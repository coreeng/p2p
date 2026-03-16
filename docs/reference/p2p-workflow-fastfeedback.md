# p2p-workflow-fastfeedback

> Runs build, functional, NFT, and integration tests in the fast-feedback environment, then promotes to extended-test on main or tag pushes.

## Usage

```yaml
jobs:
  fast-feedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@main
    with:
      version: ${{ needs.version.outputs.version }}
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
| `version` | `string` | Yes | — | Version identifier for the build and all subsequent stages. |
| `dry-run` | `boolean` | No | `false` | When `true`, runs commands without making persistent changes. |
| `main-branch` | `string` | No | `refs/heads/main` | Full ref of the main branch, used to gate promotion and Slack alerts. |
| `checkout-version` | `string` | No | `''` | Git ref to check out. Defaults to the current workflow ref when empty. |
| `app-name` | `string` | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). |
| `tenant-name` | `string` | No | `''` | Tenant name passed to all make targets. |
| `region` | `string` | No | `europe-west2` | Cloud region used by all make targets. |
| `source` | `string` | No | `${{ vars.FAST_FEEDBACK }}` | JSON matrix of deploy environments for the fast-feedback stage. |
| `destination` | `string` | No | `${{ vars.EXTENDED_TEST }}` | JSON matrix of deploy environments to promote to after integration tests pass. |
| `working-directory` | `string` | No | `.` | Repository path from which make targets are executed. |
| `skip-fastfeedback-integration-on-prs` | `boolean` | No | `false` | When `true`, skips the `integration-test` job on pull requests (runs unconditionally on main or tags). |
| `skip-subnamespaces-create` | `boolean` | No | `false` | Skips creating subnamespaces before running make targets. |
| `artifacts` | `string` | No | `''` | Comma-separated list of artifact paths to upload after each stage. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Single-line `KEY=value` pairs exported as environment variables into make targets. |
| `container_registry_user` | No | Username for authenticating to the container registry. |
| `container_registry_pat` | No | Personal access token for authenticating to the container registry. |
| `container_registry_url` | No | URL of the container registry. |
| `slack_webhook_url` | No | Slack incoming webhook URL. When set, a failure alert is posted if any job fails on the main branch. |

## Outputs

| Name | Description |
|------|-------------|
| `version` | The `version` input, passed through unchanged for downstream workflows to consume. |

## Job Graph

```
build
├── functional-test   (needs: build)
└── nft-test          (needs: build)
    └── integration-test  (needs: functional-test, nft-test)
                          Skipped when skip-fastfeedback-integration-on-prs=true
                          AND ref is not main-branch AND ref_type is not tag.
        └── promote       (needs: integration-test)
                          Runs only on main-branch or tag pushes.

notify-failure        (needs: all jobs; runs on main-branch when any job fails)
```

All jobs use a matrix derived from `source`. The `promote` job uses a matrix derived from `destination`.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to upload artifacts](../how-to/upload-artifacts.md)
- [How to skip stages on pull requests](../how-to/skip-stages-on-prs.md)
- [How to configure Slack alerts](../how-to/configure-slack-alerts.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
