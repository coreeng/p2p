import * as core from '@actions/core';
import {
  ActionInputs,
  ConfigError,
  EnvironmentConfig,
  FieldMapping,
} from './types';
import { getNestedValue } from './get-nested-value';

const CORE_FIELDS: FieldMapping[] = [
  { envVar: 'PROJECT_ID', path: 'platform.projectId' },
  { envVar: 'PROJECT_NUMBER', path: 'platform.projectNumber' },
  { envVar: 'REGION', path: 'platform.region' },
];

const FULL_FIELDS: FieldMapping[] = [
  { envVar: 'BASE_DOMAIN', path: 'ingressDomains[0].domain' },
  { envVar: 'INTERNAL_SERVICES_DOMAIN', path: 'internalServices.domain' },
];

export function extractAndExportFields(
  config: EnvironmentConfig,
  inputs: ActionInputs
): void {
  const fields =
    inputs.fields === 'full'
      ? [...CORE_FIELDS, ...FULL_FIELDS]
      : CORE_FIELDS;

  for (const { envVar, path } of fields) {
    const value = getNestedValue(config, path);
    const source =
      inputs.configMode === 'repo-file'
        ? inputs.repoFilePath
        : inputs.centralRepoName;
    if (value === undefined || value === null || value === '') {
      throw new ConfigError(
        `Field '${envVar}' (path: ${path}) not found in ${inputs.configMode} '${source}' for environment '${inputs.environment}'`
      );
    }
    core.exportVariable(envVar, String(value));
  }

  if (inputs.fields === 'full') {
    core.exportVariable('DPLATFORM', inputs.environment);
    core.exportVariable('PLATFORM_ENVIRONMENT', inputs.environment);
  }

  // Recompute derived vars.
  // TENANT_NAME must be set in the job-level env: block of the calling workflow.
  // process.env reads job-level env vars; it does NOT see GITHUB_ENV writes
  // from prior steps.
  const tenantName = process.env.TENANT_NAME;
  if (!tenantName) {
    core.warning(
      'TENANT_NAME is not set in the job environment — derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER) will be incorrect'
    );
  }

  const region = getNestedValue(config, 'platform.region');
  const projectId = getNestedValue(config, 'platform.projectId');
  const projectNumber = getNestedValue(config, 'platform.projectNumber');

  core.exportVariable(
    'REGISTRY',
    `${region}-docker.pkg.dev/${projectId}/tenant/${tenantName}`
  );
  core.exportVariable(
    'SERVICE_ACCOUNT',
    `p2p-${tenantName}@${projectId}.iam.gserviceaccount.com`
  );
  core.exportVariable(
    'WORKLOAD_IDENTITY_PROVIDER',
    `projects/${projectNumber}/locations/global/workloadIdentityPools/p2p-${tenantName}/providers/p2p-${tenantName}`
  );
}
