import { validateInputs } from '../src/validate';
import { ActionInputs, ConfigError } from '../src/types';

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    appName: '',
    version: '',
    ...overrides,
  };
}

describe('validateInputs', () => {
  it('accepts valid environment', () => {
    expect(() => validateInputs(makeInputs())).not.toThrow();
  });

  it('rejects empty environment', () => {
    expect(() => validateInputs(makeInputs({ environment: '' }))).toThrow(ConfigError);
    expect(() => validateInputs(makeInputs({ environment: '' }))).toThrow('environment is required');
  });
});
