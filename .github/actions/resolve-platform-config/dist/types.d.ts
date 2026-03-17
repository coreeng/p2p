export declare class ConfigError extends Error {
    constructor(message: string);
}
export interface ActionInputs {
    environment: string;
    appName: string;
    version: string;
}
