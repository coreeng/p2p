import * as core from '@actions/core';
import { ActionInputs } from './types';
import { validateInputs } from './validate';
import { exportP2PConvenienceVars } from './p2p-vars';

function getInputs(): ActionInputs {
  return {
    environment: core.getInput('environment'),
    appName: core.getInput('app-name'),
    version: core.getInput('version'),
  };
}

function exportDerivedVars(environment: string): void {
  const tenantName = process.env.TENANT_NAME;
  if (!tenantName) {
    core.warning(
      'TENANT_NAME is not set in the job environment — derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER) will be incorrect'
    );
  }

  const region = process.env.REGION;
  const projectId = process.env.PROJECT_ID;
  const projectNumber = process.env.PROJECT_NUMBER;

  if (region && projectId && tenantName) {
    core.exportVariable(
      'REGISTRY',
      `${region}-docker.pkg.dev/${projectId}/tenant/${tenantName}`
    );
  }

  if (tenantName && projectId) {
    core.exportVariable(
      'SERVICE_ACCOUNT',
      `p2p-${tenantName}@${projectId}.iam.gserviceaccount.com`
    );
  }

  if (projectNumber && tenantName) {
    core.exportVariable(
      'WORKLOAD_IDENTITY_PROVIDER',
      `projects/${projectNumber}/locations/global/workloadIdentityPools/p2p-${tenantName}/providers/p2p-${tenantName}`
    );
  }

  core.exportVariable('DPLATFORM', environment);
  core.exportVariable('PLATFORM_ENVIRONMENT', environment);
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);

    exportDerivedVars(inputs.environment);
    exportP2PConvenienceVars(inputs);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}
