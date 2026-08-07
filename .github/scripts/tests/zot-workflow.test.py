import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXECUTE = (ROOT / ".github/workflows/p2p-execute-command.yaml").read_text()
IMAGE_SCAN = (ROOT / ".github/workflows/p2p-workflow-image-scan.yaml").read_text()
FASTFEEDBACK = (ROOT / ".github/workflows/p2p-workflow-fastfeedback.yaml").read_text()
INTERNAL_CI = (ROOT / ".github/workflows/internal-ci.yaml").read_text()
DOCS = (ROOT / "docs/explanation/environment-configuration.md").read_text()
LATEST_IMAGE_PATH = ROOT / ".github/workflows/p2p-get-latest-image.yaml"
STAGE_PATH = ROOT / ".github/workflows/p2p-workflow-security-image-scan-stage.yaml"
SECURITY_SCAN_PATH = ROOT / ".github/workflows/p2p-workflow-security-scan.yaml"
EXTENDED_LATEST_PATH = ROOT / ".github/workflows/p2p-get-latest-image-extended-test.yaml"
PROD_LATEST_PATH = ROOT / ".github/workflows/p2p-get-latest-image-prod.yaml"


def parsed_workflow(path):
    script = (
        'require "yaml"; require "json"; '
        'puts JSON.generate(YAML.safe_load(File.read(ARGV[0]), aliases: true))'
    )
    output = subprocess.check_output(["ruby", "-e", script, str(path)], text=True)
    return json.loads(output)


def parsed_job(path, name):
    return parsed_workflow(path)["jobs"][name]


def parsed_step(job, name):
    return next(step for step in job["steps"] if step.get("name") == name)


def parsed_step_index(job, name):
    return next(index for index, step in enumerate(job["steps"]) if step.get("name") == name)


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
        for workflow, auth_file in (
            (EXECUTE, '$RUNNER_TEMP/p2p-execute-zot-auth.json'),
            (IMAGE_SCAN, '$RUNNER_TEMP/p2p-image-scan-zot-auth.json'),
        ):
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

    def test_execute_exports_runner_temp_zot_auth_file_contract(self):
        job = parsed_job(ROOT / ".github/workflows/p2p-execute-command.yaml", "exec")
        prepare = parsed_step(job, "Prepare Zot registry credentials")

        self.assertIn(
            "printf 'P2P_ZOT_AUTH_FILE=%s\\n' \"$RUNNER_TEMP/p2p-execute-zot-auth.json\" >> \"$GITHUB_ENV\"",
            prepare["run"],
        )
        self.assertIn('$RUNNER_TEMP/p2p-execute-zot-auth.json', parsed_step(job, "Login to Zot registry")["run"])

    def test_build_proves_public_read_without_persisting_inspect_json(self):
        self.assertIn("Verify Zot public image read", EXECUTE)
        self.assertIn('inputs.command == \'p2p-build\'', EXECUTE)
        self.assertIn('skopeo inspect --authfile "$RUNNER_TEMP/p2p-execute-zot-auth.json"', EXECUTE)
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

    def test_scheduled_scan_call_graph_preserves_stages_and_oidc_permissions(self):
        security_scan = parsed_workflow(SECURITY_SCAN_PATH)
        for stage in ("fast-feedback", "extended-test", "prod"):
            job = security_scan["jobs"][f"security-image-scan-{stage}"]
            self.assertEqual(job["uses"], "./.github/workflows/p2p-workflow-security-image-scan-stage.yaml")
            self.assertEqual(job["with"]["registry-path"], stage)
            self.assertEqual(job["with"]["pipeline-stage"], stage)
            self.assertEqual(job["permissions"]["id-token"], "write")

        stage_job = parsed_job(STAGE_PATH, "security-discover-version")
        self.assertEqual(stage_job["uses"], "./.github/workflows/p2p-get-latest-image.yaml")
        self.assertEqual(stage_job["permissions"]["id-token"], "write")
        self.assertEqual(stage_job["with"]["registry-path"], "${{ inputs.registry-path }}")

        for wrapper in (EXTENDED_LATEST_PATH, PROD_LATEST_PATH):
            wrapper_job = parsed_job(wrapper, "get-latest-version")
            self.assertEqual(wrapper_job["uses"], "./.github/workflows/p2p-get-latest-image.yaml")
            self.assertEqual(wrapper_job["permissions"], {"contents": "read", "id-token": "write"})

    def test_latest_image_uses_exact_zot_opt_in_and_public_registry(self):
        job = parsed_job(LATEST_IMAGE_PATH, "get-latest-image")
        self.assertEqual(job["permissions"], {"contents": "read", "id-token": "write"})
        self.assertEqual(job["env"]["REGISTRY_MODE"], "${{ vars.REGISTRY_MODE || 'artifact-registry' }}")
        self.assertEqual(job["env"]["P2P_REGISTRY_CONFIGURED"], "${{ vars.P2P_REGISTRY }}")
        self.assertEqual(job["env"]["ZOT_OIDC_AUDIENCE"], "${{ vars.ZOT_OIDC_AUDIENCE }}")
        self.assertNotIn("P2P_DEPLOYMENT_REGISTRY", json.dumps(job))

        google_auth = parsed_step(job, "Authenticate to Google Cloud")
        self.assertEqual(google_auth["if"], "inputs.dry-run == false && env.REGISTRY_MODE != 'zot'")
        zot_login = parsed_step(job, "Login to Zot registry")
        self.assertEqual(zot_login["if"], "${{ inputs.dry-run == false && env.REGISTRY_MODE == 'zot' }}")
        self.assertIn('$RUNNER_TEMP/p2p-workflow-src/.github/scripts/github-oidc-registry-login', zot_login["run"])
        self.assertIn('--registry "$P2P_REGISTRY_CONFIGURED"', zot_login["run"])
        self.assertNotIn("P2P_DEPLOYMENT_REGISTRY_CONFIGURED", zot_login["run"])

    def test_latest_image_queries_zot_and_distinguishes_empty_tags_from_errors(self):
        job = parsed_job(LATEST_IMAGE_PATH, "get-latest-image")
        query = parsed_step(job, "Get latest image")["run"]
        self.assertIn('if [[ "$REGISTRY_MODE" == "zot" ]]', query)
        self.assertIn('skopeo list-tags --authfile "$RUNNER_TEMP/p2p-latest-image-zot-auth.json"', query)
        self.assertIn('docker://${P2P_REGISTRY_CONFIGURED}/${REGISTRY_PATH}/${IMAGE_NAME}', query)
        self.assertIn(".Tags | if type == \"array\" then . else error", query)
        self.assertIn('gcloud artifacts docker images list "${REGISTRY}/${REGISTRY_PATH}/${IMAGE_NAME}"', query)
        self.assertIn("set -euo pipefail", query)
        self.assertNotIn("P2P_DEPLOYMENT_REGISTRY", query)
        zot_branch = query.split('if [[ "$REGISTRY_MODE" == "zot" ]]', 1)[1].split("else", 1)[0]
        self.assertNotIn("|| true", zot_branch)
        self.assertNotIn("2>/dev/null", zot_branch)

    def test_skopeo_is_installed_from_ubuntu_packages_before_each_zot_login(self):
        workflows = (
            parsed_job(ROOT / ".github/workflows/p2p-execute-command.yaml", "exec"),
            parsed_job(ROOT / ".github/workflows/p2p-workflow-image-scan.yaml", "security-image-scan"),
            parsed_job(LATEST_IMAGE_PATH, "get-latest-image"),
        )
        for job in workflows:
            setup = parsed_step(job, "Install Skopeo from Ubuntu packages")
            self.assertIn("sudo apt-get update", setup["run"])
            self.assertIn("sudo apt-get install --yes skopeo", setup["run"])
            self.assertLess(
                parsed_step_index(job, "Install Skopeo from Ubuntu packages"),
                parsed_step_index(job, "Login to Zot registry"),
            )
            self.assertNotIn("github.com/lework/skopeo-binary", setup["run"])

    def test_execute_skopeo_install_is_available_in_default_and_zot_modes(self):
        job = parsed_job(ROOT / ".github/workflows/p2p-execute-command.yaml", "exec")
        setup = parsed_step(job, "Install Skopeo from Ubuntu packages")
        zot_login = parsed_step(job, "Login to Zot registry")
        public_read = parsed_step(job, "Verify Zot public image read")

        self.assertNotIn("if", setup)
        self.assertIn("sudo apt-get install --yes skopeo", setup["run"])
        self.assertEqual(zot_login["if"], "${{ inputs.dry-run == false && env.REGISTRY_MODE == 'zot' }}")
        self.assertEqual(
            public_read["if"],
            "${{ inputs.dry-run == false && env.REGISTRY_MODE == 'zot' && inputs.command == 'p2p-build' && steps.run-command.outcome == 'success' }}",
        )

    def test_execute_retains_docker_config_for_normal_buildx_post_cleanup(self):
        job = parsed_job(ROOT / ".github/workflows/p2p-execute-command.yaml", "exec")
        setup_buildx = parsed_step(job, "Setup Docker Buildx")
        cleanup = parsed_step(job, "Clean up Zot registry credentials")

        self.assertLess(parsed_step_index(job, "Prepare Zot registry credentials"), parsed_step_index(job, "Login to Zot registry"))
        self.assertLess(parsed_step_index(job, "Login to Zot registry"), parsed_step_index(job, "Setup Docker Buildx"))
        self.assertLess(parsed_step_index(job, "Setup Docker Buildx"), parsed_step_index(job, "Run make ${{ inputs.command }}"))
        self.assertEqual(setup_buildx["with"].get("cleanup", True), True)
        self.assertFalse(any(step.get("name") == "Clean up Docker Buildx" for step in job["steps"]))
        self.assertEqual(cleanup["if"], "${{ always() && env.REGISTRY_MODE == 'zot' }}")
        self.assertEqual(cleanup["env"]["DOCKER_CONFIG"], "${{ runner.temp }}/p2p-execute-docker-config")
        self.assertEqual(cleanup["env"]["PRIMARY_JOB_STATUS"], "${{ job.status }}")
        self.assertIn('docker logout "$P2P_REGISTRY_CONFIGURED" >/dev/null 2>&1 || true', cleanup["run"])
        self.assertIn('rm -f "$DOCKER_CONFIG/config.json"', cleanup["run"])
        self.assertIn('rm -f "$RUNNER_TEMP/p2p-execute-zot-auth.json"', cleanup["run"])
        self.assertIn('[[ -e "$DOCKER_CONFIG/config.json" || -e "$RUNNER_TEMP/p2p-execute-zot-auth.json" ]]', cleanup["run"])
        self.assertIn('[[ "$PRIMARY_JOB_STATUS" == "success" ]]', cleanup["run"])
        self.assertNotIn("rm -rf", cleanup["run"])
        self.assertNotIn("cat ", cleanup["run"])

    def test_zot_credentials_are_prepared_before_login_and_cleaned_after_last_use(self):
        cases = (
            (
                parsed_job(ROOT / ".github/workflows/p2p-execute-command.yaml", "exec"),
                "p2p-execute-docker-config",
                "p2p-execute-zot-auth.json",
                "Verify Zot public image read",
            ),
            (
                parsed_job(ROOT / ".github/workflows/p2p-workflow-image-scan.yaml", "security-image-scan"),
                "p2p-image-scan-docker-config",
                "p2p-image-scan-zot-auth.json",
                "Scan images for secrets",
            ),
            (
                parsed_job(LATEST_IMAGE_PATH, "get-latest-image"),
                "p2p-latest-image-docker-config",
                "p2p-latest-image-zot-auth.json",
                "Get latest image",
            ),
        )
        for job, docker_dir, auth_file, last_use in cases:
            prepare = parsed_step(job, "Prepare Zot registry credentials")
            login = parsed_step(job, "Login to Zot registry")
            cleanup = parsed_step(job, "Clean up Zot registry credentials")
            self.assertEqual(prepare["env"]["DOCKER_CONFIG"], f'${{{{ runner.temp }}}}/{docker_dir}')
            self.assertIn('install -d -m 0700 "$DOCKER_CONFIG"', prepare["run"])
            self.assertIn(f'$RUNNER_TEMP/{auth_file}', login["run"])
            self.assertIn("DOCKER_CONFIG", login.get("env", {}))
            self.assertEqual(cleanup["if"], "${{ always() && env.REGISTRY_MODE == 'zot' }}")
            self.assertTrue(
                docker_dir in cleanup["run"] or docker_dir in cleanup.get("env", {}).get("DOCKER_CONFIG", ""),
                f"cleanup does not reference isolated Docker config {docker_dir}",
            )
            self.assertIn(auth_file, cleanup["run"])
            self.assertLess(parsed_step_index(job, "Prepare Zot registry credentials"), parsed_step_index(job, "Login to Zot registry"))
            self.assertLess(parsed_step_index(job, "Login to Zot registry"), parsed_step_index(job, last_use))
            self.assertLess(parsed_step_index(job, last_use), parsed_step_index(job, "Clean up Zot registry credentials"))

    def test_scan_and_discovery_never_construct_targets_from_deployment_registry(self):
        image_scan = parsed_job(ROOT / ".github/workflows/p2p-workflow-image-scan.yaml", "security-image-scan")
        resolve = parsed_step(image_scan, "Resolve image references")
        self.assertNotIn("P2P_DEPLOYMENT_REGISTRY", json.dumps(resolve))
        latest = parsed_job(LATEST_IMAGE_PATH, "get-latest-image")
        for name in ("Login to Zot registry", "Get latest image"):
            self.assertNotIn("P2P_DEPLOYMENT_REGISTRY", json.dumps(parsed_step(latest, name)))


if __name__ == "__main__":
    unittest.main()
