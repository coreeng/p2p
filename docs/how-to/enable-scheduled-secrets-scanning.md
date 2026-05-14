# How to Enable Scheduled Secrets Scanning

Fast-feedback scans only cover commits introduced by a PR or push. To also scan the full history on a schedule — covering secrets committed before the workflow was adopted and dormant repositories that no longer receive PRs — add a per-repository wrapper that calls [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md) on a cron with `scope: full-history`.

GitHub requires schedule triggers to be declared in the consuming repository, so this wrapper lives in the application repo rather than in P2P.

## 1. Add the wrapper workflow

Create `.github/workflows/secret-scan.yaml` in your application repository:

```yaml
name: P2P scheduled security scan

on:
  schedule:
    # Weekly, Monday 03:17 UTC. Pick an off-peak time for your team.
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  secret-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-security-scan.yaml@v1
    with:
      scope: full-history
      # Scheduled scans see the full history, including legacy findings.
      fail-on-findings: false
```

That's all that is required. After committing on the default branch, the workflow runs on the cron and on demand via the Actions tab.

## 2. Review the report

Each scheduled run emits:

* a **workflow summary** with a markdown table of findings;
* a **JSON artifact** named `secret-scan-findings` retained per the repository's artifact retention policy;
* no PR comment — there is no PR associated with a scheduled run.

The summary is the primary place to look. Each finding row includes a deep link (`<server>/<repo>/blob/<sha>/<file>#L<line>`) to the exact line at the offending commit.

On the first scheduled run, the workflow surfaces every committed secret that has ever existed in the repository's reachable history, including ones that were rotated or accepted long ago. The same backlog re-appears on subsequent runs until each finding is remediated or suppressed. The job status is passing regardless of the number of findings, because `fail-on-findings: false`.

## 3. Adjust the timeout for large histories (optional)

The scan duration scales with history size; most repositories complete well under the default 30-minute timeout. For very large histories, increase `timeout-minutes`:

```yaml
with:
  scope: full-history
  fail-on-findings: false
  timeout-minutes: 60
```

---

For the full input reference, see the [p2p-workflow-security-scan reference](../reference/p2p-workflow-security-scan.md). For an overview of the two scanning modes, see [secrets scanning](../explanation/secrets-scanning.md).
