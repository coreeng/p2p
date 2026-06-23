# p2p-workflow-source-security-scan

> Scans repository source for committed secrets, dependency vulnerabilities, and restricted or forbidden licenses. Produces a workflow summary, optionally posts a sticky PR comment on `pull_request` events when permissions allow, and uploads a `security-source-scan-findings` artifact. The `security-source-policy` job fails on active vulnerability or secret findings; the configured blocking severity controls whether that policy failure fails the workflow.

## Usage

Internal workflow called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `secret-scan-scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `secret-scan-scope: full-history`. Application workflows should call those primary workflows instead.

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `secret-scan-scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the current checked-out source tree. |
| `app-name` | string | No | `''` | Application name used to scope sticky PR comments in multi-app repositories. It does not select source scanner scope or security ignore files. Primary P2P workflow templates pass this through. When omitted by direct callers, comment scope falls back to `tenant-name`, then `vars.TENANT_NAME`. |
| `tenant-name` | string | No | `''` | Tenant identifier used as the sticky comment scope fallback when `app-name` is omitted. |
| `blocking-severity` | string | No | `off` | Minimum finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. When blocking is enabled, verified secrets are treated as `critical`. The `security-source-policy` job fails on active vulnerability or secret findings, but the workflow continues when findings are below the blocking threshold. |
| `ignore-unfixed` | boolean | No | `true` | Passed to Trivy vulnerability scanning. |
| `dry-run` | boolean | No | `false` | When `true`, skips scanner installs, scans, sticky PR comments, artifact upload, and policy enforcement. The summary reports that the scan was skipped. Dry-run still parses discovered `.p2p-security-ignore.yaml` files, so a malformed ignore file can fail report generation. |
| `checkout-version` | string | No | `''` | Git ref to check out before scanning. Ignored when `dry-run` is `true`; the workflow checks out the default ref. |
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
| `report-file` | Path to the generated markdown report on the runner, normally under `runner.temp`. |
| `json-file` | Path to `source-security-findings.json` on the runner, normally under `runner.temp`. |
| `vulnerability-total` | Number of source vulnerability findings in the normalized report. |
| `vulnerability-blocking` | Number of reported vulnerability findings at or above `blocking-severity`. |
| `license-total` | Number of restricted or forbidden license findings in the normalized report. |
| `secret-total` | Number of redacted TruffleHog findings in the normalized report. |
| `secret-blocking` | Number of TruffleHog findings with `status: verified` when `blocking-severity` is not `off`. |
| `security-risk` | Maximum active source vulnerability/secret risk after ignore rules: `critical`, `unclassified`, `high`, `medium`, `low`, `ok`, or `unknown`. License findings are not included. |
| `scan-status` | `ok` when scanner results were extracted successfully, otherwise `failed`. |

Results are also surfaced via:

- workflow summary;
- policy step named `Output security risk: <risk>; scan: <status>` for dashboard extraction;
- sticky PR comment with `header: security-source-scan-findings-<app-name>` on `pull_request` events;
- `security-source-scan-findings` artifact containing redacted TruffleHog findings, raw Trivy filesystem output, and `source-security-findings.json`.

Source report generation discovers every `.p2p-security-ignore.yaml` in the repository. Source vulnerability and source secret findings that match a valid, unexpired ignore entry in an applicable ignore file are omitted from active finding tables in the workflow summary and sticky PR comment. Each ignore file's source entries apply only to findings under the directory containing that file; the repository-root ignore file applies to the whole repository. Ignored findings stay visible in `source-security-findings.json` with their ignore reason and expiry metadata when present. They are excluded from active totals, active blocking counts, and policy failures.

`source-security-findings.json` uses top-level `vulnerabilities`, `licenses`, and `secrets` collections. When an ignore file is present, it also includes `ignored.vulnerabilities` and `ignored.secrets`.

The source scan scope is scanner-specific and repository-wide, not folder-scoped. With `secret-scan-scope: changes`, TruffleHog scans the changed git commit range across the repository, while Trivy source dependency vulnerability scanning/SCA scans the current checked-out source tree. With `secret-scan-scope: full-history`, TruffleHog scans reachable git history across the repository, while Trivy scans the current branch's checked-out source tree. When called from fast-feedback, the source scan checks out the same `checkout-version` ref as build, test, and promotion jobs. `working-directory` does not limit either source scanner, so shared manifests and related modules outside the P2P make target directory are still covered.

## Security ignore file

The source security workflow discovers every P2P-owned `.p2p-security-ignore.yaml` file in the repository. If no ignore files are present, scans behave normally. If any discovered ignore file is malformed, uses an unsupported schema version, omits required fields, has invalid shapes, contains invalid expiry dates, or has a source path filter that resolves outside the ignore file's directory, the scan/report job fails even when there are no findings under that directory.

See [How to ignore security findings](../how-to/ignore-security-findings.md) for the v1 schema, matching rules, and secret ID guidance. Source ignore discovery is independent of `working-directory` and `app-name`.

## Blocking policy

The workflow is visibility-first by default. Scanner setup or execution errors always fail the workflow. Finding policy is controlled by `blocking-severity`:

- `off`: findings do not fail the workflow, but the `security-source-policy` job fails when vulnerabilities or secrets are found;
- `low`, `medium`, `high`, or `critical`: reported Trivy vulnerability findings below that threshold fail only the `security-source-policy` job, while findings at or above that threshold fail the workflow;
- verified TruffleHog secrets are treated as `critical` findings and fail the workflow for any non-`off` threshold.

Restricted and forbidden license findings are report-only for every threshold. The source scan reports only HIGH and CRITICAL license classifications.

Trivy license classifications are triage signals, not a P2P-wide legal policy. Organization-specific allow/deny policy is out of scope for this version.

## See also

- [How to enable scheduled security scanning](../how-to/enable-scheduled-security-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-security-scan reference](p2p-workflow-security-scan.md)
