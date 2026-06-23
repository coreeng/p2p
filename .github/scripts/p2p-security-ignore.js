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

const toPosixPath = value => String(value || '').split(path.sep).join('/');
const normalizeRelativePath = value => {
  const normalized = toPosixPath(path.normalize(String(value || ''))).replace(/^\.\//, '');
  return normalized === '.' ? '' : normalized;
};

const isPathInsideOrEqual = (candidate, base) => {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

const sourcePathFilter = (value, label, options) => {
  assertString(value, label);
  if (!options.sourcePathBase || !options.sourcePathRoot) return value;
  const resolved = path.resolve(options.sourcePathBase, value);
  if (!isPathInsideOrEqual(resolved, options.sourcePathBase)) {
    throw new Error(`${label} must not resolve outside the ignore file directory`);
  }
  return normalizeRelativePath(path.relative(options.sourcePathRoot, resolved));
};

const validateSecurityIgnore = (parsed, options = {}) => {
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
  const normalizedVulnerabilities = [];
  for (const [index, entry] of vulnerabilities.entries()) {
    const label = `source.vulnerabilities[${index}]`;
    validateIgnoreEntryBase(entry, label, ['id', 'reason', 'package', 'paths', 'expires']);
    if (entry.package !== undefined) assertString(entry.package, `${label}.package`);
    let normalizedPaths;
    if (entry.paths !== undefined) {
      if (!Array.isArray(entry.paths)) throw new Error(`${label}.paths must be a list`);
      normalizedPaths = entry.paths.map((item, pathIndex) => sourcePathFilter(item, `${label}.paths[${pathIndex}]`, options));
    }
    normalizedVulnerabilities.push({
      ...entry,
      ...(normalizedPaths === undefined ? {} : { paths: normalizedPaths }),
    });
  }
  const normalizedSecrets = [];
  for (const [index, entry] of secrets.entries()) {
    const label = `source.secrets[${index}]`;
    validateIgnoreEntryBase(entry, label, ['id', 'reason', 'path', 'expires']);
    normalizedSecrets.push({
      ...entry,
      ...(entry.path === undefined ? {} : { path: sourcePathFilter(entry.path, `${label}.path`, options) }),
    });
  }
  return { images: normalizedImages, source: { vulnerabilities: normalizedVulnerabilities, secrets: normalizedSecrets } };
};

const parseSecurityIgnoreFile = (ignorePath, options = {}) => {
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
    return validateSecurityIgnore(parsed, options);
  } catch (error) {
    throw new Error(`Invalid .p2p-security-ignore.yaml: ${error.message}`);
  }
};

const emptySecurityIgnore = () => ({ present: false, images: [], source: { vulnerabilities: [], secrets: [] } });

const loadSecurityIgnore = workspace => {
  const ignorePath = path.join(workspace || '', '.p2p-security-ignore.yaml');
  if (!workspace || !fs.existsSync(ignorePath)) {
    return emptySecurityIgnore();
  }
  return { present: true, ...parseSecurityIgnoreFile(ignorePath) };
};

const mergeSecurityIgnores = ignores => ({
  present: ignores.some(ignore => ignore.present),
  images: ignores.flatMap(ignore => ignore.images),
  source: {
    vulnerabilities: ignores.flatMap(ignore => ignore.source.vulnerabilities),
    secrets: ignores.flatMap(ignore => ignore.source.secrets),
  },
});

const loadImageSecurityIgnore = (workspace, workingDirectory = '') => {
  const rootIgnore = loadSecurityIgnore(workspace);
  if (!workspace) return rootIgnore;
  const rootDirectory = path.resolve(workspace);
  const selectedDirectory = path.resolve(rootDirectory, workingDirectory || '.');
  if (!isPathInsideOrEqual(selectedDirectory, rootDirectory)) {
    throw new Error('working-directory must resolve inside GITHUB_WORKSPACE');
  }
  if (selectedDirectory === rootDirectory) return rootIgnore;

  const selectedIgnorePath = path.join(selectedDirectory, '.p2p-security-ignore.yaml');
  if (!fs.existsSync(selectedIgnorePath)) return rootIgnore;

  return mergeSecurityIgnores([
    rootIgnore,
    { present: true, ...parseSecurityIgnoreFile(selectedIgnorePath) },
  ]);
};

const discoverSourceIgnoreFiles = workspace => {
  if (!workspace || !fs.existsSync(workspace)) return [];
  const ignoreFiles = [];
  const visit = directory => {
    for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        if (dirent.name !== '.git') visit(fullPath);
      } else if (dirent.isFile() && dirent.name === '.p2p-security-ignore.yaml') {
        ignoreFiles.push(fullPath);
      }
    }
  };
  visit(workspace);
  return ignoreFiles.sort((a, b) => a.localeCompare(b));
};

const loadSourceSecurityIgnores = workspace => {
  const files = discoverSourceIgnoreFiles(workspace);
  if (files.length === 0) {
    return { present: false, sourceIgnores: [] };
  }

  return {
    present: true,
    sourceIgnores: files.map(file => {
      const directory = path.dirname(file);
      const parsed = parseSecurityIgnoreFile(file, {
        sourcePathRoot: workspace,
        sourcePathBase: directory,
      });
      return {
        directory: normalizeRelativePath(path.relative(workspace, directory)),
        source: parsed.source,
      };
    }),
  };
};

const activeIgnore = entry => entry.expires === undefined || entry.expires >= todayIso();

const p2pRedactedSecretId = value => {
  const fingerprint = crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
  return `p2psec_${fingerprint}`;
};

const sourceScopes = ignore => {
  if (Array.isArray(ignore.sourceIgnores)) return ignore.sourceIgnores;
  return [{ directory: '', source: ignore.source }];
};

const sourceFindingPath = finding => normalizeRelativePath(finding.source || finding.file || '');

const sourceFindingInScope = (finding, scopedIgnore) => {
  if (!scopedIgnore.directory) return true;
  const findingPath = sourceFindingPath(finding);
  return findingPath === scopedIgnore.directory || findingPath.startsWith(`${scopedIgnore.directory}/`);
};

const findSourceVulnerabilityIgnore = (finding, ignore) => {
  for (const scopedIgnore of sourceScopes(ignore)) {
    if (!sourceFindingInScope(finding, scopedIgnore)) continue;
    const matched = scopedIgnore.source.vulnerabilities.find(entry => (
      activeIgnore(entry)
      && entry.id === finding.id
      && (entry.package === undefined || entry.package === finding.package)
      && (entry.paths === undefined || entry.paths.includes(sourceFindingPath(finding)))
    ));
    if (matched) return matched;
  }
  return undefined;
};

const findSourceSecretIgnore = (finding, ignore) => {
  for (const scopedIgnore of sourceScopes(ignore)) {
    if (!sourceFindingInScope(finding, scopedIgnore)) continue;
    const matched = scopedIgnore.source.secrets.find(entry => (
      activeIgnore(entry)
      && entry.id === finding.id
      && (entry.path === undefined || entry.path === sourceFindingPath(finding))
    ));
    if (matched) return matched;
  }
  return undefined;
};

const findImageVulnerabilityIgnore = (finding, ignore, imageName) => {
  for (const image of ignore.images.filter(item => item.name === imageName)) {
    const matched = image.vulnerabilities.find(entry => (
      activeIgnore(entry)
      && entry.id === finding.id
      && (entry.package === undefined || entry.package === finding.package)
    ));
    if (matched) return matched;
  }
  return undefined;
};

const findImageSecretIgnore = (finding, ignore, imageName) => {
  for (const image of ignore.images.filter(item => item.name === imageName)) {
    const matched = image.secrets.find(entry => (
      activeIgnore(entry)
      && entry.id === finding.id
      && (entry.path === undefined || entry.path === finding.path)
    ));
    if (matched) return matched;
  }
  return undefined;
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
  loadImageSecurityIgnore,
  loadSourceSecurityIgnores,
  splitSourceVulnerabilities,
  splitSourceSecrets,
  splitImageVulnerabilities,
  splitImageSecrets,
  p2pRedactedSecretId,
  validateSecurityIgnore,
};
