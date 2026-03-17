import { ActionInputs, ConfigError } from './types';

export function validateInputs(inputs: ActionInputs): void {
  if (!inputs.environment) {
    throw new ConfigError('environment is required and must be non-empty');
  }
}
