# p2p-workflow-security-scan

> Scheduled "umbrella" workflow that runs the full secret scan and per-stage image scans for the latest deployed version in each pipeline stage. Intended for a per-repository cron wrapper that fans out across `fast-feedback`, `extended-test`, and `prod`.

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
      fast-feedback-github-env: gcp-dev
      extended-test-github-env: gcp-test
      prod-github-env: gcp-prod
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant-name` | string | No | `''` | Tenant identifier passed through to child workflows. Falls back to `vars.TENANT_NAME` when empty. |
| `image-names` | string | No | `''` | Newline- or comma-separated list of image names. The first entry is the version-lookup anchor for each stage. If empty, the workflow runs `make p2p-images` in `working-directory` to discover the list. All images returned by `make p2p-images` are scanned. |
| `working-directory` | string | No | `.` | Working directory for `make p2p-images` and downstream make targets. |
| `region` | string | No | `europe-west2` | GCP region; overridden by `vars.REGION`. |
| `fast-feedback-github-env` | string | Yes | — | GitHub Environment name granting GCP auth for the `fast-feedback` registry path. |
| `extended-test-github-env` | string | Yes | — | GitHub Environment name granting GCP auth for the `extended-test` registry path. |
| `prod-github-env` | string | Yes | — | GitHub Environment name granting GCP auth for the `prod` registry path. |
| `dry-run` | boolean | No | `false` | Passed through to child workflows; skips registry lookups and scans. |
| `timeout-minutes` | number | No | `30` | Timeout for the `secret-scan` job. Image-scan jobs use their own default. |

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
- `secret-scan-findings` artifact (JSON) from the secret-scan job.
- `trivy-reports-<github_env>` artifact per stage from each image-scan job.

## Job Graph

```
resolve-anchor-image
├── discover-version-fast-feedback ──► image-scan-fast-feedback
├── discover-version-extended-test ──► image-scan-extended-test
└── discover-version-prod          ──► image-scan-prod

secret-scan                                            (independent; runs in parallel)
```

The secret-scan job runs in parallel with the per-stage chains. All child workflows are invoked with `fail-on-findings: false`, so the umbrella stays green regardless of findings; the reporting channels are the signal.

## Version discovery

For each stage, the umbrella calls [`p2p-get-latest-image`](p2p-get-latest-image.md) with the anchor image to determine the highest semver-sorted tag in that stage's registry path. That version is passed to the image-scan workflow. Because all images in a p2p release share the same version, scanning at the anchor's version covers the whole image set.

## See also

- [p2p-workflow-secret-scan reference](p2p-workflow-secret-scan.md)
- [p2p-get-latest-image reference](p2p-get-latest-image.md)
- [Secrets scanning explanation](../explanation/secrets-scanning.md)
- [How to enable scheduled secrets scanning](../how-to/enable-scheduled-secrets-scanning.md)
