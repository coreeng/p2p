# resolve-platform-config

> Resolves platform configuration from GitHub Environments, a repo file, or a central repo and exports environment variables for downstream workflow steps.

## Usage

```yaml
steps:
  - uses: coreeng/p2p/.github/actions/resolve-platform-config@main
    with:
      environment: gcp-dev
      config-mode: repo-file
      repo-file-path: .github/platform-config.yaml
      fields: full
      app-name: my-app
      version: ${{ needs.version.outputs.version }}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | string | Yes | — | Target environment name (e.g. `gcp-dev`, `gcp-prod`). |
| `config-mode` | string | No | `''` | Config resolution mode: `github-env`, `repo-file`, or `central-repo`. Defaults to `github-env` when empty. |
| `repo-file-path` | string | No | `''` | Path to the config file in the repo. Required when `config-mode` is `repo-file`. |
| `central-repo-name` | string | No | `''` | Central config repo name. Required when `config-mode` is `central-repo`. |
| `central-repo-owner` | string | No | `''` | Central config repo owner. Required when `config-mode` is `central-repo`. |
| `central-repo-path-pattern` | string | No | `'environments/{env}/config.yaml'` | Path pattern in the central repo. `{env}` is replaced with the environment name. |
| `central-repo-token` | string | No | `''` | GitHub token for central repo access. Required when `config-mode` is `central-repo`. |
| `fields` | string | No | `'full'` | Field set to export: `core` or `full`. |
| `app-name` | string | No | `''` | Application name override. Falls back to `TENANT_NAME` when empty. |
| `version` | string | No | `''` | Version string override. Falls back to the `VERSION` env var when empty. |

## Outputs

| Name | Description |
|------|-------------|
| `resolved` | `true` when config was resolved from a file source (`repo-file` or `central-repo`); `false` for `github-env` mode. |

## Environment Variables Exported

The action writes variables to `GITHUB_ENV` so that subsequent steps can read them directly.

### Platform fields

Exported when `config-mode` is `repo-file` or `central-repo`.

**Core fields** (always exported):

| Variable | Source |
|----------|--------|
| `PROJECT_ID` | `.platform.projectId` |
| `PROJECT_NUMBER` | `.platform.projectNumber` |
| `REGION` | `.platform.region` |

**Full fields** (exported when `fields` is `full`):

| Variable | Source |
|----------|--------|
| `BASE_DOMAIN` | `.ingressDomains[0].domain` |
| `INTERNAL_SERVICES_DOMAIN` | `.internalServices.domain` |
| `DPLATFORM` | Set to the `environment` input value |
| `PLATFORM_ENVIRONMENT` | Set to the `environment` input value |

### Derived authentication variables

Computed from `TENANT_NAME`, `PROJECT_ID`, `PROJECT_NUMBER`, and `REGION`:

| Variable | Formula |
|----------|---------|
| `REGISTRY` | `<REGION>-docker.pkg.dev/<PROJECT_ID>/tenant/<TENANT_NAME>` |
| `SERVICE_ACCOUNT` | `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com` |
| `WORKLOAD_IDENTITY_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/p2p-<TENANT_NAME>/providers/p2p-<TENANT_NAME>` |

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

## Config file format

### Repo file (`config-mode: repo-file`)

The file contains an `environments` map keyed by environment name:

```yaml
environments:
  gcp-dev:
    platform:
      projectId: core-platform-dev-1a2b3c
      projectNumber: "123456789012"
      region: europe-west2
    ingressDomains:
      - domain: dev.example.com
    internalServices:
      domain: internal.dev.example.com
  gcp-prod:
    platform:
      projectId: core-platform-prod-4d5e6f
      projectNumber: "987654321098"
      region: europe-west2
    ingressDomains:
      - domain: prod.example.com
    internalServices:
      domain: internal.prod.example.com
```

### Central repo (`config-mode: central-repo`)

Each environment has its own file. The file contains the environment block directly (no `environments` wrapper):

```yaml
platform:
  projectId: core-platform-dev-1a2b3c
  projectNumber: "123456789012"
  region: europe-west2
ingressDomains:
  - domain: dev.example.com
internalServices:
  domain: internal.dev.example.com
```

The action clones the central repo with a sparse checkout and reads the file at the path produced by replacing `{env}` in `central-repo-path-pattern` with the `environment` input.

## Validation rules

- `environment` is required and must be non-empty.
- `config-mode` must be one of `github-env`, `repo-file`, or `central-repo` (or empty, which defaults to `github-env`).
- `fields` must be `core` or `full`.
- When `config-mode` is `repo-file`, `repo-file-path` is required.
- When `config-mode` is `central-repo`, `central-repo-name`, `central-repo-owner`, and `central-repo-token` are all required.
- Setting repo-file or central-repo inputs without setting `config-mode` produces an error.
- All core fields (`PROJECT_ID`, `PROJECT_NUMBER`, `REGION`) must be present and non-null in the config file.
- All full fields (`BASE_DOMAIN`, `INTERNAL_SERVICES_DOMAIN`) must be present and non-null when `fields` is `full`.
- The action warns when `TENANT_NAME` is not set, because derived auth variables depend on it.

## See also

- [Environment configuration](../explanation/environment-configuration.md)
- [p2p-execute-command reference](p2p-execute-command.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
