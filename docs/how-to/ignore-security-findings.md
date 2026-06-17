# How to Ignore Security Findings

Use the repository-root `.p2p-security-ignore.yaml` file only after confirming the finding is accepted risk. The file is a P2P product contract, not a scanner-native Trivy or TruffleHog ignore file.

Ignored findings are omitted from PR comments and workflow summaries. They are excluded from active totals, blocking counts, and policy failures. They remain available in `source-security-findings.json` and `image-security-findings.json` under `ignored.vulnerabilities` and `ignored.secrets` so the dashboard can display accepted risk separately with the recorded reason.

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

- The ignore file path is `.p2p-security-ignore.yaml` at the repository root.
- The schema version is `version: 1`.
- Image entries require `name`; it matches the standard P2P image name, not a registry reference, tag, stage, or GitHub environment.
- Vulnerability ignores require `id` and `reason`. `package` is optional for source and image vulnerabilities. `paths` is optional for source vulnerabilities and narrows matching to Trivy filesystem result target paths.
- Secret ignores require `id` and `reason`. `path` is optional for source and image secrets.
- `expires` is optional for vulnerabilities and secrets. If absent, the ignore has no expiry. If present and in the past, the ignore no longer applies.
- Optional narrowing fields use exact matching in v1. Globs and regular expressions are not supported.
- License finding ignores, stage-specific ignores, multiple ignore files, and `working-directory`-relative ignore files are out of scope for v1.

For source secrets, copy the exact `id` from `source-security-findings.json`. For image secrets, copy the `id` from the image PR comment, `image-security-findings.json`, or the dashboard evidence. Do not write raw secret values to `.p2p-security-ignore.yaml`; P2P secret finding IDs are redacted specifically so accepted secret findings can be tracked without disclosing the secret.
