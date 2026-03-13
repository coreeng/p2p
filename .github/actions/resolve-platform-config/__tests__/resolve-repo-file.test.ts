import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveRepoFile } from '../src/resolve-repo-file';
import { ConfigError } from '../src/types';

jest.mock('@actions/core', () => ({
  notice: jest.fn(),
}));

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
    expect(() => resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')).toThrow(
      ConfigError
    );
    expect(() =>
      resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')
    ).toThrow("Config file '/nonexistent/.p2p.yaml' not found");
  });

  it('throws ConfigError when environment key is missing', () => {
    fs.writeFileSync(
      configPath,
      `environments:
  gcp-prod:
    platform:
      projectId: prod-project
      projectNumber: "999"
      region: us-east1
`
    );
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(ConfigError);
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(
      `Environment 'gcp-dev' not found in '${configPath}'`
    );
  });

  it('returns parsed environment config for valid file and environment', () => {
    fs.writeFileSync(
      configPath,
      `environments:
  gcp-dev:
    platform:
      projectId: my-project-dev
      projectNumber: "123456"
      region: europe-west2
    ingressDomains:
      - domain: dev.example.com
    internalServices:
      domain: internal.dev.example.com
`
    );
    const result = resolveRepoFile(configPath, 'gcp-dev');
    expect(result.platform.projectId).toBe('my-project-dev');
    expect(result.platform.projectNumber).toBe('123456');
    expect(result.platform.region).toBe('europe-west2');
    expect(result.ingressDomains?.[0].domain).toBe('dev.example.com');
    expect(result.internalServices?.domain).toBe('internal.dev.example.com');
  });

  it('throws ConfigError when environments key is missing entirely', () => {
    fs.writeFileSync(configPath, 'someOtherKey: value\n');
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(
      `Environment 'gcp-dev' not found in '${configPath}'`
    );
  });
});
