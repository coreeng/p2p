# ADR-0001: Platform-managed secrets scanning for P2P

## Status

Accepted.

## Context

Repositories must not contain secrets. P2P should provide platform-managed scanning and reporting so that application teams do not have to independently choose, configure, and maintain security tooling.

## Decision

Use **TruffleHog OSS** as the primary secrets scanning engine for P2P.

Implement it as a **single platform-managed reusable GitHub Actions workflow** owned by P2P (`p2p-workflow-security-scan.yaml`), with a `scope` input that selects pull-request/push scanning (`scope: changes`) or scheduled full-history scanning (`scope: full-history`). Application repositories add minimal stubs via P2P templates and rollout PRs.

## Why TruffleHog

TruffleHog is selected because it is a strong fit for the immediate problem and leaves useful options open for future platform use:

* It is backed by Truffle Security rather than being maintained only by a single individual.
* It is open-source and can run inside GitHub Actions without introducing a paid SaaS dependency.
* It supports scanning Git repositories and other source types, which may be useful later for scanning Docker images, filesystems, object storage, or other platform-managed locations.
* It supports secret verification for many detector types, which helps distinguish live credentials from lower-priority findings.
* It supports custom detectors, which is important for internal credentials, database connection strings, service tokens, or other organisation-specific secret formats that public scanners may not recognise out of the box.

## Alternatives considered

### Gitleaks

Gitleaks is a strong alternative for GitHub-native secrets scanning. It is simpler, fast, permissively licensed, supports git history scanning, and has good CI ergonomics.

It was not selected as the primary tool because TruffleHog has stronger built-in support for active secret verification and broader source scanning. Those capabilities are useful for prioritising real incidents and may help if P2P later scans sources beyond Git repositories.

Gitleaks remains the preferred fallback if TruffleHog licensing, performance, output format, or operational complexity becomes a blocker.

## Integration model

### Ownership

P2P owns:

* the reusable GitHub Actions workflow;
* the pinned scanner version;
* the default TruffleHog configuration;
* default blocking rules;
* reporting conventions;
* template updates;

Application repositories own:

* fixing or rotating exposed secrets;
* justifying repository-specific suppressions;
* keeping the P2P-managed workflow enabled;
* responding to alerts raised against their repository.

### Workflow structure

P2P should integrate pull request and default-branch secrets scanning into the existing `p2p-workflow-fastfeedback.yaml` reusable workflow as an additional independent job.

The `security-scan` job runs independently from `build` so it can execute in parallel and provide fast failure feedback. It does not block `build` from starting. It blocks the overall fast-feedback workflow result when a blocking secret finding is detected and `security-scan-fail-on-findings` is enabled.

For scheduled full-history scans, the same reusable workflow is called with `scope: full-history`.

Application repositories add a small scheduled wrapper, since GitHub requires schedules to be declared in the consuming repository:

```yaml
name: P2P scheduled security scan

on:
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  secret-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@v1
    with:
      scope: full-history
      fail-on-findings: false
```

## Scan policy

### Pull request scans

Pull request scans should be fast and targeted. They should scan only changes introduced by the PR compared with the target branch or merge base.

This gives developers fast feedback and prevents most new leaks from entering the default branch.

### Push/default branch scans

Default branch scans should run after merge to catch anything missed by the PR workflow and to cover direct pushes, automation merges, or unusual repository settings.

### Scheduled scans

Scheduled scanning is useful because:

* inactive repositories may not receive PRs;
* new detector versions may find secrets that older scans missed;
* previously unverified findings can become more important after detector or verification improvements;
* audits often require evidence that the control is active, not only triggered by code changes.

## Blocking rules

TruffleHog classifies each finding into one of three result types, based on whether the detector has a verifier and whether verification succeeded. The mapping below is what the JSON record actually exposes:

| Result type  | TruffleHog signal                                | Meaning                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`   | `Verified: true`                                 | Verifier confirmed the credential against a live service.                                                                                                                                                            |
| `unknown`    | `Verified: false`, `VerificationError` is set    | Verifier ran but could not determine the answer (DNS failure, rate limit, transient network error).                                                                                                                  |
| `unverified` | `Verified: false`, `VerificationError` is absent | Either the verifier ran and rejected the credential (invalid/revoked), or no verifier is shipped for that detector (today this includes every custom regex detector). TruffleHog does not distinguish the two cases. |

Initial policy:

| Result type  | Behaviour                                                                       |
| ------------ | ------------------------------------------------------------------------------- |
| `verified`   | Blocking — fails the job.                                                       |
| `unknown`    | Reported in the summary, comment, and JSON artifact, but does not fail the job. |
| `unverified` | Reported in the summary, comment, and JSON artifact, but does not fail the job. |

Only `verified` findings block. The `unknown` and `unverified` buckets are surfaced in every report (table row, sticky PR comment, JSON artifact) but do not gate the workflow.

The fast-feedback workflow enables blocking by default (`security-scan-fail-on-findings: true`). The gate is safe to turn on from day one because two properties combine to give it a near-zero false-positive surface:

* `scope: changes` scans only the PR/push delta, so pre-existing findings on the base branch are not surfaced and there is no historical backlog to triage.
* Blocking is limited to `verified` findings, i.e. credentials that the detector's verifier authenticated against a live service.

A fast-feedback block therefore means a brand-new, verifier-confirmed live secret is being introduced — which is the canonical case the gate exists to catch.

Scheduled full-history scans are different: they re-scan the entire repository history, so they do surface legacy findings and a baseline/suppression mechanism is needed before they can block safely. The scheduled wrapper example in "Workflow structure" therefore opts out of blocking explicitly.

### Why `unverified` is non-blocking

TruffleHog cannot separate "invalid/revoked secret" from "no verifier available" — both produce `Verified: false` with no `VerificationError`. Today the bucket therefore mixes low-risk noise (revoked credentials, fake test values, example documentation strings) with any future P2P custom-regex detector findings. Once custom detectors are introduced, the policy can be refined to block findings from that specific detector name without broadening to every `unverified` match.

### Why `unknown` is non-blocking

`unknown` means TruffleHog's verifier ran and returned an error rather than a clean yes/no. In practice that bucket is dominated by false positives and is structurally non-deterministic:

* **Fake/test infrastructure in fixtures.** Detectors that take the target host from the matched credential string (Postgres, MySQL, MongoDB, Redis, AMQP/Kafka, JDBC URLs, LDAP/FTP, self-hosted GitLab/Bitbucket/Jenkins URLs, webhook URLs with embedded basic-auth) try to connect to whatever hostname appears in the match. Test fixtures and documentation routinely contain values like `postgres://user:pass@db:5432/app` or `mongodb://u:p@example-db.invalid/test`. DNS-NXDOMAIN, connection-refused, TLS errors, and "unexpected EOF" from wrong-protocol responses all land in `unknown` and are indistinguishable, by error class alone, from genuine transient failures on real hosts.
* **Transient infrastructure issues against real providers.** For vendor detectors that hit a hardcoded endpoint (AWS, GitHub, Slack, Stripe, ...), the verifier can transiently return errors due to provider rate-limits, 5xx outages, runner egress restrictions, or TruffleHog's own verification timeout. The same secret can flip between `verified` and `unknown` across runs without any code change.
* **Non-determinism breaks CI.** Because `unknown` can fire on identical inputs across runs, hard-blocking on it produces flaky pipelines that pass once and fail on rebase. That undermines the trust signal of the scan and pushes teams to disable it.

Once a baseline/suppression mechanism and path-based exclusions are available (see open questions), the policy can be tightened — for example by blocking on `unknown` from vendor-style detectors (where transient failure is real and rare) while continuing to ignore `unknown` from protocol-style detectors (where false positives dominate).

## Reporting and alerting

First iteration:

* GitHub check result on PRs (via the reusable workflow's job status).
* Workflow summary with redacted findings, emitted on every run including zero-finding runs. Each finding is rendered as a table row with a markdown link to the file at the offending commit.
* Sticky PR comment with the same redacted findings on PR scans, upserted in place across runs.
* JSON artifact attached to every scan run, containing one record per finding with fields `id`, `detector`, `status`, `file`, `line`, `commit`, and `url`. The `id` is a lowercase hex SHA-256 of `<detector_name><NUL><raw_value>`; the `url` is a GitHub `blob/<sha>/<file>#L<line>` deep link. No raw secret values are stored in the artifact.

Later:

* Slack or other out-of-band notification for default-branch or scheduled blocking findings.
* Central P2P dashboard showing repository compliance status.
* Scheduled scan history.
* Open findings by repository/team.
* Suppression/exception inventory.
* Audit export.

## Consequences

Positive consequences:

* P2P provides a consistent platform-managed secrets scanning control.
* Application teams get security coverage with minimal per-repository implementation.
* New secrets are blocked before merge by default on fast-feedback runs.
* Dormant repositories can still be scanned on a schedule.
* The implementation creates a reusable GitHub Actions pattern for future platform security controls.

Negative consequences / trade-offs:

* Without a baseline mechanism, historical findings continue to appear in every report until remediated.
* TruffleHog's `unverified` bucket conflates "invalid/revoked" with "no verifier available", so the current policy cannot block findings from custom detectors without also blocking on revoked-secret noise.
* `unknown` findings are not blocking, which means transient verification errors on real cloud credentials (rate-limits, provider 5xx, runner egress) are not gated by CI. The trade-off is intentional: blocking on `unknown` was non-deterministic and produced more false-positive blocks (from test-fixture DSNs and other protocol-detector matches) than true catches. Real verified secrets are still blocked, and `unknown` findings remain visible in the report and the JSON artifact for follow-up.

## Open questions

1. How to store and manage scan baselines for accepted historical findings.
2. How to block on findings from P2P custom detectors once they are introduced, without broadening the policy to block on every `unverified` match.
3. Whether to sub-classify `unknown` by detector category (protocol vs. vendor) once a stable allowlist of vendor-style detectors is maintained, in order to recover blocking signal for transient provider failures on real cloud credentials.

## Final decision summary

P2P adopts TruffleHog OSS as the secrets scanning engine, exposed through a single reusable GitHub Actions workflow with a `scope` input that covers PR/push and scheduled full-history scans. Blocking is limited to `verified` findings; `unknown` and `unverified` findings are reported but not blocking in the first iteration in order to keep the gate deterministic and avoid false-positive blocks from test fixtures and transient verifier errors. Broader security scanning, baselines, and custom detector tuning remain out of scope for this ADR and will be added later as separate increments.

