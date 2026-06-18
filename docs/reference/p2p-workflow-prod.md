# p2p-workflow-prod

> Deploys to production on the main branch and sends Slack notifications on both failure and success.

## Usage

```yaml
jobs:
  prod:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@main
    with:
      version: ${{ needs.fast-feedback.outputs.version }}
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
      container_registry_user: ${{ secrets.CONTAINER_REGISTRY_USER }}
      container_registry_pat: ${{ secrets.CONTAINER_REGISTRY_PAT }}
      container_registry_url: ${{ secrets.CONTAINER_REGISTRY_URL }}
      slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `version` | `string` | Yes | — | Non-empty version identifier passed to the image scan and `p2p-prod` make target, and included in Slack notifications. |
| `version-prefix` | `string` | No | `v` | Prefix prepended to `version` to form the `checkout-version` ref (e.g., `v` + `1.2.3` = `v1.2.3`). |
| `dry-run` | `boolean` | No | `false` | When `true`, runs commands without making persistent changes and skips the success Slack notification. |
| `main-branch` | `string` | No | `refs/heads/main` | Full ref of the main branch, used to gate the deploy job and Slack alerts. |
| `region` | `string` | No | `europe-west2` | Cloud region used by the `p2p-prod` make target. |
| `source` | `string` | No | `${{ vars.PROD }}` | JSON matrix of deploy environments for the prod stage. |
| `working-directory` | `string` | No | `.` | Repository path from which the make target is executed. |
| `app-name` | `string` | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). |
| `tenant-name` | `string` | No | `''` | Tenant name passed to the make target. |
| `skip-subnamespaces-create` | `boolean` | No | `false` | Skips creating subnamespaces before running the make target. |
| `security-scan-blocking-severity` | `string` | No | `off` | Minimum image-scan finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. Verified image secrets are treated as `critical`. With `off`, the policy job may fail on findings, but the workflow continues. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Single-line `KEY=value` pairs exported as environment variables into the make target. |
| `container_registry_user` | No | Username for authenticating to the container registry. |
| `container_registry_pat` | No | Personal access token for authenticating to the container registry. |
| `container_registry_url` | No | URL of the container registry. |
| `slack_webhook_url` | No | Slack incoming webhook URL. When set, both failure and success alerts are posted on the main branch. |

## Outputs

This workflow defines no outputs.

## Job Graph

```
validate-version
                Fails early when version is empty.

└── image-scan  Calls p2p-workflow-image-scan against the prod-registry images.
                Only runs on main-branch.
                Blocks the workflow on findings at or above
                security-scan-blocking-severity (default: off).
└── prod-deploy (needs: image-scan)
                Runs p2p-prod make target.
                Only runs on main-branch after image-scan succeeds.
                checkout-version = version-prefix + version.

notify-failure  (needs: validate-version, image-scan, prod-deploy; runs on main-branch when any job fails)
notify-success  (needs: prod-deploy; runs on main-branch when prod-deploy succeeds and dry-run=false)
```

`notify-failure` and `notify-success` are independent of each other and run after `prod-deploy` completes. Unlike other orchestrator workflows, this workflow sends a Slack notification on successful deployment as well as on failure.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to configure Slack alerts](../how-to/configure-slack-alerts.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [How to customise versioning](../how-to/customise-versioning.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [p2p-workflow-image-scan reference](p2p-workflow-image-scan.md)
