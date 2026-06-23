# Image scanning

Image scanning is a two-tool stack. Trivy reports known CVEs in OS and language packages. TruffleHog reports secrets embedded in the published image reference that the workflow pulls and scans. Both tools run inside [`p2p-workflow-image-scan`](../reference/p2p-workflow-image-scan.md) against each resolved scannable container image reference.

## What gets scanned and when

For a given stage, the workflow starts from standard P2P image names from the `image-names` input when that input is set. Otherwise it runs `make p2p-images` in the configured working directory. Each image name is combined with that stage's registry path and the requested version, then the resulting references are inspected before scanning.

Some P2P image lists include OCI references that are needed for build, promotion, or deployment but are not useful inputs for container scanners, such as Helm chart artifacts. Some apps also intentionally publish no scannable container image, or publish an empty `FROM scratch` image. Image scanning excludes known non-container OCI artifacts and confirmed empty container images before running Trivy or TruffleHog. If nothing scannable remains, the scan succeeds with zero findings. This keeps scanner failures meaningful: a skipped reference is logged as a warning, while scanner execution failures against scannable container images still fail the scan.

In the pipeline stage workflows, image scanning is built into fast-feedback, extended-test, and prod: fast-feedback calls it after the build job, while extended-test and prod call it before promotion or deployment on main-branch runs.

The scheduled [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md) umbrella runs image scanning alongside source security scanning. It resolves the first configured image name as the anchor, looks up the latest version for each stage/environment matrix entry, and then invokes image scanning with the full configured image-name list for each matching entry.

## Blocking and reporting

Image scanning is visibility-first by default. Both Trivy vulnerability findings and TruffleHog secret findings surface in the same workflow artifact, and in the same sticky PR comment for that app/stage/environment when the caller grants `pull-requests: write`. Findings fail the image-scan policy job. With the default `security-scan-blocking-severity: off`, or when findings are below a non-`off` threshold, that policy failure does not fail the workflow. Setting `security-scan-blocking-severity` to `low`, `medium`, `high`, or `critical` makes findings at or above that Trivy severity block the workflow; verified TruffleHog secrets are treated as `critical`.

The uploaded `image-scan-reports-*` artifact is manifest-based evidence for dashboard ingestion. Its root `manifest.json` is the supported index and points to artifact-relative Trivy JSON reports plus TruffleHog image JSON-lines reports for scanned image/platform pairs. TruffleHog JSONL files can be empty when there are no image secrets; dashboard evidence uses detector, status, layer, and path metadata and does not expose secret values.

## See also

- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [Secrets scanning](secrets-scanning.md)
