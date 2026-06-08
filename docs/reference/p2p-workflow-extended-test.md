# p2p-workflow-extended-test

> Runs extended tests in the extended-test environment and promotes to prod, both only on the main branch.

## Usage

```yaml
jobs:
  extended-test:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@main
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
| `version` | `string` | Yes | — | Version identifier for the test and promotion stages. |
| `version-prefix` | `string` | No | `v` | Prefix prepended to `version` to form the `checkout-version` ref (e.g., `v` + `1.2.3` = `v1.2.3`). |
| `dry-run` | `boolean` | No | `false` | When `true`, runs commands without making persistent changes. |
| `main-branch` | `string` | No | `refs/heads/main` | Full ref of the main branch, used to gate all jobs and Slack alerts. |
| `region` | `string` | No | `europe-west2` | Cloud region used by all make targets. |
| `source` | `string` | No | `${{ vars.EXTENDED_TEST }}` | JSON matrix of deploy environments for the extended-test stage. |
| `destination` | `string` | No | `${{ vars.PROD }}` | JSON matrix of deploy environments to promote to after tests pass. |
| `working-directory` | `string` | No | `.` | Repository path from which make targets are executed. |
| `app-name` | `string` | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). |
| `tenant-name` | `string` | No | `''` | Tenant name passed to all make targets. |
| `skip-subnamespaces-create` | `boolean` | No | `false` | Skips creating subnamespaces before running make targets. |
| `artifacts` | `string` | No | `''` | Comma-separated list of artifact paths to upload after each stage. |
| `security-scan-blocking-severity` | `string` | No | `off` | Minimum image-scan finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. Verified image secrets are treated as `critical`. With `off`, the policy job may fail on findings, but the workflow continues. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Single-line `KEY=value` pairs exported as environment variables into make targets. |
| `container_registry_user` | No | Username for authenticating to the container registry. |
| `container_registry_pat` | No | Personal access token for authenticating to the container registry. |
| `container_registry_url` | No | URL of the container registry. |
| `slack_webhook_url` | No | Slack incoming webhook URL. When set, a failure alert is posted if any job fails on the main branch. |

## Outputs

This workflow defines no outputs.

## Job Graph

```
run-tests     Runs p2p-extended-test make target.
              Only runs on main-branch.
              checkout-version = version-prefix + version.
└── promote   (needs: run-tests, image-scan)
              Promotes from source to destination environments.
              Only runs on main-branch.
              checkout-version = version-prefix + version.

image-scan    (independent of run-tests; runs in parallel)
              Calls p2p-workflow-image-scan against the source images.
              Only runs on main-branch.
              Blocks the workflow on findings at or above
              security-scan-blocking-severity (default: off).

notify-failure  (needs: run-tests, image-scan, promote; runs on main-branch when any job fails)
```

All jobs use a matrix derived from `source`. The `promote` job uses a matrix derived from `destination`.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to upload artifacts](../how-to/upload-artifacts.md)
- [How to configure Slack alerts](../how-to/configure-slack-alerts.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [How to customise versioning](../how-to/customise-versioning.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [p2p-workflow-image-scan reference](p2p-workflow-image-scan.md)
