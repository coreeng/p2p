import { extractAndExportFields } from '../src/extract-fields';
import { ActionInputs, ConfigError, EnvironmentConfig } from '../src/types';

const mockExportVariable = jest.fn();
const mockWarning = jest.fn();
jest.mock('@actions/core', () => ({
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
}));

const fullConfig: EnvironmentConfig = {
  platform: {
    projectId: 'my-project-dev',
    projectNumber: '123456',
    region: 'europe-west2',
  },
  ingressDomains: [{ domain: 'dev.example.com' }],
  internalServices: { domain: 'internal.dev.example.com' },
};

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    configMode: 'repo-file',
    repoFilePath: '.p2p.yaml',
    centralRepoName: '',
    centralRepoOwner: '',
    centralRepoToken: '',
    centralRepoPathPattern: '',
    fields: 'full',
    ...overrides,
  };
}

describe('extractAndExportFields', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockExportVariable.mockClear();
    mockWarning.mockClear();
    process.env = { ...originalEnv, TENANT_NAME: 'my-tenant' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exports core fields for fields=core', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_NUMBER',
      '123456'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'REGION',
      'europe-west2'
    );
    expect(mockExportVariable).not.toHaveBeenCalledWith(
      'DPLATFORM',
      expect.anything()
    );
  });

  it('exports core + full fields for fields=full', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'full' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'dev.example.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'INTERNAL_SERVICES_DOMAIN',
      'internal.dev.example.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith('DPLATFORM', 'gcp-dev');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PLATFORM_ENVIRONMENT',
      'gcp-dev'
    );
  });

  it('exports derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER)', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'REGISTRY',
      'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'SERVICE_ACCOUNT',
      'p2p-my-tenant@my-project-dev.iam.gserviceaccount.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'WORKLOAD_IDENTITY_PROVIDER',
      'projects/123456/locations/global/workloadIdentityPools/p2p-my-tenant/providers/p2p-my-tenant'
    );
  });

  it('throws ConfigError for missing required field', () => {
    const incompleteConfig: EnvironmentConfig = {
      platform: {
        projectId: 'my-project',
        projectNumber: '123',
        region: 'europe-west2',
      },
    };

    expect(() =>
      extractAndExportFields(incompleteConfig, makeInputs({ fields: 'full' }))
    ).toThrow(ConfigError);
    expect(() =>
      extractAndExportFields(incompleteConfig, makeInputs({ fields: 'full' }))
    ).toThrow("Field 'BASE_DOMAIN'");
  });

  it('warns when TENANT_NAME is not set', () => {
    delete process.env.TENANT_NAME;
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('TENANT_NAME is not set')
    );
  });

  it('uses centralRepoName as source label for central-repo mode', () => {
    const config: EnvironmentConfig = {
      platform: {
        projectId: 'my-project',
        projectNumber: '123',
        region: 'europe-west2',
      },
    };

    expect(() =>
      extractAndExportFields(
        config,
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: 'platform-config',
          fields: 'full',
        })
      )
    ).toThrow("in central-repo 'platform-config'");
  });
});
