const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveImages } = require('../image-scan-helpers');

async function runCase(name, makeOutputs, envOverrides = {}) {
  const calls = [];
  const outputs = {};
  const infos = [];
  const failures = [];
  const make = target => makeOutputs[target] ?? null;

  await resolveImages({
    env: {
      PIPELINE_STAGE: 'fast-feedback',
      REGION: 'europe-west2',
      PROJECT_ID: 'project-a',
      TENANT_NAME: 'tenant-a',
      VERSION: '1.2.3',
      WORKING_DIR: '/repo',
      GITHUB_WORKSPACE: '/repo',
      P2P_TENANT_NAME: 'tenant-a',
      P2P_APP_NAME: 'api',
      P2P_VERSION: '1.2.3',
      ...envOverrides,
    },
    core: {
      setOutput: (key, value) => { outputs[key] = value; },
      info: message => { infos.push(message); },
      setFailed: message => { failures.push(message); },
    },
    execFileSyncImpl(command, args, options) {
      calls.push({ command, args, cwd: options.cwd, env: options.env });
      assert.strictEqual(command, 'make', `${name}: command`);
      const target = args[args.length - 1];
      if (args.includes('-q')) {
        if (Object.prototype.hasOwnProperty.call(makeOutputs, target)) {
          return '';
        }
        const error = new Error(`No rule to make target '${target}'`);
        error.status = 2;
        throw error;
      }
      const output = make(target);
      if (output === null) {
        const error = new Error(`No rule to make target '${target}'`);
        error.status = 2;
        throw error;
      }
      return output;
    },
  });

  return { calls, outputs, infos, failures };
}

(async () => {
  const fallback = await runCase('missing image-names falls back', {
    'p2p-images': 'api ui\n',
  });
  assert.deepStrictEqual(fallback.failures, [], 'missing image-names falls back: no failures');
  assert.deepStrictEqual(
    fallback.outputs['image-refs'].split('\n'),
    [
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/api:1.2.3',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/ui:1.2.3',
    ],
  );
  assert.deepStrictEqual(
    fallback.calls.map(call => ({
      p2pTenantName: call.env.P2P_TENANT_NAME,
      p2pAppName: call.env.P2P_APP_NAME,
      p2pVersion: call.env.P2P_VERSION,
    })),
    [
      { p2pTenantName: 'tenant-a', p2pAppName: 'api', p2pVersion: '1.2.3' },
      { p2pTenantName: 'tenant-a', p2pAppName: 'api', p2pVersion: '1.2.3' },
    ],
    'missing image-names falls back with P2P make context',
  );

  const inputImages = await runCase(
    'image-names input wins',
    { 'p2p-images': 'also-not-used\n' },
    { IMAGE_NAMES: 'api,ui\nworker' },
  );
  assert.deepStrictEqual(inputImages.failures, [], 'image-names input wins: no failures');
  assert.deepStrictEqual(
    inputImages.outputs['image-refs'].split('\n'),
    [
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/api:1.2.3',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/ui:1.2.3',
      'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/worker:1.2.3',
    ],
  );
  assert.deepStrictEqual(inputImages.calls, [], 'image-names input wins: make is not called');

  const emptyInput = await runCase('empty image-names falls back', {
    'p2p-images': 'worker\n',
  }, { IMAGE_NAMES: ' , \n\t' });
  assert.deepStrictEqual(emptyInput.failures, [], 'empty image-names falls back: no failures');
  assert.strictEqual(
    emptyInput.outputs['image-refs'],
    'europe-west2-docker.pkg.dev/project-a/tenant/tenant-a/fast-feedback/worker:1.2.3',
  );

  const noTargets = await runCase('no targets is a no-op', {});
  assert.deepStrictEqual(noTargets.failures, []);
  assert.strictEqual(noTargets.outputs['image-refs'], '');
  assert(noTargets.infos.includes('No image references resolved; image scan will complete as a no-op.'));

  const unknownStage = await runCase(
    'unknown stage fails cleanly',
    { 'p2p-images': 'api\n' },
    { PIPELINE_STAGE: 'qa' },
  );
  assert.deepStrictEqual(
    unknownStage.failures,
    ["Unknown pipeline-stage 'qa'. Expected: fast-feedback|extended-test|prod."],
  );
  assert.strictEqual(unknownStage.outputs['image-refs'], undefined);
  assert.deepStrictEqual(unknownStage.calls, [], 'unknown stage fails before make');

  const escapedWorkingDirectory = await runCase(
    'working-directory escape fails before image resolution',
    { 'p2p-images': 'api\n' },
    { WORKING_DIR: '../outside', IMAGE_NAMES: 'api' },
  );
  assert.deepStrictEqual(
    escapedWorkingDirectory.failures,
    ['working-directory must resolve inside GITHUB_WORKSPACE'],
  );
  assert.strictEqual(escapedWorkingDirectory.outputs['image-refs'], undefined);
  assert.deepStrictEqual(escapedWorkingDirectory.calls, [], 'working-directory escape fails before make');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-ref-working-dir-'));
  const workspace = path.join(tmp, 'repo');
  const outside = path.join(tmp, 'outside');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(workspace, 'link'), 'dir');
    const symlinkWorkingDirectory = await runCase(
      'working-directory symlink escape fails before image resolution',
      { 'p2p-images': 'api\n' },
      { GITHUB_WORKSPACE: workspace, WORKING_DIR: 'link', IMAGE_NAMES: 'api' },
    );
    assert.deepStrictEqual(
      symlinkWorkingDirectory.failures,
      ['working-directory must resolve inside GITHUB_WORKSPACE'],
    );
    assert.strictEqual(symlinkWorkingDirectory.outputs['image-refs'], undefined);
    assert.deepStrictEqual(symlinkWorkingDirectory.calls, [], 'working-directory symlink escape fails before make');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
  }

  console.log('image ref resolver fixtures passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
