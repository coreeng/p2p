import os
import re
import shutil
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


class SkopeoRunnerConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        config = self.path / "containers"
        config.mkdir()
        (config / "registries.conf").write_text('[registries.search]\nregistries = ["docker.io"]\n')
        self.auth = self.path / "auth.json"
        self.auth.write_text('{"auths":{"ghcr.io":{"auth":"dGVzdDpmaXh0dXJl"}}}\n')
        self.skopeo = shutil.which("skopeo")
        self.assertIsNotNone(self.skopeo, "Skopeo is required for the runner configuration regression")
        self.env = dict(os.environ, XDG_CONFIG_HOME=str(self.path))
        for key in ("CONTAINERS_REGISTRIES_CONF", "REGISTRIES_CONFIG_PATH"):
            self.env.pop(key, None)

    def lookup_credentials(self, env):
        return subprocess.run(
            [self.skopeo, "login", "--authfile", str(self.auth), "--get-login", "ghcr.io"],
            env=env, capture_output=True, text=True,
        )

    def test_legacy_runner_configuration_reproduces_failure(self):
        result = self.lookup_credentials(self.env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("registries.conf must be in v2 format but is in v1", result.stderr)

    def test_every_skopeo_job_handles_legacy_runner_configuration(self):
        checked = []
        for workflow in sorted((ROOT / ".github/workflows").glob("*.yaml")):
            jobs = workflow.read_text().partition("\njobs:\n")[2]
            for job in re.finditer(r"(?ms)^  ([\w-]+):\n(.*?)(?=^  \S|\Z)", jobs):
                name, block = job.groups()
                if not re.search(r"\bskopeo (?:--version|login|inspect|copy|list-tags)\b", block):
                    continue
                checked.append((workflow.name, name))
                with self.subTest(workflow=workflow.name, job=name):
                    env = re.search(r"(?ms)^    env:\n(.*?)(?=^    \S|\Z)", block)
                    self.assertIsNotNone(env, "Skopeo jobs must configure their registry environment")
                    config = re.search(r"(?m)^      CONTAINERS_REGISTRIES_CONF: (.+)$", env.group(1))
                    self.assertIsNotNone(config, "Skopeo must not inherit legacy runner registry configuration")
                    value = config.group(1).strip().strip("\"'")
                    result = self.lookup_credentials(dict(self.env, CONTAINERS_REGISTRIES_CONF=value))
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout.strip(), "test")
        self.assertGreaterEqual(len(checked), 6, "Expected execution, promotion, lookup and release jobs")


if __name__ == "__main__":
    unittest.main()
