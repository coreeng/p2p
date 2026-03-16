# How to Configure Slack Alerts

P2P workflows send Slack notifications on failure (and, for `p2p-workflow-prod`, also on success) when you supply a webhook URL. Alerts are only sent on the main branch.

## Store the webhook URL as a secret

1. Create an incoming webhook in your Slack workspace and copy the URL.
2. Add it to your repository under **Settings > Secrets and variables > Actions** — for example, as `P2P_SLACK_WEBHOOK_URL`.

## Pass the webhook URL to your workflows

Add the `slack_webhook_url` secret to each workflow call that should send alerts.

**fastfeedback:**

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  secrets:
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
    # other secrets omitted
  with:
    version: ${{ needs.version.outputs.version }}
```

**extended-test:**

```yaml
extended-test:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
  secrets:
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
    # other secrets omitted
  with:
    version: ${{ needs.version.outputs.version }}
```

**prod:**

```yaml
prod:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@v1
  secrets:
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
    # other secrets omitted
  with:
    version: ${{ needs.version.outputs.version }}
```

**version:**

```yaml
version:
  uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
  secrets:
    git-token: ${{ secrets.GITHUB_TOKEN }}
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
```

**get-latest-image-extended-test:**

```yaml
get-latest:
  uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-extended-test.yaml@v1
  secrets:
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
    # other secrets omitted
  with:
    image-name: my-app
```

**get-latest-image-prod:**

```yaml
get-latest:
  uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-prod.yaml@v1
  secrets:
    slack_webhook_url: ${{ secrets.P2P_SLACK_WEBHOOK_URL }}
    # other secrets omitted
  with:
    image-name: my-app
```

## What gets notified

| Workflow | Failure alert | Success alert |
|---|---|---|
| `p2p-workflow-fastfeedback` | On main branch | No |
| `p2p-workflow-extended-test` | On main branch | No |
| `p2p-workflow-prod` | On main branch | On main branch (non-dry-run) |
| `p2p-version` | On main branch | No |
| `p2p-get-latest-image-extended-test` | On main branch | No |
| `p2p-get-latest-image-prod` | On main branch | No |

If `slack_webhook_url` is not set or is empty, all notification steps are silently skipped.

## Reference

- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md)
- [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md)
- [p2p-workflow-prod reference](../reference/p2p-workflow-prod.md)
- [p2p-version reference](../reference/p2p-version.md)
- [p2p-get-latest-image-extended-test reference](../reference/p2p-get-latest-image-extended-test.md)
- [p2p-get-latest-image-prod reference](../reference/p2p-get-latest-image-prod.md)
