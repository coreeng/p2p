import { run } from '../src/main';

const mockGetInput = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockExportVariable = jest.fn();
const mockNotice = jest.fn();
const mockWarning = jest.fn();
const mockDebug = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
}));

jest.mock('../src/resolve-repo-file', () => ({
  resolveRepoFile: jest.fn().mockReturnValue({
    platform: { projectId: 'my-project-dev', projectNumber: '123456', region: 'europe-west2' },
    ingressDomains: [{ domain: 'dev.example.com' }],
    internalServices: { domain: 'internal.dev.example.com' },
  }),
}));

const mockResolveCentralRepo = jest.fn().mockResolvedValue({
  platform: { projectId: 'central-proj', projectNumber: '789', region: 'us-central1' },
  ingressDomains: [{ domain: 'central.example.com' }],
  internalServices: { domain: 'internal.central.example.com' },
});
jest.mock('../src/resolve-central-repo', () => ({
  resolveCentralRepo: (...args: unknown[]) => mockResolveCentralRepo(...args),
}));

function setupInputs(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    'environment': 'gcp-dev',
    'config-mode': '',
    'repo-file-path': '',
    'central-repo-name': '',
    'central-repo-owner': '',
    'central-repo-token': '',
    'central-repo-path-pattern': 'environments/{env}/config.yaml',
    'fields': 'full',
    'app-name': '',
    'version': '',
    ...overrides,
  };
  mockGetInput.mockImplementation((name: string) => defaults[name] ?? '');
}

describe('run', () => {
  beforeEach(() => {
    mockGetInput.mockReset();
    mockSetOutput.mockReset();
    mockSetFailed.mockReset();
    mockExportVariable.mockReset();
    mockNotice.mockReset();
    mockWarning.mockReset();
    mockDebug.mockReset();
    process.env.TENANT_NAME = 'my-tenant';
    process.env.REGISTRY = 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant';
    process.env.VERSION = '1.0.0';
  });

  afterEach(() => {
    delete process.env.TENANT_NAME;
    delete process.env.REGISTRY;
    delete process.env.VERSION;
  });

  it('github-env mode sets resolved=false and exports P2P vars', async () => {
    setupInputs({ 'config-mode': 'github-env' });
    await run();
    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'false');
    expect(mockSetFailed).not.toHaveBeenCalled();
    // P2P vars should still be exported
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_TENANT_NAME', 'my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_APP_NAME', 'my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_VERSION', '1.0.0');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE', 'my-tenant');
  });

  it('repo-file mode resolves config and sets resolved=true', async () => {
    setupInputs({ 'config-mode': 'repo-file', 'repo-file-path': '.p2p.yaml' });
    await run();
    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockExportVariable).toHaveBeenCalledWith('PROJECT_ID', 'my-project-dev');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('central-repo mode resolves config and sets resolved=true', async () => {
    setupInputs({
      'config-mode': 'central-repo',
      'central-repo-name': 'platform-config',
      'central-repo-owner': 'coreeng',
      'central-repo-token': 'ghp_test',
    });
    await run();
    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockResolveCentralRepo).toHaveBeenCalled();
    expect(mockExportVariable).toHaveBeenCalledWith('PROJECT_ID', 'central-proj');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('calls setFailed on validation error', async () => {
    setupInputs({ 'environment': '' });
    await run();
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('environment is required'));
  });
});
