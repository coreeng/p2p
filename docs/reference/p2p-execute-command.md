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
| `github_env` | string | No | `''` | GitHub environment name used for deployment protection rules and concurrency grouping. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication, cluster setup, and the `make` invocation. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `subnamespace` | string | No | `''` | Kubernetes subnamespace suffix to create and switch context to before running the command. |
| `app-name` | string | No | `''` | Application name. Used to construct namespace names and P2P environment variables. |
| `tenant-name` | string | No | `''` | Tenant name. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `version` | string | Yes | — | Artifact version passed to the `make` target via `P2P_VERSION`. |
| `checkout-version` | string | No | `''` | Git ref to check out. When `dry-run` is `true`, always checks out the default ref. |
| `zone` | string | No | `europe-west2-a` | GCP zone. Declared but currently unused by the workflow steps. |
| `pre-targets` | string | No | `''` | Make targets to run before the main command. Declared but currently unused by the workflow steps. |
| `post-targets` | string | No | `''` | Make targets to run after the main command. Declared but currently unused by the workflow steps. |
| `working-directory` | string | No | `'.'` | Directory from which the `make` target is executed. |
| `skip-subnamespaces-create` | boolean | No | `false` | When `true`, skips automatic subnamespace creation even if `subnamespace` is set. |
| `artifacts` | string | No | `''` | YAML-formatted map of command names to artifact paths. Paths matching the active `command` are uploaded after the run. Does not support multi-line values within individual path entries. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs decoded into the job environment before the `make` invocation. Multi-line values within a single entry are not supported. |
| `container_registry_user` | No | Username for an additional container registry login. |
| `container_registry_pat` | No | Password/PAT for an additional container registry login. Required when `container_registry_user` is set. |
| `container_registry_url` | No | URL of the additional container registry. |

## Outputs

This workflow has no outputs.

## Job Graph

1. `exec` — Single job that performs all steps: checkout, GCP auth, cluster setup, Docker Buildx setup, skopeo setup, environment variable decoding, P2P variable export, and the `make` invocation.

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

**Namespace naming**: when `app-name` equals `TENANT_NAME`, `<namespace>` is just `TENANT_NAME`. Otherwise `<namespace>` is `TENANT_NAME-<app-name>`.
