#!/usr/bin/env python3

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/p2p-execute-command.yaml"
CI_PATH = ROOT / ".github/workflows/internal-ci.yaml"
ACTIONLINT_PATH = ROOT / ".github/actionlint.yaml"


def step(workflow: str, name: str) -> str:
    match = re.search(
        rf"^      - name: {re.escape(name)}\n(?P<body>.*?)(?=^      - name: |\Z)",
        workflow,
        re.MULTILINE | re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"missing workflow step: {name}")
    return match.group(0)


class PinnipedWorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW_PATH.read_text()

    def test_retains_google_auth_for_registry_and_make(self) -> None:
        workflow = self.workflow
        self.assertIn("uses: google-github-actions/auth@v3", workflow)
        self.assertIn("token_format: access_token", workflow)
        self.assertIn("uses: google-github-actions/setup-gcloud@v3", workflow)
        self.assertIn("password: ${{ steps.auth.outputs.access_token }}", workflow)
        self.assertIn(
            "GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}",
            workflow,
        )
        self.assertIn("make ${{ inputs.command }}", workflow)

    def test_replaces_gke_authentication_without_v2_interfaces(self) -> None:
        workflow = self.workflow
        self.assertNotIn("get-gke-credentials", workflow)
        self.assertNotIn("kubectl cluster-info", workflow)
        self.assertNotIn("p2p-v2", workflow)
        self.assertNotIn("v2-artifact", workflow)
        self.assertNotIn("compatibility", workflow.lower())

    def test_has_required_permissions_and_trusted_helper_checkout(self) -> None:
        workflow = self.workflow
        self.assertRegex(
            workflow,
            r"(?ms)^  exec:\n.*?^    permissions:\n"
            r"      contents: read\n      id-token: write\n",
        )
        checkout = step(workflow, "Checkout P2P workflow sources")
        self.assertIn("if: ${{ inputs.dry-run == false }}", checkout)
        self.assertIn("repository: ${{ job.workflow_repository }}", checkout)
        self.assertIn("ref: ${{ job.workflow_sha }}", checkout)
        self.assertIn("path: .p2p-workflow-src", checkout)
        move = step(workflow, "Move P2P workflow sources outside app workspace")
        self.assertIn('mv .p2p-workflow-src "$RUNNER_TEMP/p2p-workflow-src"', move)
        self.assertIn(
            '"$RUNNER_TEMP/p2p-workflow-src/.github/scripts/github-oidc-credential"',
            workflow,
        )
        self.assertNotIn(
            '"$GITHUB_WORKSPACE/.github/scripts/github-oidc-credential"', workflow
        )

    def test_validates_step_local_configuration_before_authentication(self) -> None:
        workflow = self.workflow
        validation = step(workflow, "Validate Pinniped configuration")
        self.assertIn("DPLATFORM: ${{ vars.DPLATFORM }}", validation)
        self.assertIn("TENANT_NAME: ${{ inputs.tenant-name != '' && inputs.tenant-name || vars.TENANT_NAME }}", validation)
        self.assertIn("GITHUB_ENVIRONMENT: ${{ inputs.github_env }}", validation)
        self.assertIn("PINNIPED_ENDPOINT: ${{ vars.PINNIPED_ENDPOINT }}", validation)
        self.assertIn("PINNIPED_CA_BUNDLE: ${{ vars.PINNIPED_CA_BUNDLE }}", validation)
        self.assertIn('[[ "$GITHUB_ENVIRONMENT" == "$DPLATFORM" ]]', validation)
        self.assertLess(
            workflow.index("- name: Validate Pinniped configuration"),
            workflow.index("- name: Configure Pinniped kubeconfig"),
        )
        job_env = workflow[
            workflow.index("    env:\n") : workflow.index("    steps:\n")
        ]
        self.assertNotIn("PINNIPED_ENDPOINT", job_env)
        self.assertNotIn("PINNIPED_CA_BUNDLE", job_env)
        print_env = step(workflow, "print env context")
        self.assertNotIn("PINNIPED_ENDPOINT", print_env)
        self.assertNotIn("PINNIPED_CA_BUNDLE", print_env)

    def test_installs_checksum_verified_pinniped_cli(self) -> None:
        install = step(self.workflow, "Install Pinniped CLI")
        self.assertIn("v0.47.0", install)
        self.assertIn(
            "43538ad0c9c9ad67fb121f3d1e8d174324b9fea63f07ec88936182889df752a6",
            install,
        )
        self.assertIn("sha256sum --check", install)
        self.assertIn("$RUNNER_TEMP", install)
        self.assertIn("/usr/local/bin/pinniped", install)

    def test_builds_ephemeral_pinniped_kubeconfig_with_exact_identity(self) -> None:
        configure = step(self.workflow, "Configure Pinniped kubeconfig")
        for assignment in (
            "PINNIPED_ENDPOINT: ${{ vars.PINNIPED_ENDPOINT }}",
            "PINNIPED_CA_BUNDLE: ${{ vars.PINNIPED_CA_BUNDLE }}",
        ):
            self.assertIn(assignment, configure)
        self.assertIn('printf \'%s\' "$PINNIPED_CA_BUNDLE" | base64 --decode', configure)
        self.assertIn("--embed-certs=true", configure)
        self.assertIn('kubeconfig="$RUNNER_TEMP/pinniped-kubeconfig"', configure)
        self.assertIn('echo "KUBECONFIG=${kubeconfig}" >> "$GITHUB_ENV"', configure)
        self.assertIn('audience="core-platform:${DPLATFORM}:${TENANT_NAME}"', configure)
        self.assertIn('authenticator="github-actions-${TENANT_NAME}"', configure)
        for argument in (
            '--exec-arg="--audience=${audience}"',
            "--exec-arg=--enable-concierge",
            "--exec-arg=--concierge-api-group-suffix=pinniped.dev",
            '--exec-arg="--concierge-authenticator-name=${authenticator}"',
            "--exec-arg=--concierge-authenticator-type=jwt",
            '--exec-arg="--concierge-endpoint=${PINNIPED_ENDPOINT}"',
            '--exec-arg="--concierge-ca-bundle-data=${PINNIPED_CA_BUNDLE}"',
            "--exec-arg=--credential-cache=",
        ):
            self.assertIn(argument, configure)
        self.assertIn('--namespace="$TENANT_NAME"', configure)
        self.assertNotIn("cat $KUBECONFIG", configure)
        self.assertNotIn("cat \"$KUBECONFIG\"", configure)

    def test_preflights_identity_without_logging_repository_claims(self) -> None:
        preflight = step(self.workflow, "Preflight Pinniped authentication")
        self.assertIn("if: ${{ inputs.dry-run == false }}", preflight)
        self.assertIn(
            'pinniped whoami --kubeconfig "$KUBECONFIG" >/dev/null', preflight
        )
        self.assertIn('echo "Pinniped authentication succeeded"', preflight)

    def test_preflights_stage_authorization_for_both_required_resources(self) -> None:
        preflight = step(self.workflow, "Preflight tenant authorization")
        self.assertIn(
            "if: ${{ inputs.dry-run == false && inputs.subnamespace != '' }}",
            preflight,
        )
        for resource in (
            "deployments.apps",
            "subnamespaceanchors.hnc.x-k8s.io",
        ):
            self.assertIn(
                f'if ! kubectl auth can-i create {resource} '
                '--namespace "$TENANT_NAME" --quiet; then',
                preflight,
            )
        self.assertEqual(preflight.count("if ! kubectl auth can-i create"), 2)

    def test_preserves_existing_kubernetes_and_registry_behavior(self) -> None:
        workflow = self.workflow
        self.assertIn("kind: SubnamespaceAnchor", workflow)
        self.assertIn('kubectl config set-context --current --namespace="${SUBNAMESPACE}"', workflow)
        self.assertIn("- name: Login to Artifact Registry", workflow)
        self.assertIn("- name: Login to tenant provided registry", workflow)

    def test_internal_ci_and_actionlint_run_the_contract(self) -> None:
        ci = CI_PATH.read_text()
        pinniped_job = ci[ci.index("  test_pinniped_auth:") : ci.index("\n  test_", ci.index("  test_pinniped_auth:") + 1)]
        self.assertIn("python3 .github/scripts/tests/pinniped-workflow.test.py", pinniped_job)

        actionlint = ACTIONLINT_PATH.read_text()
        self.assertIn(".github/workflows/p2p-execute-command.yaml:", actionlint)
        execute_config = actionlint[actionlint.index("  .github/workflows/p2p-execute-command.yaml:") :]
        self.assertIn('property "workflow_repository" is not defined in object type', execute_config)
        self.assertIn('property "workflow_sha" is not defined in object type', execute_config)


if __name__ == "__main__":
    unittest.main()
