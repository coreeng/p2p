const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildSourceSecurityReport } = require('../source-security-report.js');
const helperPath = path.resolve(__dirname, '../p2p-security-ignore.js');

async function runReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-ignore-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
    'version: 1',
    'source:',
    '  vulnerabilities:',
    '    - id: CVE-2026-0001',
    '      reason: Dev-only dependency is unreachable.',
    '      package: dev-only-tool',
    '      paths:',
    '        - package-lock.json',
    '      expires: 2026-09-01',
    '  secrets:',
    '    - id: source-secret-1',
    '      reason: Rotated credential retained until history rewrite.',
    '      path: docs/example.env',
    '      expires: 2026-10-01',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({
    Results: [
      {
        Target: 'package-lock.json',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-0001',
            PkgName: 'dev-only-tool',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-2026-0001',
          },
          {
            VulnerabilityID: 'CVE-2026-0002',
            PkgName: 'runtime-lib',
            InstalledVersion: '2.0.0',
            FixedVersion: '2.0.1',
            Severity: 'MEDIUM',
            PrimaryURL: 'https://example.test/CVE-2026-0002',
          },
          {
            VulnerabilityID: 'GHSA-xxjr-mmjv-4gpg',
            PkgName: 'lodash',
            InstalledVersion: '4.17.22',
            FixedVersion: '4.17.23',
            Severity: 'LOW',
            PrimaryURL: 'https://example.test/GHSA-xxjr-mmjv-4gpg',
          },
        ],
        Licenses: [
          {
            PkgName: 'runtime-lib',
            Name: 'GPL-3.0',
            Category: 'restricted',
            Severity: 'HIGH',
          },
        ],
      },
    ],
  }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), [
    JSON.stringify({
      id: 'source-secret-1',
      detector: 'Github',
      status: 'verified',
      file: 'docs/example.env',
      line: 3,
      commit: 'abcdef1234567890',
      url: 'https://example.test/blob/abcdef/docs/example.env#L3',
    }),
    JSON.stringify({
      id: 'source-secret-2',
      detector: 'Slack',
      status: 'unverified',
      file: 'docs/other.env',
      line: 7,
      commit: '123456abcdef7890',
      url: 'https://example.test/blob/123456/docs/other.env#L7',
    }),
  ].join('\n') + '\n');

  const outputs = {};
  let summary = '';
  const failures = [];
  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'high',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
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
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
  return {
    outputs,
    failures,
    summary,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

async function runReportWithoutIgnoreFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-no-ignore-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({
    Results: [
      {
        Target: 'package-lock.json',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2026-0001',
            PkgName: 'dev-only-tool',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-2026-0001',
          },
        ],
      },
    ],
  }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), '');

  const outputs = {};
  let summary = '';
  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'high',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
        P2P_SECURITY_IGNORE_HELPER: helperPath,
        GITHUB_SERVER_URL: 'https://github.example',
        GITHUB_REPOSITORY: 'org/repo',
        GITHUB_RUN_ID: '42',
      },
    },
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      setFailed: () => {},
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
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
  return { outputs, summary };
}

async function runAllIgnoredReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-all-ignored-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
    'version: 1',
    'source:',
    '  vulnerabilities:',
    '    - id: CVE-ALL-IGNORED',
    '      reason: Accepted source vulnerability.',
    '  secrets:',
    '    - id: all-ignored-secret',
    '      reason: Accepted source secret.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({
    Results: [
      {
        Target: 'package-lock.json',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-ALL-IGNORED',
            PkgName: 'ignored-package',
            Severity: 'CRITICAL',
            PrimaryURL: 'https://example.test/CVE-ALL-IGNORED',
          },
        ],
      },
    ],
  }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), [
    JSON.stringify({
      id: 'all-ignored-secret',
      detector: 'Github',
      status: 'verified',
      file: 'docs/ignored.env',
      line: 1,
      commit: 'abcdef1234567890',
      url: 'https://example.test/blob/abcdef/docs/ignored.env#L1',
    }),
  ].join('\n') + '\n');

  const outputs = {};
  let summary = '';
  const failures = [];
  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'high',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
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
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
  return {
    outputs,
    failures,
    summary,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

async function runReportWithMatcherEdgeCases() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-ignore-matcher-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
    'version: 1',
    'source:',
    '  vulnerabilities:',
    '    - id: CVE-ID-ONLY',
    '      reason: Accepted everywhere by ID.',
    '    - id: CVE-EXPIRED',
    '      reason: Expired vuln acceptance.',
    '      expires: 2020-01-01',
    '    - id: CVE-PKG-MISMATCH',
    '      reason: Different package only.',
    '      package: other-package',
    '    - id: CVE-PATH-MISMATCH',
    '      reason: Different source only.',
    '      paths:',
    '        - other-lock.json',
    '  secrets:',
    '    - id: secret-id-only',
    '      reason: Accepted secret by ID.',
    '    - id: secret-expired',
    '      reason: Expired secret acceptance.',
    '      expires: 2020-01-01',
    '    - id: secret-path-mismatch',
    '      reason: Different secret path only.',
    '      path: docs/other.env',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({
    Results: [
      {
        Target: 'package-lock.json',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-ID-ONLY', PkgName: 'id-only-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1', Severity: 'HIGH', PrimaryURL: 'https://example.test/CVE-ID-ONLY' },
          { VulnerabilityID: 'CVE-EXPIRED', PkgName: 'expired-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1', Severity: 'HIGH', PrimaryURL: 'https://example.test/CVE-EXPIRED' },
          { VulnerabilityID: 'CVE-PKG-MISMATCH', PkgName: 'actual-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1', Severity: 'HIGH', PrimaryURL: 'https://example.test/CVE-PKG-MISMATCH' },
          { VulnerabilityID: 'CVE-PATH-MISMATCH', PkgName: 'path-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1', Severity: 'HIGH', PrimaryURL: 'https://example.test/CVE-PATH-MISMATCH' },
        ],
      },
    ],
  }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), [
    JSON.stringify({ id: 'secret-id-only', detector: 'Github', status: 'verified', file: 'docs/id-only.env', line: 1, commit: 'abcdef1234567890', url: 'https://example.test/blob/abcdef/docs/id-only.env#L1' }),
    JSON.stringify({ id: 'secret-expired', detector: 'Github', status: 'verified', file: 'docs/expired.env', line: 2, commit: 'abcdef1234567890', url: 'https://example.test/blob/abcdef/docs/expired.env#L2' }),
    JSON.stringify({ id: 'secret-path-mismatch', detector: 'Github', status: 'verified', file: 'docs/actual.env', line: 3, commit: 'abcdef1234567890', url: 'https://example.test/blob/abcdef/docs/actual.env#L3' }),
  ].join('\n') + '\n');

  const outputs = {};
  const failures = [];
  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'high',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
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
        addRaw() {
          return this;
        },
        write() {
          return Promise.resolve();
        },
      },
    },
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
  return {
    outputs,
    failures,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

async function runOffModeVerifiedSecretReport() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-off-mode-secret-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({ Results: [] }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), [
    JSON.stringify({
      id: 'off-mode-verified-secret',
      detector: 'Github',
      status: 'verified',
      file: 'docs/off-mode.env',
      line: 5,
      commit: 'abcdef1234567890',
      url: 'https://example.test/blob/abcdef/docs/off-mode.env#L5',
    }),
  ].join('\n') + '\n');

  const outputs = {};
  const failures = [];
  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'off',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
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
        addRaw() {
          return this;
        },
        write() {
          return Promise.resolve();
        },
      },
    },
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
  return {
    outputs,
    failures,
    normalized: JSON.parse(fs.readFileSync(outputs['json-file'], 'utf8')),
  };
}

async function runReportWithInvalidIgnoreFile(ignoreFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-invalid-ignore-'));
  const root = path.join(tmp, 'source-security');
  const workspace = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(root, 'trivy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'trufflehog'), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), ignoreFile);
  fs.writeFileSync(path.join(root, 'trivy', 'trivy-fs.json'), JSON.stringify({ Results: [] }));
  fs.writeFileSync(path.join(root, 'trufflehog', 'findings.ndjson'), '');

  const sandbox = {
    process: {
      env: {
        ROOT: root,
        GITHUB_WORKSPACE: workspace,
        DRY_RUN: 'false',
        BLOCKING_SEVERITY: 'high',
        SCOPE: 'changes',
        BASE: 'base-sha',
        SECRET_SCAN_RESULT: 'success',
        SCA_SCAN_RESULT: 'success',
        P2P_SECURITY_IGNORE_HELPER: helperPath,
        GITHUB_SERVER_URL: 'https://github.example',
        GITHUB_REPOSITORY: 'org/repo',
        GITHUB_RUN_ID: '42',
      },
    },
    core: {
      setOutput: () => {},
      setFailed: () => {},
      info: () => {},
      warning: () => {},
      summary: {
        addRaw() {
          return this;
        },
        write() {
          return Promise.resolve();
        },
      },
    },
  };

  await buildSourceSecurityReport({ core: sandbox.core, env: sandbox.process.env });
}

(async () => {
  const result = await runReport();
  assert.deepStrictEqual(result.failures, []);
  assert.strictEqual(result.outputs['vulnerability-total'], 2);
  assert.strictEqual(result.outputs['vulnerability-blocking'], 0);
  assert.strictEqual(result.outputs['license-total'], 1);
  assert.strictEqual(result.outputs['secret-total'], 1);
  assert.strictEqual(result.outputs['secret-blocking'], 0);
  assert.deepStrictEqual(result.normalized.vulnerabilities.map(v => v.id), ['CVE-2026-0002', 'GHSA-xxjr-mmjv-4gpg']);
  assert.deepStrictEqual(result.normalized.secrets.map(s => s.id), ['source-secret-2']);
  assert.deepStrictEqual(result.normalized.ignored.vulnerabilities.map(v => ({
    id: v.id,
    reason: v.ignore.reason,
    expires: v.ignore.expires,
  })), [
    {
      id: 'CVE-2026-0001',
      reason: 'Dev-only dependency is unreachable.',
      expires: '2026-09-01',
    },
  ]);
  assert.deepStrictEqual(result.normalized.ignored.secrets.map(s => ({
    id: s.id,
    reason: s.ignore.reason,
    expires: s.ignore.expires,
  })), [
    {
      id: 'source-secret-1',
      reason: 'Rotated credential retained until history rewrite.',
      expires: '2026-10-01',
    },
  ]);
  assert(!result.summary.includes('### Ignored source findings'));
  assert(!result.summary.includes('Dev-only dependency is unreachable.'));
  assert(!result.summary.includes('Rotated credential retained until history rewrite.'));
  assert(!result.summary.includes('2026-09-01'));
  assert(result.summary.includes('[CVE-2026-0002](https://www.cve.org/CVERecord?id=CVE-2026-0002)'));
  assert(!result.summary.includes('https://example.test/CVE-2026-0002'));
  assert(result.summary.includes('[GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/ghsa-xxjr-mmjv-4gpg)'));
  assert(!result.summary.includes('https://example.test/GHSA-xxjr-mmjv-4gpg'));

  const noIgnore = await runReportWithoutIgnoreFile();
  assert.strictEqual(noIgnore.outputs['vulnerability-total'], 1);
  assert.strictEqual(noIgnore.outputs['vulnerability-blocking'], 1);
  assert(!noIgnore.summary.includes('**Ignored:**'));
  assert(!noIgnore.summary.includes('### Ignored source findings'));

  const allIgnored = await runAllIgnoredReport();
  assert.deepStrictEqual(allIgnored.failures, []);
  assert.strictEqual(allIgnored.outputs['vulnerability-total'], 0);
  assert.strictEqual(allIgnored.outputs['vulnerability-blocking'], 0);
  assert.strictEqual(allIgnored.outputs['secret-total'], 0);
  assert.strictEqual(allIgnored.outputs['secret-blocking'], 0);
  assert.deepStrictEqual(allIgnored.normalized.vulnerabilities, []);
  assert.deepStrictEqual(allIgnored.normalized.secrets, []);
  assert.deepStrictEqual(allIgnored.normalized.ignored.vulnerabilities.map(v => v.id), ['CVE-ALL-IGNORED']);
  assert.deepStrictEqual(allIgnored.normalized.ignored.secrets.map(s => s.id), ['all-ignored-secret']);
  assert(!allIgnored.summary.includes('### Ignored source findings'));
  assert(!allIgnored.summary.includes('Accepted source vulnerability.'));
  assert(!allIgnored.summary.includes('Accepted source secret.'));
  assert(!allIgnored.summary.includes('_No source security findings detected._'));

  const matcherEdges = await runReportWithMatcherEdgeCases();
  assert.deepStrictEqual(matcherEdges.failures, []);
  assert.strictEqual(matcherEdges.outputs['vulnerability-total'], 3);
  assert.strictEqual(matcherEdges.outputs['vulnerability-blocking'], 3);
  assert.strictEqual(matcherEdges.outputs['secret-total'], 2);
  assert.strictEqual(matcherEdges.outputs['secret-blocking'], 2);
  assert.deepStrictEqual(matcherEdges.normalized.ignored.vulnerabilities.map(v => v.id), ['CVE-ID-ONLY']);
  assert.deepStrictEqual(matcherEdges.normalized.vulnerabilities.map(v => v.id).sort(), [
    'CVE-EXPIRED',
    'CVE-PATH-MISMATCH',
    'CVE-PKG-MISMATCH',
  ]);
  assert.deepStrictEqual(matcherEdges.normalized.ignored.secrets.map(s => s.id), ['secret-id-only']);
  assert.deepStrictEqual(matcherEdges.normalized.secrets.map(s => s.id).sort(), [
    'secret-expired',
    'secret-path-mismatch',
  ]);

  const offModeVerifiedSecret = await runOffModeVerifiedSecretReport();
  assert.deepStrictEqual(offModeVerifiedSecret.failures, []);
  assert.strictEqual(offModeVerifiedSecret.outputs['secret-total'], 1);
  assert.strictEqual(offModeVerifiedSecret.outputs['secret-blocking'], 0);
  assert.deepStrictEqual(offModeVerifiedSecret.normalized.secrets.map(s => ({
    id: s.id,
    status: s.status,
    blocking: s.blocking,
  })), [
    {
      id: 'off-mode-verified-secret',
      status: 'verified',
      blocking: false,
    },
  ]);

  for (const [name, ignoreFile, expected] of [
    ['malformed YAML', 'version: 1\nsource:\n  vulnerabilities:\n    - id: CVE-1\n      reason: [unterminated\n', 'Invalid .p2p-security-ignore.yaml'],
    ['unsupported version', 'version: 2\nsource: {}\n', 'ignore file version must be 1'],
    ['missing required field', 'version: 1\nsource:\n  vulnerabilities:\n    - id: CVE-1\n', 'source.vulnerabilities[0].reason must be a non-empty string'],
    ['invalid source shape', 'version: 1\nsource:\n  vulnerabilities:\n    id: CVE-1\n', 'source.vulnerabilities must be a list'],
    ['invalid expiry', 'version: 1\nsource:\n  secrets:\n    - id: source-secret-1\n      reason: test\n      expires: 2026-02-31\n', 'source.secrets[0].expires must be a valid calendar date'],
    ['invalid image entry', 'version: 1\nimages:\n  - vulnerabilities:\n      - id: CVE-2026-IMAGE\n        reason: image accepted risk\n', 'images[0].name must be a non-empty string'],
    ['invalid image vulnerability shape', 'version: 1\nimages:\n  - name: api\n    vulnerabilities:\n      id: CVE-2026-IMAGE\n', 'images[0].vulnerabilities must be a list'],
    ['invalid image vulnerability entry', 'version: 1\nimages:\n  - name: api\n    vulnerabilities:\n      - id: CVE-2026-IMAGE\n        paths:\n          - package-lock.json\n        reason: image accepted risk\n', 'images[0].vulnerabilities[0] has unsupported field: paths'],
    ['invalid image secret entry', 'version: 1\nimages:\n  - name: api\n    secrets:\n      - id: image-secret-1\n        expires: 2026-09-01\n', 'images[0].secrets[0].reason must be a non-empty string'],
  ]) {
    await assert.rejects(
      () => runReportWithInvalidIgnoreFile(ignoreFile),
      error => error.message.includes(expected),
      name,
    );
  }
  console.log('source security ignore report fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
