# Ignore source security findings end to end

## Parent

`docs/prds/p2p-security-ignore-file.md`

## Type

AFK

## Labels

ready-for-agent

## What to build

Add repository-root `.p2p-security-ignore.yaml` support for source security findings. This slice should parse and validate the shared P2P ignore file, apply `source.vulnerabilities` and `source.secrets` ignores to normalized source security findings, split active findings from ignored findings, exclude ignored findings from source policy counts, omit ignored source findings from comments and summaries, and render ignored source findings separately in normalized machine-readable output.

The parser and matcher should be reusable by later image-scan work. A missing ignore file should preserve current source scan behavior. A malformed or semantically invalid ignore file should fail the scan/report job.

## Acceptance criteria

- [ ] A missing `.p2p-security-ignore.yaml` file preserves current source scan behavior.
- [ ] A valid repository-root `.p2p-security-ignore.yaml` file is parsed and validated.
- [ ] Malformed YAML, unsupported schema versions, missing required fields, invalid list/object shapes, and invalid expiry dates fail the source scan/report job.
- [ ] `source.vulnerabilities` entries match source vulnerability findings by `id` and optionally by `package` and Trivy source target path.
- [ ] `source.secrets` entries match source secret findings by P2P redacted secret ID and optionally by path.
- [ ] Expired source ignore entries do not apply.
- [ ] Ignored source findings are excluded from active source totals, blocking counts, and source policy failures.
- [ ] Ignored source findings are omitted from comments and summaries, and rendered separately from active source findings in normalized machine-readable output.
- [ ] Ignored source findings include the ignore reason and expiry metadata when present.
- [ ] Parser, matcher, reporting, policy-count, and expiry behavior are covered by tests that assert observable behavior.

## Blocked by

None - can start immediately.
