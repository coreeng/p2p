export declare class ConfigError extends Error {
    constructor(message: string);
}
export interface ActionInputs {
    environment: string;
    configMode: '' | 'github-env' | 'repo-file' | 'central-repo';
    repoFilePath: string;
    centralRepoName: string;
    centralRepoOwner: string;
    centralRepoToken: string;
    centralRepoPathPattern: string;
    fields: 'core' | 'full';
}
export interface EnvironmentConfig {
    platform: {
        projectId: string;
        projectNumber: string;
        region: string;
    };
    ingressDomains?: Array<{
        domain: string;
    }>;
    internalServices?: {
        domain: string;
    };
}
export interface ConfigFile {
    environments: Record<string, EnvironmentConfig>;
}
export interface FieldMapping {
    envVar: string;
    path: string;
}
