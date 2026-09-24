import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


class RegistryMakeTests(unittest.TestCase):
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
