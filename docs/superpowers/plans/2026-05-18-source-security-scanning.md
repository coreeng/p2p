# Source Security Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace git-only secret scanning with a reusable source security scan that reports source dependency vulnerabilities, restricted/forbidden licenses, and committed secrets in one compact PR comment.

**Architecture:** Add a focused Node report module that normalizes TruffleHog and Trivy JSON into one markdown report plus one merged JSON artifact. Add a new reusable GitHub workflow that runs TruffleHog and Trivy in parallel, calls the report module in a final job, and enforces the same severity/blocking model used by image scanning. Update orchestrator workflows and docs to use `p2p-workflow-source-security-scan.yaml`.

**Tech Stack:** GitHub Actions reusable workflows, TruffleHog OSS `git` scanner, Trivy `fs` scanner, Node.js 20 built-ins (`node:test`, `node:assert`, `node:fs`, `node:path`), `actionlint`, Markdown docs.

---

## File Structure

- Create `.github/scripts/source-security-report.mjs`: pure report builder and CLI. Responsibilities: parse raw scanner files, apply severity filters, redact/normalize findings, render compact markdown with `<details>` sections, and write output files/counts.
- Create `.github/scripts/source-security-report.test.mjs`: Node unit tests with inline fixtures for clean scans, vulnerability filtering/blocking, license report-only behavior, and verified secret blocking.
- Create `.github/workflows/p2p-workflow-source-security-scan.yaml`: reusable workflow with `secret-scan`, `sca-scan`, and `report` jobs.
- Delete `.github/workflows/p2p-workflow-secret-scan.yaml`: replaced by the source security workflow.
- Modify `.github/workflows/p2p-workflow-fastfeedback.yaml`: replace `secret-scan` job with `source-security-scan`, keep source workflow severity defaults aligned with image scanning, and update `needs`.
- Modify `.github/workflows/p2p-workflow-security-scan.yaml`: replace scheduled `secret-scan` job with `source-security-scan`.
- Modify `.github/workflows/internal-ci.yaml`: add a dry-run reusable workflow call for the new source security workflow.
- Create `docs/reference/p2p-workflow-source-security-scan.md`: reference page for inputs, outputs, permissions, artifacts, and policy.
- Delete `docs/reference/p2p-workflow-secret-scan.md`: replaced by the source security reference.
- Modify docs that mention secrets/security scanning: `README.md`, `docs/reference/p2p-workflow-fastfeedback.md`, `docs/reference/p2p-workflow-security-scan.md`, `docs/explanation/secrets-scanning.md`, `docs/explanation/image-scanning.md`, `docs/how-to/enable-scheduled-secrets-scanning.md`, `docs/how-to/triage-security-findings.md`, and `docs/tutorials/getting-started.md`.

## Task 1: Report Module Tests

**Files:**
- Create: `.github/scripts/source-security-report.test.mjs`
- Create: `.github/scripts/source-security-report.mjs`

- [ ] **Step 1: Create the report module skeleton**

Create `.github/scripts/source-security-report.mjs` with exported functions and a CLI guard. The first version can return empty results so tests fail on missing behavior rather than missing imports.

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

export function buildSourceSecurityReport(options) {
  return {
    markdown: '## Source security scan\n\nNo source security findings detected.\n',
    normalized: { vulnerabilities: [], licenses: [], secrets: [] },
    counts: {
      vulnerabilityTotal: 0,
      vulnerabilityBlocking: 0,
      licenseTotal: 0,
      secretTotal: 0,
      secretBlocking: 0,
    },
  };
}

export function runCli(argv = process.argv, env = process.env) {
  const args = Object.fromEntries(argv.slice(2).map(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
  const result = buildSourceSecurityReport({
    trivyPath: args.trivy,
    trufflehogPath: args.trufflehog,
    changedFilesPath: args.changedFiles,
    scope: args.scope || 'changes',
    base: args.base || '',
    severity: args.severity || 'CRITICAL,HIGH',
    blockingSeverity: args.blockingSeverity || 'CRITICAL',
    serverUrl: env.GITHUB_SERVER_URL || 'https://github.com',
    repository: env.GITHUB_REPOSITORY || '',
    runUrl: args.runUrl || '',
  });
  fs.mkdirSync(path.dirname(args.markdownOut), { recursive: true });
  fs.mkdirSync(path.dirname(args.jsonOut), { recursive: true });
  fs.writeFileSync(args.markdownOut, result.markdown);
  fs.writeFileSync(args.jsonOut, JSON.stringify(result.normalized, null, 2) + '\n');
  fs.writeFileSync(args.outputsOut, Object.entries(result.counts).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  return result;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === thisFile) {
  runCli();
}
```

- [ ] **Step 2: Write failing tests for clean output, severity filtering, license reporting, and secret blocking**

Create `.github/scripts/source-security-report.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSourceSecurityReport } from './source-security-report.mjs';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-security-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

const baseOptions = {
  scope: 'changes',
  base: 'abc123',
  severity: 'CRITICAL,HIGH',
  blockingSeverity: 'CRITICAL',
  serverUrl: 'https://github.com',
  repository: 'coreeng/example',
  runUrl: 'https://github.com/coreeng/example/actions/runs/1',
};

test('clean scan renders a compact clean comment', () => {
  const trivyPath = tmpFile('trivy.json', JSON.stringify({ Results: [] }));
  const trufflehogPath = tmpFile('trufflehog.ndjson', '');
  const result = buildSourceSecurityReport({ ...baseOptions, trivyPath, trufflehogPath });

  assert.equal(result.counts.vulnerabilityTotal, 0);
  assert.equal(result.counts.licenseTotal, 0);
  assert.equal(result.counts.secretTotal, 0);
  assert.match(result.markdown, /^## Source security scan/);
  assert.match(result.markdown, /No source security findings detected\./);
  assert.doesNotMatch(result.markdown, /<details>/);
});

test('vulnerability reporting uses severity and blocking-severity like image scan', () => {
  const trivyPath = tmpFile('trivy.json', JSON.stringify({
    Results: [{
      Target: 'package-lock.json',
      Vulnerabilities: [
        { VulnerabilityID: 'CVE-1', PkgName: 'critical-lib', InstalledVersion: '1.0.0', FixedVersion: '1.0.1', Severity: 'CRITICAL', PrimaryURL: 'https://example.test/CVE-1' },
        { VulnerabilityID: 'CVE-2', PkgName: 'high-lib', InstalledVersion: '2.0.0', FixedVersion: '2.0.1', Severity: 'HIGH', PrimaryURL: 'https://example.test/CVE-2' },
        { VulnerabilityID: 'CVE-3', PkgName: 'medium-lib', InstalledVersion: '3.0.0', FixedVersion: '3.0.1', Severity: 'MEDIUM', PrimaryURL: 'https://example.test/CVE-3' },
      ],
    }],
  }));
  const result = buildSourceSecurityReport({ ...baseOptions, trivyPath, trufflehogPath: tmpFile('trufflehog.ndjson', '') });

  assert.equal(result.counts.vulnerabilityTotal, 2);
  assert.equal(result.counts.vulnerabilityBlocking, 1);
  assert.match(result.markdown, /critical-lib/);
  assert.match(result.markdown, /high-lib/);
  assert.doesNotMatch(result.markdown, /medium-lib/);
});

test('high and critical licenses are reported but never blocking', () => {
  const trivyPath = tmpFile('trivy.json', JSON.stringify({
    Results: [{
      Target: 'package-lock.json',
      Licenses: [
        { PkgName: 'restricted-lib', Name: 'GPL-2.0', Category: 'restricted', Severity: 'HIGH' },
        { PkgName: 'forbidden-lib', Name: 'AGPL-3.0', Category: 'forbidden', Severity: 'CRITICAL' },
        { PkgName: 'permissive-lib', Name: 'MIT', Category: 'permissive', Severity: 'LOW' },
      ],
    }],
  }));
  const result = buildSourceSecurityReport({ ...baseOptions, trivyPath, trufflehogPath: tmpFile('trufflehog.ndjson', '') });

  assert.equal(result.counts.licenseTotal, 2);
  assert.match(result.markdown, /Restricted\/forbidden licenses: 2 findings/);
  assert.match(result.markdown, /restricted-lib/);
  assert.match(result.markdown, /forbidden-lib/);
  assert.doesNotMatch(result.markdown, /permissive-lib/);
  assert.equal(result.normalized.licenses.every(l => l.blocking === false), true);
});

test('verified TruffleHog findings are blocking and raw secrets are redacted', () => {
  const trufflehogLine = JSON.stringify({
    DetectorName: 'AWS',
    Raw: 'AKIAREDACTME',
    Verified: true,
    SourceMetadata: { Data: { Git: { commit: 'abcdef1234567890', file: 'config/secrets.yaml', line: 12 } } },
  });
  const result = buildSourceSecurityReport({
    ...baseOptions,
    trivyPath: tmpFile('trivy.json', JSON.stringify({ Results: [] })),
    trufflehogPath: tmpFile('trufflehog.ndjson', `${trufflehogLine}\n`),
  });

  assert.equal(result.counts.secretTotal, 1);
  assert.equal(result.counts.secretBlocking, 1);
  assert.match(result.markdown, /Secrets: 1 finding, 1 blocking/);
  assert.match(result.markdown, /config\/secrets.yaml/);
  assert.doesNotMatch(JSON.stringify(result.normalized), /AKIAREDACTME/);
});
```

- [ ] **Step 3: Run tests and verify they fail for missing behavior**

Run:

```bash
rtk node --test .github/scripts/source-security-report.test.mjs
```

Expected: at least the vulnerability, license, and secret tests fail because the skeleton returns empty normalized data.

## Task 2: Report Module Implementation

**Files:**
- Modify: `.github/scripts/source-security-report.mjs`
- Modify: `.github/scripts/source-security-report.test.mjs`

- [ ] **Step 1: Implement shared helpers**

Add helpers to `.github/scripts/source-security-report.mjs`:

```js
const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

function severitySet(csv) {
  return new Set(String(csv || '').split(',').map(s => s.trim()).filter(Boolean));
}

function normalizeSeverity(value) {
  return CANONICAL_SEVERITIES.includes(value) ? value : 'UNKNOWN';
}

function escapeCell(value) {
  const text = value === undefined || value === null || value === '' ? '-' : String(value);
  return text.replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
}

function singular(count, one, many) {
  return count === 1 ? one : many;
}

function readJson(file, fallback) {
  if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLines(file) {
  if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}
```

- [ ] **Step 2: Implement Trivy vulnerability and license normalization**

Inside `buildSourceSecurityReport`, parse `trivyPath` and produce:

```js
const reportSeveritySet = severitySet(options.severity || 'CRITICAL,HIGH');
const blockingSeveritySet = severitySet(options.blockingSeverity || 'CRITICAL');
const trivy = readJson(options.trivyPath, { Results: [] });
const results = Array.isArray(trivy.Results) ? trivy.Results : [];
const vulnerabilities = [];
const licenses = [];

for (const result of results) {
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
    if (!new Set(['CRITICAL', 'HIGH']).has(severity)) continue;
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
```

Sort vulnerabilities by severity rank, then package, then id. Sort licenses by severity rank, then package, then license.

- [ ] **Step 3: Implement TruffleHog normalization**

Parse each NDJSON line in `trufflehogPath`. Use the existing secret workflow's status semantics and stable id strategy, but do not include `Raw` in output:

```js
import crypto from 'node:crypto';

function secretStatus(finding) {
  if (finding.Verified === true) return 'verified';
  if (finding.VerificationError) return 'unknown';
  return 'unverified';
}

function secretUrl({ serverUrl, repository, commit, file, line }) {
  if (!commit || !repository) return null;
  const filePath = file ? '/' + file.split('/').map(encodeURIComponent).join('/') : '';
  const lineSuffix = line ? `#L${line}` : '';
  return `${serverUrl}/${repository}/blob/${commit}${filePath}${lineSuffix}`;
}
```

For each valid finding:

```js
const detector = finding.DetectorName || finding.DetectorType || 'unknown';
const raw = finding.Raw || '';
const id = crypto.createHash('sha256').update(`${detector}\0${raw}`).digest('hex');
const git = finding.SourceMetadata?.Data?.Git || {};
const status = secretStatus(finding);
secrets.push({
  id,
  detector,
  status,
  file: git.file || null,
  line: git.line || null,
  commit: git.commit || null,
  url: secretUrl({ serverUrl: options.serverUrl, repository: options.repository, commit: git.commit, file: git.file, line: git.line }),
  blocking: status === 'verified',
});
```

- [ ] **Step 4: Render compact markdown**

Render:

```markdown
## Source security scan

Scan range: `<base>..HEAD`

| Check | Total | Blocking |
|---|---:|---:|
| Vulnerabilities | ... | ... |
| Restricted/forbidden licenses | ... | 0 |
| Secrets | ... | ... |
```

Then append details only for non-empty sections:

```js
function details(summary, tableLines) {
  return [
    '<details>',
    `<summary>${summary}</summary>`,
    '',
    ...tableLines,
    '',
    '</details>',
    '',
  ];
}
```

Use explicit tables with explicit separator rows:

```markdown
| Severity | Package | Installed | Fixed | ID | Source |
|---|---|---|---|---|---|
| Severity | Package | License | Classification | Source |
|---|---|---|---|---|
| Detector | Status | File | Line | Commit |
|---|---|---|---|---|
```

For secrets, render the commit as a markdown link when `url` is present and a 12-character short SHA is available.

- [ ] **Step 5: Add truncation**

Limit each details table to 100 rows, preserving blocking rows first for vulnerabilities and secrets. Add the footer when truncated:

```markdown
_Showing 100 of 137 findings - see the full source security artifact for the rest._
```

- [ ] **Step 6: Run report tests**

Run:

```bash
rtk node --test .github/scripts/source-security-report.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit report module**

Run:

```bash
rtk git add .github/scripts/source-security-report.mjs .github/scripts/source-security-report.test.mjs
rtk git commit -m "feat(source-security): add report builder"
```

## Task 3: New Source Security Workflow

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
      timeout-minutes:
        required: false
        type: number
        default: 30
```

- [ ] **Step 2: Add `secret-scan` job**

Copy the current TruffleHog checkout, range detection, install, scan, and JSON normalization logic from `.github/workflows/p2p-workflow-secret-scan.yaml`. Change outputs so downstream `report` can consume artifacts:

```yaml
jobs:
  secret-scan:
    name: secret-scan
    runs-on: ubuntu-24.04
    timeout-minutes: ${{ inputs.timeout-minutes }}
    outputs:
      base: ${{ steps.scan-range.outputs.base }}
      findings-artifact: source-security-secret-findings
```

Upload the raw TruffleHog NDJSON as an artifact:

```yaml
      - name: Upload secret findings
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: source-security-secret-findings
          path: ${{ steps.scan.outputs.findings_file }}
          if-no-files-found: warn
```

- [ ] **Step 3: Add `sca-scan` job**

Add a parallel Trivy job:

```yaml
  sca-scan:
    name: sca-scan
    runs-on: ubuntu-24.04
    timeout-minutes: ${{ inputs.timeout-minutes }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Trivy
        uses: aquasecurity/setup-trivy@v0.2.6
        with:
          version: v0.70.0
          cache: true

      - id: scan
        name: Trivy filesystem SCA scan
        shell: bash
        continue-on-error: true
        env:
          SEVERITY: ${{ inputs.severity }}
          IGNORE_UNFIXED: ${{ inputs.ignore-unfixed }}
        run: |
          set +e
          out="$RUNNER_TEMP/trivy-fs.json"
          args=(fs --format json --scanners vuln,license --severity "$SEVERITY" --exit-code 0 --output "$out")
          if [ "$IGNORE_UNFIXED" = "true" ]; then
            args+=(--ignore-unfixed)
          fi
          args+=("$GITHUB_WORKSPACE")
          trivy "${args[@]}"
          status=$?
          if [ ! -f "$out" ]; then
            echo '{"Results":[]}' > "$out"
          fi
          echo "trivy_file=$out" >> "$GITHUB_OUTPUT"
          exit 0

      - name: Upload Trivy findings
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: source-security-trivy-findings
          path: ${{ steps.scan.outputs.trivy_file }}
          if-no-files-found: warn
```

- [ ] **Step 4: Add `report` job**

Add a final job that downloads both artifacts and calls the report module:

```yaml
  report:
    name: source-security-report
    runs-on: ubuntu-24.04
    needs: [secret-scan, sca-scan]
    if: always()
    steps:
      - name: Checkout report script
        uses: actions/checkout@v4

      - name: Download secret findings
        uses: actions/download-artifact@v4
        with:
          name: source-security-secret-findings
          path: ${{ runner.temp }}/source-security/trufflehog

      - name: Download Trivy findings
        uses: actions/download-artifact@v4
        with:
          name: source-security-trivy-findings
          path: ${{ runner.temp }}/source-security/trivy

      - id: build-report
        name: Build source security report
        shell: bash
        env:
          SCOPE: ${{ inputs.scope }}
          BASE: ${{ needs.secret-scan.outputs.base }}
          SEVERITY: ${{ inputs.severity }}
          BLOCKING_SEVERITY: ${{ inputs.blocking-severity }}
        run: |
          set -euo pipefail
          root="$RUNNER_TEMP/source-security"
          report="$root/source-security-report.md"
          json="$root/source-security-findings.json"
          outputs="$root/source-security-outputs.env"
          node .github/scripts/source-security-report.mjs \
            --trivy="$root/trivy/trivy-fs.json" \
            --trufflehog="$root/trufflehog/trufflehog-findings.ndjson" \
            --scope="$SCOPE" \
            --base="$BASE" \
            --severity="$SEVERITY" \
            --blockingSeverity="$BLOCKING_SEVERITY" \
            --runUrl="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" \
            --markdownOut="$report" \
            --jsonOut="$json" \
            --outputsOut="$outputs"
          cat "$outputs" >> "$GITHUB_OUTPUT"
          {
            echo "report_file=$report"
            echo "json_file=$json"
          } >> "$GITHUB_OUTPUT"
```

- [ ] **Step 5: Add summary, sticky comment, artifact, and policy steps**

Add:

```yaml
      - name: Write workflow summary
        if: always()
        shell: bash
        env:
          REPORT: ${{ steps.build-report.outputs.report_file }}
        run: cat "$REPORT" >> "$GITHUB_STEP_SUMMARY"

      - name: Upsert sticky PR comment
        if: always() && github.event_name == 'pull_request'
        continue-on-error: true
        uses: marocchino/sticky-pull-request-comment@v3
        with:
          header: source-security-scan-findings
          path: ${{ steps.build-report.outputs.report_file }}
          recreate: true

      - name: Upload source security artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: source-security-scan-findings
          path: |
            ${{ runner.temp }}/source-security/trufflehog
            ${{ runner.temp }}/source-security/trivy
            ${{ steps.build-report.outputs.json_file }}
          if-no-files-found: warn
          retention-days: 30

      - name: Enforce scan policy
        if: always()
        shell: bash
        env:
          FAIL: ${{ inputs.fail-on-findings }}
          VULN_BLOCKING: ${{ steps.build-report.outputs.vulnerabilityBlocking }}
          SECRET_BLOCKING: ${{ steps.build-report.outputs.secretBlocking }}
        run: |
          set -euo pipefail
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

- [ ] **Step 6: Delete old secret workflow**

Remove `.github/workflows/p2p-workflow-secret-scan.yaml`.

- [ ] **Step 7: Validate workflow syntax**

Run:

```bash
rtk actionlint .github/workflows/p2p-workflow-source-security-scan.yaml
```

Expected: no output and exit code 0.

- [ ] **Step 8: Commit workflow**

Run:

```bash
rtk git add .github/workflows/p2p-workflow-source-security-scan.yaml .github/workflows/p2p-workflow-secret-scan.yaml
rtk git commit -m "feat(source-security): add reusable scan workflow"
```

## Task 4: Wire Workflow Callers

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
      timeout-minutes: ${{ inputs.timeout-minutes }}
```

Update the job graph comment/docs inside the file only if the workflow contains inline explanatory comments that name `secret-scan`.

- [ ] **Step 4: Add internal CI dry-run call**

Add this job to `.github/workflows/internal-ci.yaml` after `test_fastfeedback`:

```yaml
  test_source_security_scan:
    uses: ./.github/workflows/p2p-workflow-source-security-scan.yaml
    with:
      scope: changes
      fail-on-findings: false
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

## Task 5: Documentation Update

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
- `source-security-scan-findings` artifact.

## Blocking policy

The workflow is visibility-first by default. When `fail-on-findings: true`, it fails only for:

- Trivy vulnerability findings whose severity is listed in `blocking-severity`;
- TruffleHog findings with `status: verified`.

Restricted and forbidden license findings are report-only, even when `fail-on-findings: true`.
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
- `source-security-scan-findings` artifact from the source-security-scan job. Contains raw TruffleHog output, raw Trivy filesystem output, and normalized merged JSON.
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

Expected: remaining occurrences are either historical text in design/plan docs or intentionally named internal job fragments inside source-security implementation. Update all user-facing current docs and workflows.

- [ ] **Step 9: Commit docs**

Run:

```bash
rtk git add README.md docs .github/workflows
rtk git commit -m "docs(source-security): document source scanning workflow"
```

## Task 6: Verification

**Files:**
- All modified files from Tasks 1-5.

- [ ] **Step 1: Run Node tests**

Run:

```bash
rtk node --test .github/scripts/source-security-report.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run actionlint on all workflows**

Run:

```bash
rtk actionlint .github/workflows/*.yaml
```

Expected: no output and exit code 0.

- [ ] **Step 3: Run reference scan**

Run:

```bash
rtk rg -n "p2p-workflow-secret-scan|secret-scan-findings|trufflehog-findings" README.md docs .github/workflows
```

Expected: no current user-facing references to the deleted workflow, artifact, or sticky comment header. Design and implementation plan files under `docs/superpowers/` may still reference historical names.

- [ ] **Step 4: Check git diff**

Run:

```bash
rtk git diff --stat HEAD
rtk git diff --check
```

Expected: diff contains only source security scan changes, docs updates, and report tests. `git diff --check` has no whitespace errors.

- [ ] **Step 5: Confirm working tree state**

Run:

```bash
rtk git status --short
```

Expected: only intentionally untracked user files remain. If any source security files are modified by verification fixes, commit those files with `rtk git commit -m "chore(source-security): verify workflow integration"` after reviewing `rtk git diff`.

## Self-Review

- Spec coverage: the plan covers the new workflow name, TruffleHog secrets, Trivy `vuln,license`, Trivy secret scanner disabled, misconfiguration scanner out of scope, compact foldable comment, artifact layout, vulnerability `severity` and `blocking-severity`, license report-only behavior, caller wiring, docs, and verification.
- Placeholder scan: no implementation step relies on unspecified policy or unnamed files.
- Type consistency: report outputs use camelCase keys (`vulnerabilityBlocking`, `secretBlocking`) consistently between the script and workflow policy step.
