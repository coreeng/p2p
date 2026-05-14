# Secrets scanning

P2P provides platform-managed secrets scanning so application teams do not have to choose, configure, and maintain their own scanner. The control runs as a single reusable workflow ([`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md)) that is called in two places: from `p2p-workflow-fastfeedback` on every PR and push, and from a per-repository scheduled wrapper that covers the full history.

## What gets scanned and when

| Trigger | Scope | Caller | Blocking by default |
|---------|-------|--------|---------------------|
| PR / push | `changes` — the delta (only commits introduced by the PR or push) | `p2p-workflow-fastfeedback` | **Yes** |
| Cron | `full-history` — every reachable commit | Per-repository scheduled wrapper | No |

The two modes serve different purposes: the PR/push mode is a **gate** that catches new secrets as they are introduced; the scheduled mode is a **monitoring signal** that surfaces legacy findings and re-checks dormant repositories.

## See also

- [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md)
- [How to enable scheduled secrets scanning](../how-to/enable-scheduled-secrets-scanning.md)
- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md)
