# Image scanning

P2P provides platform-managed container image scanning so application teams use the same scanner everywhere. The reusable workflow is [`p2p-workflow-image-scan`](../reference/p2p-workflow-image-scan.md), and it installs and runs Trivy against the images for one pipeline stage and version.

## What gets scanned and when

For a given stage, the workflow runs `make p2p-images` in the configured working directory, combines each returned image name with that stage's registry path and the requested version, and scans the resulting image references. In the pipeline stage workflows, image scanning is built into fast-feedback, extended-test, and prod: fast-feedback calls it after the build job, while extended-test and prod call it before promotion or deployment on main-branch runs.

The scheduled [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md) umbrella runs image scanning alongside secrets scanning. It resolves one anchor image, looks up the latest version in each stage registry path, and then invokes image scanning once for fast-feedback, extended-test, and prod.

## Blocking and reporting

Image scanning is visibility-first by default. `security-scan-fail-on-findings` defaults to `false` in the stage workflows, and the scheduled umbrella hard-codes non-blocking scans, so findings are reported without automatically failing the run unless a caller opts in. This mirrors secrets scanning: in fast-feedback the same opt-in flag is passed to both scans, while the scheduled umbrella runs them as companion monitoring signals.

Findings are written into the workflow summary, posted as a sticky pull request comment for PR runs, and uploaded as Trivy JSON artifacts.

## See also

- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [Secrets scanning](secrets-scanning.md)
