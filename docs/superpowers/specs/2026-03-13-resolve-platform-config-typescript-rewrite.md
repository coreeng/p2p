# Resolve Platform Config: TypeScript Rewrite

## Context

The `resolve-platform-config` composite action (`.github/actions/resolve-platform-config/action.yaml`) was introduced in the `feat/environment-config-resolution` branch to consolidate duplicated environment config resolution across 3 low-level workflows. It works, but has limitations inherent to composite actions:

- **Untestable**: The validation logic has 6+ distinct error paths that can only be tested by running real workflows on GitHub.
- **yq dependency**: Relies on `yq` being pre-installed on the runner. Runner image changes could break the action silently.
- **Heavy central repo fetch**: Uses `actions/checkout@v6` with sparse-checkout to clone a repo for a single YAML file.
- **Bash-in-YAML**: No IDE support, no linting, no type checking for the embedded shell scripts.

## Decision

Rewrite `resolve-platform-config` as a TypeScript GitHub Action using `node24`.

## Design

### Directory structure

```
.github/actions/resolve-platform-config/
  action.yaml                 # using: 'node24', main: 'dist/index.js' (replaces existing file)
  src/
    index.ts                  # ncc entry point — imports and calls run()
    main.ts                   # run() function — orchestrates validation, resolution, field export
    validate.ts               # input validation (mode, required inputs, field set)
    resolve-repo-file.ts      # read local YAML file, extract environment block
    resolve-central-repo.ts   # fetch file from remote repo via GitHub API
    extract-fields.ts         # extract fields from parsed config, export to GITHUB_ENV
    get-nested-value.ts       # property accessor for dot/bracket paths (e.g. ingressDomains[0].domain)
    types.ts                  # TypeScript interfaces for config schema and inputs
  __tests__/
    validate.test.ts
    resolve-repo-file.test.ts
    resolve-central-repo.test.ts
    extract-fields.test.ts
    get-nested-value.test.ts
    main.test.ts              # integration-level test of the full flow
  dist/
    index.js                  # ncc-bundled output (committed to repo)
  package.json
  package-lock.json           # committed for reproducible npm ci
  tsconfig.json
  jest.config.ts
  eslint.config.mjs           # ESLint v9 flat config
  .gitignore                  # excludes node_modules/
```

### action.yaml

The existing `action.yaml` is replaced in-place (same filename). Inputs and outputs remain identical to the current composite action — this is a transparent implementation swap. No caller changes required.

```yaml
name: 'Resolve Platform Config'
description: 'Resolves platform config from one of three mutually exclusive sources'

inputs:
  # (identical to current — environment, config-mode, repo-file-path,
  #  central-repo-name, central-repo-owner, central-repo-path-pattern,
  #  central-repo-token, fields)

outputs:
  resolved:
    description: 'true if config was resolved from repo-file or central-repo, false otherwise'

runs:
  using: 'node24'
  main: 'dist/index.js'
```

### Entry point (main.ts)

```typescript
async function run(): Promise<void> {
  try {
    const inputs = getInputs();        // read from @actions/core
    validateInputs(inputs);            // throw ConfigError on invalid combinations

    if (inputs.configMode === '' || inputs.configMode === 'github-env') {
      core.notice(`Config mode: ${inputs.configMode || '(default: github-env implicit)'}`);
      core.setOutput('resolved', 'false');
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
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}
```

### Error handling (types.ts)

All domain errors use `ConfigError`, a plain `Error` subclass. It carries no special behavior — the top-level catch in `run()` calls `core.setFailed()` to produce the `::error::` annotation.

```typescript
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
```

### Input validation (validate.ts)

Replicates the exact same checks as the current bash step, with the same error messages:

1. `environment` must be non-empty
2. `config-mode` must be one of: `github-env`, `repo-file`, `central-repo`, or empty
3. `fields` must be `core` or `full`
4. `repo-file` mode requires `repo-file-path`
5. `central-repo` mode requires `central-repo-name`, `central-repo-owner`, `central-repo-token`
6. Empty `config-mode` with config inputs present is an error

Each validation failure throws a `ConfigError`. The top-level `run()` function wraps the entire flow in a try/catch that calls `core.setFailed(error.message)`, producing the same `::error::` annotations as today.

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

  if (Array.isArray(data) || data.type !== 'file' || !data.content) {
    throw new ConfigError(
      `Config file not found at '${resolvedPath}' in central repo '${inputs.centralRepoName}'`
    );
  }

  // GitHub API returns base64 encoding for files. Check defensively.
  const encoding = (data as { encoding?: string }).encoding ?? 'base64';
  const content = encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content;
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
    const source = inputs.configMode === 'repo-file'
      ? inputs.repoFilePath
      : inputs.centralRepoName;
    if (value === undefined || value === null || value === '') {
      throw new ConfigError(
        `Field '${envVar}' (path: ${path}) not found in ${inputs.configMode} '${source}' for environment '${inputs.environment}'`
      );
    }
    core.exportVariable(envVar, String(value));
  }

  if (inputs.fields === 'full') {
    core.exportVariable('DPLATFORM', inputs.environment);
    core.exportVariable('PLATFORM_ENVIRONMENT', inputs.environment);
  }

  // Recompute derived vars.
  // TENANT_NAME must be set in the job-level env: block of the calling workflow
  // (it is NOT set by this action). All current callers do this — see
  // p2p-execute-command.yaml line 127, p2p-promote-image.yaml line 81/138.
  // process.env reads job-level env vars; it does NOT see GITHUB_ENV writes
  // from prior steps, only vars set at job definition time.
  const tenantName = process.env.TENANT_NAME;
  if (!tenantName) {
    core.warning('TENANT_NAME is not set in the job environment — derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER) will be incorrect');
  }
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

### Property accessor (get-nested-value.ts)

`getNestedValue` traverses a parsed JS object using dot-and-bracket notation (e.g., `ingressDomains[0].domain`), replacing `yq` path evaluation.

```typescript
export function getNestedValue(obj: unknown, path: string): unknown {
  // Split "ingressDomains[0].domain" into ["ingressDomains", "0", "domain"]
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
```

This is a self-contained ~10-line function. No external dependency (e.g., lodash) needed.

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
  "build": "ncc build src/index.ts -o dist --source-map --license licenses.txt",
  "test": "jest",
  "lint": "eslint src/ __tests__/",
  "all": "npm run lint && npm run test && npm run build"
}
```

**CI:** A `check-dist.yml` workflow ensures the committed `dist/` matches the build output:

```yaml
name: Check dist/
on:
  pull_request:
    paths:
      - '.github/actions/resolve-platform-config/src/**'
      - '.github/actions/resolve-platform-config/package*.json'
      - '.github/actions/resolve-platform-config/tsconfig.json'

jobs:
  check-dist:
    runs-on: ubuntu-24.04
    defaults:
      run:
        working-directory: .github/actions/resolve-platform-config
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Compare dist/
        run: |
          if ! git diff --quiet dist/; then
            echo "::error::dist/ is out of date. Run 'npm run build' and commit."
            git diff dist/
            exit 1
          fi
```

**Node version:** Build toolchain uses Node.js 24 (matching the `using: 'node24'` runtime).

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
- End-to-end: `github-env` mode sets `resolved` to `'false'` and returns without exporting env vars
- End-to-end: `repo-file` mode reads file, extracts fields, sets env vars
- End-to-end: `central-repo` mode calls API, extracts fields, sets env vars

## Backwards compatibility

- `action.yaml` inputs/outputs are identical — no caller changes
- Same error messages — existing error-handling documentation remains accurate
- Same `GITHUB_ENV` variables exported — downstream steps see the same environment
- `resolved` output: `'true'` when config is resolved, explicitly `'false'` when in github-env mode (current composite action also returns `'false'` via its `|| 'false'` fallback)

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| `dist/index.js` gets stale | `check-dist.yml` CI workflow fails on mismatch |
| `repos.getContent()` has different failure modes than `actions/checkout` | Tests mock API errors; error messages preserved |
| Contributors unfamiliar with TypeScript | Action is self-contained; wrapper workflows (YAML) remain unchanged |
| `getContent()` API rate limits | Only called once per action invocation; well within limits |
| `getContent()` file size limit (100MB) | Config files are tiny YAML; not a concern |
| `TENANT_NAME` not in job-level env | Action emits a `core.warning()` if `TENANT_NAME` is empty; all current callers set it at job level |
| `process.env` doesn't see prior-step `GITHUB_ENV` writes | `TENANT_NAME` is set in job-level `env:` blocks, not via `GITHUB_ENV` writes — this is documented as a constraint |
