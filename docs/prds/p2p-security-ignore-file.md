# P2P Security Ignore File

## Problem Statement

P2P security scans intentionally surface source vulnerabilities, git-tree secrets, image vulnerabilities, and image secrets across fast-feedback, scheduled security scans, and promoted image stages. Some findings are legitimate but temporarily or permanently accepted by the application team: a vulnerable package may be unreachable, a base image may not yet have a fixed package, a documentation fixture may intentionally look like a secret, or a rotated historical secret may remain in git history until a rewrite decision is made.

Today there is no product-level way for P2P users to record those decisions. Scanner-native ignore mechanisms are inconsistent across Trivy and TruffleHog, and they do not match the dashboard's need to visualise active and ignored findings together. Users need one P2P-owned ignore format that is stable across scanner tooling, can be consumed by CI and the dashboard, and preserves the reason for each ignored finding.

## Solution

Add a repository-root P2P security ignore file named `.p2p-security-ignore.yaml`. The file describes accepted source and image security findings using P2P concepts rather than scanner-native configuration.

The ignore file supports image-level vulnerability and secret ignores under each P2P image name, plus repository-level source vulnerability and source secret ignores. Each ignored vulnerability or secret requires only an `id` and a `reason`. Optional fields narrow the match or add review metadata.

P2P scan reporting separates active findings from ignored findings. Ignored findings do not contribute to active totals or blocking counts, but they remain visible in a separate ignored-findings section and in machine-readable artifacts so that the dashboard can display accepted risk with its reason.

Malformed ignore files fail the scan/report job. License findings are not part of this first version.

## User Stories

1. As a platform user, I want to ignore an accepted image vulnerability, so that the same accepted CVE does not keep failing or distracting from new findings.
2. As a platform user, I want each ignored vulnerability to include a reason, so that reviewers understand why the finding is accepted.
3. As a platform user, I want to ignore an accepted image secret, so that synthetic or already-remediated image secret findings can be separated from active risks.
4. As a platform user, I want to ignore an accepted source vulnerability, so that dev-only or unreachable source dependency findings can be documented without hiding image risks.
5. As a platform user, I want to ignore an accepted source secret, so that rotated historical git findings can be recorded while still preserving scan visibility.
6. As a platform user, I want source and image ignores in one file, so that repository security decisions are easy to find and review.
7. As a platform user, I want image ignores grouped by P2P image name, so that accepted findings are attached to the image they affect.
8. As a platform user, I want the ignore file to live at the repository root, so that source scans, image scans, and dashboard ingestion share one stable location.
9. As a platform user, I want only `id` and `reason` to be required for each ignored finding, so that creating an ignore is simple.
10. As a platform user, I want optional package matching for vulnerabilities, so that a CVE can be ignored only for the intended package when necessary.
11. As a platform user, I want optional source path matching for source vulnerabilities, so that lockfile-specific accepted findings do not suppress the same vulnerability elsewhere.
12. As a platform user, I want optional path matching for secrets, so that a secret ignore can be narrowed to the intended source file or image file.
13. As a platform user, I want optional expiry dates, so that temporary acceptances can become active again automatically.
14. As a platform user, I want absent expiry dates to be allowed, so that v1 can support simple acceptance records without forcing a governance workflow.
15. As a platform user, I want ignored findings shown separately from active findings, so that accepted risk remains visible without polluting active remediation counts.
16. As a platform user, I want ignored findings to retain their reasons in the dashboard, so that audit and triage discussions do not require searching workflow logs.
17. As a maintainer, I want P2P's ignore format to be independent of scanner-native files, so that Trivy or TruffleHog behavior can change without changing the product contract.
18. As a maintainer, I want invalid ignore files to fail loudly, so that a malformed file does not silently stop applying expected ignores.
19. As a maintainer, I want a scanner-neutral parser and matcher, so that source and image workflows use the same ignore semantics.
20. As a maintainer, I want image secret findings to have stable P2P-generated redacted IDs, so that users do not need to put secret values in the ignore file.
21. As a maintainer, I want source secret finding IDs and image secret finding IDs to use the same conceptual shape, so that dashboard ignore snippets are consistent.
22. As a maintainer, I want ignored findings excluded from blocking counts, so that accepted findings do not block pipelines configured with a security threshold.
23. As a maintainer, I want ignored findings retained in machine-readable reports, so that the dashboard can visualise active and ignored findings without reparsing scanner-native output.
24. As a maintainer, I want the active-vs-ignored split to apply to both `blocking-severity: off` and non-off thresholds, so that visibility-first mode and gate mode are consistent.
25. As a maintainer, I want license findings out of scope for v1, so that the first implementation focuses on security findings that can block P2P workflows.

## Implementation Decisions

- Build or modify a P2P security-ignore parser module with a small interface: read the repository-root ignore file if present, validate it, and return a normalized ignore model.
- Build or modify a P2P security-ignore matcher module with a small interface: take normalized findings and the normalized ignore model, then split findings into active and ignored collections.
- The ignore file path is `.p2p-security-ignore.yaml` at the repository root.
- The ignore file is a P2P product contract, not a Trivy `.trivyignore` file and not a TruffleHog configuration file.
- The top-level schema version is `version: 1`.
- Image ignores are grouped under `images`, where each image entry requires `name`.
- Image names match standard P2P image names, not full registry references, tags, stages, or GitHub environments.
- Stage-specific ignores are not supported in v1 because P2P promotes the same image version through stages. Stage-specific risk acceptance is treated as policy configuration, not finding identity.
- Source ignores are grouped under `source` because source scan findings are repository-level and do not belong to a single image.
- Vulnerability ignores require `id` and `reason`.
- Vulnerability `id` matches Trivy's vulnerability identifier. This can be a CVE, GHSA, OSV, distro advisory, or another scanner-provided vulnerability ID.
- Vulnerability `package` is optional. When present, it narrows matching to the finding package name. When absent, the ignore applies to every finding with that vulnerability ID in the relevant scope.
- Source vulnerability `paths` is optional. When present, every path is matched against Trivy filesystem result targets.
- Secret ignores require `id` and `reason`.
- Secret `id` is a P2P-generated redacted secret ID. It must not expose the raw secret value.
- Source secret IDs already exist conceptually through the redacted source secret finding ID. Image secret IDs need to be added during image secret normalization.
- Secret `path` is optional. When present, it narrows matching to the source file path or image file path where the secret appears.
- `expires` is optional for vulnerabilities and secrets. When absent, the ignore has no expiry. When present and in the past, the ignore no longer applies.
- `expires` uses ISO date format `YYYY-MM-DD`.
- Optional narrowing fields use exact matching in v1. Globs and regular expressions are out of scope.
- If the ignore file is absent, scans behave as they do today.
- If the ignore file is present but malformed or semantically invalid, the scan/report job fails.
- Active findings and ignored findings are separate in human-readable comments, workflow summaries, normalized JSON, and dashboard-facing artifacts.
- Ignored findings do not contribute to active totals, active blocking counts, or policy failures.
- Ignored findings include the matched ignore reason and any expiry metadata in normalized output.
- License ignores are not supported in v1.
- Source scan currently scans the whole repository workspace rather than the P2P `working-directory`; this PRD keeps one repository-root ignore file for v1.

## Testing Decisions

- Tests should assert external behavior of parsing, matching, reporting, and policy counts rather than incidental workflow script structure.
- Parser tests should cover absent file, minimal valid file, full valid file, unknown schema version, malformed YAML, missing required fields, invalid list/object shapes, invalid expiry format, and expired entries.
- Matcher tests should cover image vulnerability ignores by ID only, image vulnerability ignores narrowed by package, source vulnerability ignores narrowed by package and path, source secret ignores by ID only, image secret ignores by ID only, and secret ignores narrowed by path.
- Matching tests should verify exact-match semantics for optional fields.
- Reporting tests should verify that ignored findings are rendered separately from active findings and carry their reason.
- Policy tests should verify that ignored findings are excluded from active totals and blocking counts for both `blocking-severity: off` and non-off thresholds.
- Image secret normalization tests should verify that a stable redacted ID is emitted without exposing raw secret values.
- Workflow-level or script-level tests should follow the current internal CI pattern of extracting reusable workflow logic and running it in isolation where practical.
- Documentation tests are not required, but reference and triage docs should be reviewed for consistency with the new ignore file contract.

## Out of Scope

- Scanner-native Trivy ignore files.
- Scanner-native TruffleHog configuration or path-exclusion files.
- License finding ignores.
- Stage-specific ignores.
- Multiple ignore files.
- `working-directory`-relative ignore files.
- Glob or regex matching in optional fields.
- Requiring expiry dates.
- Permanent-ignore governance workflows.
- Dashboard implementation details beyond preserving ignored findings and reasons in machine-readable output.
- GitHub issue or API integration for managing ignore entries.

## Further Notes

The first implementation should favour a deep parser/matcher module because both source security scans and image scans need the same semantics. The dashboard should be able to consume ignored findings without understanding scanner-native output or recomputing why a finding was ignored.

The intended v1 shape is:

```yaml
version: 1

images:
  - name: api
    vulnerabilities:
      - id: CVE-2024-24790
        reason: "Runtime path is not reachable."
        package: golang.org/x/net
        expires: 2026-09-01
    secrets:
      - id: p2psec_def456
        reason: "Synthetic credential in test fixture."
        path: /app/testdata/example.env
        expires: 2026-09-01

source:
  vulnerabilities:
    - id: CVE-2024-12345
      reason: "Dev-only dependency."
      package: example-dev-tool
      paths:
        - services/api/package-lock.json
  secrets:
    - id: p2psec_abc123
      reason: "Rotated historical credential retained until rewrite decision."
      path: docs/examples/oauth.md
```
