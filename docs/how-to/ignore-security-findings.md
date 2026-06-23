# How to Ignore Security Findings

Use `.p2p-security-ignore.yaml` only after confirming the finding is accepted risk. The file is a P2P product contract, not a scanner-native Trivy or TruffleHog ignore file.

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

- Source scans discover every `.p2p-security-ignore.yaml` in the repository. Each file's `source` entries apply only to source findings under the directory containing that file. The repository-root file applies to the whole repository.
- Image scans read only the repository-root `.p2p-security-ignore.yaml` plus the `.p2p-security-ignore.yaml` in the selected `working-directory`. Image scans do not discover ignore files from other directories.
- The schema version is `version: 1`.
- Image entries require `name`; it matches the standard P2P image name, not a registry reference, tag, stage, or GitHub environment.
- Vulnerability ignores require `id` and `reason`. `package` is optional for source and image vulnerabilities. `paths` is optional for source vulnerabilities and narrows matching to Trivy filesystem result target paths.
- Secret ignores require `id` and `reason`. `path` is optional for source and image secrets.
- Source vulnerability `paths` and source secret `path` values in the repository-root ignore file are repository-relative. The same fields in nested ignore files are relative to the directory containing that ignore file. Source path filters that resolve outside that directory, including `..` escapes, fail validation.
- `expires` is optional for vulnerabilities and secrets. If present, it must use `YYYY-MM-DD`. If absent, the ignore has no expiry. If present and in the past, the ignore no longer applies.
- Optional narrowing fields use exact matching in v1. Globs and regular expressions are not supported.
- `app-name` scopes sticky PR comments only. It does not select source scanner scope or security ignore files.
- License finding ignores and stage-specific ignores are out of scope for v1.

For source secrets, copy the exact `id` from `source-security-findings.json`. For image secrets, copy the `id` from the image PR comment, `image-security-findings.json`, or the dashboard evidence. Do not write raw secret values to `.p2p-security-ignore.yaml`; P2P secret finding IDs are redacted specifically so accepted secret findings can be tracked without disclosing the secret.
