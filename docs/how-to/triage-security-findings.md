# How to Triage Security Findings

If fast-feedback, extended-test, or prod surfaces a security finding, use this guide to read the report and decide whether to remediate it or temporarily unblock the pipeline.

## 1. Read the PR comment

On pull requests, the scanners upsert sticky comments in the PR conversation instead of posting a new comment on every run.

| Source | Sticky comment header | Artifact |
|---|---|---|
| Git tree secrets | `trufflehog-findings` | `secret-scan-findings` |
| Image vulnerabilities | `image-scan-findings` | `image-scan-reports-<env>` |
| Image secrets | `image-scan-findings` (same comment) | `image-scan-reports-<env>` |

The image-scan comment renders up to two tables under one header:

- **Vulnerabilities**: a per-image summary table plus a `<details>` block per image with `Severity`, `Package`, `Installed`, `Fixed`, `CVE`, and `Source` columns. Sorted by severity, then package, then CVE; truncated to 100 rows.
- **Secrets in image**: `Detector`, `Status`, `Layer`, `File`, `Path`. `Status` is `verified`, `unknown`, or `unverified`; only `verified` rows are blocking. Truncated independently at 100 rows.

The git-tree secret-scan comment shows `Detector`, `Status`, `File`, `Line`, and `Commit`.

## 2. Download the full artifact

If the PR comment is truncated or you need raw data:

1. Open the workflow run from the PR checks or the Actions tab.
2. In the run summary, open the **Artifacts** section.
3. Download:
   - `image-scan-reports-<github_env>` for image-scan output (contains `trivy/` and `trufflehog-image/` subdirectories)
   - `secret-scan-findings` for git-tree secret-scan output

The image artifact contains raw Trivy JSON reports under `trivy/` and TruffleHog JSON-lines under `trufflehog-image/`, both keyed by image × platform. The secret artifact contains a redacted JSON array of git-tree findings.

## 3. Remediate first when the scan is correct

Preferred fixes:

- For image findings, update the vulnerable package or base image so the next build produces a clean image.
- For secret findings, remove the committed secret, rotate the credential, and replace it with a proper secret store or GitHub secret.
- For embedded secrets, rotate the credential first, identify which Dockerfile step introduced it (the `Layer` column points to the layer digest — match it against `docker history <image>`), scrub or rebuild from a fresh base, and re-push the image. A secret that appears in both the *Secrets scan* (git tree) and *Image scan* (Secrets in image) comments means the source is in the tracked tree — fix the git source first and the image side will resolve on the next build.

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
- [p2p-workflow-secret-scan reference](../reference/p2p-workflow-secret-scan.md)
- [Image scanning](../explanation/image-scanning.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
