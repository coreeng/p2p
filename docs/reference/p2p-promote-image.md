# p2p-promote-image.yaml

> Authenticates to source and destination Artifact Registries via skopeo, then delegates image promotion to the tenant's `p2p-promote-to-<stage>` make target.

## Usage

```yaml
jobs:
  promote:
    uses: coreeng/p2p/.github/workflows/p2p-promote-image.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      promotion-stage: extended-test
      source_matrix: ${{ toJSON(needs.fast-feedback.outputs) }}
      dest_github_env: extended-test
      version: ${{ needs.version.outputs.version }}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `promotion-stage` | string | Yes | — | The promotion stage name. The workflow runs `make p2p-promote-to-<promotion-stage>`. |
| `source_matrix` | string | Yes | — | JSON matrix string describing the source environment. The first entry's `deploy_env` is used as the source GitHub environment. |
| `dest_github_env` | string | Yes | — | GitHub environment name for the destination. Used to resolve destination registry credentials. |
| `app-name` | string | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). |
| `tenant-name` | string | No | `''` | Tenant name. Must equal `app-name`. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `version` | string | No | `''` | Artifact version passed as `P2P_VERSION`. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `working-directory` | string | No | `'.'` | Directory from which the `make` target is executed. |
| `checkout-version` | string | No | `''` | Git ref to check out. When `dry-run` is `true`, always checks out the default ref. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication, skopeo login, and the `make` invocation. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs decoded into the job environment before the `make` invocation. |

## Outputs

This workflow has no outputs.

## Job Graph

1. `lookup` — Runs in the source GitHub environment to resolve source registry, project ID, service account, and workload identity provider. Outputs are consumed by `promote-image`.
2. `promote-image` — Runs in `dest_github_env`. Authenticates to both source and destination GCP projects, logs skopeo in to both registries, sets P2P environment variables, and runs `make p2p-promote-to-<promotion-stage>`. Depends on `lookup`.

## Promotion mechanism

The `promote-image` job authenticates separately to the source and destination GCP projects using Workload Identity Federation. It then logs skopeo in to both registries so that the tenant's `p2p-promote-to-<stage>` make target can copy images without managing credentials itself.

The following environment variables are available to the make target:

| Variable | Description |
|----------|-------------|
| `SOURCE_REGISTRY` | Artifact Registry URL of the source environment. |
| `SOURCE_ACCESS_TOKEN` | OAuth2 access token for the source registry. |
| `SOURCE_AUTH_OVERRIDE` | Path to the source GCP credentials file. |
| `DEST_ACCESS_TOKEN` | OAuth2 access token for the destination registry. |
| `DEST_AUTH_OVERRIDE` | Path to the destination GCP credentials file. |
| `P2P_TENANT_NAME` | Resolved tenant name. |
| `P2P_APP_NAME` | Value of the `app-name` input. |
| `P2P_VERSION` | Value of the `version` input. |
| `P2P_REGISTRY` | Base Artifact Registry path for the destination. |
| `P2P_REGISTRY_FAST_FEEDBACK` | `P2P_REGISTRY/fast-feedback` |
| `P2P_REGISTRY_EXTENDED_TEST` | `P2P_REGISTRY/extended-test` |
| `P2P_REGISTRY_PROD` | `P2P_REGISTRY/prod` |
| `P2P_NAMESPACE_FUNCTIONAL` | `<namespace>-functional` |
| `P2P_NAMESPACE_NFT` | `<namespace>-nft` |
| `P2P_NAMESPACE_INTEGRATION` | `<namespace>-integration` |
| `P2P_NAMESPACE_EXTENDED` | `<namespace>-extended` |
| `P2P_NAMESPACE_PROD` | `<namespace>-prod` |

## See also

- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [Make targets](../explanation/make-targets.md)
- [Pipeline model](../explanation/pipeline-model.md)
