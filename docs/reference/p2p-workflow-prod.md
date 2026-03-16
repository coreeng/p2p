# p2p-workflow-prod

> Deploys to production on the main branch and sends Slack notifications on both failure and success.

## Usage

```yaml
jobs:
  prod:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@main
    with:
      version: ${{ needs.extended-test.outputs.version }}
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
| `version` | `string` | No | `''` | Version identifier passed to the `p2p-prod` make target and included in Slack notifications. Optional, unlike other orchestrator workflows. |
| `version-prefix` | `string` | No | `v` | Prefix prepended to `version` to form the `checkout-version` ref (e.g., `v` + `1.2.3` = `v1.2.3`). |
| `dry-run` | `boolean` | No | `false` | When `true`, runs commands without making persistent changes and skips the success Slack notification. |
| `main-branch` | `string` | No | `refs/heads/main` | Full ref of the main branch, used to gate the deploy job and Slack alerts. |
| `region` | `string` | No | `europe-west2` | Cloud region used by the `p2p-prod` make target. |
| `source` | `string` | No | `${{ vars.PROD }}` | JSON matrix of deploy environments for the prod stage. |
| `working-directory` | `string` | No | `.` | Repository path from which the make target is executed. |
| `app-name` | `string` | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). |
| `tenant-name` | `string` | No | `''` | Tenant name passed to the make target. |
| `skip-subnamespaces-create` | `boolean` | No | `false` | Skips creating subnamespaces before running the make target. |

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
prod-deploy     Runs p2p-prod make target.
                Only runs on main-branch.
                checkout-version = version-prefix + version.

notify-failure  (needs: prod-deploy; runs on main-branch when prod-deploy fails)
notify-success  (needs: prod-deploy; runs on main-branch when prod-deploy succeeds and dry-run=false)
```

`notify-failure` and `notify-success` are independent of each other and run after `prod-deploy` completes. Unlike other orchestrator workflows, this workflow sends a Slack notification on successful deployment as well as on failure.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to configure Slack alerts](../how-to/configure-slack-alerts.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [How to customise versioning](../how-to/customise-versioning.md)
