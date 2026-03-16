# p2p-get-latest-image.yaml

> Queries an Artifact Registry repository, sorts the available image tags by semantic version, and returns the highest version.

## Usage

```yaml
jobs:
  get-version:
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      image-name: my-app
      environment: ${{ vars.EXTENDED_TEST }}
      registry-path: extended-test
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `image-name` | string | Yes | — | Name of the container image to query. |
| `environment` | string | Yes | — | JSON matrix string describing the GitHub environment to authenticate against. |
| `registry-path` | string | No | `extended-test` | Sub-path within the tenant registry to query (e.g. `fast-feedback`, `extended-test`, `prod`). |
| `tenant-name` | string | No | `''` | Tenant name. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication and returns `0.0.0` as the version. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `working-directory` | string | No | `'.'` | Working directory for the version-lookup step. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs decoded into the job environment. |

## Outputs

| Name | Description |
|------|-------------|
| `version` | The highest semver-sorted image tag found in the registry, or `0.0.0` when `dry-run` is `true`. |

## Semver sorting logic

The workflow calls `gcloud artifacts docker images list` for `<registry>/<registry-path>/<image-name>`, retrieves all tags, and sorts them using a `jq` expression that:

1. Extracts the version core (e.g. `1.2.3`) and pre-release identifier (e.g. `alpha.1`) from each tag.
2. Sorts first by name prefix, then by numeric version core components, then by whether a pre-release suffix is present (release versions rank above pre-release), then by the pre-release components.
3. Reverses the sort and returns the first (highest) entry.
