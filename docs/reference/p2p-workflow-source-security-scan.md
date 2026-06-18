# p2p-workflow-source-security-scan

> Scans repository source for committed secrets, dependency vulnerabilities, and restricted or forbidden licenses. Produces a workflow summary, a compact sticky PR comment, and a `source-security-scan-findings` artifact. A separate policy job fails on findings according to the configured blocking severity.

## Usage

Called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `secret-scan-scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `secret-scan-scope: full-history`.

```yaml
jobs:
  source-security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-source-security-scan.yaml@main
    with:
      secret-scan-scope: changes
      blocking-severity: off
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `secret-scan-scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the current checked-out source tree. |
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
| `json-file` | Path to `source-security-findings.json` inside the runner workspace. |
| `vulnerability-total` | Number of source vulnerability findings in the normalized report. |
| `vulnerability-blocking` | Number of reported vulnerability findings at or above `blocking-severity`. |
| `license-total` | Number of restricted or forbidden license findings in the normalized report. |
| `secret-total` | Number of redacted TruffleHog findings in the normalized report. |
| `secret-blocking` | Number of TruffleHog findings with `status: verified` when `blocking-severity` is not `off`. |

Results are also surfaced via:

- workflow summary;
- sticky PR comment with `header: source-security-scan-findings` on `pull_request` events;
- `source-security-scan-findings` artifact containing redacted TruffleHog findings, raw Trivy filesystem output, and `source-security-findings.json`.

If the repository root contains `.p2p-security-ignore.yaml`, source vulnerability and source secret findings that match a valid, unexpired ignore entry are omitted from active finding tables in the workflow summary and sticky PR comment. Ignored findings stay visible in `source-security-findings.json` with their ignore reason and expiry metadata when present. They are excluded from active totals, active blocking counts, and policy failures.

`source-security-findings.json` uses top-level `vulnerabilities`, `licenses`, and `secrets` collections. When an ignore file is present, it also includes `ignored.vulnerabilities` and `ignored.secrets`.

The source scan scope is scanner-specific. With `secret-scan-scope: changes`, TruffleHog limits git scanning to the changed commit range, while Trivy still scans the current checked-out source tree. With `secret-scan-scope: full-history`, TruffleHog scans reachable git history, while Trivy still scans only the current branch's checked-out tree. Trivy is not limited to `working-directory`, so shared manifests and related modules outside the P2P make target directory are still covered.

## Security ignore file

The source security workflow reads one P2P-owned ignore file from the repository root: `.p2p-security-ignore.yaml`. If the file is absent, scans behave normally. If it is present but malformed, uses an unsupported schema version, omits required fields, has invalid shapes, or contains invalid expiry dates, the scan/report job fails.

See [How to ignore security findings](../how-to/ignore-security-findings.md) for the v1 schema, matching rules, and secret ID guidance. The source scan uses the repository-root ignore file even when other P2P workflows use a non-root `working-directory`.

## Blocking policy

The workflow is visibility-first by default. Scanner setup or execution errors always fail the workflow. Finding policy is controlled by `blocking-severity`:

- `off`: findings do not fail the workflow, but the `source-security-policy` job fails when vulnerabilities or secrets are found;
- `low`, `medium`, `high`, or `critical`: reported Trivy vulnerability findings at or above that threshold fail the workflow;
- verified TruffleHog secrets are treated as `critical` findings and fail the workflow for any non-`off` threshold.

Restricted and forbidden license findings are report-only for every threshold. The source scan reports only HIGH and CRITICAL license classifications.

Trivy license classifications are triage signals, not a P2P-wide legal policy. Organization-specific allow/deny policy is out of scope for this version.

## See also

- [How to enable scheduled security scanning](../how-to/enable-scheduled-security-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-security-scan reference](p2p-workflow-security-scan.md)
