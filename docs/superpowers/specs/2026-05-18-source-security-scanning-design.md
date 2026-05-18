# Source Security Scanning - Design

**Status:** Approved
**Author:** P2P platform team
**Date:** 2026-05-18

## Goal

Replace the git-only secret scan with a source security scan that covers both committed secrets and source dependency SCA findings. The scan should run on the same PR/push and scheduled paths that use secret scanning today, produce one compact sticky PR comment, and keep the blocking policy predictable for P2P consumers across different organizations.

## Motivation

P2P currently gives tenants platform-managed secret scanning through `p2p-workflow-secret-scan`, and image vulnerability scanning through `p2p-workflow-image-scan`. There is no source-level SCA scan for lockfiles and dependency manifests before an image is built.

Adding Trivy filesystem scanning fills that source dependency gap. Because P2P is reused by multiple organizations and does not yet support per-organization legal policy, license findings should be visible but not enforcing. Secret detection should stay with TruffleHog rather than enabling Trivy's secret scanner, so tenants keep one secrets signal with the existing verification semantics.

## Decisions

| Area | Decision |
|---|---|
| Workflow | Add a new reusable workflow: `p2p-workflow-source-security-scan.yaml`. No backward compatibility with the old `p2p-workflow-secret-scan.yaml` name is required. |
| Callers | Update fast-feedback and the scheduled security umbrella to call the new source security workflow. |
| Topology | Three jobs: `secret-scan` runs TruffleHog, `sca-scan` runs Trivy, and `report` merges the outputs into one summary, one sticky PR comment, and one artifact. |
| Secret scanner | Keep the existing TruffleHog git scan behavior and JSON normalization. |
| SCA scanner | Run Trivy filesystem scanning with `--scanners vuln,license --format json` against the checked-out repository. |
| Trivy secrets | Explicitly keep Trivy's secret scanner off; TruffleHog owns secrets. |
| Misconfiguration scanner | Out of scope for v1. IaC/config scanning is useful, but it is a different policy surface from source dependency SCA. |
| Vulnerabilities | Report `HIGH,CRITICAL` vulnerabilities by default, matching the compact style used by image scanning. |
| Licenses | Report only `HIGH,CRITICAL` license findings, which correspond to Trivy `Restricted` and `Forbidden` classifications. |
| License blocking | Licenses are report-only. They never fail the workflow, even when `fail-on-findings` is true. |
| Blocking | When `fail-on-findings` is true, block on high/critical vulnerability findings and verified TruffleHog secrets only. |
| Comment | One sticky PR comment, `header: source-security-scan-findings`, styled like image scanning with a short summary and foldable details sections. |
| Artifact | Upload one source security artifact containing raw scanner outputs and the normalized merged JSON. |

## Architecture

```text
source-security-scan
|-- secret-scan
|   |-- Checkout
|   |-- Determine scan range              (changes scope only)
|   |-- Install TruffleHog
|   |-- Scan git history/tree
|   `-- Upload/emit normalized secret JSON
|-- sca-scan
|   |-- Checkout
|   |-- Install Trivy
|   |-- Run trivy fs --scanners vuln,license
|   `-- Upload/emit raw Trivy JSON
`-- report
    |-- Download scanner outputs
    |-- Normalize Trivy vulnerabilities and license findings
    |-- Build compact markdown report
    |-- Write workflow summary
    |-- Upsert sticky PR comment          (pull_request only)
    |-- Upload source security artifact
    `-- Enforce policy                    (if fail-on-findings)
```

`secret-scan` and `sca-scan` run independently so source SCA does not lengthen the critical path more than necessary. The final `report` job is responsible for all user-facing output and the final blocking decision.

## Report shape

Clean scans stay short:

```markdown
## Source security scan

Scan range: `<base>..HEAD`

No source security findings detected.
```

Finding scans use the compact image-scan pattern: an at-a-glance summary followed by foldable detail sections.

```markdown
## Source security scan

Scan range: `<base>..HEAD`

| Check | Total | Blocking |
|---|---:|---:|
| Vulnerabilities | 7 | 2 |
| Restricted/forbidden licenses | 3 | 0 |
| Secrets | 1 | 1 |

<details>
<summary>Vulnerabilities: 7 findings, 2 blocking</summary>

| Severity | Package | Installed | Fixed | ID | Source |
|---|---|---|---|---|---|
| CRITICAL | example-lib | 1.0.0 | 1.0.3 | CVE-... | package-lock.json |

</details>

<details>
<summary>Restricted/forbidden licenses: 3 findings</summary>

| Severity | Package | License | Classification | Source |
|---|---|---|---|---|
| HIGH | example-lib | GPL-2.0 | Restricted | package-lock.json |

</details>

<details>
<summary>Secrets: 1 finding, 1 blocking</summary>

| Detector | Status | File | Line | Commit |
|---|---|---|---|---|
| AWS | verified | config/secrets.yaml | 12 | abc123... |

</details>
```

Each detail section should be omitted when that scanner has no relevant findings. Long sections should be truncated in the comment, with the full raw and normalized data available in the artifact.

## Policy

The workflow remains visibility-first by default. It reports findings but does not fail unless the caller opts into blocking through the existing `security-scan-fail-on-findings` path.

When blocking is enabled:

- a reported vulnerability at or above the configured blocking severity fails the workflow;
- a verified TruffleHog secret fails the workflow;
- a license finding never fails the workflow.

This keeps source security behavior aligned with image scanning while avoiding a global license enforcement policy for all P2P consumers.

## Artifact format

Upload a single artifact named `source-security-scan-findings`, with:

```text
trufflehog/findings.ndjson
trivy/trivy-fs.json
source-security-findings.json
```

`source-security-findings.json` should be a normalized merged structure with separate arrays for vulnerabilities, licenses, and secrets. Raw secret values must not be written to normalized JSON, the workflow summary, or the PR comment.

## Risks

| Risk | Mitigation |
|---|---|
| License results are interpreted as legal decisions. | Label the section as report-only and never include licenses in the blocking count. Documentation should say Trivy classifications are triage signals, not organization policy. |
| Duplicate or confusing secret output from two tools. | Run Trivy with `--scanners vuln,license` so Trivy secret scanning stays disabled. |
| Source SCA and image CVE scans produce overlapping vulnerability findings. | Document that source SCA is dependency-manifest visibility and image scan is built-artifact visibility. Do not deduplicate in v1. |
| Large Trivy reports make PR comments noisy. | Use the image-scan pattern: summary table plus foldable details, with truncation and full artifact upload. |
| Multi-organization policy differences. | Keep defaults conservative and report-only for licenses; defer per-organization policy configuration. |

## Out of scope

- Per-organization license policy or allow/deny lists.
- Blocking on license findings.
- Trivy misconfiguration scanning.
- Trivy secret scanning.
- Deduplication between source SCA and image scanning.
- SARIF or GitHub code scanning integration.

## Test plan

- `actionlint` clean for the new workflow and all modified callers.
- Markdown link check for updated docs.
- Unit-style validation of report generation with representative TruffleHog and Trivy JSON fixtures.
- PR-run verification with:
  - no findings, confirming the compact clean comment;
  - one high/critical dependency vulnerability, confirming the vulnerability details section and blocking behavior when enabled;
  - one high/critical license finding, confirming it appears in the license section but never blocks;
  - one verified secret, confirming the secret details section and blocking behavior when enabled.
