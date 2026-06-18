const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const script = path.join(repoRoot, '.github/scripts/source-secret-redact.js');
const { redactSourceSecrets } = require(script);

assert.strictEqual(typeof redactSourceSecrets, 'function');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-secret-redact-'));
const input = path.join(tmp, 'findings.ndjson');
const output = path.join(tmp, 'redacted.ndjson');

const rawSecret = 'super-secret-value';
const unknownSecret = 'unknown-secret-value';
const unverifiedSecret = 'unverified-secret-value';
const rawV2OnlySecretA = 'raw-v2-only-secret-a';
const rawV2OnlySecretB = 'raw-v2-only-secret-b';
fs.writeFileSync(input, [
  JSON.stringify({
    DetectorName: 'Github',
    Raw: rawSecret,
    Verified: true,
    SourceMetadata: {
      Data: {
        Git: {
          commit: 'abcdef1234567890',
          file: 'docs/secrets file+name.env',
          line: 7,
        },
      },
    },
  }),
  JSON.stringify({
    DetectorType: 'Slack',
    Raw: unknownSecret,
    VerificationError: 'rate limited',
    SourceMetadata: { Data: { Git: {} } },
  }),
  JSON.stringify({
    DetectorName: 'Generic',
    Raw: unverifiedSecret,
    SourceMetadata: { Data: { Git: {} } },
  }),
  JSON.stringify({
    DetectorName: 'Generic',
    RawV2: rawV2OnlySecretA,
    SourceMetadata: { Data: { Git: {} } },
  }),
  JSON.stringify({
    DetectorName: 'Generic',
    RawV2: rawV2OnlySecretB,
    SourceMetadata: { Data: { Git: {} } },
  }),
  '',
].join('\n'));

execFileSync('node', [script, input, output], {
  env: {
    ...process.env,
    SERVER_URL: 'https://github.example',
    REPOSITORY: 'org/repo',
  },
  stdio: 'pipe',
});

const redactedText = fs.readFileSync(output, 'utf8');
assert(!redactedText.includes(rawSecret));
assert(!redactedText.includes(unknownSecret));
assert(!redactedText.includes(unverifiedSecret));
assert(!redactedText.includes(rawV2OnlySecretA));
assert(!redactedText.includes(rawV2OnlySecretB));

const findings = redactedText.trim().split('\n').map(line => JSON.parse(line));
assert.strictEqual(findings.length, 5);

const expectedId = crypto.createHash('sha256').update(`Github\0${rawSecret}`).digest('hex');
assert.deepStrictEqual(findings[0], {
  id: expectedId,
  detector: 'Github',
  status: 'verified',
  file: 'docs/secrets file+name.env',
  line: 7,
  commit: 'abcdef1234567890',
  url: 'https://github.example/org/repo/blob/abcdef1234567890/docs/secrets%20file%2Bname.env#L7',
});

const rawV2Ids = findings.slice(3).map(finding => finding.id);
assert.strictEqual(new Set(rawV2Ids).size, 2);
assert.deepStrictEqual(rawV2Ids, [
  crypto.createHash('sha256').update(`Generic\0${rawV2OnlySecretA}`).digest('hex'),
  crypto.createHash('sha256').update(`Generic\0${rawV2OnlySecretB}`).digest('hex'),
]);
assert.strictEqual(findings[1].status, 'unknown');
assert.strictEqual(findings[1].detector, 'Slack');
assert.strictEqual(findings[1].url, null);
assert.strictEqual(findings[2].status, 'unverified');

console.log('source secret redaction fixtures passed');
