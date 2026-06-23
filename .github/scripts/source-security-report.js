const fs = require('fs');
const path = require('path');
const { code, escapeCell, markdownLink } = require('./markdown.js');

const CANONICAL_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
const SEV_EMOJI = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵', UNKNOWN: '⚪' };
const REPORTED_SEVERITY_TEXT = 'LOW,MEDIUM,HIGH,CRITICAL,UNKNOWN';
const SECURITY_RISK_BY_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unclassified',
};
const SECURITY_RISK_RANK = { critical: 0, unclassified: 1, high: 2, medium: 3, low: 4, ok: 5 };

const severitySet = value => new Set(String(value || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
const blockingSeveritySet = (value, core) => {
  const threshold = String(value || 'off').trim().toLowerCase();
  const byThreshold = {
    off: [],
    critical: ['CRITICAL'],
    high: ['CRITICAL', 'HIGH'],
    medium: ['CRITICAL', 'HIGH', 'MEDIUM'],
    low: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  };
  if (!Object.hasOwn(byThreshold, threshold)) {
    core.setFailed(`blocking-severity must be one of: off, low, medium, high, critical. Got: ${value}`);
    return new Set();
  }
  return new Set(byThreshold[threshold]);
};
const normalizeSeverity = value => CANONICAL_SEVERITIES.includes(value) ? value : 'UNKNOWN';
const readJson = (file, fallback) => {
  if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const readRequiredJson = (file, label) => {
  if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`Failed to process ${label} ${file}: output was missing or empty`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to process ${label} ${file}: ${error.message}`);
  }
};
const readLines = file => {
  if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
};
const readRequiredLines = (file, label) => {
  if (!file || !fs.existsSync(file)) {
    throw new Error(`Failed to process ${label} ${file}: output was missing`);
  }
  return readLines(file);
};
const vulnerabilityUrl = (id, primaryUrl) => {
  const normalizedId = String(id || '').toUpperCase();
  if (/^CVE-\d{4}-\d+$/.test(normalizedId)) {
    return `https://nvd.nist.gov/vuln/detail/${normalizedId}`;
  }
  if (/^GHSA-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(normalizedId)) {
    return `https://github.com/advisories/${normalizedId.toLowerCase()}`;
  }
  return primaryUrl || '';
};
const sortBySeverity = (a, b) => (
  Number(b.blocking) - Number(a.blocking)
  || (SEV_RANK[a.severity] ?? SEV_RANK.UNKNOWN) - (SEV_RANK[b.severity] ?? SEV_RANK.UNKNOWN)
  || a.package.localeCompare(b.package)
  || (a.id || a.license || '').localeCompare(b.id || b.license || '')
);
const sortBySeverityOnly = (a, b) => (
  (SEV_RANK[a.severity] ?? SEV_RANK.UNKNOWN) - (SEV_RANK[b.severity] ?? SEV_RANK.UNKNOWN)
  || a.package.localeCompare(b.package)
  || (a.id || a.license || '').localeCompare(b.id || b.license || '')
);
const groupBySource = rows => {
  const groups = new Map();
  for (const row of rows) {
    const source = row.source || '-';
    if (!groups.has(source)) groups.set(source, { source, rows: [] });
    groups.get(source).rows.push(row);
  }
  return Array.from(groups.values()).map(group => {
    const countsBySeverity = Object.fromEntries(CANONICAL_SEVERITIES.map(sev => [sev, 0]));
    for (const row of group.rows) countsBySeverity[row.severity] += 1;
    const blocking = group.rows.filter(row => row.blocking).length;
    group.rows.sort(sortBySeverity);
    return { ...group, countsBySeverity, blocking, total: group.rows.length };
  }).sort((a, b) => (
    b.blocking - a.blocking
    || b.total - a.total
    || a.source.localeCompare(b.source)
  ));
};
const selectedRowsBySource = rows => {
  const selected = [
    ...rows.filter(row => row.blocking).sort(sortBySeverityOnly),
    ...rows.filter(row => !row.blocking).sort(sortBySeverityOnly),
  ].slice(0, 100);
  const bySource = new Map();
  for (const row of selected) {
    const source = row.source || '-';
    const sourceRows = bySource.get(source) || [];
    sourceRows.push(row);
    bySource.set(source, sourceRows);
  }
  for (const sourceRows of bySource.values()) sourceRows.sort(sortBySeverity);
  return bySource;
};

const maxSecurityRisk = (vulnerabilities, secrets) => {
  const risks = [
    ...vulnerabilities.map(v => SECURITY_RISK_BY_SEVERITY[v.severity] || 'unclassified'),
    ...secrets.map(s => s.status === 'verified' ? 'critical' : 'unclassified'),
  ];
  if (risks.length === 0) return 'ok';
  return risks.sort((a, b) => SECURITY_RISK_RANK[a] - SECURITY_RISK_RANK[b])[0];
};

const buildSourceSecurityReport = async ({ core, env = process.env } = {}) => {
const securityIgnoreHelper = env.P2P_SECURITY_IGNORE_HELPER || path.join(__dirname, 'p2p-security-ignore.js');
const {
  loadSourceSecurityIgnore,
  splitSourceVulnerabilities,
  splitSourceSecrets,
} = require(securityIgnoreHelper);

const root = env.ROOT;
fs.mkdirSync(root, { recursive: true });
const trivyPath = path.join(root, 'trivy', 'trivy-fs.json');
const trufflehogPath = path.join(root, 'trufflehog', 'findings.ndjson');
const dryRun = env.DRY_RUN === 'true';
const scannerWarnings = [];
if (!dryRun) {
  if (env.SECRET_SCAN_RESULT !== 'success') {
    scannerWarnings.push(`TruffleHog job finished with result ${env.SECRET_SCAN_RESULT}; secret results may be incomplete.`);
  }
  if (env.SCA_SCAN_RESULT !== 'success') {
    scannerWarnings.push(`Trivy job finished with result ${env.SCA_SCAN_RESULT}; vulnerability and license results may be incomplete.`);
  }
  if (!fs.existsSync(trivyPath)) {
    scannerWarnings.push('Trivy output was not available; vulnerability and license results may be incomplete.');
  }
  if (!fs.existsSync(trufflehogPath)) {
    scannerWarnings.push('TruffleHog output was not available; secret results may be incomplete.');
  }
}
const reportSeveritySet = severitySet('LOW,MEDIUM,HIGH,CRITICAL,UNKNOWN');
const blockingSet = blockingSeveritySet(env.BLOCKING_SEVERITY, core);
const reportedSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const securityIgnore = loadSourceSecurityIgnore(env.GITHUB_WORKSPACE, env.WORKING_DIRECTORY);
const trivy = !dryRun && env.SCA_SCAN_RESULT === 'success'
  ? readRequiredJson(trivyPath, 'Trivy source report')
  : readJson(trivyPath, { Results: [] });
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
      url: vulnerabilityUrl(vuln.VulnerabilityID || 'UNKNOWN', vuln.PrimaryURL),
      source,
      blocking: blockingSet.has(severity),
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
const vulnerabilitySplit = splitSourceVulnerabilities(vulnerabilities, securityIgnore);
const activeVulnerabilities = vulnerabilitySplit.active;
const ignoredVulnerabilities = vulnerabilitySplit.ignored.sort(sortBySeverityOnly);

const secrets = [];
const trufflehogLines = !dryRun && env.SECRET_SCAN_RESULT === 'success'
  ? readRequiredLines(trufflehogPath, 'TruffleHog source report')
  : readLines(trufflehogPath);
for (const line of trufflehogLines) {
  let secret;
  try {
    secret = JSON.parse(line);
  } catch (error) {
    throw new Error(`Failed to process TruffleHog source report ${trufflehogPath}: ${error.message}`);
  }
  secrets.push({
    id: secret.id,
    detector: secret.detector || 'unknown',
    status: secret.status || 'unverified',
    file: secret.file || null,
    line: secret.line || null,
    commit: secret.commit || null,
    url: secret.url || null,
    blocking: secret.status === 'verified' && blockingSet.has('CRITICAL'),
  });
}
secrets.sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.detector.localeCompare(b.detector) || String(a.file || '').localeCompare(String(b.file || '')));
const secretSplit = splitSourceSecrets(secrets, securityIgnore);
const activeSecrets = secretSplit.active;
const ignoredSecrets = secretSplit.ignored.sort((a, b) => a.detector.localeCompare(b.detector) || String(a.file || '').localeCompare(String(b.file || '')));

const vulnerabilityBlocking = activeVulnerabilities.filter(v => v.blocking).length;
const secretBlocking = blockingSet.has('CRITICAL') ? activeSecrets.filter(s => s.blocking).length : 0;
const scanStatus = scannerWarnings.length > 0 ? 'failed' : 'ok';
const securityRisk = scanStatus === 'failed' ? 'unknown' : maxSecurityRisk(activeVulnerabilities, activeSecrets);
const normalized = { ignoreFiles: securityIgnore.ignoreFiles, vulnerabilities: activeVulnerabilities, licenses, secrets: activeSecrets };
if (securityIgnore.present) {
  normalized.ignored = {
    vulnerabilities: ignoredVulnerabilities,
    secrets: ignoredSecrets,
  };
}
const scanRange = env.SCOPE === 'changes' ? `${env.BASE || '<initial>'}..HEAD` : '<full history>';
const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
const vulnerabilityGroups = groupBySource(activeVulnerabilities);
const selectedVulnerabilitiesBySource = selectedRowsBySource(activeVulnerabilities);
const licenseGroups = groupBySource(licenses);
const selectedLicensesBySource = selectedRowsBySource(licenses);
const selectedSecrets = [
  ...activeSecrets.filter(s => s.blocking),
  ...activeSecrets.filter(s => !s.blocking),
].slice(0, 100);
const out = ['## Source security scan', ''];

if (dryRun) {
  out.push('_Scan skipped (dry-run)._');
} else {
  if (scannerWarnings.length > 0) {
    out.push('### Scanner output warnings', '', ...scannerWarnings.map(warning => `- ${warning}`), '');
  }
}

if (!dryRun) {
  out.push(
    `**Scan range:** ${code(scanRange)} · **Vulnerabilities:** ${activeVulnerabilities.length} total · ${vulnerabilityBlocking} blocking`,
    `· **Licenses:** ${licenses.length} total · 0 blocking`,
    `· **Secrets:** ${activeSecrets.length} total · ${secretBlocking} blocking`,
    `**Severities reported:** ${code(REPORTED_SEVERITY_TEXT)} · **Blocking severity:** ${code(env.BLOCKING_SEVERITY)}`,
    '',
    `[📦 Download full reports](${runUrl})`,
    '',
  );

  if (
    scannerWarnings.length === 0
    && activeVulnerabilities.length === 0
    && licenses.length === 0
    && activeSecrets.length === 0
    && ignoredVulnerabilities.length === 0
    && ignoredSecrets.length === 0
  ) {
    out.push('_No source security findings detected._');
  }

  if (activeVulnerabilities.length > 0) {
    out.push('### Vulnerabilities', '');
    const summarySeverities = reportedSeverities;
    const summaryHeader = ['Source', ...summarySeverities.map(sev => `${SEV_EMOJI[sev]} ${sev}`), 'Total'];
    out.push(
      `| ${summaryHeader.join(' | ')} |`,
      `| ${summaryHeader.map(() => '---').join(' | ')} |`,
      ...vulnerabilityGroups.map(group => {
        const counts = summarySeverities.map(sev => String(group.countsBySeverity[sev] || 0));
        return `| ${code(group.source)} | ${[...counts, String(group.total)].join(' | ')} |`;
      }),
      '',
    );

    for (const group of vulnerabilityGroups) {
      const rows = selectedVulnerabilitiesBySource.get(group.source) || [];
      if (rows.length === 0) continue;
      const sevSummary = summarySeverities
        .map(sev => `${SEV_EMOJI[sev]} ${group.countsBySeverity[sev] || 0}`)
        .join(' · ');
      out.push(
        `<details><summary>${sevSummary} — ${code(group.source)}</summary>`,
        '',
        '| Severity | Package | Installed | Fixed | CVE/ID | Source |',
        '|---|---|---|---|---|---|',
        ...rows.map(v => `| ${SEV_EMOJI[v.severity]} ${v.severity} | ${escapeCell(v.package)} | ${escapeCell(v.installed)} | ${escapeCell(v.fixed)} | ${markdownLink(v.id, v.url)} | ${escapeCell(v.source)} |`),
        '',
        '</details>',
        '',
      );
    }
  }

  if (licenses.length > 0) {
    out.push('### Restricted/forbidden licenses', '');
    const licenseSummarySeverities = ['CRITICAL', 'HIGH'];
    const summaryHeader = ['Source', ...licenseSummarySeverities.map(sev => `${SEV_EMOJI[sev]} ${sev}`), 'Total'];
    out.push(
      `| ${summaryHeader.join(' | ')} |`,
      `| ${summaryHeader.map(() => '---').join(' | ')} |`,
      ...licenseGroups.map(group => {
        const counts = licenseSummarySeverities.map(sev => String(group.countsBySeverity[sev] || 0));
        return `| ${code(group.source)} | ${[...counts, String(group.total)].join(' | ')} |`;
      }),
      '',
    );

    for (const group of licenseGroups) {
      const rows = selectedLicensesBySource.get(group.source) || [];
      if (rows.length === 0) continue;
      const sevSummary = licenseSummarySeverities
        .map(sev => `${SEV_EMOJI[sev]} ${group.countsBySeverity[sev] || 0}`)
        .join(' · ');
      out.push(
        `<details><summary>${sevSummary} — ${code(group.source)}</summary>`,
        '',
        '| Severity | Package | License | Classification | Source |',
        '|---|---|---|---|---|',
        ...rows.map(l => `| ${SEV_EMOJI[l.severity]} ${l.severity} | ${escapeCell(l.package)} | ${escapeCell(l.license)} | ${escapeCell(l.classification)} | ${escapeCell(l.source)} |`),
        '',
        '</details>',
        '',
      );
    }
  }

  if (activeSecrets.length > 0) {
    out.push(
      '### Secrets in source',
      '',
      '| Detector | Status | File | Line | Commit |',
      '|---|---|---|---|---|',
      ...selectedSecrets.map(s => {
        const file = s.file ? code(s.file) : '-';
        const shortCommit = s.commit ? s.commit.slice(0, 12) : '';
        const commit = shortCommit ? (s.url ? markdownLink(shortCommit, s.url) : code(shortCommit)) : '-';
        return `| ${escapeCell(s.detector)} | ${escapeCell(s.status)} | ${file} | ${escapeCell(s.line)} | ${commit} |`;
      }),
      '',
    );
  }

  for (const [label, count] of [['vulnerability', activeVulnerabilities.length], ['license', licenses.length], ['secret', activeSecrets.length]]) {
    if (count > 100) out.push(`_Showing 100 of ${count} ${label} findings - see the [full reports](${runUrl}) for the rest._`, '');
  }
}

const markdown = out.join('\n').trimEnd() + '\n';
const reportPath = path.join(root, 'source-security-report.md');
const jsonPath = path.join(root, 'source-security-findings.json');
fs.writeFileSync(reportPath, markdown);
fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2) + '\n');
core.setOutput('report-file', reportPath);
core.setOutput('json-file', jsonPath);
core.setOutput('vulnerability-total', activeVulnerabilities.length);
core.setOutput('vulnerability-blocking', vulnerabilityBlocking);
core.setOutput('license-total', licenses.length);
core.setOutput('secret-total', activeSecrets.length);
core.setOutput('secret-blocking', secretBlocking);
core.setOutput('security-risk', securityRisk);
core.setOutput('scan-status', scanStatus);
await core.summary.addRaw(markdown).write();
};

module.exports = {
  buildSourceSecurityReport,
};
