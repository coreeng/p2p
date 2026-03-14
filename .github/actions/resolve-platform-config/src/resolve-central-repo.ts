import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import { ActionInputs, ConfigError, EnvironmentConfig } from './types';

export async function resolveCentralRepo(
  inputs: ActionInputs
): Promise<EnvironmentConfig> {
  const resolvedPath = inputs.centralRepoPathPattern.replace(
    '{env}',
    inputs.environment
  );

  const octokit = github.getOctokit(inputs.centralRepoToken);

  let data;
  try {
    const response = await octokit.rest.repos.getContent({
      owner: inputs.centralRepoOwner,
      repo: inputs.centralRepoName,
      path: resolvedPath,
    });
    data = response.data;
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      throw new ConfigError(
        `Config file not found at '${resolvedPath}' in central repo '${inputs.centralRepoName}'`
      );
    }
    throw error;
  }

  if (Array.isArray(data) || data.type !== 'file' || !data.content) {
    throw new ConfigError(
      `Config file not found at '${resolvedPath}' in central repo '${inputs.centralRepoName}'`
    );
  }

  const encoding =
    (data as unknown as { encoding?: string }).encoding ?? 'base64';
  const content =
    encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;

  core.notice(
    `Resolving environment config from ${inputs.centralRepoName} (${resolvedPath})`
  );

  return yaml.load(content) as EnvironmentConfig;
}
