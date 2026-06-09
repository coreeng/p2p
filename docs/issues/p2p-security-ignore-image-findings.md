# Ignore image security findings end to end

## Parent

`docs/prds/p2p-security-ignore-file.md`

## Type

AFK

## Labels

ready-for-agent

## What to build

Extend `.p2p-security-ignore.yaml` support to image security findings. This slice should reuse the shared parser and matcher from source-ignore support, apply `images[].vulnerabilities` and `images[].secrets` ignores by P2P image name, split active findings from ignored findings, exclude ignored findings from image policy counts, omit ignored image findings from comments and summaries, and render ignored image findings separately in normalized machine-readable output.

Image secret findings should gain stable P2P redacted secret IDs so that image secret ignores can match without exposing raw secret values.

## Acceptance criteria

- [ ] Image scan reporting reuses the shared P2P ignore-file parser and validation behavior.
- [ ] `images[].name` entries match standard P2P image names, not full registry references, tags, stages, or GitHub environments.
- [ ] `images[].vulnerabilities` entries match image vulnerability findings by `id` and optionally by `package`.
- [ ] Image secret findings include stable P2P redacted secret IDs without exposing raw secret values.
- [ ] `images[].secrets` entries match image secret findings by P2P redacted secret ID and optionally by image file path.
- [ ] Expired image ignore entries do not apply.
- [ ] Ignored image findings are excluded from active image totals, blocking counts, and image policy failures.
- [ ] Ignored image findings are omitted from comments and summaries, and rendered separately from active image findings in normalized machine-readable output.
- [ ] Ignored image findings include the ignore reason and expiry metadata when present.
- [ ] Image vulnerability matching, image secret ID generation, image secret matching, reporting, policy-count, and expiry behavior are covered by tests that assert observable behavior.

## Blocked by

- Ignore source security findings end to end (`docs/issues/p2p-security-ignore-source-findings.md`)
