import { resolveCentralRepo } from '../src/resolve-central-repo';
import { ActionInputs, ConfigError } from '../src/types';

jest.mock('@actions/core', () => ({ notice: jest.fn() }));

const mockGetContent = jest.fn();
jest.mock('@actions/github', () => ({
  getOctokit: () => ({ rest: { repos: { getContent: mockGetContent } } }),
}));

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev', configMode: 'central-repo', repoFilePath: '',
    centralRepoName: 'platform-config', centralRepoOwner: 'coreeng',
    centralRepoToken: 'ghp_test_token',
    centralRepoPathPattern: 'environments/{env}/config.yaml',
    fields: 'full', appName: '', version: '',
    ...overrides,
  };
}

const sampleYaml = `platform:\n  projectId: my-project-dev\n  projectNumber: "123456"\n  region: europe-west2\ningressDomains:\n  - domain: dev.example.com\ninternalServices:\n  domain: internal.dev.example.com\n`;

describe('resolveCentralRepo', () => {
  beforeEach(() => { mockGetContent.mockReset(); });

  it('fetches and parses config from central repo', async () => {
    mockGetContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(sampleYaml).toString('base64'), encoding: 'base64' } });
    const result = await resolveCentralRepo(makeInputs());
    expect(mockGetContent).toHaveBeenCalledWith({ owner: 'coreeng', repo: 'platform-config', path: 'environments/gcp-dev/config.yaml' });
    expect(result.platform.projectId).toBe('my-project-dev');
  });

  it('replaces {env} in path pattern', async () => {
    mockGetContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from(sampleYaml).toString('base64'), encoding: 'base64' } });
    await resolveCentralRepo(makeInputs({ environment: 'gcp-prod', centralRepoPathPattern: 'envs/{env}/platform.yaml' }));
    expect(mockGetContent).toHaveBeenCalledWith(expect.objectContaining({ path: 'envs/gcp-prod/platform.yaml' }));
  });

  it('throws ConfigError when API returns a directory', async () => {
    mockGetContent.mockResolvedValue({ data: [{ type: 'dir', name: 'subdir' }] });
    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(ConfigError);
  });

  it('throws ConfigError when file has no content', async () => {
    mockGetContent.mockResolvedValue({ data: { type: 'file', content: null } });
    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(ConfigError);
  });

  it('handles non-base64 encoding', async () => {
    mockGetContent.mockResolvedValue({ data: { type: 'file', content: sampleYaml, encoding: 'none' } });
    const result = await resolveCentralRepo(makeInputs());
    expect(result.platform.projectId).toBe('my-project-dev');
  });

  it('throws ConfigError on 404', async () => {
    const error = new Error('Not Found');
    (error as unknown as { status: number }).status = 404;
    mockGetContent.mockRejectedValue(error);
    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(ConfigError);
  });
});
