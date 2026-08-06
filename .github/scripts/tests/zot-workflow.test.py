import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXECUTE = (ROOT / ".github/workflows/p2p-execute-command.yaml").read_text()
IMAGE_SCAN = (ROOT / ".github/workflows/p2p-workflow-image-scan.yaml").read_text()
FASTFEEDBACK = (ROOT / ".github/workflows/p2p-workflow-fastfeedback.yaml").read_text()
INTERNAL_CI = (ROOT / ".github/workflows/internal-ci.yaml").read_text()
DOCS = (ROOT / "docs/explanation/environment-configuration.md").read_text()


def workflow_step(workflow, name):
    marker = f"      - name: {name}\n"
    start = workflow.index(marker)
    end = workflow.find("\n      - name: ", start + len(marker))
    return workflow[start:] if end == -1 else workflow[start:end]


class ZotWorkflowTests(unittest.TestCase):
    def test_jobs_source_registry_configuration_from_environment_variables(self):
        required = (
            "REGISTRY_MODE: ${{ vars.REGISTRY_MODE || 'artifact-registry' }}",
            "P2P_REGISTRY_CONFIGURED: ${{ vars.P2P_REGISTRY }}",
            "P2P_DEPLOYMENT_REGISTRY_CONFIGURED: ${{ vars.P2P_DEPLOYMENT_REGISTRY }}",
            "ZOT_OIDC_AUDIENCE: ${{ vars.ZOT_OIDC_AUDIENCE }}",
        )
        for workflow in (EXECUTE, IMAGE_SCAN):
            for value in required:
                self.assertIn(value, workflow)

    def test_zot_mode_is_exact_and_configuration_is_validated_before_login(self):
        for workflow in (EXECUTE, IMAGE_SCAN):
            self.assertIn('env.REGISTRY_MODE == \'zot\'', workflow)
            self.assertIn("Validate Zot registry configuration", workflow)
            self.assertIn(': "${P2P_REGISTRY_CONFIGURED:?P2P_REGISTRY is required in Zot mode}"', workflow)
            self.assertIn(': "${P2P_DEPLOYMENT_REGISTRY_CONFIGURED:?P2P_DEPLOYMENT_REGISTRY is required in Zot mode}"', workflow)
            self.assertIn(': "${ZOT_OIDC_AUDIENCE:?ZOT_OIDC_AUDIENCE is required in Zot mode}"', workflow)
            self.assertIn("must be a bare registry host", workflow)
            self.assertIn("10#$normalized_port <= 65535", workflow)
            self.assertIn('label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$', workflow)

    def test_execute_preserves_pinniped_and_trusted_checkout(self):
        for value in (
            "Checkout P2P workflow sources",
            'mv .p2p-workflow-src "$RUNNER_TEMP/p2p-workflow-src"',
            "Validate Pinniped configuration",
            "Install Pinniped CLI",
            "Configure Pinniped kubeconfig",
            "Preflight Pinniped authentication",
            "Authorize subnamespace creation",
            "Authorize target namespace deployment",
        ):
            self.assertIn(value, EXECUTE)

    def test_registry_auth_is_mode_gated_and_uses_trusted_helper(self):
        helper = '$RUNNER_TEMP/p2p-workflow-src/.github/scripts/github-oidc-registry-login'
        auth_file = '$RUNNER_TEMP/zot-containers-auth.json'
        for workflow in (EXECUTE, IMAGE_SCAN):
            self.assertIn("Login to Zot registry", workflow)
            self.assertIn(helper, workflow)
            self.assertIn(auth_file, workflow)
            self.assertIn('--audience "$ZOT_OIDC_AUDIENCE"', workflow)
            self.assertIn('--registry "$P2P_REGISTRY_CONFIGURED"', workflow)
            self.assertNotIn("echo \"$ACTIONS_ID_TOKEN_REQUEST_TOKEN\"", workflow)
            self.assertNotIn("echo \"$token\"", workflow)
        self.assertIn("env.REGISTRY_MODE != 'zot'", IMAGE_SCAN)

    def test_execute_google_registry_auth_steps_are_independently_mode_gated(self):
        expected_condition = "if: ${{ inputs.dry-run == false && env.REGISTRY_MODE != 'zot' }}"
        google_auth = workflow_step(EXECUTE, "Authenticate to Google Cloud")
        artifact_registry_login = workflow_step(EXECUTE, "Login to Artifact Registry")

        self.assertIn("uses: google-github-actions/auth@v3", google_auth)
        self.assertIn(expected_condition, google_auth)
        self.assertIn("uses: docker/login-action@v4", artifact_registry_login)
        self.assertIn(expected_condition, artifact_registry_login)

    def test_execute_exports_separate_public_and_deployment_registries(self):
        self.assertIn('P2P_REGISTRY="${P2P_REGISTRY_CONFIGURED}"', EXECUTE)
        self.assertIn('P2P_DEPLOYMENT_REGISTRY="${P2P_DEPLOYMENT_REGISTRY_CONFIGURED}"', EXECUTE)
        self.assertIn('P2P_DEPLOYMENT_REGISTRY_FAST_FEEDBACK=${P2P_DEPLOYMENT_REGISTRY}/${P2P_REGISTRY_FAST_FEEDBACK_PATH}', EXECUTE)
        self.assertIn('P2P_DEPLOYMENT_REGISTRY_EXTENDED_TEST=${P2P_DEPLOYMENT_REGISTRY}/${P2P_REGISTRY_EXTENDED_TEST_PATH}', EXECUTE)
        self.assertIn('P2P_DEPLOYMENT_REGISTRY_PROD=${P2P_DEPLOYMENT_REGISTRY}/${P2P_REGISTRY_PROD_PATH}', EXECUTE)

    def test_build_proves_public_read_without_persisting_inspect_json(self):
        self.assertIn("Verify Zot public image read", EXECUTE)
        self.assertIn('inputs.command == \'p2p-build\'', EXECUTE)
        self.assertIn('skopeo inspect --authfile "$RUNNER_TEMP/zot-containers-auth.json"', EXECUTE)
        self.assertIn('docker://${P2P_REGISTRY_FAST_FEEDBACK}/${P2P_APP_NAME}:${P2P_VERSION}', EXECUTE)
        self.assertIn('test("^sha256:[0-9a-f]{64}$")', EXECUTE)
        self.assertIn('$RUNNER_TEMP/zot-public-digest', EXECUTE)
        self.assertIn('$GITHUB_STEP_SUMMARY', EXECUTE)
        self.assertNotIn('zot-inspect.json', EXECUTE)

    def test_image_scan_has_oidc_permission_and_public_registry_inputs(self):
        self.assertIn("permissions:", IMAGE_SCAN)
        self.assertIn("id-token: write", IMAGE_SCAN)
        self.assertIn('P2P_REGISTRY: ${{ env.P2P_REGISTRY_CONFIGURED }}', IMAGE_SCAN)
        self.assertNotIn('P2P_DEPLOYMENT_REGISTRY: ${{ env.P2P_DEPLOYMENT_REGISTRY_CONFIGURED }}', IMAGE_SCAN)

    def test_fastfeedback_promotion_can_be_disabled_without_changing_default(self):
        self.assertIn("promotion-enabled:", FASTFEEDBACK)
        self.assertIn("default: true", FASTFEEDBACK)
        self.assertIn("inputs.promotion-enabled", FASTFEEDBACK)
        promote_condition = "if: success() && inputs.promotion-enabled && ( github.ref == inputs.main-branch || github.ref_type == 'tag' )"
        self.assertIn(promote_condition, FASTFEEDBACK)

    def test_internal_ci_runs_zot_static_tests(self):
        self.assertIn("python3 .github/scripts/tests/zot-workflow.test.py", INTERNAL_CI)

    def test_exact_spike_environment_variables_are_documented(self):
        for value in (
            "REGISTRY_MODE=zot",
            "P2P_REGISTRY=registry-auth-test-2.sandbox-3-gcp.sandboxes.cecg.platform.cecg.io",
            "P2P_DEPLOYMENT_REGISTRY=registry-auth-test-2.sandbox-3-gcp-internal.sandboxes.cecg.platform.cecg.io",
            "ZOT_OIDC_AUDIENCE=core-platform-registry:sandbox-3-gcp:auth-test-2",
        ):
            self.assertIn(value, DOCS)


if __name__ == "__main__":
    unittest.main()
