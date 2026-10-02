import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(".github/workflows/p2p-execute-command.yaml").read_text()


def script(name):
    step = WORKFLOW.split(f"- name: {name}", 1)[1].split("\n      - name:", 1)[0]
    return textwrap.dedent(step.split("        run: |\n", 1)[1])


class P2PEnvironmentContract(unittest.TestCase):
    def test_preparation_delegates_to_corectl_and_exports_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "corectl").write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$CALLS"\nprintf "%s\\n" P2P_REGISTRY=registry P2P_INGRESS_DOMAIN=trial.localhost P2P_INGRESS_CLASS=traefik\n')
            (root / "corectl").chmod(0o755)
            env = dict(os.environ, PATH=directory+":"+os.environ["PATH"], CALLS=str(root/"calls"),
                       GITHUB_ENV=str(root/"environment"), DPLATFORM="trial", TENANT_NAME="shop",
                       CORECTL_CONTEXT="core-platform/engineering", CORECTL_PORTAL_URL="https://portal.example.com",
                       EXPECTED_GITHUB_ENV="integration", P2P_PREPARE_APP_NAME="web",
                       P2P_PREPARE_VERSION="1.2.3", P2P_PREPARE_COMMAND="deploy-functional")
            result = subprocess.run(["bash", "-c", script("Prepare P2P environment")], cwd=root,
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root/"calls").read_text().splitlines(), [
                "p2p", "prepare", "trial", "--application", "shop", "--app-name", "web", "--version", "1.2.3",
                "--command", "deploy-functional", "--context", "core-platform/engineering", "--url",
                "https://portal.example.com", "--ci-environment", "integration", "--output", "env"])
            self.assertTrue(all(line.startswith("P2P_") for line in (root/"environment").read_text().splitlines()))

    def test_native_execution_delegates_literal_command_to_corectl(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/"corectl").write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$CALLS"\n')
            (root/"corectl").chmod(0o755)
            env = dict(os.environ, PATH=directory+":"+os.environ["PATH"], CALLS=str(root/"calls"),
                       CORECTL_CONTEXT="core-platform/engineering", P2P_NATIVE_COMMAND="deploy-functional X=hello")
            execution = script("Run make ${{ inputs.command }}").replace("make ${{ inputs.command }}", "exit 99")
            result = subprocess.run(["bash", "-c", execution], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root/"calls").read_text().splitlines(), ["p2p", "run", "--command", "deploy-functional X=hello"])

    def test_runtime_has_no_python_or_template_file_protocol(self):
        self.assertNotIn("python3", WORKFLOW)
        self.assertNotIn("p2p-deployment-values-contract", WORKFLOW)
        self.assertNotIn(".p2p-deployment-values", Path("p2p.mk").read_text())

    def test_promotion_uses_prepared_registry_instead_of_legacy_environment(self):
        makefile = Path("p2p.mk").resolve()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/"skopeo").write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$CALLS"\n')
            (root/"skopeo").chmod(0o755)
            env = dict(os.environ, PATH=directory+":"+os.environ["PATH"], CALLS=str(root/"calls"),
                       P2P_REGISTRY="127.0.0.1:5000/shop", REGISTRY="legacy.example.com/wrong",
                       SOURCE_REGISTRY="source.example.com/shop", P2P_VERSION="1.2.3", P2P_IMAGE_NAMES="web")
            result = subprocess.run(["make", "-s", "-f", str(makefile), "p2p-promote-to-extended-test"],
                                    cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            args = (root/"calls").read_text().splitlines()
            self.assertIn("docker://source.example.com/shop/fast-feedback/web:1.2.3", args)
            self.assertIn("docker://127.0.0.1:5000/shop/extended-test/web:1.2.3", args)


if __name__ == "__main__":
    unittest.main()
