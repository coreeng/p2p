import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/p2p-execute-command.yaml"


def run_block(name):
    text = WORKFLOW.read_text()
    block = text.split("      - name: " + name + "\n", 1)[1].split("\n      - name:", 1)[0]
    return "\n".join(line[10:] for line in block.split("        run: |\n", 1)[1].splitlines())


class IngressWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        self.env = dict(os.environ, P2P_INGRESS_HOSTNAME="sample-abc123def-integration.portal.example.com")

    def validate(self, config, **env):
        if config is not None:
            (self.path / "app.yaml").write_text(config)
        return subprocess.run(["bash", "-c", run_block("Validate native application ingress")],
                              cwd=self.path, env=dict(self.env, **env), capture_output=True, text=True)

    def test_enabled_portal_uses_valid_target(self):
        result = self.validate("config:\n  ingress:\n    enabled: true\n    type: portal\n")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_disabled_ingress_and_non_ingress_apps_need_no_metadata(self):
        for config in (None, "config: {}\n", "config:\n  ingress:\n    enabled: false\n    type: portal\n",
                       "config:\n  ingress:\n    enabled: false\n    type: public\n"):
            with self.subTest(config=config):
                result = self.validate(config, P2P_INGRESS_HOSTNAME="")
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_public_ingress_uses_ordinary_configuration_without_portal_metadata(self):
        config = ("config:\n  ingress:\n    enabled: true\n    type: public\n"
                  "    className: nginx\n    hosts:\n      - host: app.example.com\n")
        for hostname in ("", "unused.invalid"):
            with self.subTest(hostname=hostname):
                result = self.validate(config, P2P_INGRESS_HOSTNAME=hostname)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((self.path / "app.yaml").read_text(), config)

    def test_untyped_ingress_uses_chart_configuration(self):
        for config in ("config:\n  ingress:\n    enabled: true\n    className: nginx\n",
                       'config:\n  ingress:\n    enabled: true\n',
                       'config:\n  ingress:\n    enabled: true\n    type: ""\n'):
            with self.subTest(config=config):
                result = self.validate(config, P2P_INGRESS_HOSTNAME="")
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_unknown_explicit_enabled_type_is_rejected(self):
        result = self.validate("config:\n  ingress:\n    enabled: true\n    type: unknown\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires config.ingress.type: portal or public", result.stderr)

    def test_typed_enabled_must_be_boolean(self):
        for ingress_type in ("portal", "public"):
            for value in ('"true"', '"false"', '1'):
                with self.subTest(ingress_type=ingress_type, value=value):
                    result = self.validate(f"config:\n  ingress:\n    enabled: {value}\n    type: {ingress_type}\n")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("must be a boolean", result.stderr)

    def test_missing_or_unsafe_metadata_is_rejected(self):
        for fields in ({"P2P_INGRESS_HOSTNAME": ""}, {"P2P_INGRESS_HOSTNAME": "*.example.com"},
                       {"P2P_INGRESS_HOSTNAME": "https://example.com"},
                       {"P2P_INGRESS_HOSTNAME": "host.example.com\nP2P_REGISTRY=evil"},
                       {"P2P_INGRESS_HOSTNAME": "a" * 64 + ".example.com"}):
            with self.subTest(fields=fields):
                result = self.validate("config:\n  ingress:\n    enabled: true\n    type: portal\n", **fields)
                self.assertNotEqual(result.returncode, 0)

    def test_validation_precedes_cluster_mutations(self):
        text = WORKFLOW.read_text()
        self.assertLess(text.index("- name: Validate native application ingress"), text.index("- name: Connect to cluster"))
        condition = text.split("- name: Validate native application ingress", 1)[1].split("working-directory:", 1)[0]
        self.assertIn("vars.CORECTL_CONTEXT != ''", condition)
        self.assertIn("inputs.dry-run == false", condition)
        for step in ("functional", "nft", "integration", "extended-test", "prod"):
            self.assertIn('"p2p-' + step + '"', condition)

    def test_each_deployment_step_forwards_only_its_metadata(self):
        for workflow, steps in (("fastfeedback", ("functional", "nft", "integration")),
                                ("extended-test", ("extended-test",)), ("prod", ("prod",))):
            text = (ROOT / f".github/workflows/p2p-workflow-{workflow}.yaml").read_text()
            for step in steps:
                expression = "matrix.ingress['extended-test']" if step == "extended-test" else "matrix.ingress." + step
                expected = ("      command: p2p-" + step + "\n"
                            "      ingress-hostname: ${{ " + expression + ".hostname }}\n")
                self.assertIn(expected, text)

    def test_application_env_cannot_replace_resolved_ingress(self):
        result = subprocess.run(["bash", "-c", run_block("Decode environment variables")], cwd=self.path,
                                env=dict(self.env, CORECTL_CONTEXT="instance/context",
                                         env_vars="P2P_INGRESS_HOSTNAME=evil",
                                         GITHUB_ENV=str(self.path / "github-env")), capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("cannot override platform deployment configuration", result.stderr)


if __name__ == "__main__":
    unittest.main()
