const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const reportScript = fs.readFileSync('/tmp/image-security-report.js', 'utf8');
const helperPath = path.resolve(__dirname, '../p2p-security-ignore.js');
const workflowRequire = moduleName => (
  moduleName === './.github/scripts/p2p-security-ignore.js'
    ? (() => { throw new Error('workflow must not load helper from caller repository'); })()
    : require(moduleName)
);
const secretId = value => `p2psec_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;

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
            VulnerabilityID: 'CVE-2026-IMAGE-2',
            PkgName: 'curl',
            InstalledVersion: '2.0.0',
            FixedVersion: '2.0.1',
            Severity: 'HIGH',
            PrimaryURL: 'https://example.test/CVE-2026-IMAGE-2',
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

  const outputs = {};
  let summary = '';
  const failures = [];
  const sandbox = {
    process: {
      env: {
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
      },
    },
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
    require: workflowRequire,
  };

  await vm.runInNewContext(`(async () => {\n${reportScript}\n})()`, sandbox);
  return {
    outputs,
    failures,
    summary,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
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

  const outputs = {};
  let summary = '';
  const failures = [];
  const sandbox = {
    process: {
      env: {
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
      },
    },
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
    require: workflowRequire,
  };

  await vm.runInNewContext(`(async () => {\n${reportScript}\n})()`, sandbox);
  return {
    outputs,
    failures,
    summary,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

(async () => {
  const result = await runReport();
  assert.deepStrictEqual(result.failures, []);
  assert.strictEqual(result.outputs['total-count'], 2);
  assert.strictEqual(result.outputs['blocking-count'], 2);
  assert.strictEqual(result.outputs['secret-total-count'], 2);
  assert.strictEqual(result.outputs['secret-blocking-count'], 2);
  assert.deepStrictEqual(result.normalized.vulnerabilities.map(v => v.id).sort(), [
    'CVE-2026-IMAGE-2',
    'CVE-2026-IMAGE-EXPIRED',
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
    id: v.id,
    reason: v.ignore.reason,
    expires: v.ignore.expires,
  })), [
    {
      image: 'tools/prod/api',
      id: 'CVE-2026-IMAGE-1',
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
  assert(result.summary.includes('### Ignored image findings'));
  assert(result.summary.includes('Base image package is accepted until upstream fixes it.'));
  assert(result.summary.includes('Synthetic image secret fixture is accepted.'));
  assert(!result.summary.includes('CVE-2026-IMAGE-1 | debian'));

  const offMode = await runOffModeAllIgnoredReport();
  assert.deepStrictEqual(offMode.failures, []);
  assert.strictEqual(offMode.outputs['total-count'], 0);
  assert.strictEqual(offMode.outputs['blocking-count'], 0);
  assert.strictEqual(offMode.outputs['secret-total-count'], 0);
  assert.strictEqual(offMode.outputs['secret-blocking-count'], 0);
  assert.deepStrictEqual(offMode.normalized.vulnerabilities, []);
  assert.deepStrictEqual(offMode.normalized.secrets, []);
  assert.deepStrictEqual(offMode.normalized.ignored.vulnerabilities.map(v => ({
    image: v.image,
    id: v.id,
    reason: v.ignore.reason,
  })), [
    {
      image: 'services/api',
      id: 'CVE-2026-OFF-IGNORED',
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
  assert(offMode.summary.includes('### Ignored image findings'));
  console.log('image security ignore report fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
