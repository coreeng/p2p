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
    Raw: 'unknown-secret-value',
    VerificationError: 'rate limited',
    SourceMetadata: { Data: { Git: {} } },
  }),
  JSON.stringify({
    DetectorName: 'Generic',
    Raw: 'unverified-secret-value',
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

const findings = redactedText.trim().split('\n').map(line => JSON.parse(line));
assert.strictEqual(findings.length, 3);

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
assert.strictEqual(findings[1].status, 'unknown');
assert.strictEqual(findings[1].detector, 'Slack');
assert.strictEqual(findings[1].url, null);
assert.strictEqual(findings[2].status, 'unverified');

console.log('source secret redaction fixtures passed');
