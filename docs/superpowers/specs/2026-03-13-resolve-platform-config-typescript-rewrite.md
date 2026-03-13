# Resolve Platform Config: TypeScript Rewrite

## Context

The `resolve-platform-config` composite action (`.github/actions/resolve-platform-config/action.yaml`) was introduced in the `feat/environment-config-resolution` branch to consolidate duplicated environment config resolution across 3 low-level workflows. It works, but has limitations inherent to composite actions:

- **Untestable**: The validation logic has 6+ distinct error paths that can only be tested by running real workflows on GitHub.
- **yq dependency**: Relies on `yq` being pre-installed on the runner. Runner image changes could break the action silently.
- **Heavy central repo fetch**: Uses `actions/checkout@v6` with sparse-checkout to clone a repo for a single YAML file.
- **Bash-in-YAML**: No IDE support, no linting, no type checking for the embedded shell scripts.

## Decision

Rewrite `resolve-platform-config` as a TypeScript GitHub Action using `node20`.

## Design

### Directory structure

```
.github/actions/resolve-platform-config/
  action.yml                  # using: 'node20', main: 'dist/index.js'
  src/
    main.ts                   # entry point — orchestrates validation, resolution, field export
    validate.ts               # input validation (mode, required inputs, field set)
    resolve-repo-file.ts      # read local YAML file, extract environment block
    resolve-central-repo.ts   # fetch file from remote repo via GitHub API
    extract-fields.ts         # extract fields from parsed config, export to GITHUB_ENV
    types.ts                  # TypeScript interfaces for config schema and inputs
  __tests__/
    validate.test.ts
    resolve-repo-file.test.ts
    resolve-central-repo.test.ts
    extract-fields.test.ts
    main.test.ts              # integration-level test of the full flow
  dist/
    index.js                  # ncc-bundled output (committed to repo)
  package.json
  tsconfig.json
  jest.config.ts
  .eslintrc.json
```

### action.yml

Inputs and outputs remain identical to the current composite action — this is a transparent implementation swap. No caller changes required.

```yaml
name: 'Resolve Platform Config'
description: 'Resolves platform config from one of three mutually exclusive sources'

inputs:
  # (identical to current)

outputs:
  resolved:
    description: 'true if config was resolved from repo-file or central-repo'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

### Entry point (main.ts)

```typescript
async function run(): Promise<void> {
  const inputs = getInputs();        // read from @actions/core
  validateInputs(inputs);            // throw on invalid combinations

  if (inputs.configMode === '' || inputs.configMode === 'github-env') {
    core.notice(`Config mode: ${inputs.configMode || '(default: github-env implicit)'}`);
    return; // vars.* already in environment — nothing to do
  }

  let config: EnvironmentConfig;
  if (inputs.configMode === 'repo-file') {
    config = resolveRepoFile(inputs.repoFilePath, inputs.environment);
  } else {
    config = await resolveCentralRepo(inputs);
  }

  extractAndExportFields(config, inputs);
  core.setOutput('resolved', 'true');
}
```

### Input validation (validate.ts)

Replicates the exact same checks as the current bash step, with the same error messages:

1. `config-mode` must be one of: `github-env`, `repo-file`, `central-repo`, or empty
2. `fields` must be `core` or `full`
3. `repo-file` mode requires `repo-file-path`
4. `central-repo` mode requires `central-repo-name`, `central-repo-owner`, `central-repo-token`
5. Empty `config-mode` with config inputs present is an error

Each check calls `core.setFailed(message)` with the same `::error::` message text as today.

### Repo-file resolution (resolve-repo-file.ts)

```typescript
import * as fs from 'fs';
import * as yaml from 'js-yaml';

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

  core.notice(`Resolving environment config from ${filePath} (${environment})`);
  return envConfig;
}
```

Replaces: `yq` calls + bash file-existence checks.

### Central repo resolution (resolve-central-repo.ts)

```typescript
import * as github from '@actions/github';
import * as yaml from 'js-yaml';

export async function resolveCentralRepo(
  inputs: ActionInputs
): Promise<EnvironmentConfig> {
  const resolvedPath = inputs.centralRepoPathPattern.replace(
    '{env}',
    inputs.environment
  );

  const octokit = github.getOctokit(inputs.centralRepoToken);
  const { data } = await octokit.rest.repos.getContent({
    owner: inputs.centralRepoOwner,
    repo: inputs.centralRepoName,
    path: resolvedPath,
  });

  if (Array.isArray(data) || data.type !== 'file') {
    throw new ConfigError(
      `Config file not found at '${resolvedPath}' in central repo '${inputs.centralRepoName}'`
    );
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  core.notice(
    `Resolving environment config from ${inputs.centralRepoName} (${resolvedPath})`
  );

  return yaml.load(content) as EnvironmentConfig;
}
```

Key change: replaces `actions/checkout@v6` sparse-checkout (git clone) with a single GitHub API call. This is faster and removes the nested action dependency.

Note: the central repo file is a flat config file (not nested under `environments.<name>` like the repo-file format), so we parse and return it directly.

### Field extraction (extract-fields.ts)

```typescript
const CORE_FIELDS: FieldMapping[] = [
  { envVar: 'PROJECT_ID', path: 'platform.projectId' },
  { envVar: 'PROJECT_NUMBER', path: 'platform.projectNumber' },
  { envVar: 'REGION', path: 'platform.region' },
];

const FULL_FIELDS: FieldMapping[] = [
  { envVar: 'BASE_DOMAIN', path: 'ingressDomains[0].domain' },
  { envVar: 'INTERNAL_SERVICES_DOMAIN', path: 'internalServices.domain' },
];

export function extractAndExportFields(
  config: EnvironmentConfig,
  inputs: ActionInputs
): void {
  const fields = inputs.fields === 'full'
    ? [...CORE_FIELDS, ...FULL_FIELDS]
    : CORE_FIELDS;

  for (const { envVar, path } of fields) {
    const value = getNestedValue(config, path);
    if (!value) {
      throw new ConfigError(
        `Field '${envVar}' (path: ${path}) not found in ${inputs.configMode} '${sourceLabel(inputs)}' for environment '${inputs.environment}'`
      );
    }
    core.exportVariable(envVar, String(value));
  }

  if (inputs.fields === 'full') {
    core.exportVariable('DPLATFORM', inputs.environment);
    core.exportVariable('PLATFORM_ENVIRONMENT', inputs.environment);
  }

  // Recompute derived vars (needs TENANT_NAME from caller's env)
  const tenantName = process.env.TENANT_NAME ?? '';
  const region = getNestedValue(config, 'platform.region');
  const projectId = getNestedValue(config, 'platform.projectId');
  const projectNumber = getNestedValue(config, 'platform.projectNumber');

  core.exportVariable(
    'REGISTRY',
    `${region}-docker.pkg.dev/${projectId}/tenant/${tenantName}`
  );
  core.exportVariable(
    'SERVICE_ACCOUNT',
    `p2p-${tenantName}@${projectId}.iam.gserviceaccount.com`
  );
  core.exportVariable(
    'WORKLOAD_IDENTITY_PROVIDER',
    `projects/${projectNumber}/locations/global/workloadIdentityPools/p2p-${tenantName}/providers/p2p-${tenantName}`
  );
}
```

`getNestedValue` is a helper that traverses the parsed object using dot-and-bracket notation (e.g., `ingressDomains[0].domain`). This replaces `yq` path evaluation.

### Types (types.ts)

```typescript
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
  ingressDomains?: Array<{ domain: string }>;
  internalServices?: { domain: string };
}

export interface ConfigFile {
  environments: Record<string, EnvironmentConfig>;
}

export interface FieldMapping {
  envVar: string;
  path: string;
}
```

### Build toolchain

**Dependencies:**
- `@actions/core` — inputs, outputs, env vars, annotations
- `@actions/github` — Octokit for central repo API calls
- `js-yaml` — YAML parsing
- `@vercel/ncc` — bundler (dev dependency)
- `typescript` — compiler (dev dependency)
- `jest` + `ts-jest` — testing (dev dependency)
- `@types/js-yaml`, `@types/node` — type definitions (dev dependency)

**Scripts:**
```json
{
  "build": "ncc build src/main.ts -o dist --source-map --license licenses.txt",
  "test": "jest",
  "lint": "eslint src/ __tests__/",
  "all": "npm run lint && npm run test && npm run build"
}
```

**CI:** A `check-dist.yml` workflow runs on PRs touching `.github/actions/resolve-platform-config/`:
1. `npm ci && npm run build`
2. `git diff --exit-code dist/`
3. Fails if the committed `dist/` is stale

### Test strategy

All tests use Jest with mocked `@actions/core` and `@actions/github`.

**validate.test.ts:**
- Valid modes accepted (empty, `github-env`, `repo-file`, `central-repo`)
- Invalid mode rejected
- Invalid `fields` rejected
- `repo-file` without `repo-file-path` rejected
- `central-repo` without each required input rejected
- Config inputs without `config-mode` rejected

**resolve-repo-file.test.ts:**
- Missing file throws with correct message
- Missing environment key throws with correct message
- Valid file + environment returns parsed config

**resolve-central-repo.test.ts:**
- Mocked Octokit `getContent` returns base64-encoded YAML, parses correctly
- Mocked 404 response throws with correct message
- Directory response (not a file) throws with correct message

**extract-fields.test.ts:**
- `core` fields extracted correctly
- `full` fields extracted correctly
- Missing field throws with correct message including field name, path, source, environment
- Derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER) computed correctly

**main.test.ts:**
- End-to-end: `github-env` mode does nothing, returns without setting `resolved`
- End-to-end: `repo-file` mode reads file, extracts fields, sets env vars
- End-to-end: `central-repo` mode calls API, extracts fields, sets env vars

## Backwards compatibility

- `action.yml` inputs/outputs are identical — no caller changes
- Same error messages — existing error-handling documentation remains accurate
- Same `GITHUB_ENV` variables exported — downstream steps see the same environment
- `resolved` output still set to `'true'` when config is resolved

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| `dist/index.js` gets stale | `check-dist.yml` CI workflow fails on mismatch |
| `repos.getContent()` has different failure modes than `actions/checkout` | Tests mock API errors; error messages preserved |
| Contributors unfamiliar with TypeScript | Action is self-contained; wrapper workflows (YAML) remain unchanged |
| `getContent()` API rate limits | Only called once per action invocation; well within limits |
| `getContent()` file size limit (100MB) | Config files are tiny YAML; not a concern |
| `TENANT_NAME` env var may not be set when derived vars are computed | Same risk exists today; document that `TENANT_NAME` must be in env before the action runs |
