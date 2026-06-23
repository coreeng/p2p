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
      app-name: my-tenant
      security-scan-blocking-severity: 'off'
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant-name` | string | No | `''` | Tenant identifier passed through to child workflows. Falls back to `vars.TENANT_NAME` when empty. |
| `app-name` | string | No | `''` | Application name passed through to child security scans so sticky PR comments are scoped per app in multi-app repositories. Scheduled wrappers should set this to the application tenant name. |
| `image-names` | string | No | `''` | Newline-, comma-, or whitespace-separated list of standard P2P image names. The first entry is the version-lookup anchor for each stage, and the full list is passed to each image scan. If empty, image scans fall back to `make p2p-images` in `working-directory`. |
| `working-directory` | string | No | `.` | Working directory for `make p2p-images` when `image-names` is empty. |
| `region` | string | No | `europe-west2` | GCP region; overridden by `vars.REGION`. |
| `dry-run` | boolean | No | `false` | Passed through to child workflows; still resolves the anchor image from `image-names` or `make p2p-images`, then skips registry lookups and scans. |
| `checkout-version` | string | No | `''` | Internal consistency input for child checkouts. Application wrappers should normally omit it. |
| `security-scan-blocking-severity` | string | No | `off` | Minimum security finding severity that blocks the umbrella workflow: `off`, `low`, `medium`, `high`, or `critical`. When blocking is enabled, verified secrets are treated as `critical`. Child policy jobs fail on active findings, but the umbrella workflow continues when findings are below the blocking threshold. |
| `timeout-minutes` | number | No | `30` | Timeout for the `security-source-scan` job. security-image-scan jobs use their own default. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Forwarded to image discovery and security-image-scan child workflows. |
| `container_registry_user` | No | Forwarded to security-image-scan when private base images need authentication. |
| `container_registry_pat` | No | Forwarded to security-image-scan. |
| `container_registry_url` | No | Forwarded to security-image-scan. |

## Outputs

None. Results are surfaced via:

- Each child job's workflow summary (`$GITHUB_STEP_SUMMARY`).
- On non-dry-run source scans where report generation completes, the `security-source-scan-findings` artifact from the security-source-scan job. It contains redacted TruffleHog output, raw Trivy filesystem output when available, and normalized merged JSON. Scheduled source scanning is repository-wide: TruffleHog scans reachable git history and Trivy source dependency vulnerability scanning/SCA scans the current branch's checked-out source tree. Scanner warnings or incomplete scanner output still fail the `security-source-scan-status-policy` job.
- On successful non-dry-run image scans where a latest image tag is found and at least one scannable container image is available, the `security-image-scan-reports-<stage>-<github_env>` artifact from each security-image-scan job. Each artifact contains root `manifest.json`, `trivy/` vulnerability JSON reports, and `trufflehog-image/` secret JSON-lines reports for scanned image/platform pairs. `manifest.json` records the P2P stage (`fast-feedback`, `extended-test`, or `prod`) and is the supported artifact index.

## Job Graph

```
security-resolve-anchor-image
├── security-image-scan-fast-feedback  (matrix: vars.FAST_FEEDBACK)
├── security-image-scan-extended-test  (matrix: vars.EXTENDED_TEST)
└── security-image-scan-prod           (matrix: vars.PROD)

security-source-scan                                   (independent; runs in parallel)
```

Each matrix entry calls an internal stage workflow that first discovers the latest version for that stage/environment and then scans that exact version. The security-source-scan job runs in parallel with the per-stage matrices. For source scans, `secret-scan-scope: full-history` applies to repository-wide TruffleHog git scanning; Trivy scans the current checked-out branch tree and is not limited to `working-directory`. The `security-scan-blocking-severity` input is passed to every child scan. Its default `off` keeps scheduled scans report-only; setting it to `low`, `medium`, `high`, or `critical` makes findings at or above that severity fail the umbrella workflow, while below-threshold findings fail only the child policy job.

## Version discovery

For each stage/environment matrix entry, the umbrella calls [`p2p-get-latest-image`](p2p-get-latest-image.md) with the anchor image to determine the highest semver-sorted tag in that stage's registry path. That version is passed to the security-image-scan workflow for the same GitHub environment. If no tag is found for that stage/environment, the image scan is skipped after logging the missing image. Because all images in a p2p release share the same version, scanning at the anchor's version covers the whole configured image set; the security-image-scan workflow still filters each configured reference to the scannable container images before running scanners.

## See also

- [p2p-workflow-source-security-scan reference](p2p-workflow-source-security-scan.md)
- [p2p-workflow-image-scan reference](p2p-workflow-image-scan.md)
- [p2p-get-latest-image reference](p2p-get-latest-image.md)
- [Secrets scanning explanation](../explanation/secrets-scanning.md)
- [How to enable scheduled security scanning](../how-to/enable-scheduled-security-scanning.md)
- [Triage security findings (how-to)](../how-to/triage-security-findings.md)
