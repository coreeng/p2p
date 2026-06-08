# p2p-workflow-source-security-scan

> Scans repository source for committed secrets, dependency vulnerabilities, and restricted or forbidden licenses. Produces a workflow summary, a compact sticky PR comment, and a `source-security-scan-findings` artifact. A separate policy job fails on findings according to the configured blocking severity.

## Usage

Called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `scope: full-history`.

```yaml
jobs:
  source-security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-source-security-scan.yaml@main
    with:
      scope: changes
      blocking-severity: off
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the checked-out source tree. |
| `blocking-severity` | string | No | `off` | Minimum finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. Verified secrets are treated as `critical`. With `off`, the policy job may fail on findings, but the workflow continues. |
| `ignore-unfixed` | boolean | No | `true` | Passed to Trivy vulnerability scanning. |
| `dry-run` | boolean | No | `false` | When `true`, skips scanner installs, scans, sticky PR comments, artifact upload, and policy enforcement. The summary reports that the scan was skipped. |
| `timeout-minutes` | number | No | `30` | Job timeout for scanner jobs. |

## Permissions

The workflow inherits permissions from the caller. Grant:

| Scope | When required |
|-------|---------------|
| `contents: read` | Always - checkout and source scanning. |
| `pull-requests: write` | `pull_request` events only - posting the sticky PR comment. Without it the comment step is non-fatal; the summary and artifact are still produced. |

## Outputs

| Name | Description |
|------|-------------|
| `report-file` | Path to the generated markdown report inside the runner workspace. |
| `json-file` | Path to the normalized merged JSON report inside the runner workspace. |
| `vulnerability-total` | Number of source vulnerability findings in the normalized report. |
| `vulnerability-blocking` | Number of reported vulnerability findings at or above `blocking-severity`. |
| `license-total` | Number of restricted or forbidden license findings in the normalized report. |
| `secret-total` | Number of redacted TruffleHog findings in the normalized report. |
| `secret-blocking` | Number of TruffleHog findings with `status: verified` when `blocking-severity` is not `off`. |

Results are also surfaced via:

- workflow summary;
- sticky PR comment with `header: source-security-scan-findings` on `pull_request` events;
- `source-security-scan-findings` artifact containing redacted TruffleHog findings, raw Trivy filesystem output, and normalized merged JSON.

## Blocking policy

The workflow is visibility-first by default. Scanner setup or execution errors always fail the workflow. Finding policy is controlled by `blocking-severity`:

- `off`: findings do not fail the workflow, but the `source-security-policy` job fails when vulnerabilities or secrets are found;
- `low`, `medium`, `high`, or `critical`: reported Trivy vulnerability findings at or above that threshold fail the workflow;
- verified TruffleHog secrets are treated as `critical` findings and fail the workflow for any non-`off` threshold.

Restricted and forbidden license findings are report-only for every threshold. The source scan reports only HIGH and CRITICAL license classifications.

Trivy license classifications are triage signals, not a P2P-wide legal policy. Organization-specific allow/deny policy is out of scope for this version.

## See also

- [How to enable scheduled security scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-security-scan reference](p2p-workflow-security-scan.md)
