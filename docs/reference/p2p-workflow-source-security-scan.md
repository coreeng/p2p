# p2p-workflow-source-security-scan

> Scans repository source for committed secrets, dependency vulnerabilities, and restricted or forbidden licenses. Produces a workflow summary, optionally posts a sticky PR comment on `pull_request` events when permissions allow, and uploads a `security-source-scan-findings` artifact. The `security-source-policy` job fails on active vulnerability or secret findings; the configured blocking severity controls whether that policy failure fails the workflow.

## Usage

Internal workflow called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `secret-scan-scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `secret-scan-scope: full-history`. Application workflows should call those primary workflows instead.

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `secret-scan-scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the current checked-out source tree. |
| `app-name` | string | No | `''` | Application name used to scope sticky PR comments in multi-Application repositories. Primary P2P workflow templates pass this through. When omitted by direct callers, comment scope falls back to `tenant-name`, then `vars.TENANT_NAME`. |
| `tenant-name` | string | No | `''` | Tenant identifier used as the sticky comment scope fallback when `app-name` is omitted. |
| `working-directory` | string | No | `.` | Repository-relative Application directory used to select the Application Security Ignore file. Source detection remains repository-wide and is not limited to this path. |
| `blocking-severity` | string | No | `off` | Minimum finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. When blocking is enabled, verified secrets are treated as `critical`. The `security-source-policy` job fails on active vulnerability or secret findings, but the workflow continues when findings are below the blocking threshold. |
| `ignore-unfixed` | boolean | No | `true` | Passed to Trivy vulnerability scanning. |
| `dry-run` | boolean | No | `false` | When `true`, skips scanner installs, scans, sticky PR comments, artifact upload, and policy enforcement. The summary reports that the scan was skipped. Dry-run still validates Repository Security Ignore and Application Security Ignore files, so a malformed ignore file can fail report generation. |
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

If source vulnerability or source secret findings match a valid, unexpired Repository Security Ignore or current Application Security Ignore entry, they are omitted from active finding tables in the workflow summary and sticky PR comment. Those surfaces do not expose ignore reasons. Ignored findings stay visible in `source-security-findings.json` under `ignored.vulnerabilities` and `ignored.secrets`. They are excluded from active totals, active blocking counts, and policy failures.

`source-security-findings.json` uses top-level `vulnerabilities`, `licenses`, and `secrets` collections. It always includes top-level `ignoreFiles`, using `[]` when no ignore files are loaded. Ignored findings include `matchedIgnores`; each match records `scope`, `path`, `reason`, and optional `expires`.

The source scan scope is scanner-specific. With `secret-scan-scope: changes`, TruffleHog limits git scanning to the changed commit range, while Trivy still scans the current checked-out source tree. With `secret-scan-scope: full-history`, TruffleHog scans reachable git history, while Trivy still scans only the current branch's checked-out tree. When called from fast-feedback, the source scan checks out the same `checkout-version` ref as build, test, and promotion jobs. Trivy is not limited to `working-directory`, so shared manifests and related modules outside the P2P make target directory are still covered. Source detection remains repository-wide; only ignore evaluation uses the Repository Security Ignore plus the Application Security Ignore selected by `working-directory`.

## Security ignore file

The source security workflow reads the Repository Security Ignore from `.p2p-security-ignore.yaml` at the repository root when present. When `working-directory` is non-root, it also reads the Application Security Ignore from `<working-directory>/.p2p-security-ignore.yaml` when present. If a loaded file is malformed, uses an unsupported schema version, omits required fields, has invalid shapes, or contains invalid expiry dates, the scan/report job fails, including during dry-run.

See [How to ignore security findings](../how-to/ignore-security-findings.md) for the v1 schema, matching rules, and secret ID guidance. `app-name` does not affect ignore file selection.

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
