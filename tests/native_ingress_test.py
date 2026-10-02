import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = Path(".github/workflows/p2p-execute-command.yaml").read_text()


def script(name):
    step = WORKFLOW.split(f"- name: {name}", 1)[1].split("\n      - name:", 1)[0]
    return textwrap.dedent(step.split("        run: |\n", 1)[1])


class NativeIngressContract(unittest.TestCase):
    def execute(self, enabled, compatible=True):
        with tempfile.TemporaryDirectory(prefix="p2p-ingress-") as directory:
            root = Path(directory)
            (root / "app.yaml").write_text(f"config:\n  ingress:\n    enabled: {enabled}\n")
            (root / "make").write_text("#!/bin/bash\nexit " + ("0" if compatible else "1") + "\n")
            (root / "corectl").write_text("#!/bin/bash\nprintf '%s\\n' \"$*\" > \"$CALLS\"\nprintf '%s\\n' P2P_INGRESS_ENABLED=true P2P_INGRESS_MODE=LOCAL_HTTP P2P_INGRESS_DOMAIN=trial.localhost P2P_INGRESS_CLASS=traefik\n")
            for executable in ("make", "corectl"):
                (root / executable).chmod(0o755)
            env = dict(os.environ, PATH=directory + ":" + os.environ["PATH"],
                       GITHUB_ENV=str(root / "environment"), CALLS=str(root / "calls"),
                       DPLATFORM="trial", TENANT_NAME="hello", CORECTL_CONTEXT="core-platform/engineering",
                       CORECTL_PORTAL_URL="https://portal.example.com")
            result = subprocess.run(["bash", "-c", script("Validate application ingress contract")], cwd=root,
                                    env=env, text=True, capture_output=True)
            return result, (root / "calls").read_text() if (root / "calls").exists() else "", \
                (root / "environment").read_text() if (root / "environment").exists() else ""

    def test_enabled_compatible_consumer_is_allowed(self):
        result, calls, env = self.execute("true")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, "")
        self.assertEqual(env, "")

    def test_disabled_needs_no_profile_lookup(self):
        result, calls, env = self.execute("false", compatible=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, "")
        self.assertEqual(env, "")

    def test_old_consumer_fails_before_lookup(self):
        result, calls, env = self.execute("true", compatible=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, "")
        self.assertEqual(env, "")

    def test_string_boolean_is_rejected(self):
        result, calls, env = self.execute('"true"')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, "")

    def test_resolved_variables_are_protected(self):
        self.assertRegex(script("Decode environment variables"), re.escape("P2P_INGRESS|BASE_DOMAIN=|MAKEFLAGS=|GNUMAKEFLAGS="))

    def test_native_make_override_channels_are_rejected(self):
        guard = script("Validate native Make configuration")
        for channel in ("P2P_NATIVE_COMMAND", "MAKEFLAGS", "GNUMAKEFLAGS", "MFLAGS"):
            for value in ("P2P_INGRESS_DOMAIN=other.example", "P2P_INGRESS_CLASS=nginx",
                          "P2P_INGRESS_ENABLED=false", "P2P_INGRESS_MODE=EXISTING_INGRESS",
                           "p2p_ingress_args=ignored", "p2p_nft_endpoint=ingress", "p2p_deployment_values=other.yaml",
                          "CORECTL_CONTEXT=", "MAKEFILES=other.mk", "MAKEFLAGS=-e", "--eval=ignored", "-e", "-fother.mk",
                          "deploy-functional X=1;P2P_INGRESS_DOMAIN=other.example make deploy-functional"):
                with self.subTest(channel=channel, value=value):
                    env = dict(os.environ, P2P_NATIVE_COMMAND="deploy-functional", MAKEFLAGS="", GNUMAKEFLAGS="", MFLAGS="")
                    env[channel] = value
                    result = subprocess.run(["bash", "-c", guard], env=env, capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0, value)

    def test_ordinary_native_make_configuration_is_allowed(self):
        env = dict(os.environ, P2P_NATIVE_COMMAND="deploy-functional p2p_version=abc123",
                   MAKEFLAGS="-j4 --no-print-directory", GNUMAKEFLAGS="", MFLAGS="")
        result = subprocess.run(["bash", "-c", script("Validate native Make configuration")],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_execution_passes_literal_make_arguments(self):
        with tempfile.TemporaryDirectory(prefix="p2p-execute-") as directory:
            root=Path(directory)
            (root / "make").write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$CALLS"\n')
            (root / "make").chmod(0o755)
            env=dict(os.environ,PATH=directory+":"+os.environ["PATH"],CORECTL_CONTEXT="core-platform/engineering",
                     P2P_NATIVE_COMMAND="deploy-functional X=1;P2P_INGRESS_DOMAIN=other.example make deploy-functional",CALLS=str(root/"calls"))
            execution=script("Run make ${{ inputs.command }}").replace("make ${{ inputs.command }}", "exit 99")
            result=subprocess.run(["bash","-c",execution],cwd=root,env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual((root/"calls").read_text().splitlines(),["deploy-functional","X=1;P2P_INGRESS_DOMAIN=other.example","make","deploy-functional"])

    def test_runner_additional_makefile_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="p2p-makefiles-") as directory:
            extra=Path(directory)/"extra.mk"
            extra.write_text('CORECTL_CONTEXT :=\nBASE_DOMAIN := other.example\n')
            env=dict(os.environ,P2P_NATIVE_COMMAND="deploy-functional",MAKEFILES=str(extra),MAKEFLAGS="",GNUMAKEFLAGS="",MFLAGS="")
            result=subprocess.run(["bash","-c",script("Validate native Make configuration")],env=env,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn("MAKEFILES",result.stderr)


if __name__ == "__main__":
    unittest.main()
