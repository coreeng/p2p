# Secrets scanning

P2P provides platform-managed secrets scanning so application teams do not have to choose, configure, and maintain their own scanner. Secrets are now part of the broader [`p2p-workflow-source-security-scan`](../reference/p2p-workflow-source-security-scan.md) reusable workflow, alongside source dependency vulnerabilities and restricted or forbidden license signals. Fast-feedback calls it on every PR and push, and scheduled wrappers can call it directly or through the [scheduled security umbrella](../reference/p2p-workflow-security-scan.md).

## What gets scanned and when

| Trigger | Scope | Caller | Blocking by default |
|---------|-------|--------|---------------------|
| PR / push | `changes` - the delta (only commits introduced by the PR or push) | `p2p-workflow-fastfeedback` | No (opt in with `security-scan-blocking-severity: low`, `medium`, `high`, or `critical`) |
| Cron | `full-history` - every reachable commit | `p2p-workflow-source-security-scan` or `p2p-workflow-security-scan` wrapper | No |

The two modes serve different purposes: the PR/push mode is a **gate candidate** that surfaces new secrets as they are introduced and can be promoted to a hard gate by setting `security-scan-blocking-severity` to a non-`off` threshold; the scheduled mode is a **monitoring signal** that surfaces legacy findings and re-checks dormant repositories. Verified secrets are treated as `critical` for blocking. The same source security report also shows source vulnerabilities and restricted or forbidden license findings.

## See also

- [Image scanning](image-scanning.md)
- [p2p-workflow-source-security-scan reference](../reference/p2p-workflow-source-security-scan.md)
- [p2p-workflow-security-scan reference (scheduled umbrella)](../reference/p2p-workflow-security-scan.md)
- [How to enable scheduled security scanning](../how-to/enable-scheduled-security-scanning.md)
- [How to triage security findings](../how-to/triage-security-findings.md)
- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md)
