# How to Triage Security Findings

If fast-feedback, extended-test, or prod surfaces a security finding, use this guide to read the report and decide whether to remediate it or temporarily unblock the pipeline.

## 1. Read the PR comment

On pull requests, the scanners upsert sticky comments in the PR conversation instead of posting a new comment on every run when the caller grants `pull-requests: write`.

| Source | Sticky comment header | Artifact |
|---|---|---|
| Source vulnerabilities | `security-source-scan-findings-<app-name>` | `security-source-scan-findings` |
| Git tree secrets | `security-source-scan-findings-<app-name>` | `security-source-scan-findings` |
| Image vulnerabilities | `security-image-scan-findings-<app-name>-<stage>-<github_env>` | `security-image-scan-reports-<stage>-<github_env>` |
| Image secrets | `security-image-scan-findings-<app-name>-<stage>-<github_env>` (same comment as image vulnerabilities for that app/stage/environment) | `security-image-scan-reports-<stage>-<github_env>` |

PR comments are optional for backward compatibility with orchestrator workflows that existed before security scans posted comments. If the caller does not grant `pull-requests: write`, the workflows still write summaries and upload artifacts, but the sticky PR comment steps are non-fatal and cannot update the PR.

P2P workflow templates pass `app-name` to security scans so each app updates its own source and image security comments.

The source-security comment renders source vulnerabilities and git-tree secrets under one header. Vulnerability rows include package, installed version, fixed version, CVE, and source where available. Git-tree secret rows show `Detector`, `Status`, `File`, `Line`, and `Commit`.

The security-image-scan comment renders up to two tables under one header:

- **Vulnerabilities**: a per-image summary table plus a `<details>` block per image with `Severity`, `Package`, `Installed`, `Fixed`, `CVE`, and `Source` columns. Sorted by severity, then package, then CVE; truncated to 100 rows.
- **Secrets in image**: `Detector`, `Status`, `ID`, `Layer`, `Path`. `Status` is `verified`, `unknown`, or `unverified`; when blocking is enabled, `verified` rows are treated as `critical`. Use the `ID` value when adding an image secret ignore entry. Truncated independently at 100 rows.

When a finding matches `.p2p-security-ignore.yaml`, comments and workflow summaries omit it from active finding tables. Ignored findings are not included in active finding totals, active blocking counts, or policy failures. They remain available in normalized JSON artifacts so the dashboard can distinguish accepted risk from clean scans without exposing ignore reasons in PR comments.

## 2. Download the full artifact

If the PR comment is truncated or you need raw data:

1. Open the workflow run from the PR checks or the Actions tab.
2. In the run summary, open the **Artifacts** section.
3. Download:
   - `security-source-scan-findings` for source-security output (contains redacted TruffleHog findings, raw Trivy filesystem output, and `source-security-findings.json`)
   - `security-image-scan-reports-<stage>-<github_env>` for security-image-scan output (contains `manifest.json`, `image-security-findings.json`, `trivy/`, and `trufflehog-image/`)

The image artifact's root `manifest.json` is the supported index. It records the stage and points to artifact-relative raw Trivy JSON reports under `trivy/` and redacted TruffleHog JSON-lines reports under `trufflehog-image/`, both keyed by scanned image x platform. A configured OCI reference can be absent from `manifest.json` when the workflow skipped it as non-scannable, such as a Helm chart artifact or confirmed empty container image; check the security-image-scan job logs for skip warnings. A TruffleHog JSONL file can be empty when no image secrets were found. Dashboard evidence does not expose secret values; use the P2P redacted secret ID, detector, status, layer, and path metadata for triage. The `security-source-scan-findings` artifact contains raw Trivy filesystem output, redacted TruffleHog source findings, and `source-security-findings.json` for source vulnerabilities and git-tree secrets.

`source-security-findings.json` uses top-level `vulnerabilities` and `secrets` collections. `image-security-findings.json` uses top-level `vulnerabilities` and `secrets` collections. When an ignore file is present, both files also include `ignored.vulnerabilities` and `ignored.secrets`; ignored records include the matched reason and expiry metadata when present. This lets dashboard ingestion display ignored findings alongside active findings without treating them as active remediation or blocking policy counts.

## 3. Remediate first when the scan is correct

Preferred fixes:

- For image findings, update the vulnerable package or base image so the next build produces a clean image.
- For source vulnerability findings, update the affected dependency or lockfile entry so the vulnerable version is no longer present.
- For git-tree secret findings, remove the committed secret, rotate the credential, and replace it with a proper secret store or GitHub secret.
- For embedded secrets, rotate the credential first, identify which Dockerfile step introduced it (the `Layer` column points to the layer digest — match it against `docker history <image>`), scrub or rebuild from a fresh base, and re-push the image. A secret that appears in both the *Source security scan* (git-tree secrets) and *Image scan* (Secrets in image) comments means the source is in the tracked tree — fix the git source first and the image side will resolve on the next build.

## 4. Record accepted security findings

Use `.p2p-security-ignore.yaml` only after confirming the finding is accepted risk. See [How to ignore security findings](ignore-security-findings.md) for the v1 schema, matching rules, and secret ID guidance.

## 5. Temporarily stop findings from blocking the workflow

This only matters if your repository explicitly turned on blocking. By default, orchestrator workflows set `security-scan-blocking-severity: off`.

To make fast-feedback non-blocking again:

```yaml
jobs:
  fastfeedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
      security-scan-blocking-severity: off
```

The same input exists on `p2p-workflow-extended-test` and `p2p-workflow-prod`.

---

See also:

- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [p2p-workflow-source-security-scan reference](../reference/p2p-workflow-source-security-scan.md)
- [How to ignore security findings](ignore-security-findings.md)
- [Image scanning](../explanation/image-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
