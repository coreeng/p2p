const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadSecurityIgnore,
  validateSecurityIgnore,
  splitSourceVulnerabilities,
  splitSourceSecrets,
  splitImageVulnerabilities,
  splitImageSecrets,
  p2pRedactedSecretId,
} = require('../p2p-security-ignore.js');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'security-ignore-helper-'));
fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
  'version: 1',
  'images:',
  '  - name: api',
  '    vulnerabilities:',
  '      - id: CVE-IMAGE',
  '        reason: accepted image risk',
  '        package: image-package',
  '    secrets:',
  '      - id: image-secret',
  '        reason: accepted image secret',
  '        path: /app/example.env',
  'source:',
  '  vulnerabilities:',
  '    - id: CVE-ID-ONLY',
  '      reason: accepted source vuln',
  '    - id: CVE-EXPIRED',
  '      reason: expired source vuln',
  '      expires: 2020-01-01',
  '    - id: CVE-PACKAGE-MISMATCH',
  '      reason: different package',
  '      package: other-package',
  '  secrets:',
  '    - id: secret-id-only',
  '      reason: accepted source secret',
  '    - id: secret-expired',
  '      reason: expired source secret',
  '      expires: 2020-01-01',
  '    - id: secret-path-mismatch',
  '      reason: different path',
  '      path: docs/other.env',
  '',
].join('\n'));

const ignore = loadSecurityIgnore(workspace);
assert.strictEqual(ignore.present, true);
assert.deepStrictEqual(ignore.images, [
  {
    name: 'api',
    vulnerabilities: [
      { id: 'CVE-IMAGE', reason: 'accepted image risk', package: 'image-package' },
    ],
    secrets: [
      { id: 'image-secret', reason: 'accepted image secret', path: '/app/example.env' },
    ],
  },
]);

assert.deepStrictEqual(validateSecurityIgnore({
  version: 1,
  images: [
    {
      name: 'worker',
      vulnerabilities: [
        { id: 'CVE-WORKER', reason: 'accepted worker risk', expires: '2026-09-01' },
      ],
      secrets: [
        { id: 'worker-secret', reason: 'accepted worker secret', path: '/app/secret.env', expires: '2026-10-01' },
      ],
    },
  ],
  source: {},
}).images, [
  {
    name: 'worker',
    vulnerabilities: [
      { id: 'CVE-WORKER', reason: 'accepted worker risk', expires: '2026-09-01' },
    ],
    secrets: [
      { id: 'worker-secret', reason: 'accepted worker secret', path: '/app/secret.env', expires: '2026-10-01' },
    ],
  },
]);

const vulnerabilities = [
  { id: 'CVE-ID-ONLY', package: 'any-package', source: 'package-lock.json', blocking: true },
  { id: 'CVE-EXPIRED', package: 'expired-package', source: 'package-lock.json', blocking: true },
  { id: 'CVE-PACKAGE-MISMATCH', package: 'actual-package', source: 'package-lock.json', blocking: true },
];
const vulnSplit = splitSourceVulnerabilities(vulnerabilities, ignore);
assert.deepStrictEqual(vulnSplit.ignored.map(v => v.id), ['CVE-ID-ONLY']);
assert.deepStrictEqual(vulnSplit.active.map(v => v.id), ['CVE-EXPIRED', 'CVE-PACKAGE-MISMATCH']);
assert.deepStrictEqual(vulnSplit.ignored[0].ignore, { reason: 'accepted source vuln' });
assert.strictEqual(vulnSplit.ignored[0].blocking, false);

const secrets = [
  { id: 'secret-id-only', file: 'docs/id.env', blocking: true },
  { id: 'secret-expired', file: 'docs/expired.env', blocking: true },
  { id: 'secret-path-mismatch', file: 'docs/actual.env', blocking: true },
];
const secretSplit = splitSourceSecrets(secrets, ignore);
assert.deepStrictEqual(secretSplit.ignored.map(s => s.id), ['secret-id-only']);
assert.deepStrictEqual(secretSplit.active.map(s => s.id), ['secret-expired', 'secret-path-mismatch']);

const imageVulnerabilities = [
  { id: 'CVE-IMAGE', package: 'image-package', blocking: true },
  { id: 'CVE-IMAGE', package: 'other-package', blocking: true },
  { id: 'CVE-OTHER', package: 'image-package', blocking: true },
];
const imageVulnSplit = splitImageVulnerabilities(imageVulnerabilities, ignore, 'api');
assert.deepStrictEqual(imageVulnSplit.ignored.map(v => v.package), ['image-package']);
assert.deepStrictEqual(imageVulnSplit.active.map(v => v.id), ['CVE-IMAGE', 'CVE-OTHER']);
assert.deepStrictEqual(imageVulnSplit.ignored[0].ignore, { reason: 'accepted image risk' });
assert.strictEqual(splitImageVulnerabilities(imageVulnerabilities, ignore, 'worker').ignored.length, 0);

const imageSecrets = [
  { id: 'image-secret', path: '/app/example.env', blocking: true },
  { id: 'image-secret', path: '/app/other.env', blocking: true },
  { id: 'other-secret', path: '/app/example.env', blocking: true },
];
const imageSecretSplit = splitImageSecrets(imageSecrets, ignore, 'api');
assert.deepStrictEqual(imageSecretSplit.ignored.map(s => s.path), ['/app/example.env']);
assert.deepStrictEqual(imageSecretSplit.active.map(s => s.id), ['image-secret', 'other-secret']);
assert.strictEqual(splitImageSecrets(imageSecrets, ignore, 'worker').ignored.length, 0);
assert.strictEqual(p2pRedactedSecretId('stable-image-secret'), p2pRedactedSecretId('stable-image-secret'));
assert.match(p2pRedactedSecretId('stable-image-secret'), /^p2psec_[0-9a-f]{16}$/);
assert(!p2pRedactedSecretId('stable-image-secret').includes('stable-image-secret'));

fs.writeFileSync(path.join(workspace, '.p2p-security-ignore.yaml'), [
  'version: 1',
  'images:',
  '  - vulnerabilities:',
  '      - id: CVE-IMAGE',
  '        reason: missing image name',
  '',
].join('\n'));
assert.throws(
  () => loadSecurityIgnore(workspace),
  /images\[0\]\.name must be a non-empty string/,
);

const emptyWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'security-ignore-empty-'));
assert.deepStrictEqual(loadSecurityIgnore(emptyWorkspace), {
  present: false,
  images: [],
  source: { vulnerabilities: [], secrets: [] },
});

console.log('security ignore helper fixtures passed');
