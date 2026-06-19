const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const VALID_STAGES = ['fast-feedback', 'extended-test', 'prod'];

function validateStage(stage, core) {
  if (!VALID_STAGES.includes(stage)) {
    core.setFailed(`Unknown pipeline-stage '${stage}'. Expected: fast-feedback|extended-test|prod.`);
    return false;
  }
  return true;
}

function splitEntries(output) {
  return String(output || '').trim().split(/[\s,]+/).filter(Boolean);
}

async function resolveImages({
  core,
  env = process.env,
  execFileSyncImpl = execFileSync,
} = {}) {
  const stage = env.PIPELINE_STAGE;
  if (!validateStage(stage, core)) return;

  function runMake(target) {
    return execFileSyncImpl('make', ['--no-print-directory', target], {
      encoding: 'utf8',
      cwd: env.WORKING_DIR,
    });
  }

  function makeTargetExists(target) {
    try {
      execFileSyncImpl('make', ['--no-print-directory', '-q', target], {
        cwd: env.WORKING_DIR,
        stdio: 'ignore',
      });
      return true;
    } catch (err) {
      // `make -q` returns 1 for targets that exist but would run, including PHONY targets.
      // Missing targets return 2, which is the only case that should trigger fallback.
      return err.status !== 2;
    }
  }

  function standardRefs(images) {
    const registry = `${env.REGION}-docker.pkg.dev/${env.PROJECT_ID}/tenant/${env.TENANT_NAME}/${stage}`;
    return images.map(img => `${registry}/${img}:${env.VERSION}`);
  }

  const inputImages = splitEntries(env.IMAGE_NAMES || '');
  let refs;
  if (inputImages.length > 0) {
    refs = standardRefs(inputImages);
  } else if (makeTargetExists('p2p-images')) {
    const images = splitEntries(runMake('p2p-images'));
    refs = standardRefs(images);
  } else {
    refs = [];
  }
  if (refs.length === 0) {
    core.setFailed('Neither image-names nor p2p-images produced any image references; nothing to scan.');
    return;
  }
  core.setOutput('image-refs', refs.join('\n'));
  core.info('Resolved image references:');
  refs.forEach(r => core.info(`  - ${r}`));
}

async function pullImages({
  core,
  env = process.env,
  fsImpl = fs,
  pathImpl = path,
  execFileSyncImpl = execFileSync,
} = {}) {
  const refs = env.IMAGE_REFS.split('\n').filter(Boolean);
  const listPath = pathImpl.join(env.RUNNER_TEMP, 'pulled-images.txt');
  fsImpl.writeFileSync(listPath, '');
  core.setOutput('list-path', listPath);
  for (const ref of refs) {
    // One inspect per ref: `{{json .}}` exposes `.manifest.manifests[]` for OCI indexes / Docker manifest
    // lists, and `.manifest.digest` + `.image.{os,architecture,variant}` for single-manifest images.
    let info;
    try {
      const out = execFileSyncImpl('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .}}'], { encoding: 'utf8' });
      info = JSON.parse(out);
    } catch (err) {
      core.setFailed(`Could not inspect ${ref}: ${err.message}`);
      return;
    }
    let entries;
    if (Array.isArray(info.manifest?.manifests)) {
      entries = info.manifest.manifests
        .filter(m => m.platform && m.platform.os !== 'unknown' && m.platform.architecture !== 'unknown')
        .map(m => ({
          platform: `${m.platform.os}/${m.platform.architecture}` +
                    (m.platform.variant ? `/${m.platform.variant}` : ''),
          digest: m.digest,
        }));
    } else {
      const img = info.image;
      if (!img || !img.os || !img.architecture || !info.manifest?.digest) {
        core.setFailed(`Could not resolve platform/digest for ${ref}.`);
        return;
      }
      entries = [{
        platform: `${img.os}/${img.architecture}` + (img.variant ? `/${img.variant}` : ''),
        digest: info.manifest.digest,
      }];
    }
    if (entries.length === 0) {
      core.setFailed(`Could not enumerate platforms for ${ref}.`);
      return;
    }
    for (const { platform, digest } of entries) {
      core.info(`Pulling ${ref} (${platform}) @ ${digest}`);
      execFileSyncImpl('docker', ['pull', '--platform', platform, ref], { stdio: 'inherit' });
      fsImpl.appendFileSync(listPath, `${ref}\t${platform}\t${digest}\n`);
    }
  }
}

function sanitizeReportName(value) {
  return value.replace(/[\/:@]/g, '_');
}

async function scanImages({
  core,
  env = process.env,
  fsImpl = fs,
  pathImpl = path,
  execFileSyncImpl = execFileSync,
} = {}) {
  const reportsDir = pathImpl.join(env.RUNNER_TEMP, 'trivy');
  const reportList = pathImpl.join(reportsDir, 'reports.txt');
  fsImpl.mkdirSync(reportsDir, { recursive: true });
  fsImpl.writeFileSync(reportList, '');
  core.setOutput('reports-dir', reportsDir);
  core.setOutput('report-list', reportList);

  const ignoreUnfixed = env.IGNORE_UNFIXED === 'true';

  const list = env.PULLED_LIST;
  const entries = fsImpl.readFileSync(list, 'utf8').split('\n').filter(Boolean);
  for (const line of entries) {
    const [ref, plat, digest] = line.split('\t');
    const refName = ref.split('@')[0];
    const target = `${refName}@${digest}`;
    const out = pathImpl.join(reportsDir, `${sanitizeReportName(ref)}-${sanitizeReportName(plat)}.json`);
    const args = [
      'image',
      '--format', 'json',
      '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL',
      ...(ignoreUnfixed ? ['--ignore-unfixed'] : []),
      '--scanners', 'vuln',
      '--exit-code', '0',
      '--output', out,
      target,
    ];
    core.info(`Scanning ${ref} (${plat}) @ ${digest}`);
    execFileSyncImpl('trivy', args, { stdio: 'inherit' });
    fsImpl.appendFileSync(reportList, `${ref}\t${plat}\t${digest}\t${out}\n`);
  }
}

function loadSecurityIgnoreHelper(helperPath) {
  return require(helperPath || path.join(__dirname, 'p2p-security-ignore.js'));
}

function isSensitiveSecretKey(key) {
  const normalized = String(key || '').toLowerCase();
  return normalized.includes('raw') || normalized === 'redacted';
}

function stripRawSecretFields(value) {
  if (Array.isArray(value)) return value.map(stripRawSecretFields);
  if (!value || typeof value !== 'object') return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveSecretKey(key)) continue;
    redacted[key] = stripRawSecretFields(item);
  }
  return redacted;
}

function redactTruffleHogJsonl(output, p2pRedactedSecretId) {
  return String(output || '').split('\n').filter(Boolean).map(line => {
    let finding;
    try {
      finding = JSON.parse(line);
    } catch {
      throw new Error('malformed TruffleHog JSONL');
    }
    const id = p2pRedactedSecretId(finding.RawV2 || finding.Raw || finding.Redacted || line);
    return JSON.stringify({ ...stripRawSecretFields(finding), id });
  }).join('\n');
}

async function secretScanImages({
  core,
  env = process.env,
  fsImpl = fs,
  pathImpl = path,
  spawnSyncImpl = spawnSync,
  securityIgnore = loadSecurityIgnoreHelper(env.P2P_SECURITY_IGNORE_HELPER),
} = {}) {
  const { p2pRedactedSecretId } = securityIgnore;

  const reportsDir = pathImpl.join(env.RUNNER_TEMP, 'trufflehog-image');
  const reportList = pathImpl.join(reportsDir, 'reports.txt');
  fsImpl.mkdirSync(reportsDir, { recursive: true });
  fsImpl.writeFileSync(reportList, '');
  core.setOutput('reports-dir', reportsDir);
  core.setOutput('report-list', reportList);

  const entries = fsImpl.readFileSync(env.PULLED_LIST, 'utf8').split('\n').filter(Boolean);
  for (const line of entries) {
    const [ref, plat, digest] = line.split('\t');
    const refName = ref.split('@')[0];
    const target = `docker://${refName}@${digest}`;
    const out = pathImpl.join(reportsDir, `${sanitizeReportName(ref)}-${sanitizeReportName(plat)}.jsonl`);
    core.info(`Scanning ${ref} (${plat}) @ ${digest} for secrets`);
    const proc = spawnSyncImpl(
      'trufflehog',
      ['docker', '--image', target, '--fail', '--json', '--no-update'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
    if (proc.status !== 0 && proc.status !== 183) {
      core.setFailed(`trufflehog exited with ${proc.status}: ${proc.stderr || proc.error?.message || '(no stderr)'}`);
      return;
    }
    let redactedOutput;
    try {
      redactedOutput = redactTruffleHogJsonl(proc.stdout || '', p2pRedactedSecretId);
    } catch {
      core.setFailed(`Failed to parse TruffleHog image JSONL for ${ref} (${plat}).`);
      return;
    }
    fsImpl.writeFileSync(out, redactedOutput ? `${redactedOutput}\n` : '');
    fsImpl.appendFileSync(reportList, `${ref}\t${plat}\t${digest}\t${out}\n`);
  }
}

function keyFor(ref, platform, digest) {
  return [ref, platform, digest].join('\u0000');
}

function displayPath(file) {
  return String(file || '').split(path.sep).join('/');
}

function title(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function resolveReportPath(reportPath, reportRoot, artifactPrefix, expectedExtension, kind, core, options = {}) {
  if (!reportPath) {
    core.setFailed(`Missing ${kind} report path.`);
    return null;
  }
  if (!reportRoot || !fs.existsSync(reportRoot)) {
    core.setFailed(`Missing ${kind} report root.`);
    return null;
  }
  const root = path.resolve(reportRoot);
  const realRoot = fs.realpathSync(reportRoot);
  const resolved = path.resolve(path.isAbsolute(reportPath) ? reportPath : path.join(root, reportPath));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    core.setFailed(`${title(kind)} report path must stay inside report root: ${displayPath(reportPath)}`);
    return null;
  }
  const relativePath = path.relative(root, resolved).split(path.sep).join('/');
  if (
    !relativePath
    || path.isAbsolute(relativePath)
    || relativePath === '..'
    || relativePath.startsWith('../')
    || relativePath.split('/').includes('..')
  ) {
    core.setFailed(`${title(kind)} report path must be artifact-relative without parent traversal: ${displayPath(reportPath)}`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    core.setFailed(`${title(kind)} report path does not exist: ${displayPath(reportPath)}`);
    return null;
  }
  const linkStat = fs.lstatSync(resolved);
  if (linkStat.isSymbolicLink()) {
    core.setFailed(`${title(kind)} report path must not be a symlink: ${relativePath}`);
    return null;
  }
  const realResolved = fs.realpathSync(resolved);
  if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}${path.sep}`)) {
    core.setFailed(`${title(kind)} report path must stay inside report root: ${displayPath(reportPath)}`);
    return null;
  }
  const stat = fs.statSync(realResolved);
  if (!stat.isFile()) {
    core.setFailed(`${title(kind)} report path is not a file: ${displayPath(reportPath)}`);
    return null;
  }
  if (stat.size === 0 && !options.allowEmpty) {
    core.setFailed(`${title(kind)} report is empty: ${relativePath}`);
    return null;
  }
  if (!relativePath.endsWith(expectedExtension)) {
    core.setFailed(`${title(kind)} report path must end in ${expectedExtension}: ${relativePath}`);
    return null;
  }
  return {
    sourcePath: realResolved,
    artifactPath: `${artifactPrefix}/${relativePath}`,
  };
}

function readReportList(listPath, kind, reportRoot, artifactPrefix, expectedExtension, core, options = {}) {
  if (!listPath || !fs.existsSync(listPath) || fs.statSync(listPath).size === 0) {
    return new Map();
  }
  const reports = new Map();
  for (const line of fs.readFileSync(listPath, 'utf8').split('\n').filter(Boolean)) {
    const fields = line.split('\t');
    if (fields.length !== 4) {
      core.setFailed(`Malformed ${kind} report list entry: ${line}`);
      return null;
    }
    const [imageRef, platform, digest, reportPath] = fields;
    if (!imageRef || !platform || !digest || !reportPath) {
      core.setFailed(`Malformed ${kind} report list entry: ${line}`);
      return null;
    }
    const key = keyFor(imageRef, platform, digest);
    if (reports.has(key)) {
      core.setFailed(`Duplicate ${kind} report for ${imageRef} (${platform}) @ ${digest}.`);
      return null;
    }
    const resolvedReport = resolveReportPath(reportPath, reportRoot, artifactPrefix, expectedExtension, kind, core, options);
    if (!resolvedReport) return null;
    reports.set(key, { imageRef, platform, digest, ...resolvedReport });
  }
  return reports;
}

async function buildManifest({
  core,
  env = process.env,
} = {}) {
  const stage = env.PIPELINE_STAGE;
  if (!validateStage(stage, core)) return;

  const artifactRoot = path.join(env.RUNNER_TEMP, 'image-scan-artifact');
  const vulnerabilityReports = readReportList(
    env.REPORT_LIST,
    'vulnerability',
    env.REPORT_ROOT,
    'trivy',
    '.json',
    core,
  );
  if (!vulnerabilityReports) return;
  const secretReports = readReportList(
    env.SECRET_REPORT_LIST,
    'secret',
    env.SECRET_REPORT_ROOT,
    'trufflehog-image',
    '.jsonl',
    core,
    { allowEmpty: true },
  );
  if (!secretReports) return;

  const reports = [];
  const artifactPaths = new Set();
  function addArtifactPath(file) {
    if (artifactPaths.has(file.artifactPath)) {
      core.setFailed(`Duplicate artifact report path: ${file.artifactPath}`);
      return false;
    }
    artifactPaths.add(file.artifactPath);
    return true;
  }

  for (const vulnReport of vulnerabilityReports.values()) {
    const key = keyFor(vulnReport.imageRef, vulnReport.platform, vulnReport.digest);
    const secretReport = secretReports.get(key);
    if (!secretReport) {
      core.setFailed(`Missing secret report for ${vulnReport.imageRef} (${vulnReport.platform}) @ ${vulnReport.digest}.`);
      return;
    }
    if (!addArtifactPath(vulnReport) || !addArtifactPath(secretReport)) return;
    reports.push({
      imageRef: vulnReport.imageRef,
      platform: vulnReport.platform,
      digest: vulnReport.digest,
      vulnerabilityReport: vulnReport.artifactPath,
      secretReport: secretReport.artifactPath,
    });
  }
  for (const secretReport of secretReports.values()) {
    const key = keyFor(secretReport.imageRef, secretReport.platform, secretReport.digest);
    if (!vulnerabilityReports.has(key)) {
      core.setFailed(`Missing vulnerability report for ${secretReport.imageRef} (${secretReport.platform}) @ ${secretReport.digest}.`);
      return;
    }
  }

  if (reports.length === 0) {
    core.setFailed('No scanned image reports found; cannot build manifest.json.');
    return;
  }

  reports.sort((a, b) => (
    a.imageRef.localeCompare(b.imageRef)
    || a.platform.localeCompare(b.platform)
    || a.digest.localeCompare(b.digest)
  ));

  const manifest = {
    schemaVersion: 1,
    stage,
    reports,
  };
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(artifactRoot, { recursive: true });
  const copyReport = reportPath => {
    const destination = path.join(artifactRoot, ...reportPath.artifactPath.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(reportPath.sourcePath, destination);
  };
  for (const vulnReport of vulnerabilityReports.values()) copyReport(vulnReport);
  for (const secretReport of secretReports.values()) copyReport(secretReport);

  const manifestPath = path.join(artifactRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  core.setOutput('manifest-path', manifestPath);
  core.setOutput('artifact-dir', artifactRoot);
  core.info(`Wrote image scan manifest to ${manifestPath}`);
}

module.exports = {
  buildManifest,
  pullImages,
  redactTruffleHogJsonl,
  resolveImages,
  scanImages,
  secretScanImages,
  stripRawSecretFields,
};
