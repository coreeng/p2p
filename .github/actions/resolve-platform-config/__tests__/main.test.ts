import { run } from '../src/main';

const mockGetInput = jest.fn();
const mockSetFailed = jest.fn();
const mockExportVariable = jest.fn();
const mockWarning = jest.fn();
const mockDebug = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
  debug: (...args: unknown[]) => mockDebug(...args),
}));

describe('run', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockGetInput.mockReset();
    mockSetFailed.mockReset();
    mockExportVariable.mockReset();
    mockWarning.mockReset();
    mockDebug.mockReset();
    process.env = {
      ...originalEnv,
      TENANT_NAME: 'my-tenant',
      REGION: 'europe-west2',
      PROJECT_ID: 'my-project',
      PROJECT_NUMBER: '123456',
      REGISTRY: 'europe-west2-docker.pkg.dev/my-project/tenant/my-tenant',
      VERSION: '1.0.0',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setupInputs(inputs: Record<string, string>): void {
    mockGetInput.mockImplementation((name: string) => inputs[name] ?? '');
  }

  it('exports derived vars and P2P convenience vars', async () => {
    setupInputs({
      environment: 'gcp-dev',
      'app-name': 'my-app',
      version: '2.0.0',
    });

    await run();

    // Derived vars
    expect(mockExportVariable).toHaveBeenCalledWith(
      'REGISTRY',
      'europe-west2-docker.pkg.dev/my-project/tenant/my-tenant'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'SERVICE_ACCOUNT',
      'p2p-my-tenant@my-project.iam.gserviceaccount.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'WORKLOAD_IDENTITY_PROVIDER',
      'projects/123456/locations/global/workloadIdentityPools/p2p-my-tenant/providers/p2p-my-tenant'
    );
    expect(mockExportVariable).toHaveBeenCalledWith('DPLATFORM', 'gcp-dev');
    expect(mockExportVariable).toHaveBeenCalledWith('PLATFORM_ENVIRONMENT', 'gcp-dev');

    // P2P vars
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_TENANT_NAME', 'my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_APP_NAME', 'my-app');
    expect(mockExportVariable).toHaveBeenCalledWith('P2P_VERSION', '2.0.0');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('warns when TENANT_NAME is not set', async () => {
    delete process.env.TENANT_NAME;
    setupInputs({ environment: 'gcp-dev', 'app-name': '', version: '' });

    await run();

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('TENANT_NAME is not set')
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('calls setFailed on validation error', async () => {
    setupInputs({ environment: '', 'app-name': '', version: '' });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('environment is required')
    );
  });
});
