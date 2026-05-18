# p2p-workflow-source-security-scan

> Scans repository source for committed secrets, dependency vulnerabilities, and restricted or forbidden licenses. Produces a workflow summary, a compact sticky PR comment, and a `source-security-scan-findings` artifact. Optionally fails the job on blocking vulnerability or verified secret findings.

## Usage

Called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `scope: full-history`.

```yaml
jobs:
  source-security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-source-security-scan.yaml@main
    with:
      scope: changes
      fail-on-findings: false
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the checked-out source tree. |
| `fail-on-findings` | boolean | No | `false` | When `true`, fails the job if any reported vulnerability at `blocking-severity` or verified secret is detected. License findings never block. |
| `severity` | string | No | `CRITICAL,HIGH` | Comma-separated Trivy vulnerability severities to report, matching image scan semantics. |
| `blocking-severity` | string | No | `CRITICAL` | Comma-separated vulnerability severities that count towards the blocking policy. Must be a subset of `severity` to have an effect. |
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
| `vulnerability-blocking` | Number of reported vulnerability findings whose severity is listed in `blocking-severity`. |
| `license-total` | Number of restricted or forbidden license findings in the normalized report. |
| `secret-total` | Number of redacted TruffleHog findings in the normalized report. |
| `secret-blocking` | Number of TruffleHog findings with `status: verified`. |

Results are also surfaced via:

- workflow summary;
- sticky PR comment with `header: source-security-scan-findings` on `pull_request` events;
- `source-security-scan-findings` artifact containing redacted TruffleHog findings, raw Trivy filesystem output, and normalized merged JSON.

## Blocking policy

The workflow is visibility-first by default. When `fail-on-findings: true`, it fails only for:

- reported Trivy vulnerability findings whose severity is listed in `blocking-severity`;
- TruffleHog findings with `status: verified`.

Restricted and forbidden license findings are report-only, even when `fail-on-findings: true`. The source scan reports only HIGH and CRITICAL license classifications.

Trivy license classifications are triage signals, not a P2P-wide legal policy. Organization-specific allow/deny policy is out of scope for this version.

## See also

- [How to enable scheduled source security scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-security-scan reference](p2p-workflow-security-scan.md)
