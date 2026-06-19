const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildImageSecurityReport } = require('../image-security-report.js');
const helperPath = path.resolve(__dirname, '../p2p-security-ignore.js');
const secretId = value => `p2psec_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;

async function runReportModule(env) {
  const outputs = {};
  let summary = '';
  const failures = [];
  await buildImageSecurityReport({
    env,
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      setFailed: (message) => { failures.push(message); },
      info: () => {},
      warning: () => {},
      summary: {
        addRaw(markdown) {
          summary = markdown;
          return this;
        },
        write() {
          return Promise.resolve();
        },
      },
    },
  });
  return {
    outputs,
    failures,
    summary,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

async function runReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-ignore-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
    'version: 1',
    'images:',
    '  - name: tools/prod/api',
    '    vulnerabilities:',
    '      - id: CVE-2026-IMAGE-1',
    '        reason: Base image package is accepted until upstream fixes it.',
    '        package: openssl',
    '        expires: 2026-09-01',
    '      - id: CVE-2026-IMAGE-EXPIRED',
    '        reason: Expired image vulnerability acceptance.',
    '        package: zlib',
    '        expires: 2020-01-01',
    '    secrets:',
    `      - id: ${secretId('accepted-image-secret-value')}`,
    '        reason: Synthetic image secret fixture is accepted.',
    '        path: /app/accepted.env',
    '        expires: 2026-10-01',
    `      - id: ${secretId('expired-image-secret-value')}`,
    '        reason: Expired image secret acceptance.',
    '        path: /app/expired.env',
    '        expires: 2020-01-01',
    '',
  ].join('\n'));

  const vulnReport = path.join(trivyDir, 'tools-prod-api-linux-amd64.json');
  fs.writeFileSync(vulnReport, JSON.stringify({
    Results: [
      {
        Target: 'api-image (debian)',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-IMAGE-1',
            PkgName: 'openssl',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-2026-IMAGE-1',
          },
          {
            VulnerabilityID: 'CVE-2026-12345',
            PkgName: 'curl\nlib|curl',
            InstalledVersion: '2.0.0',
            FixedVersion: '2.0.1\rpatched|build',
            Severity: 'HIGH',
            PrimaryURL: 'https://example.test/CVE-2026-12345',
          },
          {
            VulnerabilityID: 'GHSA-xxjr-mmjv-4gpg',
            PkgName: 'lodash',
            InstalledVersion: '4.17.22',
            FixedVersion: '4.17.23',
            Severity: 'HIGH',
            PrimaryURL: 'https://example.test/GHSA-xxjr-mmjv-4gpg',
          },
          {
            VulnerabilityID: 'CVE-2026-IMAGE-EXPIRED',
            PkgName: 'zlib',
            InstalledVersion: '3.0.0',
            FixedVersion: '3.0.1',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-2026-IMAGE-EXPIRED',
          },
        ],
      },
    ],
  }));
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `europe-west2-docker.pkg.dev/project/tenant/prod/prod/tools/prod/api:1.2.3\tlinux/amd64\tsha256:api\t${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'tools-prod-api-linux-amd64.jsonl');
  fs.writeFileSync(secretReport, [
    JSON.stringify({
      DetectorName: 'Github',
      Verified: true,
      Raw: 'accepted-image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:layer1', file: '/app/accepted.env' } } },
    }),
    JSON.stringify({
      DetectorName: 'Slack',
      Verified: true,
      Raw: 'active-image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:layer2', file: '/app/active.env' } } },
    }),
    JSON.stringify({
      DetectorName: 'Stripe',
      Verified: true,
      Raw: 'expired-image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:layer3', file: '/app/expired.env' } } },
    }),
  ].join('\n') + '\n');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `europe-west2-docker.pkg.dev/project/tenant/prod/prod/tools/prod/api:1.2.3\tlinux/amd64\tsha256:api\t${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    REGION: 'europe-west2',
    PROJECT_ID: 'project',
    TENANT_NAME: 'prod',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runOffModeAllIgnoredReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-ignore-off-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
    'version: 1',
    'images:',
    '  - name: services/api',
    '    vulnerabilities:',
    '      - id: CVE-2026-OFF-IGNORED',
    '        reason: Accepted off-mode image vulnerability.',
    '    secrets:',
    `      - id: ${secretId('off-mode-image-secret-value')}`,
    '        reason: Accepted off-mode image secret.',
    '        path: /app/off.env',
    '',
  ].join('\n'));

  const vulnReport = path.join(trivyDir, 'off-vuln.json');
  fs.writeFileSync(vulnReport, JSON.stringify({
    Results: [
      {
        Target: 'api-image (debian)',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-OFF-IGNORED',
            PkgName: 'openssl',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-2026-OFF-IGNORED',
          },
        ],
      },
    ],
  }));
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `europe-west2-docker.pkg.dev/project/tenant/fast-feedback/fast-feedback/services/api:1.2.3\tlinux/amd64\tsha256:api\t${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'off-secret.jsonl');
  fs.writeFileSync(secretReport, [
    JSON.stringify({
      DetectorName: 'Github',
      Verified: true,
      Raw: 'off-mode-image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:layer1', file: '/app/off.env' } } },
    }),
  ].join('\n') + '\n');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `europe-west2-docker.pkg.dev/project/tenant/fast-feedback/fast-feedback/services/api:1.2.3\tlinux/amd64\tsha256:api\t${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'off',
    PIPELINE_STAGE: 'fast-feedback',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    REGION: 'europe-west2',
    PROJECT_ID: 'project',
    TENANT_NAME: 'fast-feedback',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runUnclassifiedImageReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-unclassified-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const vulnReport = path.join(trivyDir, 'unclassified-vuln.json');
  fs.writeFileSync(vulnReport, JSON.stringify({
    Results: [
      {
        Target: 'api-image (debian)',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-UNCLASSIFIED',
            PkgName: 'openssl',
            Severity: 'UNKNOWN',
            PrimaryURL: 'https://example.test/CVE-2026-UNCLASSIFIED',
          },
          {
            VulnerabilityID: 'CVE-2026-HIGH',
            PkgName: 'curl',
            Severity: 'HIGH',
            PrimaryURL: 'https://example.test/CVE-2026-HIGH',
          },
        ],
      },
    ],
  }));
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `europe-west2-docker.pkg.dev/project/tenant/prod/prod/services/api:1.2.3\tlinux/amd64\tsha256:api\t${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'unclassified-secret.jsonl');
  fs.writeFileSync(secretReport, [
    JSON.stringify({
      DetectorName: 'Slack',
      Verified: false,
      Raw: 'image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:layer1', file: '/app/.env' } } },
    }),
  ].join('\n') + '\n');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `europe-west2-docker.pkg.dev/project/tenant/prod/prod/services/api:1.2.3\tlinux/amd64\tsha256:api\t${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'critical',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    REGION: 'europe-west2',
    PROJECT_ID: 'project',
    TENANT_NAME: 'prod',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

function readStatusStepNames(workflowPath) {
  return fs.readFileSync(workflowPath, 'utf8')
    .split('\n')
    .filter(line => line.includes('Output security risk:'));
}

async function runMarkdownEscapingReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-markdown-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const vulnReport = path.join(trivyDir, 'markdown-vuln.json');
  fs.writeFileSync(vulnReport, JSON.stringify({
    Results: [
      {
        Target: 'image (alpine)',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-LINK] [bad|row',
            PkgName: 'pkg',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'HIGH',
            PrimaryURL: 'https://example.test/CVE-2026-LINK',
          },
        ],
      },
    ],
  }));
  const reportList = path.join(trivyDir, 'reports.txt');
  const imageRef = 'registry.example/prod/bad`script`<script>|img:1.2.3';
  const platform = 'linux/amd64<script>|plat';
  fs.writeFileSync(reportList, [
    `${imageRef}\t${platform}\tsha256:markdown\t${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'markdown-secret.jsonl');
  fs.writeFileSync(secretReport, [
    JSON.stringify({
      DetectorName: 'Github',
      Verified: true,
      Raw: 'markdown-image-secret-value',
      SourceMetadata: { Data: { Docker: { layer: 'sha256:`layer1`', file: '/app/`secret`.env' } } },
    }),
  ].join('\n') + '\n');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `${imageRef}\t${platform}\tsha256:markdown\t${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runCorruptTrivyReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-corrupt-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const vulnReport = path.join(trivyDir, 'corrupt.json');
  fs.writeFileSync(vulnReport, '{not json');
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `registry.example/prod/api:1.2.3	linux/amd64	sha256:corrupt	${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'empty.jsonl');
  fs.writeFileSync(secretReport, '');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `registry.example/prod/api:1.2.3	linux/amd64	sha256:corrupt	${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runCorruptTruffleHogReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-corrupt-secret-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const vulnReport = path.join(trivyDir, 'empty.json');
  fs.writeFileSync(vulnReport, JSON.stringify({ Results: [] }));
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `registry.example/prod/api:1.2.3	linux/amd64	sha256:corrupt-secret	${vulnReport}`,
    '',
  ].join('\n'));

  const secretReport = path.join(secretDir, 'corrupt.jsonl');
  fs.writeFileSync(secretReport, '{not json\n');
  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, [
    `registry.example/prod/api:1.2.3	linux/amd64	sha256:corrupt-secret	${secretReport}`,
    '',
  ].join('\n'));

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runMissingTrivyReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-missing-trivy-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `registry.example/prod/api:1.2.3\tlinux/amd64\tsha256:missing\t${path.join(trivyDir, 'missing.json')}`,
    '',
  ].join('\n'));

  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, '');

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

async function runMalformedTruffleHogReportList() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-malformed-secret-list-'));
  const workspace = path.join(tmp, 'repo');
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });

  const vulnReport = path.join(trivyDir, 'empty.json');
  fs.writeFileSync(vulnReport, JSON.stringify({ Results: [] }));
  const reportList = path.join(trivyDir, 'reports.txt');
  fs.writeFileSync(reportList, [
    `registry.example/prod/api:1.2.3\tlinux/amd64\tsha256:empty\t${vulnReport}`,
    '',
  ].join('\n'));

  const secretList = path.join(secretDir, 'reports.txt');
  fs.writeFileSync(secretList, 'registry.example/prod/api:1.2.3\tlinux/amd64\tsha256:missing-output\n');

  return runReportModule({
    RUNNER_TEMP: tmp,
    GITHUB_WORKSPACE: workspace,
    REPORT_LIST: reportList,
    SECRET_REPORT_LIST: secretList,
    BLOCKING_SEVERITY: 'high',
    PIPELINE_STAGE: 'prod',
    GITHUB_ENV_INPUT: '',
    VERSION: '1.2.3',
    P2P_SECURITY_IGNORE_HELPER: helperPath,
    GITHUB_SERVER_URL: 'https://github.example',
    GITHUB_REPOSITORY: 'org/repo',
    GITHUB_RUN_ID: '42',
  });
}

(async () => {
  const result = await runReport();
  assert.deepStrictEqual(result.failures, []);
  assert.strictEqual(result.outputs['security-risk'], 'critical');
  assert.strictEqual(result.outputs['scan-status'], 'ok');
  assert.strictEqual(result.outputs['total-count'], 3);
  assert.strictEqual(result.outputs['blocking-count'], 3);
  assert.strictEqual(result.outputs['secret-total-count'], 2);
  assert.strictEqual(result.outputs['secret-blocking-count'], 2);
  assert.deepStrictEqual(result.normalized.vulnerabilities.map(v => v.id).sort(), [
    'CVE-2026-12345',
    'CVE-2026-IMAGE-EXPIRED',
    'GHSA-xxjr-mmjv-4gpg',
  ]);
  assert.deepStrictEqual(result.normalized.secrets.map(s => ({
    image: s.image,
    id: s.id,
    path: s.path,
    blocking: s.isBlocking,
  })).sort((a, b) => a.path.localeCompare(b.path)), [
    {
      image: 'tools/prod/api',
      id: secretId('active-image-secret-value'),
      path: '/app/active.env',
      blocking: true,
    },
    {
      image: 'tools/prod/api',
      id: secretId('expired-image-secret-value'),
      path: '/app/expired.env',
      blocking: true,
    },
  ]);
  assert.deepStrictEqual(result.normalized.ignored.vulnerabilities.map(v => ({
    image: v.image,
    shortName: v.shortName,
    id: v.id,
    cve: v.cve,
    cveUrl: v.cveUrl,
    package: v.package,
    installed: v.installed,
    fixed: v.fixed,
    severity: v.severity,
    source: v.source,
    isBlocking: v.isBlocking,
    fullRef: v.fullRef,
    reason: v.ignore.reason,
    expires: v.ignore.expires,
  })), [
    {
      image: 'tools/prod/api',
      shortName: 'tools/prod/api',
      id: 'CVE-2026-IMAGE-1',
      cve: 'CVE-2026-IMAGE-1',
      cveUrl: 'https://example.test/CVE-2026-IMAGE-1',
      package: 'openssl',
      installed: '1.0.0',
      fixed: '1.0.1',
      severity: 'CRITICAL',
      source: 'debian',
      isBlocking: false,
      fullRef: 'europe-west2-docker.pkg.dev/project/tenant/prod/prod/tools/prod/api:1.2.3',
      reason: 'Base image package is accepted until upstream fixes it.',
      expires: '2026-09-01',
    },
  ]);
  assert.deepStrictEqual(result.normalized.ignored.secrets.map(s => ({
    image: s.image,
    id: s.id,
    path: s.path,
    reason: s.ignore.reason,
    expires: s.ignore.expires,
    blocking: s.isBlocking,
  })), [
    {
      image: 'tools/prod/api',
      id: secretId('accepted-image-secret-value'),
      path: '/app/accepted.env',
      reason: 'Synthetic image secret fixture is accepted.',
      expires: '2026-10-01',
      blocking: false,
    },
  ]);
  const normalizedText = JSON.stringify(result.normalized);
  assert(!normalizedText.includes('accepted-image-secret-value'));
  assert(!normalizedText.includes('active-image-secret-value'));
  assert(!result.summary.includes('### Ignored image findings'));
  assert(!result.summary.includes('Base image package is accepted until upstream fixes it.'));
  assert(!result.summary.includes('Synthetic image secret fixture is accepted.'));
  assert(!result.summary.includes('CVE-2026-IMAGE-1 | debian'));
  assert(result.summary.includes('[CVE-2026-12345](https://nvd.nist.gov/vuln/detail/CVE-2026-12345)'));
  assert(!result.summary.includes('https://example.test/CVE-2026-12345'));
  assert(result.summary.includes('curl lib\\|curl'));
  assert(result.summary.includes('2.0.1 patched\\|build'));
  assert(!result.summary.includes('curl\nlib|curl'));
  assert(!result.summary.includes('2.0.1\rpatched|build'));
  assert(result.summary.includes('[GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/ghsa-xxjr-mmjv-4gpg)'));
  assert(!result.summary.includes('https://example.test/GHSA-xxjr-mmjv-4gpg'));

  const markdownEscaping = await runMarkdownEscapingReport();
  assert.deepStrictEqual(markdownEscaping.failures, []);
  assert(markdownEscaping.summary.includes('<code>bad`script`&lt;script&gt;\\|img</code>'));
  assert(markdownEscaping.summary.includes('(linux/amd64&lt;script&gt;\\|plat)'));
  assert(markdownEscaping.summary.includes('Full ref: <code>registry.example/prod/bad`script`&lt;script&gt;\\|img:1.2.3</code>'));
  assert(markdownEscaping.summary.includes('[CVE-2026-LINK\\] \\[bad\\|row](https://example.test/CVE-2026-LINK)'));
  assert(!markdownEscaping.summary.includes('`bad`script`'));
  assert(!markdownEscaping.summary.includes('`sha256:`layer1``'));
  assert(markdownEscaping.summary.includes('<code>sha256:`layer1`</code>'));
  assert(!markdownEscaping.summary.includes('bad<script>|img'));
  assert(!markdownEscaping.summary.includes('linux/amd64<script>|plat'));

  await assert.rejects(
    () => runCorruptTrivyReport(),
    error => error.message.includes('Failed to process Trivy report'),
  );
  await assert.rejects(
    () => runCorruptTruffleHogReport(),
    error => error.message.includes('Failed to process TruffleHog image report'),
  );
  await assert.rejects(
    () => runMissingTrivyReport(),
    error => error.message.includes('Missing or empty Trivy report'),
  );
  await assert.rejects(
    () => runMalformedTruffleHogReportList(),
    error => error.message.includes('Malformed TruffleHog image report list entry'),
  );

  const unclassified = await runUnclassifiedImageReport();
  assert.deepStrictEqual(unclassified.failures, []);
  assert.strictEqual(unclassified.outputs['security-risk'], 'unclassified');
  assert.strictEqual(unclassified.outputs['scan-status'], 'ok');

  const offMode = await runOffModeAllIgnoredReport();
  assert.deepStrictEqual(offMode.failures, []);
  assert.strictEqual(offMode.outputs['security-risk'], 'ok');
  assert.strictEqual(offMode.outputs['scan-status'], 'ok');
  assert.strictEqual(offMode.outputs['total-count'], 0);
  assert.strictEqual(offMode.outputs['blocking-count'], 0);
  assert.strictEqual(offMode.outputs['secret-total-count'], 0);
  assert.strictEqual(offMode.outputs['secret-blocking-count'], 0);
  assert.deepStrictEqual(offMode.normalized.vulnerabilities, []);
  assert.deepStrictEqual(offMode.normalized.secrets, []);
  assert.deepStrictEqual(offMode.normalized.ignored.vulnerabilities.map(v => ({
    image: v.image,
    shortName: v.shortName,
    id: v.id,
    cve: v.cve,
    package: v.package,
    installed: v.installed,
    fixed: v.fixed,
    severity: v.severity,
    source: v.source,
    isBlocking: v.isBlocking,
    reason: v.ignore.reason,
  })), [
    {
      image: 'services/api',
      shortName: 'services/api',
      id: 'CVE-2026-OFF-IGNORED',
      cve: 'CVE-2026-OFF-IGNORED',
      package: 'openssl',
      installed: '-',
      fixed: '-',
      severity: 'CRITICAL',
      source: 'debian',
      isBlocking: false,
      reason: 'Accepted off-mode image vulnerability.',
    },
  ]);
  assert.deepStrictEqual(offMode.normalized.ignored.secrets.map(s => ({
    image: s.image,
    id: s.id,
    reason: s.ignore.reason,
    blocking: s.isBlocking,
  })), [
    {
      image: 'services/api',
      id: secretId('off-mode-image-secret-value'),
      reason: 'Accepted off-mode image secret.',
      blocking: false,
    },
  ]);
  assert(offMode.summary.includes('**Vulnerabilities:** 0 total · 0 blocking'));
  assert(offMode.summary.includes('· **Secrets:** 0 total · 0 blocking'));
  assert(!offMode.summary.includes('### Ignored image findings'));
  assert(!offMode.summary.includes('Accepted off-mode image vulnerability.'));
  assert(!offMode.summary.includes('Accepted off-mode image secret.'));
  const imageStatusSteps = readStatusStepNames(path.resolve(__dirname, '../../workflows/p2p-workflow-image-scan.yaml'));
  assert.deepStrictEqual(imageStatusSteps, [
    '      - name: "Output security risk: ${{ needs.image-scan.outputs.security-risk || \'unknown\' }}; scan: ${{ needs.image-scan.outputs.scan-status || \'failed\' }}"',
  ]);
  console.log('image security ignore report fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
