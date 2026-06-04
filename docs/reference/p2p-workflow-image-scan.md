# p2p-workflow-image-scan

> Scans every image resolved by the repository's P2P image targets for known vulnerabilities (Trivy) and embedded secrets (TruffleHog). Produces a workflow summary, a sticky PR comment (on `pull_request` events), and an `image-scan-reports-<github_env>` artifact. Optionally fails the job on blocking findings.

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
| `version` | string | Yes | — | Image tag to scan. Used for standard P2P image names and for explicit image repositories returned without a tag or digest. |
| `github_env` | string | No | `''` | GitHub Environment used for GCP auth and concurrency grouping. Required in practice — image pulls go through Workload Identity Federation bound to this environment. |
| `tenant-name` | string | No | `''` | Tenant identifier. Falls back to `vars.TENANT_NAME` when empty. |
| `region` | string | No | `europe-west2` | GCP region for the Artifact Registry. Overridden by `vars.REGION` when set on the environment. |
| `working-directory` | string | No | `.` | Directory from which `make p2p-image-refs` or `make p2p-images` is executed to discover scan targets. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP auth, registry login, Trivy install, the scan itself, the sticky PR comment, the artifact upload, and the policy step. The `Build report` step still runs and produces a "Scan skipped" summary. |
| `fail-on-findings` | boolean | No | `false` | When `true`, fails the job if any reported vulnerability at a `blocking-severity` level or verified image secret is detected. |
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
- The `image-scan-reports-<github_env>` artifact, retained for 30 days. Contains root `manifest.json`, `trivy/` (one Trivy JSON per image × platform), and `trufflehog-image/` (one TruffleHog JSON-lines file per image × platform).

## Permissions

The workflow inherits permissions from the caller. Grant:

| Scope | When required |
|-------|---------------|
| `contents: read` | Always — cloning the repository and reading P2P image make targets. |
| `id-token: write` | Always — GCP authentication via Workload Identity Federation. |
| `pull-requests: write` | `pull_request` events only — posting the sticky PR comment. Without it the comment step fails open (continue-on-error); the summary and artifact are still produced. |

The job runs under `environment: ${{ inputs.github_env }}` and authenticates to the stage Artifact Registry plus the optional tenant-provided registry before pulling and scanning images.

## Image resolution

The workflow first checks for an optional `p2p-image-refs` make target in `working-directory`. If the target exists and prints at least one whitespace-separated entry, those entries are scanned directly after normalization:

- `ghcr.io/coreeng/support-bot` becomes `ghcr.io/coreeng/support-bot:<version>`.
- `ghcr.io/coreeng/support-bot:0.0.48` is scanned unchanged.
- `ghcr.io/coreeng/support-bot@sha256:<digest>` is scanned unchanged.

Any entry containing `@` is treated as an explicit digest reference, and any entry with a colon after the last slash is treated as tagged. This means registry ports such as `localhost:5000/team/service` are not mistaken for tags; they receive the workflow `version` tag when no image tag is present.

For digest refs, the digest suffix must be a platform-specific image manifest digest, not an OCI image index digest. It must match the platform manifest digest that the workflow resolves and publishes in `manifest.json`. A mismatch fails the scan and no dashboard-matching image evidence artifact is uploaded.

Every explicit ref must be readable with the workflow's existing registry credentials: the stage Artifact Registry login, public anonymous access, or the single optional `container_registry_user` / `container_registry_pat` / `container_registry_url` login.

If `p2p-image-refs` is missing or prints no entries, the workflow keeps the standard P2P behavior. It runs `make p2p-images` in `working-directory`; that target must print whitespace-separated image names with no registry and no tag. Each name is combined with the registry path for `pipeline-stage` and the `version` input to form the full reference:

```
<region>-docker.pkg.dev/<project>/tenant/<tenant>/<pipeline-stage>/<image>:<version>
```

If neither target produces scan targets, the job fails — there is nothing to scan.

## Artifact contract

Each published `image-scan-reports-<github_env>` artifact is complete dashboard image evidence. The root `manifest.json` is the supported artifact index; `reports.txt` files are runner-local implementation detail and are not published or supported for downstream parsing.

Manifest schema version 1:

```json
{
  "schemaVersion": 1,
  "stage": "fast-feedback",
  "reports": [
    {
      "imageRef": "ghcr.io/coreeng/support-bot:0.0.192",
      "platform": "linux/amd64",
      "digest": "sha256:66bcd930d1794057bd206ebd3f2751eeedc3a57fe65bc869f41380e58f68bf6f",
      "vulnerabilityReport": "trivy/ghcr.io_coreeng_support-bot_0.0.192-linux_amd64.json",
      "secretReport": "trufflehog-image/ghcr.io_coreeng_support-bot_0.0.192-linux_amd64.jsonl"
    }
  ]
}
```

- `stage` is the P2P `pipeline-stage`: `fast-feedback`, `extended-test`, or `prod`.
- `reports` contains one entry per scanned image × platform.
- `imageRef` is the normalized image reference requested by the workflow.
- `digest` is the platform-specific manifest digest that was pulled and scanned.
- `vulnerabilityReport` is an artifact-relative path to a Trivy JSON report under `trivy/`.
- `secretReport` is an artifact-relative path to a TruffleHog JSON-lines report under `trufflehog-image/`; the file may be empty when TruffleHog finds no secrets.
- Report paths must be relative to the artifact root, must not be absolute, must not contain parent-directory traversal, and must point to files in the same artifact.

If scanning, report generation, or manifest validation is incomplete, the workflow does not upload a dashboard-matching `image-scan-reports-*` artifact. Use the failed job logs as the diagnostic surface.

## Report format

The sticky comment and workflow summary contain a unified header followed by compact vulnerability and image-secret sections. Comment rows are truncated for readability; the full scanner output is available in the artifact. For triage details and column meanings, see [How to triage security findings](../how-to/triage-security-findings.md).

## See also

- [p2p-workflow-fastfeedback reference](p2p-workflow-fastfeedback.md)
- [p2p-workflow-extended-test reference](p2p-workflow-extended-test.md)
- [p2p-workflow-prod reference](p2p-workflow-prod.md)
- [p2p-workflow-security-scan reference (scheduled umbrella)](p2p-workflow-security-scan.md)
- [Image scanning explanation](../explanation/image-scanning.md)
- [Triage security findings (how-to)](../how-to/triage-security-findings.md)
