# Image scanning

Image scanning is a two-tool stack. Trivy reports known CVEs in OS and language packages. TruffleHog reports secrets embedded anywhere in any layer of the built image, including intermediate layers that were squashed out of the final filesystem. Both tools run inside [`p2p-workflow-image-scan`](../reference/p2p-workflow-image-scan.md) against each image returned by `make p2p-images`.

## What gets scanned and when

For a given stage, the workflow runs `make p2p-images` in the configured working directory, combines each returned image name with that stage's registry path and the requested version, and scans the resulting image references. In the pipeline stage workflows, image scanning is built into fast-feedback, extended-test, and prod: fast-feedback calls it after the build job, while extended-test and prod call it before promotion or deployment on main-branch runs.

The scheduled [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md) umbrella runs image scanning alongside source security scanning. It resolves one anchor image, looks up the latest version in each stage registry path, and then invokes image scanning once for fast-feedback, extended-test, and prod.

## Blocking and reporting

Image scanning is visibility-first by default. Both Trivy vulnerability findings and TruffleHog secret findings surface in the same sticky PR comment and the same workflow artifact. The workflow does not fail the job unless the caller sets `security-scan-fail-on-findings: true`, at which point a finding at or above `blocking-severity` (Trivy) **or** any `verified` TruffleHog finding will fail the run.

## See also

- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [Secrets scanning](secrets-scanning.md)
