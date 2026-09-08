# p2p-execute-command.yaml

> Authenticates to GCP and a Kubernetes cluster, sets up the P2P environment variables, and runs a `make` target.

## Usage

```yaml
jobs:
  build:
    uses: coreeng/p2p/.github/workflows/p2p-execute-command.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      command: p2p-build
      version: ${{ needs.version.outputs.version }}
      github_env: fast-feedback
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `command` | string | Yes | — | The `make` target to run (e.g. `p2p-build`). |
| `command-overrides` | string | No | `''` | Comma-separated commands implemented by the caller's `.github/actions/p2p-command` composite action. Unlisted commands use Make. |
| `runner-label` | string | No | `''` | GitHub Actions runner label for the command-execution job. When empty, uses the caller's `P2P_RUNNER_LABEL` organization or repository variable, then `ubuntu-24.04`. |
| `github_env` | string | No | `''` | GitHub environment name used for deployment protection rules and concurrency grouping. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication, cluster setup, and the `make` invocation. |
| `region` | string | No | `''` | GCP region. Falls back to the `REGION` repository/environment variable, then `europe-west2`. |
| `subnamespace` | string | No | `''` | Kubernetes subnamespace suffix to create and switch context to before running the command. |
| `app-name` | string | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). Falls back to `TENANT_NAME` when empty. |
| `tenant-name` | string | No | `''` | Tenant name. Must equal `app-name`. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `version` | string | Yes | — | Artifact version passed to the `make` target via `P2P_VERSION`. |
| `checkout-version` | string | No | `''` | Git ref to check out. Ignored when `dry-run` is `true`; the workflow checks out the default ref. |
| `zone` | string | No | `europe-west2-a` | GCP zone. Accepted but unused by the workflow. |
| `pre-targets` | string | No | `''` | Make targets to run before the main command. Accepted but unused by the workflow. |
| `post-targets` | string | No | `''` | Make targets to run after the main command. Accepted but unused by the workflow. |
| `working-directory` | string | No | `'.'` | Directory from which the `make` target is executed. |
| `skip-subnamespaces-create` | boolean | No | `false` | When `true`, skips automatic subnamespace creation even if `subnamespace` is set. |
| `artifacts` | string | No | `''` | YAML-formatted map of command names to artifact paths. Paths matching the active `command` are uploaded after the run. Single-line path entries only. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs decoded into the job environment before the `make` invocation. Single-line entries only. |
| `container_registry_user` | No | Username for an additional container registry login. |
| `container_registry_pat` | No | Password/PAT for an additional container registry login. Required when `container_registry_user` is set. |
| `container_registry_url` | No | URL of the additional container registry. |

## Repository command implementation

Set `command-overrides: p2p-build` to select the caller action for builds. The
action must exist at `.github/actions/p2p-command/action.yml` in the caller
checkout selected by `checkout-version`. It receives `command` and
`working-directory` inputs; shell steps must set their own working directory.

Authentication, registry login, kubeconfig, namespace setup, decoded secrets,
`P2P_*` variables, `GITHUB_TOKEN`, and `GOOGLE_APPLICATION_CREDENTIALS` are prepared
before the action runs. Artifact collection and concurrency remain P2P-owned.
The action executes with the job's credentials and permissions, so callers must
review its code and third-party actions as privileged workflow code.

The selected action owns tool setup and the complete command outcome, including
checks, all image tags and pushes, and any additional artifacts. P2P skips its
Buildx setup, skopeo installation, and Make invocation for that command. An action
can perform custom setup then call Make itself, installing any tools it needs.
Missing actions and action failures fail the job; they never fall back to Make.

Supported selections are `p2p-build`, `p2p-functional`, `p2p-nft`,
`p2p-integration`, `p2p-extended-test`, and `p2p-prod`. Surrounding whitespace is
trimmed. Unknown names, duplicates, and empty list entries fail validation.
An empty input preserves the default implementation for every command. Dry runs
validate selection but skip both implementations and default tool setup.

For rollout, use a reviewed P2P commit from `release/command-overrides`. To roll
back command customization, remove `command-overrides`; the caller action can
remain present and unused. The higher-level fast-feedback workflow forwards this
input; extended-test and production callers can use the execution workflow
directly if they need overrides.

## Outputs

This workflow has no outputs.

## Job Graph

1. `exec` — Single job that performs all steps: checkout, GCP auth, cluster setup, Docker Buildx setup, skopeo setup, environment variable decoding, P2P variable export, and the `make` invocation.

## Concurrency

`p2p-build` receives a per-run concurrency group so independent builds can run in parallel. Every other command is grouped by GitHub environment, tenant, application, and subnamespace. Those commands queue rather than cancel when they target the same resources because `cancel-in-progress` is `false`.

## Environment Variables

The following variables are exported to `GITHUB_ENV` before the `make` target runs and are therefore available inside the target:

| Variable | Value |
|----------|-------|
| `P2P_TENANT_NAME` | Resolved tenant name (`tenant-name` input or `TENANT_NAME` variable). |
| `P2P_APP_NAME` | Value of the `app-name` input. |
| `P2P_VERSION` | Value of the `version` input. |
| `P2P_REGISTRY` | Base Artifact Registry path: `<region>-docker.pkg.dev/<project>/tenant/<tenant>`. |
| `P2P_REGISTRY_FAST_FEEDBACK` | `P2P_REGISTRY/fast-feedback` |
| `P2P_REGISTRY_EXTENDED_TEST` | `P2P_REGISTRY/extended-test` |
| `P2P_REGISTRY_PROD` | `P2P_REGISTRY/prod` |
| `P2P_NAMESPACE_FUNCTIONAL` | `<namespace>-functional` |
| `P2P_NAMESPACE_NFT` | `<namespace>-nft` |
| `P2P_NAMESPACE_INTEGRATION` | `<namespace>-integration` |
| `P2P_NAMESPACE_EXTENDED` | `<namespace>-extended` |
| `P2P_NAMESPACE_PROD` | `<namespace>-prod` |
| `PLATFORM_ENVIRONMENT` | Value of the `DPLATFORM` repository/environment variable. |

**Namespace naming**: each application has its own application tenant, so `app-name` always equals `TENANT_NAME` and `<namespace>` is simply `TENANT_NAME`.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [Environment configuration](../explanation/environment-configuration.md)
- [Make targets](../explanation/make-targets.md)
