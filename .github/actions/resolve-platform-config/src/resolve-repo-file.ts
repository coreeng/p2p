import * as fs from 'fs';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { ConfigError, ConfigFile, EnvironmentConfig } from './types';

export function resolveRepoFile(
  filePath: string,
  environment: string
): EnvironmentConfig {
  if (!fs.existsSync(filePath)) {
    throw new ConfigError(`Config file '${filePath}' not found`);
  }

  const raw = yaml.load(fs.readFileSync(filePath, 'utf8')) as ConfigFile;
  const envConfig = raw?.environments?.[environment];

  if (!envConfig) {
    throw new ConfigError(
      `Environment '${environment}' not found in '${filePath}'`
    );
  }

  core.notice(
    `Resolving environment config from ${filePath} (${environment})`
  );
  return envConfig;
}
