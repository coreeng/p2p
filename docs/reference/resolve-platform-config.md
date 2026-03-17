# resolve-platform-config

> Resolves platform configuration from GitHub Environment variables and exports derived auth and P2P convenience variables for downstream workflow steps.

## Usage

```yaml
steps:
  - uses: coreeng/p2p/.github/actions/resolve-platform-config@main
    with:
      environment: gcp-dev
      app-name: my-app
      version: ${{ needs.version.outputs.version }}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | string | Yes | — | Target environment name (e.g. `gcp-dev`, `gcp-prod`). |
| `app-name` | string | No | `''` | Application name for P2P convenience variables. Falls back to `TENANT_NAME` when empty. |
| `version` | string | No | `''` | Artifact version for `P2P_VERSION`. Falls back to the `VERSION` env var when empty. |

## Prerequisites

The following environment variables must be set in the job environment (typically via GitHub Environment settings) before the action runs:

| Variable | Description |
|----------|-------------|
| `TENANT_NAME` | Application tenant name. Required for derived auth vars and P2P convenience vars. |
| `PROJECT_ID` | GCP project ID (e.g. `core-platform-dev-1a2b3c`). |
| `PROJECT_NUMBER` | GCP project number (e.g. `123456789012`). |
| `REGION` | GCP region (e.g. `europe-west2`). |

The action warns when `TENANT_NAME` is not set and skips derived auth variables that depend on missing inputs.

## Environment Variables Exported

The action writes variables to `GITHUB_ENV` so that subsequent steps can read them directly.

### Derived authentication variables

Computed from `TENANT_NAME`, `PROJECT_ID`, `PROJECT_NUMBER`, and `REGION`:

| Variable | Formula |
|----------|---------|
| `REGISTRY` | `<REGION>-docker.pkg.dev/<PROJECT_ID>/tenant/<TENANT_NAME>` |
| `SERVICE_ACCOUNT` | `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com` |
| `WORKLOAD_IDENTITY_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/p2p-<TENANT_NAME>/providers/p2p-<TENANT_NAME>` |

### Platform environment aliases

| Variable | Value |
|----------|-------|
| `DPLATFORM` | Set to the `environment` input value |
| `PLATFORM_ENVIRONMENT` | Set to the `environment` input value |

### P2P convenience variables

Exported when `TENANT_NAME` is set in the job environment. These match the variables that `p2p.mk` produces.

| Variable | Value |
|----------|-------|
| `P2P_TENANT_NAME` | `TENANT_NAME` |
| `P2P_APP_NAME` | `app-name` input, or `TENANT_NAME` when empty |
| `P2P_VERSION` | `version` input, or `VERSION` env var |
| `P2P_REGISTRY` | Same as `REGISTRY` |
| `P2P_REGISTRY_FAST_FEEDBACK_PATH` | `fast-feedback` |
| `P2P_REGISTRY_EXTENDED_TEST_PATH` | `extended-test` |
| `P2P_REGISTRY_PROD_PATH` | `prod` |
| `P2P_REGISTRY_FAST_FEEDBACK` | `<REGISTRY>/fast-feedback` |
| `P2P_REGISTRY_EXTENDED_TEST` | `<REGISTRY>/extended-test` |
| `P2P_REGISTRY_PROD` | `<REGISTRY>/prod` |
| `P2P_NAMESPACE` | `<TENANT_NAME>` when app-name equals tenant-name; otherwise `<TENANT_NAME>-<APP_NAME>` |
| `P2P_NAMESPACE_FUNCTIONAL` | `<P2P_NAMESPACE>-functional` |
| `P2P_NAMESPACE_NFT` | `<P2P_NAMESPACE>-nft` |
| `P2P_NAMESPACE_INTEGRATION` | `<P2P_NAMESPACE>-integration` |
| `P2P_NAMESPACE_EXTENDED` | `<P2P_NAMESPACE>-extended` |
| `P2P_NAMESPACE_PROD` | `<P2P_NAMESPACE>-prod` |

## Validation rules

- `environment` is required and must be non-empty.
- The action warns when `TENANT_NAME` is not set, because derived auth variables depend on it.

## See also

- [Environment configuration](../explanation/environment-configuration.md)
- [p2p-execute-command reference](p2p-execute-command.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
