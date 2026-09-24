import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


class RegistryMakeTests(unittest.TestCase):
    def test_workflows_use_corectl_without_registry_inputs(self):
        workflows = (
            "p2p-execute-command.yaml", "p2p-get-latest-image.yaml",
            "p2p-promote-image.yaml", "p2p-promote-source.yaml",
            "p2p-workflow-image-scan.yaml",
        )
        for name in workflows:
            with self.subTest(workflow=name):
                source = (ROOT / ".github/workflows" / name).read_text()
                self.assertIn("corectl p2p registry connect", source)
                self.assertIn("corectl p2p registry login", source)
                self.assertIn("corectl p2p registry disconnect", source)
                self.assertNotIn(".github/scripts/registry-", source)
                self.assertNotIn("P2P_ZOT_", source)
                self.assertNotIn("vars.ZOT_", source)

    def test_docker_config_precedes_buildx_and_login(self):
        source = (ROOT / ".github/workflows/p2p-execute-command.yaml").read_text()
        prepare = source.index("- name: Prepare image registry client")
        buildx = source.index("- name: Setup Docker Buildx")
        login = source.index("- name: Authenticate to image registry")
        self.assertLess(prepare, buildx)
        self.assertLess(buildx, login)
        self.assertIn('echo "DOCKER_CONFIG=$docker_config" >> "$GITHUB_ENV"', source[prepare:buildx])

    def test_publish_refreshes_credentials_after_build(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "Makefile").write_text(
                f"SHELL := /bin/bash\ninclude {ROOT / 'p2p.mk'}\n"
                ".PHONY: p2p-build build-app\n"
                "p2p-build: build-app push-app\n"
                "build-app:\n\t@echo build\n"
                "push-%:\n\t@echo push-$*\n"
            )
            corectl = path / "corectl"
            corectl.write_text('#!/bin/sh\necho corectl "$@"\n')
            corectl.chmod(0o755)
            env = dict(os.environ, PATH=f"{path}:{os.environ['PATH']}", P2P_VERSION="1.0.0",
                       CORECTL_CONTEXT="instance/context", DPLATFORM="test-gcp-dev",
                       DOCKER_CONFIG=str(path / "docker"))
            result = subprocess.run(["make", "p2p-build"], cwd=path, env=env,
                                    check=True, capture_output=True, text=True)
            self.assertEqual(result.stdout.splitlines(), [
                "build", "corectl p2p registry login test-gcp-dev --context instance/context", "push-app",
            ])

            env["CORECTL_CONTEXT"] = ""
            result = subprocess.run(["make", "p2p-build"], cwd=path, env=env,
                                    check=True, capture_output=True, text=True)
            self.assertEqual(result.stdout.splitlines(), ["build", "push-app"])


if __name__ == "__main__":
    unittest.main()
