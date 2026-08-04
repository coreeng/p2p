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

    def test_resolves_target_namespace_once_for_setup_and_authorization(self) -> None:
        resolver = step(self.workflow, "Resolve target namespace")
        self.assertIn(
            "if: ${{ inputs.dry-run == false && inputs.app-name != '' && inputs.subnamespace != '' }}",
            resolver,
        )
        self.assertIn('if [[ "$TENANT_NAME" == "$APP_NAME" ]]; then', resolver)
        self.assertIn('target_namespace="${TENANT_NAME}-${SUBNAMESPACE}"', resolver)
        self.assertIn(
            'target_namespace="${TENANT_NAME}-${APP_NAME}-${SUBNAMESPACE}"', resolver
        )
        self.assertIn(
            'echo "target-namespace=${target_namespace}" >> "$GITHUB_OUTPUT"', resolver
        )

    def test_authorizes_required_hnc_operation_at_the_setup_boundary(self) -> None:
        authorization = step(self.workflow, "Authorize subnamespace creation")
        setup_condition = (
            "if: ${{ inputs.dry-run == false && "
            "inputs.skip-subnamespaces-create == false && "
            "inputs.app-name != '' && inputs.subnamespace != '' }}"
        )
        self.assertIn(setup_condition, authorization)
        self.assertIn(
            'TARGET_NAMESPACE: ${{ steps.resolve-target-namespace.outputs.target-namespace }}',
            authorization,
        )
        self.assertIn(
            'kubectl get subnamespaceanchor "$TARGET_NAMESPACE" '
            '--namespace "$TENANT_NAME" --ignore-not-found -o name',
            authorization,
        )
        self.assertIn(
            '''then
            operation="patch"
          else
            operation="create"
          fi''',
            authorization,
        )
        self.assertIn(
            'if ! kubectl auth can-i "$operation" subnamespaceanchors.hnc.x-k8s.io '
            '--namespace "$TENANT_NAME" --quiet; then',
            authorization,
        )
        self.assertNotIn("deployments.apps", authorization)

        setup = step(
            self.workflow,
            "Setup subnamespace ${{ steps.resolve-target-namespace.outputs.target-namespace }}",
        )
        self.assertIn(setup_condition, setup)
        self.assertIn(
            "TARGET_NAMESPACE: ${{ steps.resolve-target-namespace.outputs.target-namespace }}",
            setup,
        )
        self.assertIn("name: ${TARGET_NAMESPACE}", setup)
        self.assertIn('get subnamespaceanchor "${TARGET_NAMESPACE}"', setup)
        self.assertIn('--namespace="${TARGET_NAMESPACE}"', setup)

    def test_authorizes_deployments_in_target_namespace_after_setup(self) -> None:
        authorization = step(self.workflow, "Authorize target namespace deployment")
        self.assertIn(
            "if: ${{ inputs.dry-run == false && inputs.app-name != '' && inputs.subnamespace != '' }}",
            authorization,
        )
        self.assertIn(
            "TARGET_NAMESPACE: ${{ steps.resolve-target-namespace.outputs.target-namespace }}",
            authorization,
        )
        self.assertIn(
            "if ! kubectl auth can-i create deployments.apps "
            '--namespace "$TARGET_NAMESPACE" --quiet; then',
            authorization,
        )
        self.assertNotIn(
            'create deployments.apps --namespace "$TENANT_NAME"', self.workflow
        )
        self.assertLess(
            self.workflow.index("id: setup-subnamespace"),
            self.workflow.index("- name: Authorize target namespace deployment"),
        )

    def test_preserves_existing_kubernetes_and_registry_behavior(self) -> None:
        workflow = self.workflow
        self.assertIn("kind: SubnamespaceAnchor", workflow)
        self.assertIn('kubectl config set-context --current --namespace="${TARGET_NAMESPACE}"', workflow)
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
