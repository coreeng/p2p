import importlib.machinery
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
helper = ROOT / ".github/scripts/registry-contract"
spec = importlib.util.spec_from_loader("registry_contract", importlib.machinery.SourceFileLoader("registry_contract", str(helper)))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RegistryContractTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "GITHUB_REPOSITORY_ID": "123",
            "DPLATFORM": "test-gcp-dev",
            "TENANT_NAME": "payments",
        }

    def test_prefix_comes_from_platform_assignment(self):
        values = module.contract(self.env, "commerce/payments")
        self.assertEqual(values, {
            "REGISTRY": "127.0.0.1:5000/commerce/payments",
            "P2P_REGISTRY": "127.0.0.1:5000/commerce/payments",
        })

    def test_invalid_prefix_and_identity_fail_closed(self):
        for prefix in ("commerce/other", "../payments", "commerce/payments/extra", "Commerce/payments", "commerce//payments"):
            with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                module.contract(self.env, prefix)
        for key, value in (("GITHUB_REPOSITORY_ID", "not-an-id"), ("DPLATFORM", ""),
                           ("TENANT_NAME", "other")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.contract(dict(self.env, **{key: value}), "commerce/payments")

    def test_workflows_use_platform_connection_without_registry_variables(self):
        workflows = (
            "p2p-execute-command.yaml", "p2p-get-latest-image.yaml",
            "p2p-promote-image.yaml", "p2p-promote-source.yaml",
            "p2p-workflow-image-scan.yaml",
        )
        for name in workflows:
            with self.subTest(workflow=name):
                source = (ROOT / ".github/workflows" / name).read_text()
                self.assertIn(".github/scripts/registry-connect", source)
                self.assertNotIn("P2P_ZOT_", source)
                self.assertNotIn("vars.ZOT_", source)
                self.assertNotIn("Login to Zot", source)

    def test_registry_connection_validates_platform_assignment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            corectl = path / "corectl"
            corectl.write_text("#!/bin/sh\nprintf '%s\\n' \"$REGISTRY_RESPONSE\"\n")
            corectl.chmod(0o755)
            env_file = path / "github-env"
            env = dict(os.environ, PATH=f"{path}:{os.environ['PATH']}",
                       CORECTL_CONTEXT="instance/context", CORECTL_PORTAL_URL="https://portal.example",
                       DPLATFORM="test-gcp-dev", TENANT_NAME="payments", RUNNER_TEMP=str(path),
                       GITHUB_ENV=str(env_file),
                       GITHUB_REPOSITORY_ID="123")
            responses = (
                ('{"registry":"localhost:5000","cluster":"test-gcp-dev","prefix":"commerce/payments"}', True),
                ('{"registry":"localhost:5000","cluster":"other","prefix":"commerce/payments"}', False),
                ('{"registry":"localhost:5000","cluster":"test-gcp-dev","prefix":"commerce/other"}', False),
                ('{"registry":"localhost:5000","cluster":"test-gcp-dev","prefix":"../payments"}', False),
                ('{"registry":"evil.example","cluster":"test-gcp-dev","prefix":"commerce/payments"}', False),
            )
            for response, success in responses:
                with self.subTest(response=response):
                    env_file.write_text("")
                    result = subprocess.run([str(ROOT / ".github/scripts/registry-connect"), "test-gcp-dev"],
                                            env=dict(env, REGISTRY_RESPONSE=response), capture_output=True, text=True)
                    self.assertEqual(result.returncode == 0, success, result.stderr)
                    if success:
                        self.assertIn("P2P_REGISTRY=127.0.0.1:5000/commerce/payments", env_file.read_text())
                        self.assertNotIn("P2P_ZOT_", env_file.read_text())

            result = subprocess.run([str(ROOT / ".github/scripts/registry-connect"), "dev"],
                                    env=dict(env, REGISTRY_RESPONSE=responses[0][0]),
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("GitHub environment must match the target cluster", result.stderr)

    def test_registry_login_refreshes_after_build_before_push(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            makefile = path / "Makefile"
            makefile.write_text(
                f"SHELL := /bin/bash\ninclude {ROOT / 'p2p.mk'}\n"
                ".PHONY: p2p-build build-app\n"
                "p2p-build: build-app push-app\n"
                "build-app:\n\t@echo build\n"
                "push-%:\n\t@echo push-$*\n"
            )
            login = path / "p2p-workflow-src/.github/scripts/registry-login"
            login.parent.mkdir(parents=True)
            login.write_text("#!/bin/sh\necho login \"$@\"\n")
            login.chmod(0o755)
            env = dict(os.environ, P2P_VERSION="1.0.0", CORECTL_CONTEXT="test/context",
                       RUNNER_TEMP=str(path), DPLATFORM="test-gcp-dev",
                       P2P_REGISTRY="127.0.0.1:5000/commerce/payments")
            result = subprocess.run(["make", "p2p-build"], cwd=path, env=env,
                                    check=True, capture_output=True, text=True)
            self.assertEqual(result.stdout.splitlines(), [
                "build", "login --audience core-platform-registry:test-gcp-dev --registry 127.0.0.1:5000 "
                f"--skopeo-auth-file {path / 'p2p-registry-auth.json'}", "push-app",
            ])

            env["CORECTL_CONTEXT"] = ""
            result = subprocess.run(["make", "p2p-build"], cwd=path, env=env,
                                    check=True, capture_output=True, text=True)
            self.assertEqual(result.stdout.splitlines(), ["build", "push-app"])

    def test_docker_config_is_set_before_buildx_initializes(self):
        source = (ROOT / ".github/workflows/p2p-execute-command.yaml").read_text()
        prepare = source.index("- name: Prepare image registry client")
        buildx = source.index("- name: Setup Docker Buildx")
        login = source.index("- name: Authenticate to image registry")
        self.assertLess(prepare, buildx)
        self.assertLess(buildx, login)
        self.assertIn('echo "DOCKER_CONFIG=$docker_config" >> "$GITHUB_ENV"', source[prepare:buildx])
        self.assertNotIn("export DOCKER_CONFIG=", source[login:source.index("- name: Set p2p variables")])


if __name__ == "__main__":
    unittest.main()
