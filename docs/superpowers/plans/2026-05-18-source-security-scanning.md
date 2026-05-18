# Source Security Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace git-only secret scanning with a reusable source security scan that reports source dependency vulnerabilities, restricted/forbidden licenses, and committed secrets in one compact PR comment.

**Architecture:** Add a new reusable GitHub workflow that runs TruffleHog and Trivy in parallel, then uses an embedded `actions/github-script` report step to normalize findings, render one compact markdown report, write one merged JSON artifact, and enforce the same severity/blocking model used by image scanning. This deliberately follows the existing `p2p-workflow-image-scan.yaml` pattern instead of adding a separate report script. The workflow includes a `dry-run` input so internal CI and dry-run fast-feedback do not run scanners, post comments, upload public findings artifacts, or enforce policy.

**Tech Stack:** GitHub Actions reusable workflows, embedded `actions/github-script@v7`, TruffleHog OSS `git` scanner, Trivy `fs` scanner, `actionlint`, Markdown docs.

---

## File Structure

- Create `.github/workflows/p2p-workflow-source-security-scan.yaml`: reusable workflow with `secret-scan`, `sca-scan`, and `report` jobs. The `report` job owns all embedded JavaScript for parsing, redaction, markdown rendering, normalized JSON, output counts, and policy inputs. Scanner jobs use internally named artifacts only to transfer redacted TruffleHog output and raw Trivy output into the final report job.
- Delete `.github/workflows/p2p-workflow-secret-scan.yaml`: replaced by the source security workflow.
- Modify `.github/workflows/p2p-workflow-fastfeedback.yaml`: replace `secret-scan` job with `source-security-scan`, keep source workflow severity defaults aligned with image scanning, and update `needs`.
- Modify `.github/workflows/p2p-workflow-security-scan.yaml`: replace scheduled `secret-scan` job with `source-security-scan`.
- Modify `.github/workflows/internal-ci.yaml`: add a dry-run reusable workflow call for the new source security workflow.
- Create `docs/reference/p2p-workflow-source-security-scan.md`: reference page for inputs, outputs, permissions, artifacts, and policy.
- Delete `docs/reference/p2p-workflow-secret-scan.md`: replaced by the source security reference.
- Modify docs that mention secrets/security scanning: `README.md`, `docs/reference/p2p-workflow-fastfeedback.md`, `docs/reference/p2p-workflow-security-scan.md`, `docs/explanation/secrets-scanning.md`, `docs/explanation/image-scanning.md`, `docs/how-to/enable-scheduled-secrets-scanning.md`, `docs/how-to/triage-security-findings.md`, and `docs/tutorials/getting-started.md`.

## Task 1: New Source Security Workflow

**Files:**
- Create: `.github/workflows/p2p-workflow-source-security-scan.yaml`
- Delete: `.github/workflows/p2p-workflow-secret-scan.yaml`

- [ ] **Step 1: Create workflow inputs**

Create `.github/workflows/p2p-workflow-source-security-scan.yaml` with these `workflow_call` inputs:

```yaml
on:
  workflow_call:
    inputs:
      scope:
        required: true
        type: string
      fail-on-findings:
        required: false
        type: boolean
        default: false
      severity:
        required: false
        type: string
        default: 'CRITICAL,HIGH'
      blocking-severity:
        required: false
        type: string
        default: 'CRITICAL'
      ignore-unfixed:
        required: false
        type: boolean
        default: true
      dry-run:
        required: false
        type: boolean
        default: false
      timeout-minutes:
        required: false
        type: number
        default: 30
```

- [ ] **Step 2: Add `secret-scan` job**

Copy the checkout, scan-range, TruffleHog install, and TruffleHog scan steps from the existing `.github/workflows/p2p-workflow-secret-scan.yaml`. Keep `fetch-depth: 0`, `--results=verified,unverified,unknown`, and `continue-on-error: true`. Do not upload raw TruffleHog output because it can contain secret material; create and transfer a redacted NDJSON file instead.

The job must expose the range and upload redacted NDJSON:

```yaml
jobs:
  secret-scan:
    name: secret-scan
    runs-on: ubuntu-24.04
    timeout-minutes: ${{ inputs.timeout-minutes }}
    outputs:
      base: ${{ steps.scan-range.outputs.base }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - id: scan-range
        name: Determine scan range
        if: inputs.scope == 'changes'
        shell: bash
        env:
          EVENT_NAME: ${{ github.event_name }}
          PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          PUSH_BEFORE_SHA: ${{ github.event.before }}
        run: |
          if [ "$EVENT_NAME" = "pull_request" ]; then
            echo "base=$PR_BASE_SHA" >> "$GITHUB_OUTPUT"
          elif [ -n "$PUSH_BEFORE_SHA" ] && [ "$PUSH_BEFORE_SHA" != "0000000000000000000000000000000000000000" ]; then
            echo "base=$PUSH_BEFORE_SHA" >> "$GITHUB_OUTPUT"
          elif git rev-parse HEAD^ >/dev/null 2>&1; then
            echo "base=$(git rev-parse HEAD^)" >> "$GITHUB_OUTPUT"
          else
            echo "base=" >> "$GITHUB_OUTPUT"
          fi

      - name: Install TruffleHog
        if: ${{ inputs.dry-run == false }}
        shell: bash
        run: |
          curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/v3.95.3/scripts/install.sh \
            | sh -s -- -b "$RUNNER_TEMP" v3.95.3
          echo "$RUNNER_TEMP" >> "$GITHUB_PATH"

      - id: scan
        name: TruffleHog OSS secrets scan
        if: ${{ inputs.dry-run == false }}
        shell: bash
        continue-on-error: true
        env:
          SCOPE: ${{ inputs.scope }}
          BASE: ${{ steps.scan-range.outputs.base }}
        run: |
          set +e
          out="$RUNNER_TEMP/trufflehog-findings.ndjson"
          ARGS=(git "file://$GITHUB_WORKSPACE" --json "--results=verified,unverified,unknown" --no-update)
          if [ "$SCOPE" = "changes" ]; then
            ARGS+=(--branch=HEAD)
            if [ -n "$BASE" ]; then
              ARGS+=(--since-commit="$BASE")
            fi
          fi
          trufflehog "${ARGS[@]}" > "$out"
          echo "findings_file=$out" >> "$GITHUB_OUTPUT"
          exit 0

      - id: redact
        name: Build redacted secret findings
        if: ${{ always() && inputs.dry-run == false }}
        shell: bash
        env:
          FINDINGS: ${{ steps.scan.outputs.findings_file }}
          SERVER_URL: ${{ github.server_url }}
          REPOSITORY: ${{ github.repository }}
        run: |
          set -euo pipefail
          redacted="$RUNNER_TEMP/findings.ndjson"
          : > "$redacted"
          if [ -s "$FINDINGS" ]; then
            while IFS= read -r line; do
              [ -z "$line" ] && continue
              detector=$(jq -r '.DetectorName // .DetectorType // "unknown"' <<< "$line")
              raw=$(jq -r '.Raw // ""' <<< "$line")
              id=$(printf '%s\0%s' "$detector" "$raw" | sha256sum | cut -d' ' -f1)
              jq -c \
                --arg id "$id" \
                --arg server "$SERVER_URL" \
                --arg repo "$REPOSITORY" '
                (.SourceMetadata.Data.Git.commit // "") as $commit |
                (.SourceMetadata.Data.Git.file // "") as $file |
                (.SourceMetadata.Data.Git.line // "") as $line |
                ($file | split("/") | map(@uri) | join("/")) as $file_uri |
                {
                  id: $id,
                  detector: (.DetectorName // .DetectorType // "unknown"),
                  status: (
                    if .Verified == true then "verified"
                    elif (.VerificationError // null) != null then "unknown"
                    else "unverified"
                    end
                  ),
                  file: (if $file == "" then null else $file end),
                  line: (if $line == "" then null else $line end),
                  commit: (if $commit == "" then null else $commit end),
                  url: (
                    if $commit == "" then null
                    else $server + "/" + $repo + "/blob/" + $commit
                      + (if $file == "" then "" else "/" + $file_uri end)
                      + (if $line == "" then "" else "#L" + ($line | tostring) end)
                    end
                  )
                }
              ' <<< "$line" >> "$redacted"
            done < "$FINDINGS"
          fi
          echo "redacted_file=$redacted" >> "$GITHUB_OUTPUT"

      - name: Upload redacted secret findings
        if: ${{ always() && inputs.dry-run == false }}
        uses: actions/upload-artifact@v4
        with:
          name: source-security-internal-secret-findings
          path: ${{ steps.redact.outputs.redacted_file }}
          if-no-files-found: warn
```

- [ ] **Step 3: Add `sca-scan` job**

Add a parallel Trivy filesystem job:

```yaml
  sca-scan:
    name: sca-scan
    runs-on: ubuntu-24.04
    timeout-minutes: ${{ inputs.timeout-minutes }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Trivy
        if: ${{ inputs.dry-run == false }}
        uses: aquasecurity/setup-trivy@v0.2.6
        with:
          version: v0.70.0
          cache: true

      - id: scan
        name: Trivy filesystem SCA scan
        if: ${{ inputs.dry-run == false }}
        shell: bash
        env:
          SEVERITY: ${{ inputs.severity }}
          IGNORE_UNFIXED: ${{ inputs.ignore-unfixed }}
        run: |
          set -euo pipefail
          out="$RUNNER_TEMP/trivy-fs.json"
          # License reporting is always HIGH,CRITICAL. The Trivy command must
          # request the union so a caller narrowing vulnerability severity to
          # CRITICAL does not suppress HIGH restricted-license results.
          trivy_severity=$(printf '%s\nHIGH\nCRITICAL\n' "$SEVERITY" | tr ',' '\n' | awk 'NF && !seen[$0]++' | paste -sd, -)
          args=(fs --format json --scanners vuln,license --severity "$trivy_severity" --exit-code 0 --output "$out")
          if [ "$IGNORE_UNFIXED" = "true" ]; then
            args+=(--ignore-unfixed)
          fi
          args+=("$GITHUB_WORKSPACE")
          trivy "${args[@]}"
          if [ ! -f "$out" ]; then
            echo '{"Results":[]}' > "$out"
          fi
          echo "trivy_file=$out" >> "$GITHUB_OUTPUT"

      - name: Upload Trivy findings
        if: ${{ always() && inputs.dry-run == false }}
        uses: actions/upload-artifact@v4
        with:
          name: source-security-internal-trivy-findings
          path: ${{ steps.scan.outputs.trivy_file }}
          if-no-files-found: warn
```

- [ ] **Step 4: Add report job shell and downloads**

Add the final report job:

```yaml
  report:
    name: source-security-report
    runs-on: ubuntu-24.04
    needs: [secret-scan, sca-scan]
    if: always()
    steps:
      - name: Download secret findings
        if: ${{ inputs.dry-run == false }}
        uses: actions/download-artifact@v4
        with:
          name: source-security-internal-secret-findings
          path: ${{ runner.temp }}/source-security/trufflehog

      - name: Download Trivy findings
        if: ${{ inputs.dry-run == false }}
        uses: actions/download-artifact@v4
        with:
          name: source-security-internal-trivy-findings
          path: ${{ runner.temp }}/source-security/trivy

      - id: report
        name: Build source security report
        uses: actions/github-script@v7
        env:
          SCOPE: ${{ inputs.scope }}
          BASE: ${{ needs.secret-scan.outputs.base }}
          SEVERITY: ${{ inputs.severity }}
          BLOCKING_SEVERITY: ${{ inputs.blocking-severity }}
          DRY_RUN: ${{ inputs.dry-run }}
          ROOT: ${{ runner.temp }}/source-security
        with:
          script: |
            const fs = require('fs');
            const path = require('path');
```

- [ ] **Step 5: Add embedded JavaScript helpers**

Inside the `script: |` block, add these helpers:

```js
            const CANONICAL_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
            const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

            const severitySet = value => new Set(String(value || '').split(',').map(s => s.trim()).filter(Boolean));
            const normalizeSeverity = value => CANONICAL_SEVERITIES.includes(value) ? value : 'UNKNOWN';
            const escapeCell = value => {
              const text = value === undefined || value === null || value === '' ? '-' : String(value);
              return text.replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
            };
            const readJson = (file, fallback) => {
              if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return fallback;
              return JSON.parse(fs.readFileSync(file, 'utf8'));
            };
            const readLines = file => {
              if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return [];
              return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
            };
            const findingWord = count => count === 1 ? 'finding' : 'findings';
            const sortBySeverity = (a, b) => (
              (SEV_RANK[a.severity] ?? SEV_RANK.UNKNOWN) - (SEV_RANK[b.severity] ?? SEV_RANK.UNKNOWN)
              || a.package.localeCompare(b.package)
              || (a.id || a.license || '').localeCompare(b.id || b.license || '')
            );
            const details = (summary, tableLines) => [
              '<details>',
              `<summary>${summary}</summary>`,
              '',
              ...tableLines,
              '',
              '</details>',
              '',
            ];
```

- [ ] **Step 6: Add embedded Trivy parsing**

Continue inside the same `script: |` block:

```js
            const root = process.env.ROOT;
            fs.mkdirSync(root, { recursive: true });
            const trivyPath = path.join(root, 'trivy', 'trivy-fs.json');
            const trufflehogPath = path.join(root, 'trufflehog', 'findings.ndjson');
            const reportSeveritySet = severitySet(process.env.SEVERITY || 'CRITICAL,HIGH');
            const blockingSeveritySet = severitySet(process.env.BLOCKING_SEVERITY || 'CRITICAL');
            const trivy = readJson(trivyPath, { Results: [] });
            const vulnerabilities = [];
            const licenses = [];

            for (const result of Array.isArray(trivy.Results) ? trivy.Results : []) {
              const source = result.Target || '-';
              for (const vuln of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
                const severity = normalizeSeverity(vuln.Severity);
                if (!reportSeveritySet.has(severity)) continue;
                vulnerabilities.push({
                  id: vuln.VulnerabilityID || 'UNKNOWN',
                  package: vuln.PkgName || '-',
                  installed: vuln.InstalledVersion || '-',
                  fixed: vuln.FixedVersion || '-',
                  severity,
                  url: vuln.PrimaryURL || `https://avd.aquasec.com/nvd/${vuln.VulnerabilityID || 'UNKNOWN'}`,
                  source,
                  blocking: blockingSeveritySet.has(severity),
                });
              }
              for (const license of Array.isArray(result.Licenses) ? result.Licenses : []) {
                const severity = normalizeSeverity(license.Severity);
                if (!['CRITICAL', 'HIGH'].includes(severity)) continue;
                licenses.push({
                  package: license.PkgName || '-',
                  license: license.Name || license.ID || '-',
                  classification: license.Category || '-',
                  severity,
                  source,
                  blocking: false,
                });
              }
            }

            vulnerabilities.sort(sortBySeverity);
            licenses.sort(sortBySeverity);
```

- [ ] **Step 7: Add embedded TruffleHog parsing**

Continue inside the same `script: |` block:

```js
            const secrets = [];
            for (const line of readLines(trufflehogPath)) {
              let secret;
              try {
                secret = JSON.parse(line);
              } catch {
                continue;
              }
              secrets.push({
                id: secret.id,
                detector: secret.detector || 'unknown',
                status: secret.status || 'unverified',
                file: secret.file || null,
                line: secret.line || null,
                commit: secret.commit || null,
                url: secret.url || null,
                blocking: secret.status === 'verified',
              });
            }
            secrets.sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.detector.localeCompare(b.detector) || String(a.file || '').localeCompare(String(b.file || '')));
```

- [ ] **Step 8: Add embedded markdown rendering and normalized JSON**

Continue inside the same `script: |` block:

```js
            const vulnerabilityBlocking = vulnerabilities.filter(v => v.blocking).length;
            const secretBlocking = secrets.filter(s => s.blocking).length;
            const normalized = { vulnerabilities, licenses, secrets };
            const out = ['## Source security scan', ''];
            out.push(process.env.SCOPE === 'changes' ? `Scan range: \`${process.env.BASE || '<initial>'}..HEAD\`` : 'Scan range: `<full history>`', '');

            if (process.env.DRY_RUN === 'true') {
              out.push('_Scan skipped (dry-run)._');
            } else if (vulnerabilities.length === 0 && licenses.length === 0 && secrets.length === 0) {
              out.push('No source security findings detected.');
            } else {
              out.push(
                '| Check | Total | Blocking |',
                '|---|---:|---:|',
                `| Vulnerabilities | ${vulnerabilities.length} | ${vulnerabilityBlocking} |`,
                `| Restricted/forbidden licenses | ${licenses.length} | 0 |`,
                `| Secrets | ${secrets.length} | ${secretBlocking} |`,
                '',
                `**Severities reported:** \`${process.env.SEVERITY}\` · **Blocking severities:** \`${process.env.BLOCKING_SEVERITY}\``,
                '',
              );

              if (vulnerabilities.length > 0) {
                const rows = [
                  '| Severity | Package | Installed | Fixed | ID | Source |',
                  '|---|---|---|---|---|---|',
                  ...vulnerabilities.slice(0, 100).map(v => `| ${v.severity} | ${escapeCell(v.package)} | ${escapeCell(v.installed)} | ${escapeCell(v.fixed)} | [${escapeCell(v.id)}](${v.url}) | ${escapeCell(v.source)} |`),
                ];
                out.push(...details(`Vulnerabilities: ${vulnerabilities.length} ${findingWord(vulnerabilities.length)}, ${vulnerabilityBlocking} blocking`, rows));
              }

              if (licenses.length > 0) {
                const rows = [
                  '| Severity | Package | License | Classification | Source |',
                  '|---|---|---|---|---|',
                  ...licenses.slice(0, 100).map(l => `| ${l.severity} | ${escapeCell(l.package)} | ${escapeCell(l.license)} | ${escapeCell(l.classification)} | ${escapeCell(l.source)} |`),
                ];
                out.push(...details(`Restricted/forbidden licenses: ${licenses.length} ${findingWord(licenses.length)}`, rows));
              }

              if (secrets.length > 0) {
                const rows = [
                  '| Detector | Status | File | Line | Commit |',
                  '|---|---|---|---|---|',
                  ...secrets.slice(0, 100).map(s => {
                    const commit = s.commit ? (s.url ? `[${s.commit.slice(0, 12)}](${s.url})` : s.commit.slice(0, 12)) : '-';
                    return `| ${escapeCell(s.detector)} | ${escapeCell(s.status)} | ${escapeCell(s.file)} | ${escapeCell(s.line)} | ${commit} |`;
                  }),
                ];
                out.push(...details(`Secrets: ${secrets.length} ${findingWord(secrets.length)}, ${secretBlocking} blocking`, rows));
              }

              for (const [label, count] of [['vulnerability', vulnerabilities.length], ['license', licenses.length], ['secret', secrets.length]]) {
                if (count > 100) out.push(`_Showing 100 of ${count} ${label} findings - see the full source security artifact for the rest._`, '');
              }
            }

            const markdown = out.join('\n').trimEnd() + '\n';
            const reportPath = path.join(root, 'source-security-report.md');
            const jsonPath = path.join(root, 'source-security-findings.json');
            fs.writeFileSync(reportPath, markdown);
            fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2) + '\n');
            core.setOutput('report-file', reportPath);
            core.setOutput('json-file', jsonPath);
            core.setOutput('vulnerability-total', vulnerabilities.length);
            core.setOutput('vulnerability-blocking', vulnerabilityBlocking);
            core.setOutput('license-total', licenses.length);
            core.setOutput('secret-total', secrets.length);
            core.setOutput('secret-blocking', secretBlocking);
            await core.summary.addRaw(markdown).write();
```

- [ ] **Step 9: Add sticky comment, artifact, and policy steps**

Add these steps after the embedded report:

```yaml
      - name: Upsert sticky PR comment
        if: ${{ always() && github.event_name == 'pull_request' && inputs.dry-run == false }}
        continue-on-error: true
        uses: marocchino/sticky-pull-request-comment@v3
        with:
          header: source-security-scan-findings
          path: ${{ steps.report.outputs.report-file }}
          recreate: true

      - name: Upload source security artifact
        if: ${{ always() && inputs.dry-run == false }}
        uses: actions/upload-artifact@v4
        with:
          name: source-security-scan-findings
          path: |
            ${{ runner.temp }}/source-security/trufflehog
            ${{ runner.temp }}/source-security/trivy
            ${{ steps.report.outputs.json-file }}
          if-no-files-found: warn
          retention-days: 30

      - name: Enforce scan policy
        if: ${{ always() && inputs.dry-run == false }}
        shell: bash
        env:
          FAIL: ${{ inputs.fail-on-findings }}
          VULN_BLOCKING: ${{ steps.report.outputs.vulnerability-blocking }}
          SECRET_BLOCKING: ${{ steps.report.outputs.secret-blocking }}
        run: |
          set -euo pipefail
          echo "Trivy source vulnerabilities: total=${{ steps.report.outputs.vulnerability-total }}, blocking=${VULN_BLOCKING:-0}"
          echo "Trivy restricted/forbidden licenses: total=${{ steps.report.outputs.license-total }}, blocking=0"
          echo "TruffleHog secrets: total=${{ steps.report.outputs.secret-total }}, blocking=${SECRET_BLOCKING:-0}"
          echo "fail-on-findings=${FAIL}"
          if [ "$FAIL" = "true" ]; then
            failed=0
            if [ "${VULN_BLOCKING:-0}" -gt 0 ]; then
              echo "::error::${VULN_BLOCKING} blocking source vulnerability finding(s) detected."
              failed=1
            fi
            if [ "${SECRET_BLOCKING:-0}" -gt 0 ]; then
              echo "::error::${SECRET_BLOCKING} verified secret finding(s) detected."
              failed=1
            fi
            [ "$failed" -eq 0 ] || exit 1
          fi
```

- [ ] **Step 10: Delete old secret workflow**

Remove `.github/workflows/p2p-workflow-secret-scan.yaml`.

- [ ] **Step 11: Validate workflow syntax**

Run:

```bash
rtk actionlint .github/workflows/p2p-workflow-source-security-scan.yaml
```

Expected: no output and exit code 0.

- [ ] **Step 12: Commit workflow**

Run:

```bash
rtk git add .github/workflows/p2p-workflow-source-security-scan.yaml .github/workflows/p2p-workflow-secret-scan.yaml
rtk git commit -m "feat(source-security): add reusable scan workflow"
```

## Task 2: Wire Workflow Callers

**Files:**
- Modify: `.github/workflows/p2p-workflow-fastfeedback.yaml`
- Modify: `.github/workflows/p2p-workflow-security-scan.yaml`
- Modify: `.github/workflows/internal-ci.yaml`

- [ ] **Step 1: Replace fast-feedback secret scan job**

In `.github/workflows/p2p-workflow-fastfeedback.yaml`, replace:

```yaml
  secret-scan:
    uses: ./.github/workflows/p2p-workflow-secret-scan.yaml
    with:
      scope: changes
      fail-on-findings: ${{ inputs.security-scan-fail-on-findings }}
      dry-run: ${{ inputs.dry-run }}
      timeout-minutes: 10
```

with:

```yaml
  source-security-scan:
    uses: ./.github/workflows/p2p-workflow-source-security-scan.yaml
    with:
      scope: changes
      fail-on-findings: ${{ inputs.security-scan-fail-on-findings }}
      timeout-minutes: 10
```

- [ ] **Step 2: Update fast-feedback dependencies**

Change:

```yaml
needs: [integration-test, image-scan, secret-scan]
```

to:

```yaml
needs: [integration-test, image-scan, source-security-scan]
```

Change:

```yaml
needs: [build, secret-scan, image-scan, functional-test, nft-test, integration-test, promote]
```

to:

```yaml
needs: [build, source-security-scan, image-scan, functional-test, nft-test, integration-test, promote]
```

- [ ] **Step 3: Replace scheduled umbrella secret scan**

In `.github/workflows/p2p-workflow-security-scan.yaml`, replace the `secret-scan` job with:

```yaml
  source-security-scan:
    uses: ./.github/workflows/p2p-workflow-source-security-scan.yaml
    with:
      scope: full-history
      fail-on-findings: false
      dry-run: ${{ inputs.dry-run }}
      timeout-minutes: ${{ inputs.timeout-minutes }}
```

- [ ] **Step 4: Add internal CI dry-run call**

Add this job to `.github/workflows/internal-ci.yaml` after `test_fastfeedback`:

```yaml
  test_source_security_scan:
    uses: ./.github/workflows/p2p-workflow-source-security-scan.yaml
    with:
      scope: changes
      fail-on-findings: false
      dry-run: true
      timeout-minutes: 10
```

- [ ] **Step 5: Validate caller workflows**

Run:

```bash
rtk actionlint .github/workflows/p2p-workflow-fastfeedback.yaml .github/workflows/p2p-workflow-security-scan.yaml .github/workflows/internal-ci.yaml
```

Expected: no output and exit code 0.

- [ ] **Step 6: Commit caller wiring**

Run:

```bash
rtk git add .github/workflows/p2p-workflow-fastfeedback.yaml .github/workflows/p2p-workflow-security-scan.yaml .github/workflows/internal-ci.yaml
rtk git commit -m "feat(source-security): wire workflow callers"
```

## Task 3: Documentation Update

**Files:**
- Create: `docs/reference/p2p-workflow-source-security-scan.md`
- Delete: `docs/reference/p2p-workflow-secret-scan.md`
- Modify: `README.md`
- Modify: `docs/reference/p2p-workflow-fastfeedback.md`
- Modify: `docs/reference/p2p-workflow-security-scan.md`
- Modify: `docs/explanation/secrets-scanning.md`
- Modify: `docs/explanation/image-scanning.md`
- Modify: `docs/how-to/enable-scheduled-secrets-scanning.md`
- Modify: `docs/how-to/triage-security-findings.md`
- Modify: `docs/tutorials/getting-started.md`

- [ ] **Step 1: Create source security reference**

Create `docs/reference/p2p-workflow-source-security-scan.md` with:

```markdown
# p2p-workflow-source-security-scan

> Scans repository source for committed secrets and source dependency SCA findings. Produces a workflow summary, a compact sticky PR comment, and a `source-security-scan-findings` artifact. Optionally fails the job on blocking vulnerability or verified secret findings.

## Usage

Called from [`p2p-workflow-fastfeedback`](p2p-workflow-fastfeedback.md) on PR and push events with `scope: changes`, and from the scheduled [`p2p-workflow-security-scan`](p2p-workflow-security-scan.md) umbrella with `scope: full-history`.

```yaml
jobs:
  source-security-scan:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-source-security-scan.yaml@main
    with:
      scope: changes
      fail-on-findings: false
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `scope` | string | Yes | - | `changes` for PR/push scanning or `full-history` for scheduled monitoring. TruffleHog uses this to choose git history scope. Trivy scans the checked-out source tree. |
| `fail-on-findings` | boolean | No | `false` | When `true`, fails the job if any vulnerability at `blocking-severity` or verified secret is detected. License findings never block. |
| `severity` | string | No | `CRITICAL,HIGH` | Comma-separated Trivy vulnerability severities to report, matching image scan semantics. |
| `blocking-severity` | string | No | `CRITICAL` | Comma-separated vulnerability severities that count towards the blocking policy. Must be a subset of `severity` to have an effect. |
| `ignore-unfixed` | boolean | No | `true` | Passed to Trivy vulnerability scanning. |
| `dry-run` | boolean | No | `false` | When `true`, skips scanner installs, scans, sticky PR comments, artifact upload, and policy enforcement. The summary reports that the scan was skipped. |
| `timeout-minutes` | number | No | `30` | Job timeout for scanner jobs. |

## Permissions

| Scope | When required |
|-------|---------------|
| `contents: read` | Always - checkout and source scanning. |
| `pull-requests: write` | `pull_request` events only - posting the sticky PR comment. Without it the comment step is non-fatal; the summary and artifact are still produced. |

## Outputs

None. Results are surfaced via:

- workflow summary;
- sticky PR comment with `header: source-security-scan-findings` on `pull_request` events;
- `source-security-scan-findings` artifact containing redacted TruffleHog findings, raw Trivy filesystem output, and normalized merged JSON.

## Blocking policy

The workflow is visibility-first by default. When `fail-on-findings: true`, it fails only for:

- Trivy vulnerability findings whose severity is listed in `blocking-severity`;
- TruffleHog findings with `status: verified`.

Restricted and forbidden license findings are report-only, even when `fail-on-findings: true`.

Trivy license classifications are triage signals, not a P2P-wide legal policy. Organization-specific allow/deny policy is out of scope for this version.
```

- [ ] **Step 2: Delete old secret reference**

Remove `docs/reference/p2p-workflow-secret-scan.md`.

- [ ] **Step 3: Update finding source table**

In `docs/how-to/triage-security-findings.md`, replace the source table rows for git-tree secrets with:

```markdown
| Source | Sticky comment header | Artifact |
|---|---|---|
| Source vulnerabilities | `source-security-scan-findings` | `source-security-scan-findings` |
| Source restricted/forbidden licenses | `source-security-scan-findings` | `source-security-scan-findings` |
| Git tree secrets | `source-security-scan-findings` | `source-security-scan-findings` |
| Image vulnerabilities | `image-scan-findings` | `image-scan-reports-<env>` |
| Image secrets | `image-scan-findings` (same comment) | `image-scan-reports-<env>` |
```

Add this caveat below the source-security table explanation:

```markdown
Restricted and forbidden license findings are shown for triage only. Trivy's license classification is not a legal decision and is not a P2P-wide organization policy; confirm the finding against your organization's open-source policy before taking enforcement action.
```

- [ ] **Step 4: Update fast-feedback reference**

In `docs/reference/p2p-workflow-fastfeedback.md`, replace `secret-scan` wording with `source-security-scan` and describe:

```markdown
source-security-scan  (independent of build; runs in parallel)
                      Calls p2p-workflow-source-security-scan with scope: changes.
                      Reports source vulnerabilities, restricted/forbidden licenses,
                      and git-tree secrets. Fails only on blocking vulnerabilities or
                      verified secrets when security-scan-fail-on-findings=true.
```

- [ ] **Step 5: Update scheduled umbrella reference**

In `docs/reference/p2p-workflow-security-scan.md`, replace `secret-scan` with `source-security-scan` in the summary, job graph, outputs, and see-also links. The outputs section must include:

```markdown
- `source-security-scan-findings` artifact from the source-security-scan job. Contains redacted TruffleHog output, raw Trivy filesystem output, and normalized merged JSON.
```

- [ ] **Step 6: Update README and explanation docs**

Update the internal workflow table in `README.md`:

```markdown
| [p2p-workflow-source-security-scan](docs/reference/p2p-workflow-source-security-scan.md) | Scans repository source for dependency vulnerabilities, restricted/forbidden licenses, and committed secrets; posts one compact sticky comment and uploads normalized findings. |
```

Update `docs/explanation/secrets-scanning.md` so it explains secrets are now part of source security scanning, not a standalone reusable workflow.

Update `docs/explanation/image-scanning.md` only where it links to the source-side workflow or triage docs.

- [ ] **Step 7: Update how-to and tutorial pages**

In `docs/how-to/enable-scheduled-secrets-scanning.md`, rename the page title to:

```markdown
# How to Enable Scheduled Source Security Scanning
```

Explain that the scheduled wrapper now calls `p2p-workflow-source-security-scan` directly for source-only scheduled scans, or `p2p-workflow-security-scan` for source plus image scans.

In `docs/tutorials/getting-started.md`, update the security scans subsection so it says fast-feedback calls source security and image scanning automatically.

- [ ] **Step 8: Check references**

Run:

```bash
rtk rg -n "p2p-workflow-secret-scan|secret-scan-findings|trufflehog-findings|secret-scan\\b" README.md docs .github/workflows
```

Expected: remaining occurrences are historical text in `docs/superpowers/` or intentionally named internal job fragments inside source-security implementation. Update current user-facing docs and workflows.

- [ ] **Step 9: Commit docs**

Run:

```bash
rtk git add README.md docs .github/workflows
rtk git commit -m "docs(source-security): document source scanning workflow"
```

## Task 4: Verification

**Files:**
- All modified files from Tasks 1-3.

- [ ] **Step 1: Run actionlint on all workflows**

Run:

```bash
rtk actionlint .github/workflows/*.yaml
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run reference scan**

Run:

```bash
rtk rg -n "p2p-workflow-secret-scan|secret-scan-findings|trufflehog-findings" README.md docs .github/workflows
```

Expected: no current user-facing references to the deleted workflow, artifact, or sticky comment header. Design and implementation plan files under `docs/superpowers/` may still reference historical names.

- [ ] **Step 3: Check git diff**

Run:

```bash
rtk git diff --stat HEAD
rtk git diff --check
```

Expected: diff contains only source security scan changes and docs updates. `git diff --check` has no whitespace errors.

- [ ] **Step 4: Confirm working tree state**

Run:

```bash
rtk git status --short
```

Expected: only intentionally untracked user files remain. If any source security files are modified by verification fixes, commit those files with `rtk git commit -m "chore(source-security): verify workflow integration"` after reviewing `rtk git diff`.

## Self-Review

- Spec coverage: the plan covers the new workflow name, TruffleHog secrets, Trivy `vuln,license`, Trivy secret scanner disabled, misconfiguration scanner out of scope, compact foldable comment, artifact layout, vulnerability `severity` and `blocking-severity`, license report-only behavior, caller wiring, docs, and verification.
- Pattern consistency: the report logic is embedded in `actions/github-script`, matching the existing image scan report implementation.
- Placeholder scan: no implementation step relies on unspecified policy or unnamed files.
- Output consistency: report outputs use kebab-case keys (`vulnerability-blocking`, `secret-blocking`) consistently between the embedded script and workflow policy step.
