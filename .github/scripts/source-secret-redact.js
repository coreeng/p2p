#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');

const secretId = (detector, raw) => crypto
  .createHash('sha256')
  .update(`${detector}\0${raw}`)
  .digest('hex');

const pathToUrlPath = file => String(file || '')
  .split('/')
  .map(segment => encodeURIComponent(segment))
  .join('/');

const redactFinding = (finding, { serverUrl, repository }) => {
  const detector = finding.DetectorName || finding.DetectorType || 'unknown';
  const raw = finding.Raw || '';
  const git = finding.SourceMetadata?.Data?.Git || {};
  const commit = git.commit || null;
  const file = git.file || null;
  const line = git.line || null;

  return {
    id: secretId(detector, raw),
    detector,
    status: finding.Verified === true ? 'verified' : (finding.VerificationError ? 'unknown' : 'unverified'),
    file,
    line,
    commit,
    url: commit
      ? `${serverUrl}/${repository}/blob/${commit}${file ? `/${pathToUrlPath(file)}` : ''}${line ? `#L${line}` : ''}`
      : null,
  };
};

const redactSourceSecrets = ({ inputPath, outputPath, serverUrl, repository }) => {
  if (!inputPath) throw new Error('findings input path required');
  if (!outputPath) throw new Error('redacted output path required');
  if (!serverUrl) throw new Error('SERVER_URL is required');
  if (!repository) throw new Error('REPOSITORY is required');

  fs.writeFileSync(outputPath, '');
  if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size === 0) return;

  const lines = fs.readFileSync(inputPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    let finding;
    try {
      finding = JSON.parse(line);
    } catch (error) {
      throw new Error(`Failed to process TruffleHog source finding ${inputPath}: ${error.message}`);
    }
    fs.appendFileSync(outputPath, `${JSON.stringify(redactFinding(finding, { serverUrl, repository }))}\n`);
  }
};

if (require.main === module) {
  try {
    redactSourceSecrets({
      inputPath: process.argv[2],
      outputPath: process.argv[3],
      serverUrl: process.env.SERVER_URL,
      repository: process.env.REPOSITORY,
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  redactSourceSecrets,
};
