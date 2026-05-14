# How to Triage Security Findings

If fast-feedback, extended-test, or prod surfaces a security finding, use this guide to read the report and decide whether to remediate it or temporarily unblock the pipeline.

## 1. Read the PR comment

On pull requests, both scanners upsert a single sticky comment in the PR conversation instead of posting a new comment on every run.

- Image findings appear in the `Trivy image scan` comment.
- Secret findings appear in the `Secrets scan` comment.

For image findings:

- The summary table groups findings by image.
- Expand an image row to see a details table with `Severity`, `Package`, `Installed`, `Fixed`, `CVE`, and `Source`.
- The comment only shows the first 100 findings. Download the full artifact if you need the complete set.

For secret findings:

- Each row shows `Detector`, `Status`, `File`, `Line`, and `Commit`.
- `Status` is one of `verified`, `unknown`, or `unverified`.
- Only `verified` findings are blocking; the others are still reported for review.

## 2. Download the full artifact

If the PR comment is truncated or you need raw data:

1. Open the workflow run from the PR checks or the Actions tab.
2. In the run summary, open the **Artifacts** section.
3. Download:
   - `trivy-reports-<github_env>` for image-scan output
   - `secret-scan-findings` for secret-scan output

The image artifact contains raw Trivy JSON reports per image and platform. The secret artifact contains a redacted JSON array of findings.

## 3. Remediate first when the scan is correct

Preferred fixes:

- For image findings, update the vulnerable package or base image so the next build produces a clean image.
- For secret findings, remove the committed secret, rotate the credential, and replace it with a proper secret store or GitHub secret.

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
