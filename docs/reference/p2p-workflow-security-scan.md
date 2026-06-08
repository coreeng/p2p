# p2p-workflow-security-scan

> Scheduled "umbrella" workflow that runs full source security scanning and per-stage image scans for the latest deployed version in each pipeline stage. Intended for a per-repository cron wrapper that fans out across `fast-feedback`, `extended-test`, and `prod`.

## Usage

Add a wrapper in the application repository that calls this workflow on a daily cron and on demand. The wrapper job must declare `permissions: id-token: write` — the umbrella's `discover-version-*` children call `google-github-actions/auth@v3` for OIDC and cannot acquire the token unless the caller grants it.

```yaml
name: scheduled-security
on:
  schedule:
    - cron: '0 6 * * *'   # Daily, 06:00 UTC
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
      container_registry_user: ${{ secrets.CONTAINER_REGISTRY_USER }}
      container_registry_pat: ${{ secrets.CONTAINER_REGISTRY_PAT }}
      container_registry_url: ${{ secrets.CONTAINER_REGISTRY_URL }}
    with:
      tenant-name: my-tenant
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant-name` | string | No | `''` | Tenant identifier passed through to child workflows. Falls back to `vars.TENANT_NAME` when empty. |
| `image-names` | string | No | `''` | Newline-, comma-, or whitespace-separated list of standard P2P image names. The first entry is the version-lookup anchor for each stage, and the full list is passed to each image scan. If empty, image scans fall back to `make p2p-images` in `working-directory`. |
| `working-directory` | string | No | `.` | Working directory for `make p2p-images` and downstream make targets. |
| `region` | string | No | `europe-west2` | GCP region; overridden by `vars.REGION`. |
| `dry-run` | boolean | No | `false` | Passed through to child workflows; skips registry lookups and scans. |
| `timeout-minutes` | number | No | `30` | Timeout for the `source-security-scan` job. Image-scan jobs use their own default. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Forwarded to all child workflows. |
| `container_registry_user` | No | Forwarded to image-scan when private base images need authentication. |
| `container_registry_pat` | No | Forwarded to image-scan. |
| `container_registry_url` | No | Forwarded to image-scan. |

## Outputs

None. Results are surfaced via:

- Each child job's workflow summary (`$GITHUB_STEP_SUMMARY`).
- `source-security-scan-findings` artifact from the source-security-scan job. Contains redacted TruffleHog output, raw Trivy filesystem output, and normalized merged JSON.
- `image-scan-reports-<stage>-<github_env>` artifact from each image-scan job. Each artifact contains root `manifest.json`, `trivy/` vulnerability JSON reports, and `trufflehog-image/` secret JSON-lines reports. `manifest.json` records the P2P stage (`fast-feedback`, `extended-test`, or `prod`) and is the supported artifact index.

## Job Graph

```
resolve-anchor-image
├── image-scan-fast-feedback  (matrix: vars.FAST_FEEDBACK)
├── image-scan-extended-test  (matrix: vars.EXTENDED_TEST)
└── image-scan-prod           (matrix: vars.PROD)

source-security-scan                                   (independent; runs in parallel)
```

Each matrix entry calls an internal stage workflow that first discovers the latest version for that stage/environment and then scans that exact version. The source-security-scan job runs in parallel with the per-stage matrices. All child workflows are invoked with `blocking-severity: off`, so findings can fail policy jobs without failing the umbrella workflow; the reporting channels are the signal.

## Version discovery

For each stage/environment matrix entry, the umbrella calls [`p2p-get-latest-image`](p2p-get-latest-image.md) with the anchor image to determine the highest semver-sorted tag in that stage's registry path. That version is passed to the image-scan workflow for the same GitHub environment. If no tag is found for that stage/environment, the image scan is skipped after logging the missing image. Because all images in a p2p release share the same version, scanning at the anchor's version covers the whole image set.

## See also

- [p2p-workflow-source-security-scan reference](p2p-workflow-source-security-scan.md)
- [p2p-workflow-image-scan reference](p2p-workflow-image-scan.md)
- [p2p-get-latest-image reference](p2p-get-latest-image.md)
- [Secrets scanning explanation](../explanation/secrets-scanning.md)
- [How to enable scheduled security scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [Triage security findings (how-to)](../how-to/triage-security-findings.md)
