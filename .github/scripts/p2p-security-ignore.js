const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const todayIso = () => new Date().toISOString().slice(0, 10);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const assertKeys = (value, allowed, label) => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} has unsupported field: ${key}`);
  }
};

const assertString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
};

const assertExpiry = (value, label) => {
  if (value === undefined) return;
  assertString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
};

const validateIgnoreEntryBase = (entry, label, allowed) => {
  if (!isPlainObject(entry)) throw new Error(`${label} must be an object`);
  assertKeys(entry, allowed, label);
  assertString(entry.id, `${label}.id`);
  assertString(entry.reason, `${label}.reason`);
  assertExpiry(entry.expires, `${label}.expires`);
};

const validateSecurityIgnore = parsed => {
  if (!isPlainObject(parsed)) throw new Error('ignore file must be a YAML object');
  assertKeys(parsed, ['version', 'source', 'images'], 'ignore file');
  if (parsed.version !== 1) throw new Error('ignore file version must be 1');

  const images = parsed.images === undefined ? [] : parsed.images;
  if (!Array.isArray(images)) throw new Error('images must be a list');
  const normalizedImages = [];
  for (const [index, image] of images.entries()) {
    const label = `images[${index}]`;
    if (!isPlainObject(image)) throw new Error(`${label} must be an object`);
    assertKeys(image, ['name', 'vulnerabilities', 'secrets'], label);
    assertString(image.name, `${label}.name`);
    const imageVulnerabilities = image.vulnerabilities === undefined ? [] : image.vulnerabilities;
    const imageSecrets = image.secrets === undefined ? [] : image.secrets;
    if (!Array.isArray(imageVulnerabilities)) throw new Error(`${label}.vulnerabilities must be a list`);
    if (!Array.isArray(imageSecrets)) throw new Error(`${label}.secrets must be a list`);
    for (const [entryIndex, entry] of imageVulnerabilities.entries()) {
      const entryLabel = `${label}.vulnerabilities[${entryIndex}]`;
      validateIgnoreEntryBase(entry, entryLabel, ['id', 'reason', 'package', 'expires']);
      if (entry.package !== undefined) assertString(entry.package, `${entryLabel}.package`);
    }
    for (const [entryIndex, entry] of imageSecrets.entries()) {
      const entryLabel = `${label}.secrets[${entryIndex}]`;
      validateIgnoreEntryBase(entry, entryLabel, ['id', 'reason', 'path', 'expires']);
      if (entry.path !== undefined) assertString(entry.path, `${entryLabel}.path`);
    }
    normalizedImages.push({
      name: image.name,
      vulnerabilities: imageVulnerabilities,
      secrets: imageSecrets,
    });
  }

  const source = parsed.source === undefined ? {} : parsed.source;
  if (!isPlainObject(source)) throw new Error('source must be an object');
  assertKeys(source, ['vulnerabilities', 'secrets'], 'source');
  const vulnerabilities = source.vulnerabilities === undefined ? [] : source.vulnerabilities;
  const secrets = source.secrets === undefined ? [] : source.secrets;
  if (!Array.isArray(vulnerabilities)) throw new Error('source.vulnerabilities must be a list');
  if (!Array.isArray(secrets)) throw new Error('source.secrets must be a list');
  for (const [index, entry] of vulnerabilities.entries()) {
    const label = `source.vulnerabilities[${index}]`;
    validateIgnoreEntryBase(entry, label, ['id', 'reason', 'package', 'paths', 'expires']);
    if (entry.package !== undefined) assertString(entry.package, `${label}.package`);
    if (entry.paths !== undefined) {
      if (!Array.isArray(entry.paths)) throw new Error(`${label}.paths must be a list`);
      for (const [pathIndex, item] of entry.paths.entries()) assertString(item, `${label}.paths[${pathIndex}]`);
    }
  }
  for (const [index, entry] of secrets.entries()) {
    const label = `source.secrets[${index}]`;
    validateIgnoreEntryBase(entry, label, ['id', 'reason', 'path', 'expires']);
    if (entry.path !== undefined) assertString(entry.path, `${label}.path`);
  }
  return { images: normalizedImages, source: { vulnerabilities, secrets } };
};

const loadSecurityIgnore = workspace => {
  const ignorePath = path.join(workspace || '', '.p2p-security-ignore.yaml');
  if (!workspace || !fs.existsSync(ignorePath)) {
    return { present: false, images: [], source: { vulnerabilities: [], secrets: [] } };
  }
  let parsed;
  try {
    parsed = JSON.parse(execFileSync(
      'ruby',
      ['-ryaml', '-rjson', '-rdate', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read, permitted_classes: [Date], aliases: false))'],
      { input: fs.readFileSync(ignorePath, 'utf8'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ));
  } catch (error) {
    throw new Error(`Invalid .p2p-security-ignore.yaml: ${error.stderr || error.message}`);
  }
  try {
    return { present: true, ...validateSecurityIgnore(parsed) };
  } catch (error) {
    throw new Error(`Invalid .p2p-security-ignore.yaml: ${error.message}`);
  }
};

const activeIgnore = entry => entry.expires === undefined || entry.expires >= todayIso();

const p2pRedactedSecretId = value => {
  const fingerprint = crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
  return `p2psec_${fingerprint}`;
};

const findSourceVulnerabilityIgnore = (finding, ignore) => ignore.source.vulnerabilities.find(entry => (
  activeIgnore(entry)
  && entry.id === finding.id
  && (entry.package === undefined || entry.package === finding.package)
  && (entry.paths === undefined || entry.paths.includes(finding.source))
));

const findSourceSecretIgnore = (finding, ignore) => ignore.source.secrets.find(entry => (
  activeIgnore(entry)
  && entry.id === finding.id
  && (entry.path === undefined || entry.path === finding.file)
));

const findImage = (ignore, imageName) => ignore.images.find(image => image.name === imageName);

const findImageVulnerabilityIgnore = (finding, ignore, imageName) => {
  const image = findImage(ignore, imageName);
  if (!image) return undefined;
  return image.vulnerabilities.find(entry => (
    activeIgnore(entry)
    && entry.id === finding.id
    && (entry.package === undefined || entry.package === finding.package)
  ));
};

const findImageSecretIgnore = (finding, ignore, imageName) => {
  const image = findImage(ignore, imageName);
  if (!image) return undefined;
  return image.secrets.find(entry => (
    activeIgnore(entry)
    && entry.id === finding.id
    && (entry.path === undefined || entry.path === finding.path)
  ));
};

const ignoreMetadata = entry => ({
  reason: entry.reason,
  ...(entry.expires === undefined ? {} : { expires: entry.expires }),
});

const splitIgnored = (findings, findIgnore) => {
  const active = [];
  const ignored = [];
  for (const finding of findings) {
    const matched = findIgnore(finding);
    if (matched) {
      ignored.push({ ...finding, blocking: false, ignore: ignoreMetadata(matched) });
    } else {
      active.push(finding);
    }
  }
  return { active, ignored };
};

const splitSourceVulnerabilities = (findings, ignore) => (
  splitIgnored(findings, finding => findSourceVulnerabilityIgnore(finding, ignore))
);

const splitSourceSecrets = (findings, ignore) => (
  splitIgnored(findings, finding => findSourceSecretIgnore(finding, ignore))
);

const splitImageVulnerabilities = (findings, ignore, imageName) => (
  splitIgnored(findings, finding => findImageVulnerabilityIgnore(finding, ignore, imageName))
);

const splitImageSecrets = (findings, ignore, imageName) => (
  splitIgnored(findings, finding => findImageSecretIgnore(finding, ignore, imageName))
);

module.exports = {
  loadSecurityIgnore,
  splitSourceVulnerabilities,
  splitSourceSecrets,
  splitImageVulnerabilities,
  splitImageSecrets,
  p2pRedactedSecretId,
  validateSecurityIgnore,
};
