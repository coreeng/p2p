# ADR-0001: Managed security scanning in P2P workflows

## Status

Accepted.

## Context

P2P application repositories need a consistent way to find security issues without each team choosing and maintaining separate scanning workflows. The platform should cover the cases that matter during normal delivery:

- source findings, plus new committed secrets, during a pull request;
- vulnerabilities and secrets in the images built for that pull request;
- older findings in repositories or deployed images that do not change often.

The first two cases are developer feedback. The last case is monitoring and audit evidence, so it must run from a schedule declared in each consuming repository.

## Decision

P2P provides managed security scanning through reusable GitHub Actions workflows.

Fast-feedback now runs source security scanning and image scanning automatically on pull requests and pushes. Source security scanning is repository-wide, not folder-scoped: TruffleHog checks the changed git history for committed secrets, and Trivy source dependency vulnerability scanning/SCA checks the current source tree. Neither source scanner is limited to the configured `working-directory`; that input affects make target execution, image build context, and image ignore-file selection, not source scanner scope. Image scanning checks the built P2P container images for known vulnerabilities and embedded secrets.

The workflows are visibility-first by default: findings are reported in workflow run summaries, artifacts, and PR comments where permissions allow, but they do not block unless the caller sets `security-scan-blocking-severity` to `low`, `medium`, `high`, or `critical`. Promotion waits for the scan jobs to complete, so scanner execution failures stop promotion. Security findings stop promotion only when they meet the configured blocking threshold. Callers can set `security-scan-enabled: false` as an explicit escape hatch to disable managed security scanner execution and policy jobs while leaving the rest of the pipeline unblocked.

P2P also provides a scheduled umbrella workflow, `p2p-workflow-security-scan`, for repositories that want periodic monitoring. A repository enables it with a small cron wrapper. Each scheduled run scans:

- the repository source history for secrets, and the current branch source tree for dependency vulnerabilities/SCA;
- the latest fast-feedback images;
- the latest extended-test images;
- the latest production images.

For each stage and environment, the scheduled workflow discovers the latest image version from the stage registry path and scans the configured P2P image set. If a stage has no deployed image yet, that stage is skipped after logging the missing image.

## User-facing model

Application teams normally get PR scanning by using the existing P2P fast-feedback workflow. No extra job is needed for the default PR path.

To add scheduled monitoring, the application repository adds a wrapper workflow:

```yaml
name: scheduled-security
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@main
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      tenant-name: my-tenant
      app-name: my-tenant
```

Teams read results in the GitHub Actions workflow run summary and artifacts. The source scan writes source vulnerability and secret results to the workflow run summary on every non-dry-run scan. On pull requests, source scan comments are posted when the workflow has `pull-requests: write`; image scan comments are also posted when that permission is granted through the caller chain. If the permission is omitted, image scanning still runs and uploads artifacts, but PR comment posting is non-fatal.

Scheduled source security scanning is also repository-wide, not folder-scoped: TruffleHog scans reachable git history for secrets, and Trivy source dependency vulnerability scanning/SCA scans the current branch source tree. As in fast-feedback, `working-directory` does not limit source scanner scope.

Application repositories may add P2P-owned `.p2p-security-ignore.yaml` files to record accepted security findings. Source report generation discovers every `.p2p-security-ignore.yaml` in the repository; each file's source entries apply only to findings under that file's directory, so the repository-root file applies to the whole repository. Image report generation reads the repository-root ignore file plus the ignore file in the selected `working-directory`. Valid, unexpired ignore entries remove matching findings from active report tables, active totals, blocking counts, and policy failures while keeping ignored records in normalized JSON artifacts for dashboard ingestion. Malformed ignore files, unsupported schema versions, invalid shapes, or invalid expiry dates fail report generation instead of silently weakening policy.

## Scanner choices

P2P uses Trivy for vulnerability scanning.

Trivy was selected because it covers both filesystem and container-image vulnerability scanning, supports common OS and language package ecosystems, emits machine-readable JSON, and has straightforward GitHub Actions installation. Using one vulnerability scanner for source and image paths keeps severity settings, report parsing, and artifact contracts consistent.

P2P uses TruffleHog for secret scanning.

TruffleHog was selected because it supports Git and Docker image sources, has broad detector coverage, verifies many credential types against their providers, and emits structured output that can be redacted and normalized. Verification is important because P2P can treat verified credentials as higher-confidence findings while still reporting unknown or unverified matches without making CI flaky.

We are not using Trivy's built-in secret scanner as the primary secret engine because it is regex-oriented and does not provide the same verification model. We are not using Gitleaks as the primary secret engine because, while it is simpler and strong for Git scanning, TruffleHog's verification and non-Git source support better match the combined source-plus-image scanning model.

## Consequences

Application teams get consistent security feedback from the workflows they already use, with minimal repository configuration.

The platform owns scanner versions, default policy, report shape, and reusable workflow behavior. Application teams own triage, rotation, remediation, and any repository-specific follow-up.

Scheduled scans can surface historical or dormant findings repeatedly until they are remediated or otherwise handled. This is intentional for monitoring, but it means scheduled results are reporting signals rather than default hard gates.

Security scan PR comments are scoped to the app. Image scan comments are additionally scoped by stage and environment, so multi-app pull requests and multi-environment runs update distinct sticky comments.
