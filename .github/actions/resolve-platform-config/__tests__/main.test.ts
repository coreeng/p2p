import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { run } from '../src/main';

const mockGetInput = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockNotice = jest.fn();
const mockExportVariable = jest.fn();
const mockWarning = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
}));

const mockGetContent = jest.fn();
jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: { repos: { getContent: mockGetContent } },
  }),
}));

const centralYaml = `platform:
  projectId: central-project
  projectNumber: "789"
  region: us-east1
ingressDomains:
  - domain: central.example.com
internalServices:
  domain: internal.central.example.com
`;

describe('main', () => {
  const originalEnv = process.env;
  let tmpDir: string;

  beforeEach(() => {
    mockGetInput.mockReset();
    mockSetOutput.mockReset();
    mockSetFailed.mockReset();
    mockNotice.mockReset();
    mockExportVariable.mockReset();
    mockWarning.mockReset();
    mockGetContent.mockReset();
    process.env = { ...originalEnv, TENANT_NAME: 'my-tenant' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupInputs(inputs: Record<string, string>): void {
    mockGetInput.mockImplementation((name: string) => inputs[name] ?? '');
  }

  it('github-env mode sets resolved=false and returns early', async () => {
    setupInputs({
      environment: 'gcp-dev',
      'config-mode': '',
      'repo-file-path': '',
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'false');
    expect(mockExportVariable).not.toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('repo-file mode reads file and exports env vars', async () => {
    const configPath = path.join(tmpDir, '.p2p.yaml');
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

    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'repo-file',
      'repo-file-path': configPath,
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'dev.example.com'
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('central-repo mode calls API and exports env vars', async () => {
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        content: Buffer.from(centralYaml).toString('base64'),
        encoding: 'base64',
      },
    });

    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'central-repo',
      'repo-file-path': '',
      'central-repo-name': 'platform-config',
      'central-repo-owner': 'coreeng',
      'central-repo-token': 'ghp_test_token',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'coreeng',
      repo: 'platform-config',
      path: 'environments/gcp-dev/config.yaml',
    });
    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'central-project'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'central.example.com'
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('calls setFailed on validation error', async () => {
    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'invalid-mode',
      'repo-file-path': '',
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid config-mode 'invalid-mode'")
    );
  });
});
