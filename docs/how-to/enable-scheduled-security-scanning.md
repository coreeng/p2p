# How to Enable Scheduled Security Scanning

Fast-feedback scans pull-request and push changes. To also monitor older source findings and deployed images, add a per-repository scheduled wrapper that calls [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md).

GitHub requires `schedule` triggers to live in the consuming repository, so this wrapper belongs in the application repo rather than in P2P.

## 1. Add the wrapper workflow

Create `.github/workflows/security-scan.yaml` in your application repository:

```yaml
name: P2P scheduled security scan

on:
  schedule:
    # Weekly, Monday 03:17 UTC. Pick an off-peak time for your team.
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@v1
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      tenant-name: my-tenant
      app-name: my-tenant
      security-scan-blocking-severity: 'off'
```

`id-token: write` is required because the image discovery and image scan jobs authenticate to Google Cloud with OIDC.

## 2. What gets scanned

Each scheduled run starts these scans:

- source security scan over the repository's reachable git history for secrets and current source tree for dependency vulnerabilities;
- latest fast-feedback images for each environment in `vars.FAST_FEEDBACK`;
- latest extended-test images for each environment in `vars.EXTENDED_TEST`;
- latest production images for each environment in `vars.PROD`.

The source scan uses TruffleHog for committed secrets and Trivy for source dependency vulnerabilities. In scheduled scans, `full-history` applies to TruffleHog git scanning; Trivy scans the current branch's checked-out source tree. The image scans use Trivy for image vulnerabilities and TruffleHog for embedded image secrets.

Scheduled scans are report-only by default. The wrapper passes `security-scan-blocking-severity: 'off'`, so findings can fail the child policy jobs without failing the umbrella workflow. Scanner execution errors, authentication errors, and invalid configuration still fail the workflow.

To make scheduled scans block on findings, set `security-scan-blocking-severity` to `low`, `medium`, `high`, or `critical`. The value is passed to the full source scan and every image scan.

## 3. Image discovery

By default, the umbrella runs `make p2p-images` from `working-directory` and uses the first returned image name as the anchor for latest-version discovery. Each stage image scan then resolves its scan targets independently: it uses the explicit `image-names` input when provided, or runs `make p2p-images` from `working-directory` when `image-names` is empty.

If your repository cannot use `make p2p-images` for scheduled scans, pass `image-names` explicitly:

```yaml
jobs:
  security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@v1
    permissions:
      contents: read
      id-token: write
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      tenant-name: my-tenant
      app-name: my-tenant
      image-names: |
        api
        worker
```

The first explicit image name is used to find the latest deployed version in each stage registry path. If `image-names` is empty, the first name returned by `make p2p-images` is used for discovery. If a stage has no deployed image tag yet, that stage scan is skipped after writing a log line.

## 4. Review the reports

Each run emits:

- workflow summaries for source security and each image scan;
- on non-dry-run source scans where report generation completes, `security-source-scan-findings`, retained for 30 days;
- on successful non-dry-run image scans where a latest image tag is found, `security-image-scan-reports-<stage>-<github_env>` for each scanned stage/environment, retained for 30 days.

The source artifact contains redacted TruffleHog output, raw Trivy filesystem output, and normalized merged JSON. Each image artifact contains a root `manifest.json`, Trivy vulnerability JSON reports, and TruffleHog image JSON-lines reports.

There is no PR comment for scheduled runs because there is no associated pull request.

## 5. Tune large repositories

For large histories, increase the source scan timeout:

```yaml
with:
  tenant-name: my-tenant
  app-name: my-tenant
  timeout-minutes: 60
```

For repositories with multiple P2P projects, set `working-directory` to the directory that contains the relevant Makefile:

```yaml
with:
  tenant-name: my-tenant
  app-name: my-tenant
  working-directory: services/api
```

## See also

- [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md)
- [p2p-workflow-source-security-scan reference](../reference/p2p-workflow-source-security-scan.md)
- [p2p-workflow-image-scan reference](../reference/p2p-workflow-image-scan.md)
- [Secrets scanning](../explanation/secrets-scanning.md)
- [Image scanning](../explanation/image-scanning.md)
- [How to triage security findings](triage-security-findings.md)
