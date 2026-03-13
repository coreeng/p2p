import { validateInputs } from '../src/validate';
import { ActionInputs, ConfigError } from '../src/types';

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    configMode: '',
    repoFilePath: '',
    centralRepoName: '',
    centralRepoOwner: '',
    centralRepoToken: '',
    centralRepoPathPattern: 'environments/{env}/config.yaml',
    fields: 'full',
    ...overrides,
  };
}

describe('validateInputs', () => {
  it('accepts empty config-mode (implicit github-env)', () => {
    expect(() => validateInputs(makeInputs())).not.toThrow();
  });

  it('accepts explicit github-env mode', () => {
    expect(() =>
      validateInputs(makeInputs({ configMode: 'github-env' }))
    ).not.toThrow();
  });

  it('accepts repo-file mode with repo-file-path', () => {
    expect(() =>
      validateInputs(
        makeInputs({ configMode: 'repo-file', repoFilePath: '.p2p.yaml' })
      )
    ).not.toThrow();
  });

  it('accepts central-repo mode with all required inputs', () => {
    expect(() =>
      validateInputs(
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: 'config-repo',
          centralRepoOwner: 'coreeng',
          centralRepoToken: 'ghp_token',
        })
      )
    ).not.toThrow();
  });

  it('rejects empty environment', () => {
    expect(() => validateInputs(makeInputs({ environment: '' }))).toThrow(
      ConfigError
    );
  });

  it('rejects invalid config-mode', () => {
    expect(() =>
      validateInputs(makeInputs({ configMode: 'invalid' as '' }))
    ).toThrow("Invalid config-mode 'invalid'");
  });

  it('rejects invalid fields', () => {
    expect(() =>
      validateInputs(makeInputs({ fields: 'partial' as 'core' }))
    ).toThrow("Invalid fields 'partial'");
  });

  it('rejects repo-file mode without repo-file-path', () => {
    expect(() =>
      validateInputs(makeInputs({ configMode: 'repo-file', repoFilePath: '' }))
    ).toThrow("config-mode is 'repo-file' but repo-file-path is not set");
  });

  it('rejects central-repo mode without central-repo-name', () => {
    expect(() =>
      validateInputs(
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: '',
          centralRepoOwner: 'coreeng',
          centralRepoToken: 'ghp_token',
        })
      )
    ).toThrow("config-mode is 'central-repo' but central-repo-name is not set");
  });

  it('rejects central-repo mode without central-repo-owner', () => {
    expect(() =>
      validateInputs(
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: 'config-repo',
          centralRepoOwner: '',
          centralRepoToken: 'ghp_token',
        })
      )
    ).toThrow(
      "config-mode is 'central-repo' but central-repo-owner is not set"
    );
  });

  it('rejects central-repo mode without central-repo-token', () => {
    expect(() =>
      validateInputs(
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: 'config-repo',
          centralRepoOwner: 'coreeng',
          centralRepoToken: '',
        })
      )
    ).toThrow(
      "config-mode is 'central-repo' but central-repo-token is not set"
    );
  });

  it('rejects config inputs when config-mode is empty', () => {
    expect(() =>
      validateInputs(makeInputs({ repoFilePath: '.p2p.yaml' }))
    ).toThrow(
      'config-mode is not set but repo-file or central-repo inputs are provided'
    );
  });

  it('rejects config inputs when config-mode is empty (central-repo-name)', () => {
    expect(() =>
      validateInputs(makeInputs({ centralRepoName: 'config-repo' }))
    ).toThrow(
      'config-mode is not set but repo-file or central-repo inputs are provided'
    );
  });

  it('accepts fields=core', () => {
    expect(() =>
      validateInputs(makeInputs({ fields: 'core' }))
    ).not.toThrow();
  });
});
