const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  scanImages,
  secretScanImages,
} = require('../image-scan-helpers');
const { p2pRedactedSecretId } = require('../p2p-security-ignore');

async function runScanFunction(scanFunction, options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-targets-'));
  const pulledList = path.join(tmp, 'pulled-images.txt');
  fs.writeFileSync(
    pulledList,
    [
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3\tlinux/amd64\tsha256:api',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3\tlinux/arm64\tsha256:worker',
    ].join('\n') + '\n',
  );

  const calls = [];
  const outputs = {};
  const failures = [];
  const common = {
    env: {
      RUNNER_TEMP: tmp,
      PULLED_LIST: pulledList,
      SEVERITY: 'CRITICAL,HIGH',
      IGNORE_UNFIXED: 'true',
    },
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      setFailed: message => { failures.push(message); },
      info: () => {},
    },
  };

  if (scanFunction === scanImages) {
    await scanFunction({
      ...common,
      execFileSyncImpl(command, args) {
        calls.push({ command, args });
        return '';
      },
    });
  } else {
    await scanFunction({
      ...common,
      securityIgnore: { p2pRedactedSecretId },
      spawnSyncImpl(command, args) {
        calls.push({ command, args });
        return {
          status: 183,
          stdout: [
            JSON.stringify({
              id: 'scanner-provided-secret-id',
              DetectorName: 'Github',
              Verified: true,
              Raw: 'raw-image-secret-value',
              RawV2: 'raw-image-secret-value-v2',
              SourceMetadata: {
                Data: {
                  Docker: {
                    layer: 'sha256:layer',
                    file: '/app/secret.env',
                  },
                },
              },
              ExtraData: {
                RawSecret: 'nested-raw-image-secret-value',
              },
            }),
            ...(options.malformedSecretOutput ? ['malformed raw-image-secret-value'] : []),
            '',
          ].join('\n'),
          stderr: '',
        };
      },
    });
  }

  return { calls, outputs, failures };
}

(async () => {
  const trivyRun = await runScanFunction(scanImages);
  assert.deepStrictEqual(trivyRun.failures, []);
  assert.deepStrictEqual(
    trivyRun.calls.map(call => call.args[call.args.length - 1]),
    [
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3@sha256:api',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3@sha256:worker',
    ],
  );

  const secretRun = await runScanFunction(secretScanImages);
  assert.deepStrictEqual(secretRun.failures, []);
  assert.deepStrictEqual(
    secretRun.calls.map(call => call.args[2]),
    [
      'docker://europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3@sha256:api',
      'docker://europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/worker:1.2.3@sha256:worker',
    ],
  );
  for (const line of fs.readFileSync(secretRun.outputs['report-list'], 'utf8').trim().split('\n')) {
    const reportPath = line.split('\t')[3];
    assert.strictEqual(path.extname(reportPath), '.jsonl');
    const reportText = fs.readFileSync(reportPath, 'utf8');
    assert(!reportText.includes('"Raw"'));
    assert(!reportText.includes('"RawV2"'));
    assert(!reportText.includes('RawSecret'));
    assert(!reportText.includes('raw-image-secret-value'));
    assert(!reportText.includes('raw-image-secret-value-v2'));
    assert(!reportText.includes('nested-raw-image-secret-value'));
    assert(!reportText.includes('malformed raw-image-secret-value'));
    const findings = reportText.trim().split('\n').map(item => JSON.parse(item));
    const finding = findings.find(item => item.DetectorName === 'Github');
    assert.match(finding.id, /^p2psec_[0-9a-f]{16}$/);
    assert.notStrictEqual(finding.id, 'scanner-provided-secret-id');
    assert.strictEqual(finding.DetectorName, 'Github');
    assert.strictEqual(finding.SourceMetadata.Data.Docker.file, '/app/secret.env');
  }

  const malformedSecretRun = await runScanFunction(secretScanImages, { malformedSecretOutput: true });
  assert.deepStrictEqual(
    malformedSecretRun.failures,
    ['Failed to parse TruffleHog image JSONL for europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/prod/api:1.2.3 (linux/amd64).'],
  );
  assert(!malformedSecretRun.failures.join('\n').includes('raw-image-secret-value'));
  assert.strictEqual(fs.readFileSync(malformedSecretRun.outputs['report-list'], 'utf8'), '');

  console.log('image scan target fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
