# How to Upload Artifacts

Pass the `artifacts` input to a P2P workflow to upload files produced by your make targets as GitHub Actions artifacts after each command runs.

## The `artifacts` input format

`artifacts` is a YAML string mapping each make command name to a list of path globs. After a command runs, the workflow collects files matching the globs and uploads them as a named artifact.

Pass it under the `with:` block of your workflow call:

```yaml
with:
  version: ${{ needs.version.outputs.version }}
  artifacts: |
    p2p-build:
      - reports/build/**
    p2p-functional:
      - reports/functional/**
      - reports/shared/**
    p2p-nft:
      - reports/nft/**
    p2p-integration:
      - reports/integration/**
  # other inputs omitted
```

Only the entry matching the command currently executing is used. Commands with no entry in the map produce no artifact upload.

## Upload artifacts from an extended-test workflow

```yaml
with:
  version: ${{ needs.version.outputs.version }}
  artifacts: |
    p2p-extended-test:
      - reports/extended/**
  # other inputs omitted
```

## How `working-directory` affects paths

If you set `working-directory: ./service`, artifact paths are resolved relative to `./service`. The glob `reports/build/**` becomes `service/reports/build/**` when the artifact is uploaded.

Absolute paths (starting with `/`) are used as-is regardless of `working-directory`.

## How artifacts are named

Each uploaded artifact is named:

```
<command>-<env>-run<run_number>-attempt<run_attempt>
```

For example: `p2p-build-fast-feedback-run12-attempt1`.

Artifacts are retained for 14 days. If no files match the configured globs, the upload step emits a warning but does not fail the workflow.

## Reference

- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md) — `artifacts` input details
- [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md) — `artifacts` input details
