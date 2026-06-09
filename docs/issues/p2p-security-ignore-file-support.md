# Add P2P security ignore file support

## Parent

`docs/prds/p2p-security-ignore-file.md`

## Type

AFK

## Labels

ready-for-agent

## What to build

Add support for a repository-root `.p2p-security-ignore.yaml` file that lets P2P users record accepted source and image security findings. The format must support image vulnerabilities, image secrets, source vulnerabilities, and source secrets. Each ignored finding requires an `id` and a `reason`; optional fields narrow matching or add expiry metadata.

The implementation should parse and validate the ignore file, split normalized scan findings into active and ignored collections, exclude ignored findings from active totals and blocking policy counts, and render ignored findings separately in human-readable and machine-readable outputs.

This work should keep the format independent of scanner-native Trivy and TruffleHog ignore mechanisms. License ignores, stage-specific ignores, multiple ignore files, and `working-directory`-relative ignore files are out of scope.

## Acceptance criteria

- [ ] A missing `.p2p-security-ignore.yaml` file preserves current scan behavior.
- [ ] A valid `.p2p-security-ignore.yaml` file is parsed from the repository root.
- [ ] Malformed YAML, unsupported schema versions, missing required fields, invalid shapes, and invalid expiry dates fail the scan/report job.
- [ ] Image vulnerability ignores match by vulnerability ID and optionally by package.
- [ ] Source vulnerability ignores match by vulnerability ID and optionally by package and Trivy source target path.
- [ ] Source secret ignores match by P2P redacted secret ID and optionally by path.
- [ ] Image secret findings include stable P2P redacted secret IDs without exposing raw secret values.
- [ ] Image secret ignores match by P2P redacted secret ID and optionally by image file path.
- [ ] Expired ignore entries do not apply.
- [ ] Ignored findings are excluded from active totals, blocking counts, and policy failures.
- [ ] Ignored findings are rendered separately from active findings in comments, summaries, and normalized machine-readable output.
- [ ] Ignored findings include the ignore reason and expiry metadata when present.
- [ ] License findings are unchanged and cannot be ignored by this v1 format.
- [ ] Tests cover parser validation, matcher behavior, active-vs-ignored reporting, policy counts, expired entries, and image secret ID generation.
- [ ] Reference and triage documentation describe the ignore file path, schema, matching behavior, and reporting split.

## Blocked by

None - can start immediately.
