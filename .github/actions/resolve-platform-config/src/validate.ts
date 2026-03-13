import { ActionInputs, ConfigError } from './types';

const VALID_MODES = ['', 'github-env', 'repo-file', 'central-repo'];
const VALID_FIELDS = ['core', 'full'];

export function validateInputs(inputs: ActionInputs): void {
  if (!inputs.environment) {
    throw new ConfigError('environment is required and must be non-empty');
  }

  if (!VALID_MODES.includes(inputs.configMode)) {
    throw new ConfigError(
      `Invalid config-mode '${inputs.configMode}'. Must be one of: github-env, repo-file, central-repo`
    );
  }

  if (!VALID_FIELDS.includes(inputs.fields)) {
    throw new ConfigError(
      `Invalid fields '${inputs.fields}'. Must be one of: core, full`
    );
  }

  if (inputs.configMode === 'repo-file' && !inputs.repoFilePath) {
    throw new ConfigError(
      "config-mode is 'repo-file' but repo-file-path is not set"
    );
  }

  if (inputs.configMode === 'central-repo') {
    if (!inputs.centralRepoName) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-name is not set"
      );
    }
    if (!inputs.centralRepoOwner) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-owner is not set"
      );
    }
    if (!inputs.centralRepoToken) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-token is not set"
      );
    }
  }

  if (inputs.configMode === '') {
    if (
      inputs.repoFilePath ||
      inputs.centralRepoName ||
      inputs.centralRepoOwner ||
      inputs.centralRepoToken
    ) {
      throw new ConfigError(
        'config-mode is not set but repo-file or central-repo inputs are provided. Set config-mode explicitly.'
      );
    }
  }
}
