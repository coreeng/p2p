const fs = require('fs');
const path = require('path');
const { escapeCell } = require('./markdown.js');

const CANONICAL_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const SEV_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
const SEV_EMOJI = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🔵', UNKNOWN: '⚪' };

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

const sourceFromTarget = target => {
  const text = String(target || '');
  const match = text.match(/^.+\((.+)\)$/);
  return match ? match[1] : text;
};

const vulnerabilityUrl = (id, primaryUrl) => {
  const normalizedId = String(id || '').toUpperCase();
  if (/^CVE-\d{4}-\d+$/.test(normalizedId)) {
    return `https://www.cve.org/CVERecord?id=${normalizedId}`;
  }
  if (/^GHSA-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(normalizedId)) {
    return `https://github.com/advisories/${normalizedId.toLowerCase()}`;
  }
  return primaryUrl || '';
};

const rowSort = (a, b) => (
  (SEV_RANK[a.severity] ?? SEV_RANK.UNKNOWN) - (SEV_RANK[b.severity] ?? SEV_RANK.UNKNOWN)
  || a.package.localeCompare(b.package)
  || a.cve.localeCompare(b.cve)
);

const normalizeVulnerabilityRows = (rawRows, group, blockingSet, options = {}) => {
  const dedup = new Map();
  for (const rawRow of rawRows) {
    const key = [rawRow.severity, rawRow.installed, rawRow.fixed, rawRow.id, rawRow.source].join('\u0000');
    if (!dedup.has(key)) {
      dedup.set(key, {
        severity: rawRow.severity,
        installed: rawRow.installed,
        fixed: rawRow.fixed,
        cve: rawRow.id,
        cveUrl: rawRow.cveUrl,
        source: rawRow.source,
        packages: [],
        packageSet: new Set(),
        isBlocking: options.forceNonBlocking ? false : blockingSet.has(rawRow.severity),
        shortName: group.shortName,
        ...(options.includeImage ? { image: group.shortName } : {}),
        ...(options.includeFullRef ? { fullRef: group.fullRef } : {}),
        ...(rawRow.ignore ? { ignore: rawRow.ignore } : {}),
      });
    }
    const row = dedup.get(key);
    if (!row.packageSet.has(rawRow.package)) {
      row.packageSet.add(rawRow.package);
      row.packages.push(rawRow.package);
    }
  }

  return Array.from(dedup.values())
    .map(({ packageSet, packages, ...row }) => ({
      ...row,
      package: packages.join(', '),
      id: row.cve,
    }))
    .sort(rowSort);
};

const buildImageSecurityReport = async ({ core, env = process.env } = {}) => {
  const securityIgnoreHelper = env.P2P_SECURITY_IGNORE_HELPER || path.join(__dirname, 'p2p-security-ignore.js');
  const {
    loadSecurityIgnore,
    splitImageVulnerabilities,
    splitImageSecrets,
    p2pRedactedSecretId,
  } = require(securityIgnoreHelper);
  const blockingSet = blockingSeveritySet(env.BLOCKING_SEVERITY, core);
  const reportedSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const list = env.REPORT_LIST;
  const listExists = !!(list && fs.existsSync(list) && fs.statSync(list).size > 0);
  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const securityIgnore = loadSecurityIgnore(env.GITHUB_WORKSPACE);

  const shortNameFromRef = ref => {
    const refWithoutDigest = String(ref || '').split('@')[0];
    const registryPrefix = `${env.REGION}-docker.pkg.dev/${env.PROJECT_ID}/tenant/${env.TENANT_NAME}/${env.PIPELINE_STAGE}/`;
    if (
      env.REGION
      && env.PROJECT_ID
      && env.TENANT_NAME
      && refWithoutDigest.startsWith(registryPrefix)
    ) {
      return refWithoutDigest.slice(registryPrefix.length).split(':')[0];
    }
    const segments = refWithoutDigest.split('/').filter(Boolean);
    const stageIndex = segments.lastIndexOf(env.PIPELINE_STAGE);
    if (stageIndex >= 0 && stageIndex < segments.length - 1) {
      const imageSegments = segments.slice(stageIndex + 1);
      imageSegments[imageSegments.length - 1] = imageSegments[imageSegments.length - 1].split(':')[0];
      return imageSegments.join('/');
    }
    return refWithoutDigest.split('/').pop().split(':')[0];
  };

  let total = 0;
  let blocking = 0;
  const imageGroups = {};
  const ignoredImageVulnerabilities = [];

  if (listExists) {
    const entries = fs.readFileSync(list, 'utf8').split('\n').filter(Boolean);
    for (const line of entries) {
      const [ref, plat, digest, out] = line.split('\t');
      if (!out || !fs.existsSync(out) || fs.statSync(out).size === 0) continue;
      try {
        const shortName = shortNameFromRef(ref);
        if (!imageGroups[shortName]) {
          imageGroups[shortName] = {
            shortName,
            fullRef: ref,
            platforms: new Set(),
            rawRows: [],
          };
        }
        const group = imageGroups[shortName];
        if (!group.fullRef) group.fullRef = ref;
        if (plat) group.platforms.add(plat);

        const report = JSON.parse(fs.readFileSync(out, 'utf8'));
        const results = Array.isArray(report.Results) ? report.Results : [];
        for (const res of results) {
          const source = sourceFromTarget(res?.Target) || '-';
          const vulns = Array.isArray(res?.Vulnerabilities) ? res.Vulnerabilities : [];
          for (const v of vulns) {
            const severity = CANONICAL_SEVERITIES.includes(v.Severity) ? v.Severity : 'UNKNOWN';
            const cve = v.VulnerabilityID || 'UNKNOWN';
            group.rawRows.push({
              severity,
              package: v.PkgName || '-',
              installed: v.InstalledVersion || '-',
              fixed: v.FixedVersion || '-',
              id: cve,
              cveUrl: vulnerabilityUrl(cve, v.PrimaryURL),
              source,
            });
          }
        }
      } catch (error) {
        core.warning(`Failed to process Trivy report for ${ref} (${plat}): ${error.message}`);
      }
    }
  }

  for (const group of Object.values(imageGroups)) {
    const split = splitImageVulnerabilities(group.rawRows, securityIgnore, group.shortName);
    group.rawRows = split.active;
    ignoredImageVulnerabilities.push(
      ...normalizeVulnerabilityRows(split.ignored, group, blockingSet, {
        forceNonBlocking: true,
        includeImage: true,
        includeFullRef: true,
      }),
    );
    total += split.active.length;
    blocking += split.active.filter(row => blockingSet.has(row.severity)).length;
  }

  const secretList = env.SECRET_REPORT_LIST;
  const secretListExists = !!(secretList && fs.existsSync(secretList) && fs.statSync(secretList).size > 0);
  const secretImageGroups = {};
  const ignoredImageSecrets = [];
  let secretTotal = 0;
  let secretBlocking = 0;
  if (secretListExists) {
    for (const line of fs.readFileSync(secretList, 'utf8').split('\n').filter(Boolean)) {
      // Four tab-separated fields: original ref, platform, manifest digest, output path.
      const [ref, plat, digest, out] = line.split('\t');
      if (!out || !fs.existsSync(out)) continue;
      const shortName = shortNameFromRef(ref);
      if (!secretImageGroups[shortName]) {
        secretImageGroups[shortName] = { shortName, fullRef: ref, platforms: new Set(), rawRows: [] };
      }
      const group = secretImageGroups[shortName];
      if (plat) group.platforms.add(plat);
      for (const ln of fs.readFileSync(out, 'utf8').split('\n').filter(Boolean)) {
        let f;
        try { f = JSON.parse(ln); } catch (e) { continue; }
        const detector = f.DetectorName || f.DetectorType || 'unknown';
        const verified = f.Verified === true;
        const status = verified ? 'verified' : (f.VerificationError ? 'unknown' : 'unverified');
        const meta = (f.SourceMetadata && f.SourceMetadata.Data && f.SourceMetadata.Data.Docker) || {};
        const isBlocking = verified && blockingSet.has('CRITICAL');
        group.rawRows.push({
          id: f.id || p2pRedactedSecretId(f.RawV2 || f.Raw || f.Redacted || `${detector}:${meta.file || '-'}:${meta.layer || '-'}`),
          detector,
          status,
          layer: meta.layer || '-',
          path: meta.file || '-',
          isBlocking,
          blocking: isBlocking,
        });
      }
    }
  }

  for (const group of Object.values(secretImageGroups)) {
    const split = splitImageSecrets(group.rawRows, securityIgnore, group.shortName);
    group.rawRows = split.active;
    ignoredImageSecrets.push(
      ...split.ignored.map(row => ({ ...row, isBlocking: false, image: group.shortName, fullRef: group.fullRef })),
    );
    secretTotal += split.active.length;
    secretBlocking += split.active.filter(row => row.isBlocking).length;
  }

  const imageSummaries = Object.values(imageGroups)
    .map(group => {
      const rows = normalizeVulnerabilityRows(group.rawRows, group, blockingSet);

      const countsBySeverity = Object.fromEntries(CANONICAL_SEVERITIES.map(sev => [sev, 0]));
      for (const row of rows) countsBySeverity[row.severity] += 1;

      return {
        shortName: group.shortName,
        fullRef: group.fullRef,
        platforms: Array.from(group.platforms).sort((a, b) => a.localeCompare(b)),
        rows,
        countsBySeverity,
        blockingUnique: rows.filter(row => row.isBlocking).length,
        totalUnique: rows.length,
      };
    })
    .filter(group => group.totalUnique > 0)
    .sort((a, b) => (
      b.blockingUnique - a.blockingUnique
      || b.totalUnique - a.totalUnique
      || a.shortName.localeCompare(b.shortName)
    ));

  const allUniqueRows = imageSummaries.flatMap(group => group.rows.map(row => ({ ...row, shortName: group.shortName })));
  const totalUniqueRows = allUniqueRows.length;
  const selectedRows = [
    ...allUniqueRows.filter(row => row.isBlocking),
    ...allUniqueRows.filter(row => !row.isBlocking),
  ].slice(0, 100);
  const selectedRowsByImage = new Map();
  for (const row of selectedRows) {
    const rows = selectedRowsByImage.get(row.shortName) || [];
    rows.push(row);
    selectedRowsByImage.set(row.shortName, rows);
  }
  for (const rows of selectedRowsByImage.values()) rows.sort(rowSort);

  const secretRowSort = (a, b) => (
    Number(b.isBlocking) - Number(a.isBlocking)
    || a.detector.localeCompare(b.detector)
    || a.path.localeCompare(b.path)
  );
  const secretSummaries = Object.values(secretImageGroups)
    .map(group => {
      const dedup = new Map();
      for (const rawRow of group.rawRows) {
        const key = [rawRow.id, rawRow.detector, rawRow.status, rawRow.layer, rawRow.path].join('\u0000');
        if (!dedup.has(key)) dedup.set(key, { ...rawRow, shortName: group.shortName });
      }
      const rows = Array.from(dedup.values()).sort(secretRowSort);
      return {
        shortName: group.shortName,
        platforms: Array.from(group.platforms).sort((a, b) => a.localeCompare(b)),
        rows,
        blockingUnique: rows.filter(r => r.isBlocking).length,
        totalUnique: rows.length,
      };
    })
    .filter(group => group.totalUnique > 0)
    .sort((a, b) => (
      b.blockingUnique - a.blockingUnique
      || b.totalUnique - a.totalUnique
      || a.shortName.localeCompare(b.shortName)
    ));

  const allSecretRows = secretSummaries.flatMap(group => group.rows);
  const totalSecretUnique = allSecretRows.length;
  const selectedSecretRows = [
    ...allSecretRows.filter(r => r.isBlocking),
    ...allSecretRows.filter(r => !r.isBlocking),
  ].slice(0, 100);
  const selectedSecretsByImage = new Map();
  for (const row of selectedSecretRows) {
    const arr = selectedSecretsByImage.get(row.shortName) || [];
    arr.push(row);
    selectedSecretsByImage.set(row.shortName, arr);
  }
  for (const arr of selectedSecretsByImage.values()) arr.sort(secretRowSort);

  const envSuffix = env.GITHUB_ENV_INPUT ? ` / ${env.GITHUB_ENV_INPUT}` : '';
  const out = [`## Image scan (${env.PIPELINE_STAGE}${envSuffix})`];

  if (!listExists && !secretListExists) {
    out.push('', '_Scan skipped (dry-run or upstream failure)._');
  } else if (total === 0 && secretTotal === 0 && ignoredImageVulnerabilities.length === 0 && ignoredImageSecrets.length === 0) {
    out.push(
      '',
      `**Version:** \`${env.VERSION}\` · **Vulnerabilities:** 0 · **Secrets:** 0`,
      '',
      '_No vulnerabilities or secrets found._',
    );
  } else {
    out.push(
      '',
      `**Version:** \`${env.VERSION}\` · **Vulnerabilities:** ${total} total · ${blocking} blocking`,
      `· **Secrets:** ${secretTotal} total · ${secretBlocking} blocking`,
      `**Severities reported:** \`LOW,MEDIUM,HIGH,CRITICAL\` · **Blocking severity:** \`${env.BLOCKING_SEVERITY}\``,
      '',
      `[📦 Download full reports](${runUrl})`,
      '',
    );

    if (total > 0) {
      out.push('### Vulnerabilities', '');
      if (imageSummaries.length > 0) {
        const summaryHeader = [
          'Image',
          ...reportedSeverities.map(sev => `${SEV_EMOJI[sev]} ${sev}`),
          'Total',
        ];
        out.push(
          `| ${summaryHeader.join(' | ')} |`,
          `| ${summaryHeader.map(() => '---').join(' | ')} |`,
          ...imageSummaries.map(group => {
            const counts = reportedSeverities.map(sev => String(group.countsBySeverity[sev] || 0));
            return `| \`${escapeCell(group.shortName)}\` | ${[...counts, String(group.totalUnique)].join(' | ')} |`;
          }),
          '',
        );
      }

      for (const group of imageSummaries) {
        const rows = selectedRowsByImage.get(group.shortName) || [];
        if (rows.length === 0) continue;

        const sevSummary = reportedSeverities
          .map(sev => `${SEV_EMOJI[sev]} ${group.countsBySeverity[sev] || 0}`)
          .join(' · ');
        const platformSuffix = group.platforms.length > 0 ? ` (${group.platforms.join(', ')})` : '';

        out.push(
          `<details><summary>${sevSummary} — <code>${group.shortName}</code>${platformSuffix}</summary>`,
          '',
          '| Severity | Package | Installed | Fixed | CVE | Source |',
          '|---|---|---|---|---|---|',
          ...rows.map(row => `| ${SEV_EMOJI[row.severity]} ${row.severity} | ${escapeCell(row.package)} | ${escapeCell(row.installed)} | ${escapeCell(row.fixed)} | [${row.cve}](${row.cveUrl}) | ${escapeCell(row.source)} |`),
          '',
          `Full ref: \`${group.fullRef}\``,
          '',
          '</details>',
          '',
        );
      }

      if (totalUniqueRows > 100) {
        out.push(`_Showing 100 of ${totalUniqueRows} findings — see the [full Trivy reports](${runUrl}) for the rest._`);
      }
    }

    if (secretTotal > 0) {
      out.push('### Secrets in image', '');
      for (const group of secretSummaries) {
        const rows = selectedSecretsByImage.get(group.shortName) || [];
        if (rows.length === 0) continue;
        const platformSuffix = group.platforms.length > 0 ? ` (${group.platforms.join(', ')})` : '';
        out.push(
          `**\`${group.shortName}\`**${platformSuffix}`,
          '',
          '| Detector | Status | ID | Layer | Path |',
          '|---|---|---|---|---|',
          ...rows.map(r => `| ${escapeCell(r.detector)} | ${r.status} | \`${escapeCell(r.id)}\` | \`${escapeCell(r.layer)}\` | ${escapeCell(r.path)} |`),
          '',
        );
      }
      if (totalSecretUnique > 100) {
        out.push(`_Showing 100 of ${totalSecretUnique} secret findings — see the [full reports](${runUrl}) for the rest._`, '');
      }
    }
  }

  const md = out.join('\n').trimEnd() + '\n';
  const reportPath = path.join(env.RUNNER_TEMP, 'trivy-report.md');
  const jsonPath = path.join(env.RUNNER_TEMP, 'image-security-findings.json');
  const normalized = {
    vulnerabilities: imageSummaries.flatMap(group => group.rows.map(row => ({ ...row, image: group.shortName, id: row.cve }))),
    secrets: secretSummaries.flatMap(group => group.rows.map(row => ({ ...row, image: group.shortName }))),
  };
  if (securityIgnore.present) {
    normalized.ignored = {
      vulnerabilities: ignoredImageVulnerabilities,
      secrets: ignoredImageSecrets,
    };
  }
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2) + '\n');
  core.setOutput('report-path', reportPath);
  core.setOutput('comment-path', reportPath);
  core.setOutput('json-file', jsonPath);
  core.setOutput('total-count', total);
  core.setOutput('blocking-count', blocking);
  core.setOutput('secret-total-count', secretTotal);
  core.setOutput('secret-blocking-count', secretBlocking);
  await core.summary.addRaw(md).write();
};

module.exports = {
  buildImageSecurityReport,
};
