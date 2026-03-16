import { extractAndExportFields } from '../src/extract-fields';
import { ActionInputs, ConfigError, EnvironmentConfig } from '../src/types';

const mockExportVariable = jest.fn();
const mockWarning = jest.fn();
jest.mock('@actions/core', () => ({
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
}));

function makeConfig(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return {
    platform: { projectId: 'my-project-dev', projectNumber: '123456', region: 'europe-west2' },
    ingressDomains: [{ domain: 'dev.example.com' }],
    internalServices: { domain: 'internal.dev.example.com' },
    ...overrides,
  };
}

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    configMode: 'repo-file',
    repoFilePath: '.p2p.yaml',
    centralRepoName: '',
    centralRepoOwner: '',
    centralRepoToken: '',
    centralRepoPathPattern: 'environments/{env}/config.yaml',
    fields: 'full',
    appName: '',
    version: '',
    ...overrides,
  };
}

describe('extractAndExportFields', () => {
  beforeEach(() => {
    mockExportVariable.mockReset();
    mockWarning.mockReset();
    process.env.TENANT_NAME = 'my-tenant';
  });

  afterEach(() => {
    delete process.env.TENANT_NAME;
  });

  it('exports core fields for fields=core', () => {
    extractAndExportFields(makeConfig(), makeInputs({ fields: 'core' }));
    expect(mockExportVariable).toHaveBeenCalledWith('PROJECT_ID', 'my-project-dev');
    expect(mockExportVariable).toHaveBeenCalledWith('PROJECT_NUMBER', '123456');
    expect(mockExportVariable).toHaveBeenCalledWith('REGION', 'europe-west2');
    expect(mockExportVariable).not.toHaveBeenCalledWith('BASE_DOMAIN', expect.anything());
    expect(mockExportVariable).not.toHaveBeenCalledWith('DPLATFORM', expect.anything());
  });

  it('exports core + full fields for fields=full', () => {
    extractAndExportFields(makeConfig(), makeInputs({ fields: 'full' }));
    expect(mockExportVariable).toHaveBeenCalledWith('PROJECT_ID', 'my-project-dev');
    expect(mockExportVariable).toHaveBeenCalledWith('BASE_DOMAIN', 'dev.example.com');
    expect(mockExportVariable).toHaveBeenCalledWith('INTERNAL_SERVICES_DOMAIN', 'internal.dev.example.com');
    expect(mockExportVariable).toHaveBeenCalledWith('DPLATFORM', 'gcp-dev');
    expect(mockExportVariable).toHaveBeenCalledWith('PLATFORM_ENVIRONMENT', 'gcp-dev');
  });

  it('exports derived auth vars', () => {
    extractAndExportFields(makeConfig(), makeInputs());
    expect(mockExportVariable).toHaveBeenCalledWith('REGISTRY', 'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant');
    expect(mockExportVariable).toHaveBeenCalledWith('SERVICE_ACCOUNT', 'p2p-my-tenant@my-project-dev.iam.gserviceaccount.com');
    expect(mockExportVariable).toHaveBeenCalledWith('WORKLOAD_IDENTITY_PROVIDER', 'projects/123456/locations/global/workloadIdentityPools/p2p-my-tenant/providers/p2p-my-tenant');
  });

  it('warns when TENANT_NAME is not set', () => {
    delete process.env.TENANT_NAME;
    extractAndExportFields(makeConfig(), makeInputs());
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('TENANT_NAME is not set'));
  });

  it('throws ConfigError when a core field is missing', () => {
    const config = makeConfig({ platform: { projectId: '', projectNumber: '123456', region: 'europe-west2' } });
    expect(() => extractAndExportFields(config, makeInputs())).toThrow(ConfigError);
    expect(() => extractAndExportFields(config, makeInputs())).toThrow("Field 'PROJECT_ID'");
  });

  it('throws ConfigError when a full field is missing', () => {
    const config = makeConfig({ ingressDomains: undefined });
    expect(() => extractAndExportFields(config, makeInputs({ fields: 'full' }))).toThrow(ConfigError);
    expect(() => extractAndExportFields(config, makeInputs({ fields: 'full' }))).toThrow("Field 'BASE_DOMAIN'");
  });

  it('does not throw for missing full fields when fields=core', () => {
    const config = makeConfig({ ingressDomains: undefined, internalServices: undefined });
    expect(() => extractAndExportFields(config, makeInputs({ fields: 'core' }))).not.toThrow();
  });
});
