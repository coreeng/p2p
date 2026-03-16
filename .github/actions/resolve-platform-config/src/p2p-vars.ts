import * as core from '@actions/core';
import { ActionInputs } from './types';

export function exportP2PConvenienceVars(inputs: ActionInputs): void {
  const tenantName = process.env.TENANT_NAME;
  if (!tenantName) {
    core.debug('TENANT_NAME is not set — skipping P2P convenience variables');
    return;
  }

  const appName = inputs.appName || tenantName;

  core.exportVariable('P2P_TENANT_NAME', tenantName);
  core.exportVariable('P2P_APP_NAME', appName);

  const version = inputs.version || process.env.VERSION;
  if (version) {
    core.exportVariable('P2P_VERSION', version);
  }

  const registry = process.env.REGISTRY;
  if (!registry) {
    core.warning('REGISTRY is not set — skipping registry-related P2P variables');
  } else {
    core.exportVariable('P2P_REGISTRY', registry);
    core.exportVariable('P2P_REGISTRY_FAST_FEEDBACK_PATH', 'fast-feedback');
    core.exportVariable('P2P_REGISTRY_EXTENDED_TEST_PATH', 'extended-test');
    core.exportVariable('P2P_REGISTRY_PROD_PATH', 'prod');
    core.exportVariable('P2P_REGISTRY_FAST_FEEDBACK', `${registry}/fast-feedback`);
    core.exportVariable('P2P_REGISTRY_EXTENDED_TEST', `${registry}/extended-test`);
    core.exportVariable('P2P_REGISTRY_PROD', `${registry}/prod`);
  }

  const namespace = tenantName === appName ? tenantName : `${tenantName}-${appName}`;
  core.exportVariable('P2P_NAMESPACE', namespace);
  core.exportVariable('P2P_NAMESPACE_FUNCTIONAL', `${namespace}-functional`);
  core.exportVariable('P2P_NAMESPACE_NFT', `${namespace}-nft`);
  core.exportVariable('P2P_NAMESPACE_INTEGRATION', `${namespace}-integration`);
  core.exportVariable('P2P_NAMESPACE_EXTENDED', `${namespace}-extended`);
  core.exportVariable('P2P_NAMESPACE_PROD', `${namespace}-prod`);
}
