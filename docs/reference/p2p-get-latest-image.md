# p2p-get-latest-image.yaml

> Queries an Artifact Registry repository, sorts the available image tags by semantic version, and returns the highest version.

## Usage

```yaml
permissions:
  contents: read
  id-token: write

jobs:
  get-version:
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      image-name: my-app
      github_env: gcp-test
      registry-path: extended-test
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `image-name` | string | Yes | — | Name of the container image to query. |
| `github_env` | string | Yes | — | GitHub Environment to authenticate against. |
| `registry-path` | string | No | `extended-test` | Sub-path within the tenant registry to query (e.g. `fast-feedback`, `extended-test`, `prod`). |
| `tenant-name` | string | No | `''` | Tenant name. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication and returns `0.0.0` as the version. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `working-directory` | string | No | `'.'` | Accepted for caller interface compatibility; version lookup queries Artifact Registry and does not require a checkout. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Accepted for wrapper workflow interface compatibility; not currently consumed by this workflow. |

## Outputs

| Name | Description |
|------|-------------|
| `version` | The highest semver-sorted image tag found in the registry, `0.0.0` when `dry-run` is `true`, or empty when no tags are found. |
| `found` | `true` when a tag was found, or when `dry-run` is `true`; `false` when the registry query succeeds but no tags are available. |

## SemVer sorting logic

The workflow calls `gcloud artifacts docker images list` for `<registry>/<registry-path>/<image-name>`, retrieves all tags, and sorts them using the shared latest-image resolver. The resolver:

1. Parses SemVer tags with an optional leading `v`, such as `1.2.3`, `v1.2.3`, and `1.2.3-alpha.1`.
2. Compares tags by the normalized SemVer value, ignoring build metadata for precedence.
3. Ranks release versions above pre-release versions for the same version core.
4. Returns the original selected tag, preserving whether the registry tag used a leading `v`.

## See also

- [p2p-get-latest-image-extended-test reference](p2p-get-latest-image-extended-test.md)
- [p2p-get-latest-image-prod reference](p2p-get-latest-image-prod.md)
- [Pipeline model](../explanation/pipeline-model.md)
