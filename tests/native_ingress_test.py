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
        with tempfile.TemporaryDirectory(prefix="p2p-ingress-", dir="/tmp/opencode") as directory:
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
            result = subprocess.run(["bash", "-c", script("Resolve application ingress")], cwd=root,
                                    env=env, text=True, capture_output=True)
            return result, (root / "calls").read_text() if (root / "calls").exists() else "", \
                (root / "environment").read_text() if (root / "environment").exists() else ""

    def test_enabled_resolves_exact_target_and_application(self):
        result, calls, env = self.execute("true")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("p2p ingress trial --application hello --context core-platform/engineering", calls)
        self.assertIn("P2P_INGRESS_MODE=LOCAL_HTTP", env)

    def test_disabled_needs_no_profile_lookup(self):
        result, calls, env = self.execute("false", compatible=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, "")
        self.assertIn("P2P_INGRESS_MODE=DISABLED", env)

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
        self.assertRegex(script("Decode environment variables"), re.escape("P2P_INGRESS|BASE_DOMAIN=|MAKEFLAGS="))


if __name__ == "__main__":
    unittest.main()
