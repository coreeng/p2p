# How to Skip Stages on Pull Requests

Two inputs control what runs on pull requests: `dry-run` skips cloud authentication and build tool invocation entirely, and `run-fastfeedback-integration-on-prs` opts pull requests into integration tests. Integration tests always run on `main` and tag pushes.

## 1. Use `dry-run` for syntax testing

Set `dry-run: true` to skip cloud authentication and build tool invocation. The workflow still runs checkout and environment setup, making it useful for validating workflow syntax without cloud credentials.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    dry-run: true
```

## 2. Enable integration tests on PRs

Integration tests are skipped on pull requests by default. Set `run-fastfeedback-integration-on-prs: true` to run integration tests when the workflow runs on a pull request.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    run-fastfeedback-integration-on-prs: true
```

## 3. Skip cloud work and integration tests on PRs

Use `dry-run` by itself when you want fast PR syntax feedback without cloud access or integration tests:

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    dry-run: ${{ github.event_name == 'pull_request' }}
```

This gives fast PR feedback without requiring cloud access, while still running the full pipeline on `main`.

---

For the full input reference for the fast-feedback workflow, see the [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md).
