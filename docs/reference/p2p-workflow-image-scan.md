# p2p-workflow-image-scan

> Scans every image resolved by the repository's P2P image targets for known vulnerabilities (Trivy) and embedded secrets (TruffleHog). Produces a workflow summary, optionally posts a sticky PR comment on `pull_request` events, and uploads an `image-scan-reports-<stage>-<github_env>` artifact. A separate policy job fails on active vulnerability or secret findings; the configured blocking severity controls whether that policy failure fails the workflow.

## Usage

Internal workflow called by [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md), [`p2p-workflow-extended-test`](p2p-workflow-extended-test.md), [`p2p-workflow-prod`](p2p-workflow-prod.md), and the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella. Application workflows should call those primary workflows instead; they expose `security-scan-blocking-severity` as the tenant-facing control.

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `pipeline-stage` | string | Yes | — | One of `fast-feedback`, `extended-test`, `prod`. Selects the registry path (`<region>-docker.pkg.dev/<project>/tenant/<tenant>/<stage>`) the images are pulled from. |
| `version` | string | Yes | — | Image tag to scan. Used with each standard P2P image name to build the stage Artifact Registry reference. |
| `github_env` | string | No | `''` | GitHub Environment used for environment-scoped variables and GCP auth. Required in practice — image pulls go through Workload Identity Federation bound to this environment. |
| `tenant-name` | string | No | `''` | Tenant identifier. Falls back to `vars.TENANT_NAME` when empty. |
| `region` | string | No | `europe-west2` | GCP region for the Artifact Registry. Overridden by `vars.REGION` when set on the environment. |
| `working-directory` | string | No | `.` | Directory from which `make p2p-images` is executed when `image-names` is empty. |
| `image-names` | string | No | `''` | Newline-, comma-, or whitespace-separated list of standard P2P image names to scan. When set, this list is used instead of `make p2p-images`. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP auth, registry login, Trivy install, the scan itself, the sticky PR comment, the artifact upload, and the policy step. The `Build report` step still runs and produces a "Scan skipped" summary. |
| `blocking-severity` | string | No | `off` | Minimum finding severity that blocks the workflow: `off`, `low`, `medium`, `high`, or `critical`. Verified image secrets are treated as `critical`. The policy job fails on active vulnerability or secret findings, but the workflow continues when findings are below the blocking threshold. |
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

| Name | Description |
|------|-------------|
| `json-file` | Path to `image-security-findings.json` inside the runner workspace. |
| `security-risk` | Maximum active image vulnerability/secret risk after ignore rules: `critical`, `unclassified`, `high`, `medium`, `low`, `ok`, or `unknown`. |
| `scan-status` | `ok` when scanner results were extracted successfully, otherwise `failed`. |

Results are also surfaced via:

- The workflow summary (`$GITHUB_STEP_SUMMARY`).
- Policy step named `Output security risk: <risk>; scan: <status>` for dashboard extraction.
- A sticky PR comment with `header: image-scan-findings-<stage>-<github_env>` on `pull_request` events when `dry-run: false` and the caller grants `pull-requests: write`. When `github_env` is empty, the header uses `local`.
- The `image-scan-reports-<stage>-<github_env>` artifact, retained for 30 days. When `github_env` is empty, the artifact name uses `local`. Contains root `manifest.json`, `image-security-findings.json`, `trivy/` (one Trivy JSON per image x platform), and `trufflehog-image/` (one redacted TruffleHog JSON-lines file per image x platform).

If the repository root contains `.p2p-security-ignore.yaml`, image vulnerability and image secret findings that match a valid, unexpired ignore entry are omitted from active finding tables in the workflow summary and sticky PR comment. Ignored findings stay visible in `image-security-findings.json` with their ignore reason and expiry metadata when present. They are excluded from active totals, active blocking counts, and image policy failures.

`image-security-findings.json` uses top-level `vulnerabilities` and `secrets` collections. When an ignore file is present, it also includes `ignored.vulnerabilities` and `ignored.secrets`.

## Permissions

The workflow inherits the token permissions passed by the caller chain. In nested reusable workflows, GitHub caps the token to the permissions granted by the top-level caller and each intermediate caller. Grant:

| Scope | When required |
|-------|---------------|
| `contents: read` | Always — cloning the repository and reading P2P image make targets. |
| `id-token: write` | Always — GCP authentication via Workload Identity Federation. |
| `pull-requests: write` | `pull_request` events only, and only when sticky PR comments are wanted. Without it the comment step fails open (continue-on-error); the summary and artifact are still produced. |

The job runs under `environment: ${{ inputs.github_env }}` and authenticates to the stage Artifact Registry plus the optional tenant-provided registry before pulling and scanning images.

## Image resolution

If `image-names` is set, the workflow splits it on commas or whitespace and scans exactly those standard P2P image names. If it is empty, the workflow runs `make p2p-images` in `working-directory`; that target must print standard P2P image names with no registry and no tag. Each image name is combined with the registry path for `pipeline-stage` and the `version` input to form the full reference:

```
<region>-docker.pkg.dev/<project>/tenant/<tenant>/<pipeline-stage>/<image>:<version>
```

If neither `image-names` nor `p2p-images` produces scan targets, the job fails — there is nothing to scan.

## Security ignore file

The image scan workflow reads one P2P-owned ignore file from the repository root: `.p2p-security-ignore.yaml`. If the file is absent, scans behave normally. If it is present but malformed, uses an unsupported schema version, omits required fields, has invalid shapes, or contains invalid expiry dates, the scan/report job fails.

See [How to ignore security findings](../how-to/ignore-security-findings.md) for the v1 schema, matching rules, and secret ID guidance.

## Artifact contract

Each published `image-scan-reports-<stage>-<github_env>` artifact is complete dashboard image evidence. The root `manifest.json` is the supported artifact index; `reports.txt` files are runner-local implementation detail and are not published or supported for downstream parsing.

Manifest schema version 1:

```json
{
  "schemaVersion": 1,
  "stage": "fast-feedback",
  "reports": [
    {
      "imageRef": "europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/api:0.0.192",
      "platform": "linux/amd64",
      "digest": "sha256:66bcd930d1794057bd206ebd3f2751eeedc3a57fe65bc869f41380e58f68bf6f",
      "vulnerabilityReport": "trivy/europe-west2-docker.pkg.dev_project-a_tenant_tenant-a_fast-feedback_api_0.0.192-linux_amd64.json",
      "secretReport": "trufflehog-image/europe-west2-docker.pkg.dev_project-a_tenant_tenant-a_fast-feedback_api_0.0.192-linux_amd64.jsonl"
    }
  ]
}
```

- `stage` is the P2P `pipeline-stage`: `fast-feedback`, `extended-test`, or `prod`.
- `reports` contains one entry per scanned image × platform.
- `imageRef` is the normalized image reference requested by the workflow.
- `digest` is the platform-specific manifest digest that was pulled and scanned.
- `vulnerabilityReport` is an artifact-relative path to a Trivy JSON report under `trivy/`.
- `secretReport` is an artifact-relative path to a redacted TruffleHog JSON-lines report under `trufflehog-image/`; the file may be empty when TruffleHog finds no secrets.
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
