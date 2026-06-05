# How to Triage Security Findings

If fast-feedback, extended-test, or prod surfaces a security finding, use this guide to read the report and decide whether to remediate it or temporarily unblock the pipeline.

## 1. Read the PR comment

On pull requests, the scanners upsert sticky comments in the PR conversation instead of posting a new comment on every run.

| Source | Sticky comment header | Artifact |
|---|---|---|
| Source vulnerabilities | `source-security-scan-findings` | `source-security-scan-findings` |
| Source restricted/forbidden licenses | `source-security-scan-findings` | `source-security-scan-findings` |
| Git tree secrets | `source-security-scan-findings` | `source-security-scan-findings` |
| Image vulnerabilities | `image-scan-findings` | `image-scan-reports-<env>` |
| Image secrets | `image-scan-findings` (same comment) | `image-scan-reports-<env>` |

Restricted and forbidden license findings are shown for triage only. The source scan reports only HIGH and CRITICAL license classifications. Trivy's license classification is not a legal decision and is not a P2P-wide organization policy; confirm the finding against your organization's open-source policy before taking enforcement action.

The source-security comment renders source vulnerabilities, restricted or forbidden licenses, and git-tree secrets under one header. Vulnerability rows include package, installed version, fixed version, CVE, and source where available. License rows identify the package and detected license. Git-tree secret rows show `Detector`, `Status`, `File`, `Line`, and `Commit`.

The image-scan comment renders up to two tables under one header:

- **Vulnerabilities**: a per-image summary table plus a `<details>` block per image with `Severity`, `Package`, `Installed`, `Fixed`, `CVE`, and `Source` columns. Sorted by severity, then package, then CVE; truncated to 100 rows.
- **Secrets in image**: `Detector`, `Status`, `Layer`, `Path`. `Status` is `verified`, `unknown`, or `unverified`; only `verified` rows are blocking. Truncated independently at 100 rows.

## 2. Download the full artifact

If the PR comment is truncated or you need raw data:

1. Open the workflow run from the PR checks or the Actions tab.
2. In the run summary, open the **Artifacts** section.
3. Download:
   - `source-security-scan-findings` for source-security output (contains redacted TruffleHog findings, raw Trivy filesystem output, and normalized merged JSON)
   - `image-scan-reports-<stage>-<github_env>` for image-scan output (contains `manifest.json`, `trivy/`, and `trufflehog-image/`)

The image artifact's root `manifest.json` is the supported index. It records the stage and points to artifact-relative raw Trivy JSON reports under `trivy/` and TruffleHog JSON-lines reports under `trufflehog-image/`, both keyed by image × platform. A TruffleHog JSONL file can be empty when no image secrets were found. Dashboard evidence does not expose secret values; use detector, status, layer, and path metadata for triage. The source-security artifact contains scanner-native output plus normalized JSON for source vulnerabilities, source license findings, and git-tree secrets.

## 3. Remediate first when the scan is correct

Preferred fixes:

- For image findings, update the vulnerable package or base image so the next build produces a clean image.
- For source vulnerability findings, update the affected dependency or lockfile entry so the vulnerable version is no longer present.
- For restricted or forbidden license findings, confirm the package and license against your organization's open-source policy before changing dependencies or taking enforcement action.
- For git-tree secret findings, remove the committed secret, rotate the credential, and replace it with a proper secret store or GitHub secret.
- For embedded secrets, rotate the credential first, identify which Dockerfile step introduced it (the `Layer` column points to the layer digest — match it against `docker history <image>`), scrub or rebuild from a fresh base, and re-push the image. A secret that appears in both the *Source security scan* (git-tree secrets) and *Image scan* (Secrets in image) comments means the source is in the tracked tree — fix the git source first and the image side will resolve on the next build.

## 4. Temporarily stop findings from blocking the workflow

This only matters if your repository explicitly turned on blocking. By default, orchestrator workflows set `security-scan-fail-on-findings: false`.

To make fast-feedback non-blocking again:

```yaml
jobs:
  fastfeedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
      security-scan-fail-on-findings: false
```

The same input exists on `p2p-workflow-extended-test` and `p2p-workflow-prod`.

---

See also:

- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [p2p-workflow-source-security-scan reference](../reference/p2p-workflow-source-security-scan.md)
- [Image scanning](../explanation/image-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
