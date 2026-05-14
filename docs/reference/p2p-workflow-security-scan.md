# p2p-workflow-security-scan

> Scans repository contents for committed secrets using TruffleHog OSS. Produces a workflow summary, a sticky PR comment, and a JSON artifact. Optionally fails the job on verified findings.

## Usage

Called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `scope: changes`, and from a per-repository scheduled wrapper with `scope: full-history`.

```yaml
jobs:
  secret-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@main
    with:
      scope: full-history
      fail-on-findings: false
    permissions:
      contents: read
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `scope` | string | Yes | — | `changes` to scan only the PR/push delta (`<merge-base>..HEAD` for `pull_request`, `<event.before>..HEAD` for `push`), or `full-history` to scan every reachable commit. |
| `fail-on-findings` | boolean | No | `true` | When `true`, fails the job if any blocking finding is detected. Blocking is limited to `verified` findings; `unknown` and `unverified` are reported but never block. |
| `timeout-minutes` | number | No | `30` | Job timeout. Increase for very large repository histories. |

## Secrets

This workflow defines no secrets. It uses the caller's `GITHUB_TOKEN` for the sticky PR comment and artifact upload.

## Outputs

This workflow has no outputs. Results are surfaced via the workflow summary, the sticky PR comment (on `pull_request` events), and the `secret-scan-findings` JSON artifact.

## Permissions

The workflow inherits permissions from the caller. Grant:

| Scope | When required |
|-------|---------------|
| `contents: read` | Always — cloning the repository. |
| `pull-requests: write` | `pull_request` events only — posting the sticky PR comment. Without it the comment step is skipped; the summary and artifact are still produced. |

## Job Graph

1. `security-scan` — Single job that checks out the repository, runs TruffleHog against the configured scope, renders the workflow summary, upserts the sticky PR comment, and uploads the `secret-scan-findings` artifact.

## Artifact format

The `secret-scan-findings` artifact contains a single JSON array, one object per finding:

```json
[
  {
    "id": "sha256 of '<detector>\\0<raw>'",
    "detector": "AWS",
    "status": "verified",
    "file": "config/secrets.yaml",
    "line": 12,
    "commit": "eef6a9735455...",
    "url": "https://github.com/<owner>/<repo>/blob/<sha>/config/secrets.yaml#L12"
  }
]
```

The `id` is stable across runs for the same detector and raw secret value. Raw secret values are never written to the artifact, summary, or comment.

## See also

- [How to enable scheduled secrets scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
