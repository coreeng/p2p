# Document and review the security ignore file contract

## Parent

`docs/prds/p2p-security-ignore-file.md`

## Type

HITL

## Labels

ready-for-agent

## What to build

Document the P2P security ignore file contract and review the machine-readable ignored-finding shape against dashboard ingestion needs. The docs should explain the repository-root `.p2p-security-ignore.yaml` path, schema version, required and optional fields, exact-match semantics, expiry behavior, active-vs-ignored reporting split, and the decision to leave license ignores out of v1.

The review should confirm that P2P's normalized ignored-finding output carries enough information for the dashboard to visualise ignored findings separately with their reasons.

## Acceptance criteria

- [ ] Reference docs describe `.p2p-security-ignore.yaml` and its v1 schema.
- [ ] Triage docs explain that comments and summaries show active findings only, while artifacts retain ignored findings separately with reasons for dashboard ingestion.
- [ ] Docs state that `id` and `reason` are required for vulnerability and secret ignores.
- [ ] Docs state that `package`, `paths`, `path`, and `expires` are optional narrowing or review metadata fields.
- [ ] Docs state that optional narrowing fields use exact matching in v1.
- [ ] Docs state that absent `expires` means no expiry and past `expires` means the ignore no longer applies.
- [ ] Docs state that license finding ignores, stage-specific ignores, multiple ignore files, and `working-directory`-relative ignore files are out of scope for v1.
- [ ] A human reviewer confirms the ignored-finding machine-readable output is sufficient for dashboard ingestion before merge.

## Blocked by

- Ignore source security findings end to end (`docs/issues/p2p-security-ignore-source-findings.md`)
- Ignore image security findings end to end (`docs/issues/p2p-security-ignore-image-findings.md`)
