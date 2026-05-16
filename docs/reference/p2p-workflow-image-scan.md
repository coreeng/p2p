# p2p-workflow-image-scan

> Scans every image returned by `make p2p-images` for known vulnerabilities (Trivy) and embedded secrets (TruffleHog). Produces a workflow summary, a sticky PR comment (on `pull_request` events), and an `image-scan-reports-<github_env>` artifact. Optionally fails the job on blocking findings.

## Usage

Called by [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md), [`p2p-workflow-extended-test`](p2p-workflow-extended-test.md), [`p2p-workflow-prod`](p2p-workflow-prod.md), and the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella. Tenants do not call it directly; the `security-scan-fail-on-findings` input on the orchestrator workflows toggles the blocking policy.

```yaml
jobs:
  image-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-image-scan.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
      container_registry_user: ${{ secrets.CONTAINER_REGISTRY_USER }}
      container_registry_pat: ${{ secrets.CONTAINER_REGISTRY_PAT }}
      container_registry_url: ${{ secrets.CONTAINER_REGISTRY_URL }}
    with:
      pipeline-stage: fast-feedback
      github_env: gcp-dev
      version: ${{ needs.version.outputs.version }}
      fail-on-findings: false
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `pipeline-stage` | string | Yes | — | One of `fast-feedback`, `extended-test`, `prod`. Selects the registry path (`<region>-docker.pkg.dev/<project>/tenant/<tenant>/<stage>`) the images are pulled from. |
| `version` | string | Yes | — | Image tag to scan. All images returned by `make p2p-images` are scanned at this version. |
| `github_env` | string | No | `''` | GitHub Environment used for GCP auth and concurrency grouping. Required in practice — image pulls go through Workload Identity Federation bound to this environment. |
| `tenant-name` | string | No | `''` | Tenant identifier. Falls back to `vars.TENANT_NAME` when empty. |
| `region` | string | No | `europe-west2` | GCP region for the Artifact Registry. Overridden by `vars.REGION` when set on the environment. |
| `working-directory` | string | No | `.` | Directory from which `make p2p-images` is executed to discover image names. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP auth, registry login, Trivy install, the scan itself, the sticky PR comment, the artifact upload, and the policy step. The `Build report` step still runs and produces a "Scan skipped" summary. |
| `fail-on-findings` | boolean | No | `false` | When `true`, fails the job if any finding at a `blocking-severity` level is detected. |
| `severity` | string | No | `CRITICAL,HIGH` | Comma-separated Trivy severities to report. |
| `blocking-severity` | string | No | `CRITICAL` | Comma-separated severities that count towards the blocking policy. Must be a subset of `severity` to have an effect. |
| `ignore-unfixed` | boolean | No | `true` | When `true`, passes `--ignore-unfixed` to Trivy — only vulnerabilities with a fixed version are reported. |
| `timeout-minutes` | number | No | `20` | Job timeout. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Single-line `KEY=value` pairs. Accepted for parity with sibling workflows; not currently consumed by the scan. |
| `container_registry_user` | No | Username for an additional container registry login (e.g. a private base-image registry). |
| `container_registry_pat` | No | Password/PAT for the additional registry. Required when `container_registry_user` is set. |
| `container_registry_url` | No | URL of the additional registry. |

## Outputs

This workflow defines no outputs. Results are surfaced via:

- The workflow summary (`$GITHUB_STEP_SUMMARY`).
- A sticky PR comment with `header: image-scan-findings` on `pull_request` events when `dry-run: false`.
- The `image-scan-reports-<github_env>` artifact, retained for 30 days. Contains a `trivy/` subdirectory (one Trivy JSON per image × platform) and a `trufflehog-image/` subdirectory (one TruffleHog JSON-lines file per image × platform).

## Permissions

The workflow inherits permissions from the caller. Grant:

| Scope | When required |
|-------|---------------|
| `contents: read` | Always — cloning the repository and reading `make p2p-images`. |
| `id-token: write` | Always — GCP authentication via Workload Identity Federation. |
| `pull-requests: write` | `pull_request` events only — posting the sticky PR comment. Without it the comment step fails open (continue-on-error); the summary and artifact are still produced. |

## Job Graph

```
image-scan
├── Checkout
├── Authenticate to Google Cloud      (if dry-run=false)
├── Login to Artifact Registry        (if dry-run=false)
├── Login to tenant provided registry (optional; if creds and dry-run=false)
├── Resolve image references
├── Pull images                       (if dry-run=false)
├── Install Trivy                     (if dry-run=false)
├── Install TruffleHog                (if dry-run=false)
├── Scan images (Trivy)               (if dry-run=false)
├── Scan images (TruffleHog)          (if dry-run=false)
├── Build report                      (always)
├── Post sticky PR comment            (pull_request only; if dry-run=false)
├── Upload image-scan reports         (if dry-run=false)
└── Enforce policy                    (if dry-run=false)
```

The job runs under `environment: ${{ inputs.github_env }}`.

## Image resolution

The list of images to scan is taken from `make p2p-images` executed in `working-directory`. The make target must print whitespace-separated image names (no registry, no tag). Each name is combined with the registry path for `pipeline-stage` and the `version` input to form the full reference:

```
<region>-docker.pkg.dev/<project>/tenant/<tenant>/<pipeline-stage>/<image>:<version>
```

If `make p2p-images` returns no names, the job fails — there is nothing to scan.

## Report format

The sticky comment and workflow summary contain a unified header (version, vulnerability counts, secret counts, requested severities, blocking severities) followed by up to two tables.

**Vulnerabilities table** (rendered when Trivy finds at least one finding at the requested severities):

- A per-image counts table (rows sorted by blocking count, then total, then name).
- A `<details>` block per image with the deduplicated finding rows (Severity, Package, Installed, Fixed, CVE link, Source). Rows are sorted by severity, then package, then CVE.

The vulnerabilities table is truncated to 100 rows total; the full set is always available in the artifact's `trivy/` subdirectory.

**Secrets in image** rendering — one section per image (sorted by blocking then total findings), each with a heading naming the image and the platforms it was scanned on, followed by a deduplicated table. Columns:

- `Detector` — TruffleHog detector that matched (e.g. `AWS`, `Slack`, `GitHub`).
- `Status` — `verified` (TruffleHog successfully called the credential's verifier), `unknown` (verifier returned an error or timeout), or `unverified` (no verifier ran). Only `verified` rows are blocking.
- `Layer` — digest of the image layer containing the secret.
- `Path` — file path within the image where the secret was found.

The secrets section is independently truncated at 100 rows total across all images; the rest are in the artifact's `trufflehog-image/` subdirectory.

## See also

- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-extended-test reference](p2p-workflow-extended-test.md)
- [p2p-workflow-prod reference](p2p-workflow-prod.md)
- [p2p-workflow-security-scan reference (scheduled umbrella)](p2p-workflow-security-scan.md)
- [Image scanning explanation](../explanation/image-scanning.md)
- [Triage security findings (how-to)](../how-to/triage-security-findings.md)
