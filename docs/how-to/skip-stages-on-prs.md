# How to Skip Stages on Pull Requests

Two inputs let you reduce what runs on pull requests: `dry-run` skips cloud authentication and build tool invocation entirely, and `skip-fastfeedback-integration-on-prs` skips integration tests on PRs while keeping them on `main` and tag pushes.

## 1. Use `dry-run` for syntax testing

Set `dry-run: true` to skip cloud authentication and build tool invocation. The workflow still runs checkout and environment setup, so it is useful for validating workflow syntax without needing cloud credentials.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    dry-run: true
```

## 2. Skip integration tests on PRs

Set `skip-fastfeedback-integration-on-prs: true` to skip integration tests when the workflow runs on a pull request. Integration tests still run on pushes to `main` and on tag pushes.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    skip-fastfeedback-integration-on-prs: true
```

## 3. Combine both inputs

You can use `dry-run` and `skip-fastfeedback-integration-on-prs` together. A common pattern is to enable `dry-run` only on PRs using a conditional expression while also skipping integration tests:

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    dry-run: ${{ github.event_name == 'pull_request' }}
    skip-fastfeedback-integration-on-prs: true
```

This gives fast PR feedback without requiring cloud access, while still running the full pipeline on `main`.

---

For the full input reference for the fast-feedback workflow, see the [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md).
