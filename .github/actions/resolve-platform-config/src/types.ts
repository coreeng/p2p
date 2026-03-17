export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ActionInputs {
  environment: string;
  appName: string;
  version: string;
}
