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

const emptySecurityIgnore = () => ({
  present: false,
  ignoreFiles: [],
  images: [],
  source: { vulnerabilities: [], secrets: [] },
});

const parseSecurityIgnoreFile = ignorePath => {
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
    return validateSecurityIgnore(parsed);
  } catch (error) {
    throw new Error(`Invalid .p2p-security-ignore.yaml: ${error.message}`);
  }
};

const withIgnoreMetadata = (entry, metadata) => {
  const copy = { ...entry };
  Object.defineProperty(copy, '__p2pIgnoreFile', { value: metadata, enumerable: false });
  return copy;
};

const attachIgnoreMetadata = (ignore, metadata) => ({
  images: ignore.images.map(image => ({
    name: image.name,
    vulnerabilities: image.vulnerabilities.map(entry => withIgnoreMetadata(entry, metadata)),
    secrets: image.secrets.map(entry => withIgnoreMetadata(entry, metadata)),
  })),
  source: {
    vulnerabilities: ignore.source.vulnerabilities.map(entry => withIgnoreMetadata(entry, metadata)),
    secrets: ignore.source.secrets.map(entry => withIgnoreMetadata(entry, metadata)),
  },
});

const mergeSecurityIgnores = loadedFiles => {
  if (loadedFiles.length === 0) return emptySecurityIgnore();
  return {
    present: true,
    ignoreFiles: loadedFiles.map(file => file.metadata),
    images: loadedFiles.flatMap(file => file.ignore.images),
    source: {
      vulnerabilities: loadedFiles.flatMap(file => file.ignore.source.vulnerabilities),
      secrets: loadedFiles.flatMap(file => file.ignore.source.secrets),
    },
  };
};

const toRepoRelativePath = (workspace, targetPath) => {
  const relative = path.relative(workspace, targetPath);
  return relative === '' ? '.' : relative.split(path.sep).join('/');
};

const normalizeWorkingDirectory = (workspace, workingDirectory) => {
  const raw = String(workingDirectory || '').trim();
  if (raw === '' || raw === '.') return { isRoot: true, absolutePath: workspace, relativePath: '.' };
  if (path.isAbsolute(raw)) throw new Error(`working-directory must be repository-relative: ${raw}`);
  const absolutePath = path.resolve(workspace, raw);
  const relativePath = toRepoRelativePath(workspace, absolutePath);
  if (relativePath === '..' || relativePath.startsWith('../')) {
    throw new Error(`working-directory must stay within the repository: ${raw}`);
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`working-directory does not exist: ${relativePath}`);
  }
  const realWorkspace = fs.realpathSync(workspace);
  const realWorkingDirectory = fs.realpathSync(absolutePath);
  const realRelativePath = path.relative(realWorkspace, realWorkingDirectory);
  if (realRelativePath === '..' || realRelativePath.startsWith('../')) {
    throw new Error(`working-directory must stay within the repository: ${raw}`);
  }
  return { isRoot: realRelativePath === '', absolutePath, relativePath };
};

const assertRealPathWithinWorkspace = (workspace, targetPath, label) => {
  const realWorkspace = fs.realpathSync(workspace);
  const realTarget = fs.realpathSync(targetPath);
  const realRelativePath = path.relative(realWorkspace, realTarget);
  if (realRelativePath === '..' || realRelativePath.startsWith('../')) {
    throw new Error(`${label} must stay within the repository`);
  }
};

const loadSecurityIgnore = workspace => {
  const ignorePath = path.join(workspace || '', '.p2p-security-ignore.yaml');
  if (!workspace || !fs.existsSync(ignorePath)) {
    return emptySecurityIgnore();
  }
  const metadata = { scope: 'repository', path: '.p2p-security-ignore.yaml' };
  return mergeSecurityIgnores([
    { metadata, ignore: attachIgnoreMetadata(parseSecurityIgnoreFile(ignorePath), metadata) },
  ]);
};

const loadSourceSecurityIgnore = (workspace, workingDirectory) => {
  if (!workspace) {
    const rawWorkingDirectory = String(workingDirectory || '').trim();
    if (rawWorkingDirectory !== '' && rawWorkingDirectory !== '.') {
      throw new Error('GITHUB_WORKSPACE is required when working-directory is not repository root');
    }
    return emptySecurityIgnore();
  }
  const root = path.resolve(workspace);
  const workingDir = normalizeWorkingDirectory(root, workingDirectory);
  const rootIgnorePath = path.join(root, '.p2p-security-ignore.yaml');
  const appIgnorePath = path.join(workingDir.absolutePath, '.p2p-security-ignore.yaml');
  const files = [];

  if (fs.existsSync(rootIgnorePath)) {
    const metadata = { scope: 'repository', path: '.p2p-security-ignore.yaml' };
    files.push({ metadata, ignore: attachIgnoreMetadata(parseSecurityIgnoreFile(rootIgnorePath), metadata) });
  }

  const appIgnoreIsRootIgnore = fs.existsSync(rootIgnorePath)
    && fs.existsSync(appIgnorePath)
    && fs.realpathSync(appIgnorePath) === fs.realpathSync(rootIgnorePath);
  if (!workingDir.isRoot && fs.existsSync(appIgnorePath) && !appIgnoreIsRootIgnore) {
    assertRealPathWithinWorkspace(root, appIgnorePath, 'application ignore file');
    const metadata = { scope: 'application', path: `${workingDir.relativePath}/.p2p-security-ignore.yaml` };
    files.unshift({ metadata, ignore: attachIgnoreMetadata(parseSecurityIgnoreFile(appIgnorePath), metadata) });
  }

  return mergeSecurityIgnores(files);
};

const activeIgnore = entry => entry.expires === undefined || entry.expires >= todayIso();

const p2pRedactedSecretId = value => {
  const fingerprint = crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
  return `p2psec_${fingerprint}`;
};

const findSourceVulnerabilityIgnores = (finding, ignore) => ignore.source.vulnerabilities.filter(entry => (
  activeIgnore(entry)
  && entry.id === finding.id
  && (entry.package === undefined || entry.package === finding.package)
  && (entry.paths === undefined || entry.paths.includes(finding.source))
));

const findSourceSecretIgnores = (finding, ignore) => ignore.source.secrets.filter(entry => (
  activeIgnore(entry)
  && entry.id === finding.id
  && (entry.path === undefined || entry.path === finding.file)
));

const findImages = (ignore, imageName) => ignore.images.filter(image => image.name === imageName);

const findImageVulnerabilityIgnores = (finding, ignore, imageName) => {
  const images = findImages(ignore, imageName);
  return images.flatMap(image => image.vulnerabilities.filter(entry => (
    activeIgnore(entry)
    && entry.id === finding.id
    && (entry.package === undefined || entry.package === finding.package)
  )));
};

const findImageSecretIgnores = (finding, ignore, imageName) => {
  const images = findImages(ignore, imageName);
  return images.flatMap(image => image.secrets.filter(entry => (
    activeIgnore(entry)
    && entry.id === finding.id
    && (entry.path === undefined || entry.path === finding.path)
  )));
};

const ignoreMetadata = entry => ({
  scope: entry.__p2pIgnoreFile?.scope || 'repository',
  path: entry.__p2pIgnoreFile?.path || '.p2p-security-ignore.yaml',
  reason: entry.reason,
  ...(entry.expires === undefined ? {} : { expires: entry.expires }),
});

const splitIgnored = (findings, findIgnores) => {
  const active = [];
  const ignored = [];
  for (const finding of findings) {
    const matched = findIgnores(finding);
    if (matched.length > 0) {
      ignored.push({ ...finding, blocking: false, matchedIgnores: matched.map(ignoreMetadata) });
    } else {
      active.push(finding);
    }
  }
  return { active, ignored };
};

const splitSourceVulnerabilities = (findings, ignore) => (
  splitIgnored(findings, finding => findSourceVulnerabilityIgnores(finding, ignore))
);

const splitSourceSecrets = (findings, ignore) => (
  splitIgnored(findings, finding => findSourceSecretIgnores(finding, ignore))
);

const splitImageVulnerabilities = (findings, ignore, imageName) => (
  splitIgnored(findings, finding => findImageVulnerabilityIgnores(finding, ignore, imageName))
);

const splitImageSecrets = (findings, ignore, imageName) => (
  splitIgnored(findings, finding => findImageSecretIgnores(finding, ignore, imageName))
);

module.exports = {
  loadSecurityIgnore,
  loadImageSecurityIgnore: loadSourceSecurityIgnore,
  loadSourceSecurityIgnore,
  splitSourceVulnerabilities,
  splitSourceSecrets,
  splitImageVulnerabilities,
  splitImageSecrets,
  p2pRedactedSecretId,
  validateSecurityIgnore,
};
