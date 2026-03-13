import * as core from '@actions/core';
import { ActionInputs, EnvironmentConfig } from './types';
import { validateInputs } from './validate';
import { resolveRepoFile } from './resolve-repo-file';
import { resolveCentralRepo } from './resolve-central-repo';
import { extractAndExportFields } from './extract-fields';

function getInputs(): ActionInputs {
  return {
    environment: core.getInput('environment'),
    configMode: core.getInput('config-mode') as ActionInputs['configMode'],
    repoFilePath: core.getInput('repo-file-path'),
    centralRepoName: core.getInput('central-repo-name'),
    centralRepoOwner: core.getInput('central-repo-owner'),
    centralRepoToken: core.getInput('central-repo-token'),
    centralRepoPathPattern: core.getInput('central-repo-path-pattern'),
    fields: core.getInput('fields') as ActionInputs['fields'],
  };
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);

    if (inputs.configMode === '' || inputs.configMode === 'github-env') {
      core.notice(
        `Config mode: ${inputs.configMode || '(default: github-env implicit)'}`
      );
      core.setOutput('resolved', 'false');
      return;
    }

    let config: EnvironmentConfig;
    if (inputs.configMode === 'repo-file') {
      config = resolveRepoFile(inputs.repoFilePath, inputs.environment);
    } else {
      config = await resolveCentralRepo(inputs);
    }

    extractAndExportFields(config, inputs);
    core.setOutput('resolved', 'true');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}
