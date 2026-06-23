# How to Ignore Security Findings

Use `.p2p-security-ignore.yaml` only after confirming the finding is accepted risk. The file is a P2P product contract, not a scanner-native Trivy or TruffleHog ignore file.

P2P supports two security ignore scopes with the same input YAML schema version, `version: 1`:

- The repository-root `.p2p-security-ignore.yaml` is the **Repository Security Ignore** and applies to every Application in the repository.
- When `working-directory` is non-root, `<working-directory>/.p2p-security-ignore.yaml` is the **Application Security Ignore** for the current Application.

`working-directory` selects the Application Security Ignore file. `app-name` only scopes display surfaces such as sticky PR comments; it does not select ignore files.

Ignored findings are omitted from active tables in PR comments and workflow summaries, and those surfaces do not expose ignore reasons. Ignored findings are excluded from active totals, blocking counts, and policy failures. They remain available in `source-security-findings.json` and `image-security-findings.json` under `ignored.vulnerabilities` and `ignored.secrets` so the dashboard can display accepted risk separately.

Minimal v1 shape:

```yaml
version: 1

images:
  - name: api
    vulnerabilities:
      - id: CVE-2024-24790
        reason: "Runtime path is not reachable."
    secrets:
      - id: p2psec_def456
        reason: "Synthetic credential in test fixture."

source:
  vulnerabilities:
    - id: CVE-2024-12345
      reason: "Dev-only dependency."
  secrets:
    - id: source-secret-redacted-id
      reason: "Rotated historical credential retained until rewrite decision."
```

Rules for v1:

- The input YAML schema version is `version: 1`.
- The Repository Security Ignore path is `.p2p-security-ignore.yaml` at the repository root.
- The Application Security Ignore path is `<working-directory>/.p2p-security-ignore.yaml` when `working-directory` is non-root.
- Repository Security Ignore and Application Security Ignore matching is additive. A finding is ignored if it matches any valid, unexpired entry from either loaded file.
- Image entries require `name`; it matches the standard P2P image name, not a registry reference, tag, stage, or GitHub environment.
- Vulnerability ignores require `id` and `reason`. `package` is optional for source and image vulnerabilities. `paths` is optional for source vulnerabilities and narrows matching to Trivy filesystem result target paths.
- Secret ignores require `id` and `reason`. `path` is optional for source and image secrets.
- `expires` is optional for vulnerabilities and secrets. If present, it must use `YYYY-MM-DD`. If absent, the ignore has no expiry. If present and in the past, the ignore no longer applies.
- Optional narrowing fields use exact matching in v1. Globs and regular expressions are not supported.
- Malformed Repository Security Ignore or Application Security Ignore files, unsupported schema versions, invalid shapes, missing required fields, and invalid expiry dates fail report generation.
- Dry-run scans still validate loaded ignore files, so malformed files can fail dry-run report generation.
- License finding ignores and stage-specific ignores are out of scope for v1.

For source secrets, copy the exact `id` from `source-security-findings.json`. For image secrets, copy the `id` from the image PR comment, `image-security-findings.json`, or the dashboard evidence. Do not write raw secret values to `.p2p-security-ignore.yaml`; P2P secret finding IDs are redacted specifically so accepted secret findings can be tracked without disclosing the secret.

Normalized source and image artifacts always include top-level `ignoreFiles`, using `[]` when no ignore files are loaded. Each loaded file is listed with `scope` (`repository` or `application`) and `path`. Ignored findings include `matchedIgnores`; each match records `scope`, `path`, `reason`, and optional `expires`. Matches are ordered with Application Security Ignore entries first, then Repository Security Ignore entries, preserving YAML order within each file.
