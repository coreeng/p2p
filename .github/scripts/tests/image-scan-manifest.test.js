const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildManifest,
  pullImages,
} = require('../image-scan-helpers');

async function runPullScript(imageRefs, inspectByRef) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-pull-'));
  const outputs = {};
  const failures = [];
  const pulls = [];

  await pullImages({
    env: {
      RUNNER_TEMP: tmp,
      IMAGE_REFS: imageRefs.join('\n'),
    },
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      setFailed: message => { failures.push(message); },
      info: () => {},
    },
    execFileSyncImpl(command, args) {
      assert.strictEqual(command, 'docker');
      if (args[0] === 'buildx') {
        const ref = args[3];
        if (!inspectByRef[ref]) throw new Error(`unexpected inspect ref ${ref}`);
        return JSON.stringify(inspectByRef[ref]);
      }
      if (args[0] === 'pull') {
        pulls.push(args);
        return '';
      }
      throw new Error(`unexpected docker args ${args.join(' ')}`);
    },
  });

  return { outputs, failures, pulls };
}

async function runManifestScript({ stage, vulnLines = [], secretLines = [], vulnRawLines = null, secretRawLines = null }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-manifest-'));
  const trivyDir = path.join(tmp, 'trivy');
  const secretDir = path.join(tmp, 'trufflehog-image');
  fs.mkdirSync(trivyDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });
  const vulnList = path.join(trivyDir, 'reports.txt');
  const secretList = path.join(secretDir, 'reports.txt');
  const writeReport = (dir, name) => {
    if (name.includes('..')) return name;
    const report = path.join(dir, name);
    if (name.startsWith('missing-')) return report;
    fs.writeFileSync(report, name.startsWith('empty-') ? '' : '{}');
    return report;
  };
  fs.writeFileSync(
    vulnList,
    vulnRawLines === null
      ? vulnLines.map(([ref, plat, digest, name]) => `${ref}\t${plat}\t${digest}\t${writeReport(trivyDir, name)}`).join('\n') + '\n'
      : vulnRawLines.join('\n') + '\n',
  );
  fs.writeFileSync(
    secretList,
    secretRawLines === null
      ? secretLines.map(([ref, plat, digest, name]) => `${ref}\t${plat}\t${digest}\t${writeReport(secretDir, name)}`).join('\n') + '\n'
      : secretRawLines.join('\n') + '\n',
  );

  const outputs = {};
  const failures = [];

  await buildManifest({
    env: {
      RUNNER_TEMP: tmp,
      PIPELINE_STAGE: stage,
      REPORT_LIST: vulnList,
      SECRET_REPORT_LIST: secretList,
      REPORT_ROOT: trivyDir,
      SECRET_REPORT_ROOT: secretDir,
    },
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      setFailed: message => { failures.push(message); },
      info: () => {},
      warning: () => {},
    },
  });

  return {
    manifest: outputs['manifest-path'] ? JSON.parse(fs.readFileSync(outputs['manifest-path'], 'utf8')) : null,
    manifestPath: outputs['manifest-path'],
    artifactDir: outputs['artifact-dir'],
    tmp,
    failures,
  };
}

(async () => {
  const singlePlatform = await runPullScript(
    ['europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3'],
    {
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3': {
        manifest: { digest: 'sha256:resolved' },
        image: { os: 'linux', architecture: 'amd64' },
      },
    },
  );
  assert.deepStrictEqual(singlePlatform.failures, []);
  assert.deepStrictEqual(
    fs.readFileSync(singlePlatform.outputs['list-path'], 'utf8').trim(),
    'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3\tlinux/amd64\tsha256:resolved',
  );

  const multiPlatform = await runPullScript(
    ['europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3'],
    {
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3': {
        manifest: {
          digest: 'sha256:index',
          manifests: [
            { platform: { os: 'linux', architecture: 'amd64' }, digest: 'sha256:amd64' },
            { platform: { os: 'linux', architecture: 'arm64' }, digest: 'sha256:arm64' },
          ],
        },
      },
    },
  );
  assert.deepStrictEqual(multiPlatform.failures, []);
  assert.deepStrictEqual(
    fs.readFileSync(multiPlatform.outputs['list-path'], 'utf8').trim().split('\n'),
    [
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3\tlinux/amd64\tsha256:amd64',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3\tlinux/arm64\tsha256:arm64',
    ],
  );

  const multi = await runManifestScript({
    stage: 'extended-test',
    vulnLines: [
      ['ghcr.io/coreeng/zeta:1.0.0', 'linux/arm64', 'sha256:z-arm', 'zeta-arm-vuln.json'],
      ['ghcr.io/coreeng/alpha:1.0.0', 'linux/amd64', 'sha256:a-amd', 'alpha-amd-vuln.json'],
      ['ghcr.io/coreeng/zeta:1.0.0', 'linux/amd64', 'sha256:z-amd', 'zeta-amd-vuln.json'],
    ],
    secretLines: [
      ['ghcr.io/coreeng/zeta:1.0.0', 'linux/arm64', 'sha256:z-arm', 'zeta-arm-secret.jsonl'],
      ['ghcr.io/coreeng/alpha:1.0.0', 'linux/amd64', 'sha256:a-amd', 'alpha-amd-secret.jsonl'],
      ['ghcr.io/coreeng/zeta:1.0.0', 'linux/amd64', 'sha256:z-amd', 'zeta-amd-secret.jsonl'],
    ],
  });
  assert.deepStrictEqual(multi.failures, []);
  assert.strictEqual(path.basename(multi.manifestPath), 'manifest.json');
  assert.strictEqual(path.basename(multi.artifactDir), 'image-scan-artifact');
  assert.strictEqual(multi.manifestPath, path.join(multi.artifactDir, 'manifest.json'));
  assert.deepStrictEqual(multi.manifest, {
    schemaVersion: 1,
    stage: 'extended-test',
    reports: [
      {
        imageRef: 'ghcr.io/coreeng/alpha:1.0.0',
        platform: 'linux/amd64',
        digest: 'sha256:a-amd',
        vulnerabilityReport: 'trivy/alpha-amd-vuln.json',
        secretReport: 'trufflehog-image/alpha-amd-secret.jsonl',
      },
      {
        imageRef: 'ghcr.io/coreeng/zeta:1.0.0',
        platform: 'linux/amd64',
        digest: 'sha256:z-amd',
        vulnerabilityReport: 'trivy/zeta-amd-vuln.json',
        secretReport: 'trufflehog-image/zeta-amd-secret.jsonl',
      },
      {
        imageRef: 'ghcr.io/coreeng/zeta:1.0.0',
        platform: 'linux/arm64',
        digest: 'sha256:z-arm',
        vulnerabilityReport: 'trivy/zeta-arm-vuln.json',
        secretReport: 'trufflehog-image/zeta-arm-secret.jsonl',
      },
    ],
  });
  assert(fs.existsSync(path.join(multi.artifactDir, 'manifest.json')));
  assert(fs.existsSync(path.join(multi.artifactDir, 'trivy/alpha-amd-vuln.json')));
  assert(fs.existsSync(path.join(multi.artifactDir, 'trufflehog-image/alpha-amd-secret.jsonl')));
  assert(!fs.existsSync(path.join(multi.artifactDir, 'trivy/reports.txt')));
  assert(!fs.existsSync(path.join(multi.artifactDir, 'trufflehog-image/reports.txt')));

  const single = await runManifestScript({
    stage: 'fast-feedback',
    vulnLines: [
      ['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-vuln.json'],
    ],
    secretLines: [
      ['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-secret.jsonl'],
    ],
  });
  assert.deepStrictEqual(single.failures, []);
  assert.deepStrictEqual(single.manifest.reports, [
    {
      imageRef: 'ghcr.io/coreeng/single:1.0.0',
      platform: 'linux/amd64',
      digest: 'sha256:single',
      vulnerabilityReport: 'trivy/single-vuln.json',
      secretReport: 'trufflehog-image/single-secret.jsonl',
    },
  ]);

  const cleanSecretScan = await runManifestScript({
    stage: 'fast-feedback',
    vulnLines: [
      ['ghcr.io/coreeng/clean-secret:1.0.0', 'linux/amd64', 'sha256:clean', 'clean-secret-vuln.json'],
    ],
    secretLines: [
      ['ghcr.io/coreeng/clean-secret:1.0.0', 'linux/amd64', 'sha256:clean', 'empty-clean-secret.jsonl'],
    ],
  });
  assert.deepStrictEqual(cleanSecretScan.failures, []);
  assert.deepStrictEqual(cleanSecretScan.manifest.reports, [
    {
      imageRef: 'ghcr.io/coreeng/clean-secret:1.0.0',
      platform: 'linux/amd64',
      digest: 'sha256:clean',
      vulnerabilityReport: 'trivy/clean-secret-vuln.json',
      secretReport: 'trufflehog-image/empty-clean-secret.jsonl',
    },
  ]);

  const singleVuln = ['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-vuln.json'];
  const singleSecret = ['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-secret.jsonl'];
  const failureCases = [
    {
      name: 'missing secret report',
      input: { stage: 'fast-feedback', vulnLines: [singleVuln], secretLines: [] },
      failures: ['Missing secret report for ghcr.io/coreeng/single:1.0.0 (linux/amd64) @ sha256:single.'],
    },
    {
      name: 'missing vulnerability report',
      input: { stage: 'fast-feedback', vulnLines: [], secretLines: [singleSecret] },
      failures: ['Missing vulnerability report for ghcr.io/coreeng/single:1.0.0 (linux/amd64) @ sha256:single.'],
    },
    {
      name: 'invalid stage',
      input: { stage: 'qa', vulnLines: [singleVuln], secretLines: [singleSecret] },
      failures: ["Unknown pipeline-stage 'qa'. Expected: fast-feedback|extended-test|prod."],
    },
    {
      name: 'malformed list row',
      input: {
        stage: 'fast-feedback',
        vulnRawLines: ['ghcr.io/coreeng/single:1.0.0\tlinux/amd64\tsha256:single'],
        secretLines: [],
      },
      failures: ['Malformed vulnerability report list entry: ghcr.io/coreeng/single:1.0.0\tlinux/amd64\tsha256:single'],
    },
    {
      name: 'duplicate vulnerability report',
      input: {
        stage: 'fast-feedback',
        vulnLines: [
          singleVuln,
          ['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-vuln-copy.json'],
        ],
        secretLines: [singleSecret],
      },
      failures: ['Duplicate vulnerability report for ghcr.io/coreeng/single:1.0.0 (linux/amd64) @ sha256:single.'],
    },
    {
      name: 'missing report path',
      input: {
        stage: 'fast-feedback',
        vulnLines: [['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'missing-vuln.json']],
        secretLines: [singleSecret],
      },
      failures: result => ['Vulnerability report path does not exist: ' + path.join(result.tmp, 'trivy', 'missing-vuln.json')],
    },
    {
      name: 'no reports',
      input: { stage: 'fast-feedback' },
      failures: ['No scanned image reports found; cannot build manifest.json.'],
    },
    {
      name: 'bad secret extension',
      input: {
        stage: 'fast-feedback',
        vulnLines: [singleVuln],
        secretLines: [['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'single-secret.json']],
      },
      failures: ['Secret report path must end in .jsonl: single-secret.json'],
    },
    {
      name: 'parent traversal',
      input: {
        stage: 'fast-feedback',
        vulnLines: [['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', '../single-vuln.json']],
        secretLines: [singleSecret],
      },
      failures: ['Vulnerability report path must stay inside report root: ../single-vuln.json'],
    },
    {
      name: 'empty vulnerability report',
      input: {
        stage: 'fast-feedback',
        vulnLines: [['ghcr.io/coreeng/single:1.0.0', 'linux/amd64', 'sha256:single', 'empty-vuln.json']],
        secretLines: [singleSecret],
      },
      failures: ['Vulnerability report is empty: empty-vuln.json'],
    },
  ];
  for (const testCase of failureCases) {
    const result = await runManifestScript(testCase.input);
    const failures = typeof testCase.failures === 'function'
      ? testCase.failures(result)
      : testCase.failures;
    assert.deepStrictEqual(result.failures, failures, testCase.name);
  }

  console.log('image scan manifest fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
