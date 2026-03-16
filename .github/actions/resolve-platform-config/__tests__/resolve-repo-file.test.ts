import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveRepoFile } from '../src/resolve-repo-file';
import { ConfigError } from '../src/types';

jest.mock('@actions/core', () => ({ notice: jest.fn() }));

describe('resolveRepoFile', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-repo-file-'));
    configPath = path.join(tmpDir, '.p2p.yaml');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws ConfigError when file does not exist', () => {
    expect(() => resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')).toThrow(ConfigError);
    expect(() => resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')).toThrow("Config file '/nonexistent/.p2p.yaml' not found");
  });

  it('throws ConfigError when environment key is missing', () => {
    fs.writeFileSync(configPath, 'environments:\n  gcp-prod:\n    platform:\n      projectId: prod\n      projectNumber: "999"\n      region: us-east1\n');
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(ConfigError);
  });

  it('returns parsed environment config for valid file and environment', () => {
    fs.writeFileSync(configPath, 'environments:\n  gcp-dev:\n    platform:\n      projectId: my-project-dev\n      projectNumber: "123456"\n      region: europe-west2\n    ingressDomains:\n      - domain: dev.example.com\n    internalServices:\n      domain: internal.dev.example.com\n');
    const result = resolveRepoFile(configPath, 'gcp-dev');
    expect(result.platform.projectId).toBe('my-project-dev');
    expect(result.platform.region).toBe('europe-west2');
    expect(result.ingressDomains?.[0].domain).toBe('dev.example.com');
  });

  it('throws ConfigError when environments key is missing entirely', () => {
    fs.writeFileSync(configPath, 'someOtherKey: value\n');
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow("Environment 'gcp-dev' not found");
  });
});
