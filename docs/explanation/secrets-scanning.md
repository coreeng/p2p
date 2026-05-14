# Secrets scanning

P2P provides platform-managed secrets scanning so application teams do not have to choose, configure, and maintain their own scanner. The control runs as a single reusable workflow ([`p2p-workflow-secret-scan`](../reference/p2p-workflow-secret-scan.md)) that is called in two places: from `p2p-workflow-fastfeedback` on every PR and push, and from a per-repository scheduled wrapper (either standalone or via the [scheduled security umbrella](../reference/p2p-workflow-security-scan.md)) that covers the full history.

## What gets scanned and when

| Trigger | Scope | Caller | Blocking by default |
|---------|-------|--------|---------------------|
| PR / push | `changes` — the delta (only commits introduced by the PR or push) | `p2p-workflow-fastfeedback` | No (opt-in via `security-scan-fail-on-findings: true`) |
| Cron | `full-history` — every reachable commit | Per-repository scheduled wrapper | No |

The two modes serve different purposes: the PR/push mode is a **gate candidate** that surfaces new secrets as they are introduced and can be promoted to a hard gate by setting `security-scan-fail-on-findings: true`; the scheduled mode is a **monitoring signal** that surfaces legacy findings and re-checks dormant repositories.

## See also

- [Image scanning](image-scanning.md)
- [p2p-workflow-secret-scan reference](../reference/p2p-workflow-secret-scan.md)
- [p2p-workflow-security-scan reference (scheduled umbrella)](../reference/p2p-workflow-security-scan.md)
- [How to enable scheduled secrets scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md)
