import { exportP2PConvenienceVars } from '../src/p2p-vars';
import { ActionInputs } from '../src/types';

const mockExportVariable = jest.fn();
const mockWarning = jest.fn();
const mockDebug = jest.fn();
jest.mock('@actions/core', () => ({
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
}));

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    appName: '',
    version: '',
    ...overrides,
  };
}

describe('exportP2PConvenienceVars', () => {
  beforeEach(() => {
    mockExportVariable.mockReset();
    mockWarning.mockReset();
    mockDebug.mockReset();
    process.env.TENANT_NAME = 'my-tenant';
    process.env.REGISTRY = 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant';
    delete process.env.VERSION;
  });

  afterEach(() => {
    delete process.env.TENANT_NAME;
    delete process.env.REGISTRY;
    delete process.env.VERSION;
  });

  it('skips all P2P vars when TENANT_NAME is not set', () => {
    delete process.env.TENANT_NAME;
    exportP2PConvenienceVars(makeInputs());
    expect(mockExportVariable).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('TENANT_NAME is not set'));
  });

  it('exports P2P_TENANT_NAME and P2P_APP_NAME', () => {
    exportP2PConvenienceVars(makeInputs());
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_TENANT_NAME', 'my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_APP_NAME', 'my-tenant');
  });

  it('uses app-name input when provided', () => {
    exportP2PConvenienceVars(makeInputs({ appName: 'custom-app' }));
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_APP_NAME', 'custom-app');
  });

  it('exports P2P_VERSION from input', () => {
    exportP2PConvenienceVars(makeInputs({ version: '1.2.3' }));
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_VERSION', '1.2.3');
  });

  it('exports P2P_VERSION from env when input is empty', () => {
    process.env.VERSION = '4.5.6';
    exportP2PConvenienceVars(makeInputs());
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_VERSION', '4.5.6');
  });

  it('does not export P2P_VERSION when neither input nor env is set', () => {
    exportP2PConvenienceVars(makeInputs());
    expect(mockExportVariable).not.toHaveBeenCalledWith('P2P_VERSION', expect.anything());
  });

  it('exports registry-related P2P variables', () => {
    exportP2PConvenienceVars(makeInputs());
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_FAST_FEEDBACK_PATH', 'fast-feedback');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_EXTENDED_TEST_PATH', 'extended-test');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_PROD_PATH', 'prod');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_FAST_FEEDBACK', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant/fast-feedback');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_EXTENDED_TEST', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant/extended-test');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_REGISTRY_PROD', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant/prod');
  });

  it('warns when REGISTRY is not set', () => {
    delete process.env.REGISTRY;
    exportP2PConvenienceVars(makeInputs());
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('REGISTRY is not set'));
    expect(mockExportVariable).not.toHaveBeenCalledWith('P2P_REGISTRY', expect.anything());
  });

  it('exports namespace vars with tenant-app concatenation when appName differs', () => {
    exportP2PConvenienceVars(makeInputs({ appName: 'my-app' }));
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE', 'my-tenant-my-app');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE_FUNCTIONAL', 'my-tenant-my-app-functional');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE_NFT', 'my-tenant-my-app-nft');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE_INTEGRATION', 'my-tenant-my-app-integration');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE_EXTENDED', 'my-tenant-my-app-extended');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_NAMESPACE_PROD', 'my-tenant-my-app-prod');
  });
});
