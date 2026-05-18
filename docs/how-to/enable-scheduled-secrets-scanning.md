# How to Enable Scheduled Source Security Scanning

Fast-feedback scans only cover commits introduced by a PR or push. To also scan the full history on a schedule, add a per-repository wrapper that calls [`p2p-workflow-source-security-scan`](../reference/p2p-workflow-source-security-scan.md) on a cron with `scope: full-history`. Use this source-only wrapper for committed secrets, source dependency vulnerabilities, and restricted or forbidden license signals. To run source security and per-stage image scans together on a single schedule, use the [scheduled security umbrella](../reference/p2p-workflow-security-scan.md) instead.

GitHub requires schedule triggers to be declared in the consuming repository, so this wrapper lives in the application repo rather than in P2P.

## 1. Add the wrapper workflow

Create `.github/workflows/source-security-scan.yaml` in your application repository:

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
  source-security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-source-security-scan.yaml@v1
    with:
      scope: full-history
      # Scheduled scans see the full history, including legacy findings.
      fail-on-findings: false
```

That's all that is required. After committing on the default branch, the workflow runs on the cron and on demand via the Actions tab.

## 2. Review the report

Each scheduled run emits:

* a **workflow summary** with a markdown table of findings;
* a **workflow artifact** named `source-security-scan-findings` retained per the repository's artifact retention policy;
* no PR comment — there is no PR associated with a scheduled run.

The artifact contains redacted TruffleHog output, raw Trivy filesystem output, and normalized merged JSON. The summary is the primary place to look. Secret finding rows include a deep link (`<server>/<repo>/blob/<sha>/<file>#L<line>`) to the exact line at the offending commit when available.

On the first scheduled run, the workflow surfaces source security findings across the repository's reachable history and current source tree. Secret findings may include credentials that were rotated or accepted long ago. The same backlog re-appears on subsequent runs until each finding is remediated or suppressed. The job status is passing regardless of the number of findings, because `fail-on-findings: false`.

## 3. Adjust the timeout for large histories (optional)

The scan duration scales with history size; most repositories complete well under the default 30-minute timeout. For very large histories, increase `timeout-minutes`:

```yaml
with:
  scope: full-history
  fail-on-findings: false
  timeout-minutes: 60
```

## 4. Use the scheduled umbrella for source plus images

If you also want per-stage image vulnerability and embedded-secret scans on the same schedule, call [`p2p-workflow-security-scan`](../reference/p2p-workflow-security-scan.md) instead. The umbrella runs `p2p-workflow-source-security-scan` with `scope: full-history` and runs image scans for the latest deployed version in fast-feedback, extended-test, and prod.

---

For the full input reference, see the [p2p-workflow-source-security-scan reference](../reference/p2p-workflow-source-security-scan.md). For an overview of the two scanning modes, see [secrets scanning](../explanation/secrets-scanning.md). For how to read and triage findings, see [how to triage security findings](triage-security-findings.md).
