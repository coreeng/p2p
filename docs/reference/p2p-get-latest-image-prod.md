# p2p-get-latest-image-prod.yaml

> Wraps `p2p-get-latest-image.yaml` with prod defaults to retrieve the latest promoted image from the `prod` registry path.

## Usage

```yaml
permissions:
  contents: read
  id-token: write

jobs:
  get-version:
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-prod.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
      slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
    with:
      image-name: my-app
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `image-name` | string | Yes | — | Name of the container image to query. |
| `environment` | string | No | `${{ vars.PROD }}` | JSON matrix string describing the GitHub environment to authenticate against. |
| `registry-path` | string | No | `prod` | Sub-path within the tenant registry to query. |
| `tenant-name` | string | No | `''` | Tenant name. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `working-directory` | string | No | `'.'` | Accepted for caller interface compatibility; version lookup queries Artifact Registry and does not require a checkout. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication and returns `0.0.0` as the version. |
| `main-branch` | string | No | `refs/heads/main` | The ref on which the workflow executes. The job and failure notification are skipped when the triggering ref does not match. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs forwarded to the underlying `p2p-get-latest-image` job. |
| `slack_webhook_url` | No | Slack incoming webhook URL. When set, a notification is posted on failure (main branch only). |

## Outputs

| Name | Description |
|------|-------------|
| `version` | The highest semver-sorted image tag found in the `prod` registry path, `0.0.0` when `dry-run` is `true`, or empty when no tags are found. |

## Job Graph

1. `get-latest-version` — Calls `p2p-get-latest-image.yaml`. Only runs when `github.ref == main-branch`.
2. `notify-failure` — Sends a Slack alert if `slack_webhook_url` is set and `get-latest-version` failed on the main branch. Depends on `get-latest-version`.

## See also

- [How to configure Slack alerts](../how-to/configure-slack-alerts.md)
- [Pipeline model](../explanation/pipeline-model.md)
- [p2p-get-latest-image reference](p2p-get-latest-image.md)
