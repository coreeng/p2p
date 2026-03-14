# Resolve Platform Config TypeScript Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the `resolve-platform-config` composite action as a TypeScript GitHub Action, replacing bash/yq/actions-checkout with typed JS, js-yaml, and the GitHub API.

**Architecture:** Single Node.js 20 action under `.github/actions/resolve-platform-config/`. Entry point orchestrates: validate inputs → resolve config (local file or GitHub API) → extract fields → export to `GITHUB_ENV`. All logic is unit-testable with Jest. The bundled `dist/index.js` (via ncc) is committed alongside source.

**Tech Stack:** TypeScript, Node.js 20, `@actions/core`, `@actions/github`, `js-yaml`, Jest, `@vercel/ncc`

**Spec:** `docs/superpowers/specs/2026-03-13-resolve-platform-config-typescript-rewrite.md`

---

## Chunk 1: Project scaffold and types

### Task 1: Initialize the Node.js project

All commands run from the action directory: `.github/actions/resolve-platform-config/`

**Files:**
- Create: `.github/actions/resolve-platform-config/package.json`
- Create: `.github/actions/resolve-platform-config/tsconfig.json`
- Create: `.github/actions/resolve-platform-config/jest.config.ts`
- Create: `.github/actions/resolve-platform-config/eslint.config.mjs`
- Create: `.github/actions/resolve-platform-config/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "resolve-platform-config",
  "version": "1.0.0",
  "private": true,
  "description": "Resolves platform config from GitHub Environments, repo file, or central repo",
  "main": "dist/index.js",
  "scripts": {
    "build": "ncc build src/index.ts -o dist --source-map --license licenses.txt",
    "test": "jest",
    "lint": "eslint src/ __tests__/",
    "all": "npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "@actions/github": "^6.0.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.17.0",
    "@vercel/ncc": "^0.38.3",
    "eslint": "^9.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

- [ ] **Step 3: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  verbose: true,
};

export default config;
```

- [ ] **Step 4: Create eslint.config.mjs**

```javascript
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/', 'lib/', 'node_modules/', 'jest.config.ts'],
  }
);
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
lib/
```

- [ ] **Step 6: Run npm install**

Run: `cd .github/actions/resolve-platform-config && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd .github/actions/resolve-platform-config && npx tsc --noEmit`
Expected: No errors (no source files yet, so this is a baseline check)

- [ ] **Step 8: Commit scaffold**

```bash
cd .github/actions/resolve-platform-config
git add package.json package-lock.json tsconfig.json jest.config.ts eslint.config.mjs .gitignore
git commit -m "chore: initialize TypeScript project for resolve-platform-config action"
```

---

### Task 2: Create types and ConfigError

**Files:**
- Create: `.github/actions/resolve-platform-config/src/types.ts`

- [ ] **Step 1: Write the test**

Create `.github/actions/resolve-platform-config/__tests__/types.test.ts`:

```typescript
import { ConfigError } from '../src/types';

describe('ConfigError', () => {
  it('has name ConfigError', () => {
    const err = new ConfigError('test message');
    expect(err.name).toBe('ConfigError');
  });

  it('extends Error', () => {
    const err = new ConfigError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test message');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/types.test.ts`
Expected: FAIL — `Cannot find module '../src/types'`

- [ ] **Step 3: Write types.ts**

Create `.github/actions/resolve-platform-config/src/types.ts`:

```typescript
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts __tests__/types.test.ts
git commit -m "feat: add types and ConfigError for resolve-platform-config"
```

---

## Chunk 2: get-nested-value and validate

### Task 3: Implement get-nested-value

**Files:**
- Create: `.github/actions/resolve-platform-config/src/get-nested-value.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/get-nested-value.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/get-nested-value.test.ts`:

```typescript
import { getNestedValue } from '../src/get-nested-value';

describe('getNestedValue', () => {
  const config = {
    platform: {
      projectId: 'my-project',
      projectNumber: '123456',
      region: 'europe-west2',
    },
    ingressDomains: [{ domain: 'dev.example.com' }],
    internalServices: { domain: 'internal.dev.example.com' },
  };

  it('resolves simple dot paths', () => {
    expect(getNestedValue(config, 'platform.projectId')).toBe('my-project');
    expect(getNestedValue(config, 'platform.region')).toBe('europe-west2');
  });

  it('resolves array bracket notation', () => {
    expect(getNestedValue(config, 'ingressDomains[0].domain')).toBe(
      'dev.example.com'
    );
  });

  it('resolves nested object paths', () => {
    expect(getNestedValue(config, 'internalServices.domain')).toBe(
      'internal.dev.example.com'
    );
  });

  it('returns undefined for missing paths', () => {
    expect(getNestedValue(config, 'platform.nonexistent')).toBeUndefined();
    expect(getNestedValue(config, 'missing.deeply.nested')).toBeUndefined();
  });

  it('returns undefined for null/undefined input', () => {
    expect(getNestedValue(null, 'any.path')).toBeUndefined();
    expect(getNestedValue(undefined, 'any.path')).toBeUndefined();
  });

  it('returns undefined for out-of-bounds array index', () => {
    expect(getNestedValue(config, 'ingressDomains[5].domain')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/get-nested-value.test.ts`
Expected: FAIL — `Cannot find module '../src/get-nested-value'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/get-nested-value.ts`:

```typescript
export function getNestedValue(obj: unknown, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/get-nested-value.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/get-nested-value.ts __tests__/get-nested-value.test.ts
git commit -m "feat: add getNestedValue property accessor"
```

---

### Task 4: Implement input validation

**Files:**
- Create: `.github/actions/resolve-platform-config/src/validate.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/validate.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/validate.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/validate.test.ts`
Expected: FAIL — `Cannot find module '../src/validate'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/validate.ts`:

```typescript
import { ActionInputs, ConfigError } from './types';

const VALID_MODES = ['', 'github-env', 'repo-file', 'central-repo'];
const VALID_FIELDS = ['core', 'full'];

export function validateInputs(inputs: ActionInputs): void {
  if (!inputs.environment) {
    throw new ConfigError('environment is required and must be non-empty');
  }

  if (!VALID_MODES.includes(inputs.configMode)) {
    throw new ConfigError(
      `Invalid config-mode '${inputs.configMode}'. Must be one of: github-env, repo-file, central-repo`
    );
  }

  if (!VALID_FIELDS.includes(inputs.fields)) {
    throw new ConfigError(
      `Invalid fields '${inputs.fields}'. Must be one of: core, full`
    );
  }

  if (inputs.configMode === 'repo-file' && !inputs.repoFilePath) {
    throw new ConfigError(
      "config-mode is 'repo-file' but repo-file-path is not set"
    );
  }

  if (inputs.configMode === 'central-repo') {
    if (!inputs.centralRepoName) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-name is not set"
      );
    }
    if (!inputs.centralRepoOwner) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-owner is not set"
      );
    }
    if (!inputs.centralRepoToken) {
      throw new ConfigError(
        "config-mode is 'central-repo' but central-repo-token is not set"
      );
    }
  }

  if (inputs.configMode === '') {
    if (
      inputs.repoFilePath ||
      inputs.centralRepoName ||
      inputs.centralRepoOwner ||
      inputs.centralRepoToken
    ) {
      throw new ConfigError(
        'config-mode is not set but repo-file or central-repo inputs are provided. Set config-mode explicitly.'
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/validate.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/validate.ts __tests__/validate.test.ts
git commit -m "feat: add input validation for resolve-platform-config"
```

---

## Chunk 3: resolve-repo-file

### Task 5: Implement repo-file resolution

**Files:**
- Create: `.github/actions/resolve-platform-config/src/resolve-repo-file.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/resolve-repo-file.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/resolve-repo-file.test.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveRepoFile } from '../src/resolve-repo-file';
import { ConfigError } from '../src/types';

// Mock @actions/core to suppress notice() output
jest.mock('@actions/core', () => ({
  notice: jest.fn(),
}));

describe('resolveRepoFile', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-repo-file-'));
    configPath = path.join(tmpDir, '.p2p.yaml');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws ConfigError when file does not exist', () => {
    expect(() => resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')).toThrow(
      ConfigError
    );
    expect(() =>
      resolveRepoFile('/nonexistent/.p2p.yaml', 'gcp-dev')
    ).toThrow("Config file '/nonexistent/.p2p.yaml' not found");
  });

  it('throws ConfigError when environment key is missing', () => {
    fs.writeFileSync(
      configPath,
      `environments:
  gcp-prod:
    platform:
      projectId: prod-project
      projectNumber: "999"
      region: us-east1
`
    );
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(ConfigError);
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(
      `Environment 'gcp-dev' not found in '${configPath}'`
    );
  });

  it('returns parsed environment config for valid file and environment', () => {
    fs.writeFileSync(
      configPath,
      `environments:
  gcp-dev:
    platform:
      projectId: my-project-dev
      projectNumber: "123456"
      region: europe-west2
    ingressDomains:
      - domain: dev.example.com
    internalServices:
      domain: internal.dev.example.com
`
    );
    const result = resolveRepoFile(configPath, 'gcp-dev');
    expect(result.platform.projectId).toBe('my-project-dev');
    expect(result.platform.projectNumber).toBe('123456');
    expect(result.platform.region).toBe('europe-west2');
    expect(result.ingressDomains?.[0].domain).toBe('dev.example.com');
    expect(result.internalServices?.domain).toBe('internal.dev.example.com');
  });

  it('throws ConfigError when environments key is missing entirely', () => {
    fs.writeFileSync(configPath, 'someOtherKey: value\n');
    expect(() => resolveRepoFile(configPath, 'gcp-dev')).toThrow(
      `Environment 'gcp-dev' not found in '${configPath}'`
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/resolve-repo-file.test.ts`
Expected: FAIL — `Cannot find module '../src/resolve-repo-file'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/resolve-repo-file.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/resolve-repo-file.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/resolve-repo-file.ts __tests__/resolve-repo-file.test.ts
git commit -m "feat: add repo-file resolution for resolve-platform-config"
```

---

## Chunk 4: resolve-central-repo

### Task 6: Implement central-repo resolution

**Files:**
- Create: `.github/actions/resolve-platform-config/src/resolve-central-repo.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/resolve-central-repo.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/resolve-central-repo.test.ts`:

```typescript
import { resolveCentralRepo } from '../src/resolve-central-repo';
import { ActionInputs, ConfigError } from '../src/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  notice: jest.fn(),
}));

// Mock @actions/github
const mockGetContent = jest.fn();
jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      repos: {
        getContent: mockGetContent,
      },
    },
  }),
}));

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    configMode: 'central-repo',
    repoFilePath: '',
    centralRepoName: 'platform-config',
    centralRepoOwner: 'coreeng',
    centralRepoToken: 'ghp_test_token',
    centralRepoPathPattern: 'environments/{env}/config.yaml',
    fields: 'full',
    ...overrides,
  };
}

const sampleYaml = `platform:
  projectId: my-project-dev
  projectNumber: "123456"
  region: europe-west2
ingressDomains:
  - domain: dev.example.com
internalServices:
  domain: internal.dev.example.com
`;

describe('resolveCentralRepo', () => {
  beforeEach(() => {
    mockGetContent.mockReset();
  });

  it('fetches and parses config from central repo', async () => {
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        content: Buffer.from(sampleYaml).toString('base64'),
        encoding: 'base64',
      },
    });

    const result = await resolveCentralRepo(makeInputs());

    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'coreeng',
      repo: 'platform-config',
      path: 'environments/gcp-dev/config.yaml',
    });
    expect(result.platform.projectId).toBe('my-project-dev');
    expect(result.platform.region).toBe('europe-west2');
  });

  it('replaces {env} in path pattern', async () => {
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        content: Buffer.from(sampleYaml).toString('base64'),
        encoding: 'base64',
      },
    });

    await resolveCentralRepo(
      makeInputs({
        environment: 'gcp-prod',
        centralRepoPathPattern: 'envs/{env}/platform.yaml',
      })
    );

    expect(mockGetContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'envs/gcp-prod/platform.yaml' })
    );
  });

  it('throws ConfigError when API returns a directory', async () => {
    mockGetContent.mockResolvedValue({
      data: [{ type: 'dir', name: 'subdir' }],
    });

    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(
      ConfigError
    );
    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(
      "Config file not found at 'environments/gcp-dev/config.yaml' in central repo 'platform-config'"
    );
  });

  it('throws ConfigError when file has no content', async () => {
    mockGetContent.mockResolvedValue({
      data: { type: 'file', content: null },
    });

    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(
      ConfigError
    );
  });

  it('handles non-base64 encoding', async () => {
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        content: sampleYaml,
        encoding: 'none',
      },
    });

    const result = await resolveCentralRepo(makeInputs());
    expect(result.platform.projectId).toBe('my-project-dev');
  });

  it('throws ConfigError on 404 (Octokit throws RequestError)', async () => {
    const error = new Error('Not Found');
    (error as unknown as { status: number }).status = 404;
    mockGetContent.mockRejectedValue(error);

    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(
      ConfigError
    );
    await expect(resolveCentralRepo(makeInputs())).rejects.toThrow(
      "Config file not found at 'environments/gcp-dev/config.yaml' in central repo 'platform-config'"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/resolve-central-repo.test.ts`
Expected: FAIL — `Cannot find module '../src/resolve-central-repo'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/resolve-central-repo.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/resolve-central-repo.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/resolve-central-repo.ts __tests__/resolve-central-repo.test.ts
git commit -m "feat: add central-repo resolution via GitHub API"
```

---

## Chunk 5: extract-fields

### Task 7: Implement field extraction and env var export

**Files:**
- Create: `.github/actions/resolve-platform-config/src/extract-fields.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/extract-fields.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/extract-fields.test.ts`:

```typescript
import { extractAndExportFields } from '../src/extract-fields';
import { ActionInputs, ConfigError, EnvironmentConfig } from '../src/types';

const mockExportVariable = jest.fn();
const mockWarning = jest.fn();
jest.mock('@actions/core', () => ({
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
}));

const fullConfig: EnvironmentConfig = {
  platform: {
    projectId: 'my-project-dev',
    projectNumber: '123456',
    region: 'europe-west2',
  },
  ingressDomains: [{ domain: 'dev.example.com' }],
  internalServices: { domain: 'internal.dev.example.com' },
};

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
  return {
    environment: 'gcp-dev',
    configMode: 'repo-file',
    repoFilePath: '.p2p.yaml',
    centralRepoName: '',
    centralRepoOwner: '',
    centralRepoToken: '',
    centralRepoPathPattern: '',
    fields: 'full',
    ...overrides,
  };
}

describe('extractAndExportFields', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockExportVariable.mockClear();
    mockWarning.mockClear();
    process.env = { ...originalEnv, TENANT_NAME: 'my-tenant' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exports core fields for fields=core', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_NUMBER',
      '123456'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'REGION',
      'europe-west2'
    );
    // Should NOT set DPLATFORM or PLATFORM_ENVIRONMENT for core mode
    expect(mockExportVariable).not.toHaveBeenCalledWith(
      'DPLATFORM',
      expect.anything()
    );
  });

  it('exports core + full fields for fields=full', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'full' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'dev.example.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'INTERNAL_SERVICES_DOMAIN',
      'internal.dev.example.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith('DPLATFORM', 'gcp-dev');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PLATFORM_ENVIRONMENT',
      'gcp-dev'
    );
  });

  it('exports derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER)', () => {
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));

    expect(mockExportVariable).toHaveBeenCalledWith(
      'REGISTRY',
      'europe-west2-docker.pkg.dev/my-project-dev/tenant/my-tenant'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'SERVICE_ACCOUNT',
      'p2p-my-tenant@my-project-dev.iam.gserviceaccount.com'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'WORKLOAD_IDENTITY_PROVIDER',
      'projects/123456/locations/global/workloadIdentityPools/p2p-my-tenant/providers/p2p-my-tenant'
    );
  });

  it('throws ConfigError for missing required field', () => {
    const incompleteConfig: EnvironmentConfig = {
      platform: {
        projectId: 'my-project',
        projectNumber: '123',
        region: 'europe-west2',
      },
      // missing ingressDomains and internalServices
    };

    expect(() =>
      extractAndExportFields(incompleteConfig, makeInputs({ fields: 'full' }))
    ).toThrow(ConfigError);
    expect(() =>
      extractAndExportFields(incompleteConfig, makeInputs({ fields: 'full' }))
    ).toThrow("Field 'BASE_DOMAIN'");
  });

  it('warns when TENANT_NAME is not set', () => {
    delete process.env.TENANT_NAME;
    extractAndExportFields(fullConfig, makeInputs({ fields: 'core' }));
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('TENANT_NAME is not set')
    );
  });

  it('uses centralRepoName as source label for central-repo mode', () => {
    const config: EnvironmentConfig = {
      platform: {
        projectId: 'my-project',
        projectNumber: '123',
        region: 'europe-west2',
      },
    };

    expect(() =>
      extractAndExportFields(
        config,
        makeInputs({
          configMode: 'central-repo',
          centralRepoName: 'platform-config',
          fields: 'full',
        })
      )
    ).toThrow("in central-repo 'platform-config'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/extract-fields.test.ts`
Expected: FAIL — `Cannot find module '../src/extract-fields'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/extract-fields.ts`:

```typescript
import * as core from '@actions/core';
import { ActionInputs, ConfigError, EnvironmentConfig, FieldMapping } from './types';
import { getNestedValue } from './get-nested-value';

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
  const fields =
    inputs.fields === 'full'
      ? [...CORE_FIELDS, ...FULL_FIELDS]
      : CORE_FIELDS;

  for (const { envVar, path } of fields) {
    const value = getNestedValue(config, path);
    const source =
      inputs.configMode === 'repo-file'
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
  // TENANT_NAME must be set in the job-level env: block of the calling workflow.
  // process.env reads job-level env vars; it does NOT see GITHUB_ENV writes
  // from prior steps.
  const tenantName = process.env.TENANT_NAME;
  if (!tenantName) {
    core.warning(
      'TENANT_NAME is not set in the job environment — derived vars (REGISTRY, SERVICE_ACCOUNT, WORKLOAD_IDENTITY_PROVIDER) will be incorrect'
    );
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/extract-fields.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/extract-fields.ts __tests__/extract-fields.test.ts
git commit -m "feat: add field extraction and env var export"
```

---

## Chunk 6: main entry point, action.yaml, and build

### Task 8: Implement main.ts entry point

**Files:**
- Create: `.github/actions/resolve-platform-config/src/main.ts`
- Create: `.github/actions/resolve-platform-config/__tests__/main.test.ts`

- [ ] **Step 1: Write the tests**

Create `.github/actions/resolve-platform-config/__tests__/main.test.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { run } from '../src/main';

const mockGetInput = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockNotice = jest.fn();
const mockExportVariable = jest.fn();
const mockWarning = jest.fn();

jest.mock('@actions/core', () => ({
  getInput: (...args: unknown[]) => mockGetInput(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
  exportVariable: (...args: unknown[]) => mockExportVariable(...args),
  warning: (...args: unknown[]) => mockWarning(...args),
}));

const mockGetContent = jest.fn();
jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: { repos: { getContent: mockGetContent } },
  }),
}));

const sampleYaml = `platform:
  projectId: central-project
  projectNumber: "789"
  region: us-east1
ingressDomains:
  - domain: central.example.com
internalServices:
  domain: internal.central.example.com
`;

describe('main', () => {
  const originalEnv = process.env;
  let tmpDir: string;

  beforeEach(() => {
    mockGetInput.mockReset();
    mockSetOutput.mockReset();
    mockSetFailed.mockReset();
    mockNotice.mockReset();
    mockExportVariable.mockReset();
    mockWarning.mockReset();
    mockGetContent.mockReset();
    process.env = { ...originalEnv, TENANT_NAME: 'my-tenant' };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupInputs(inputs: Record<string, string>): void {
    mockGetInput.mockImplementation((name: string) => inputs[name] ?? '');
  }

  it('github-env mode sets resolved=false and returns early', async () => {
    setupInputs({
      environment: 'gcp-dev',
      'config-mode': '',
      'repo-file-path': '',
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'false');
    expect(mockExportVariable).not.toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('repo-file mode reads file and exports env vars', async () => {
    const configPath = path.join(tmpDir, '.p2p.yaml');
    fs.writeFileSync(
      configPath,
      `environments:
  gcp-dev:
    platform:
      projectId: my-project-dev
      projectNumber: "123456"
      region: europe-west2
    ingressDomains:
      - domain: dev.example.com
    internalServices:
      domain: internal.dev.example.com
`
    );

    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'repo-file',
      'repo-file-path': configPath,
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'my-project-dev'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'dev.example.com'
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('central-repo mode calls API and exports env vars', async () => {
    mockGetContent.mockResolvedValue({
      data: {
        type: 'file',
        content: Buffer.from(sampleYaml).toString('base64'),
        encoding: 'base64',
      },
    });

    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'central-repo',
      'repo-file-path': '',
      'central-repo-name': 'platform-config',
      'central-repo-owner': 'coreeng',
      'central-repo-token': 'ghp_test_token',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'coreeng',
      repo: 'platform-config',
      path: 'environments/gcp-dev/config.yaml',
    });
    expect(mockSetOutput).toHaveBeenCalledWith('resolved', 'true');
    expect(mockExportVariable).toHaveBeenCalledWith(
      'PROJECT_ID',
      'central-project'
    );
    expect(mockExportVariable).toHaveBeenCalledWith(
      'BASE_DOMAIN',
      'central.example.com'
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('calls setFailed on validation error', async () => {
    setupInputs({
      environment: 'gcp-dev',
      'config-mode': 'invalid-mode',
      'repo-file-path': '',
      'central-repo-name': '',
      'central-repo-owner': '',
      'central-repo-token': '',
      'central-repo-path-pattern': 'environments/{env}/config.yaml',
      fields: 'full',
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid config-mode 'invalid-mode'")
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/main.test.ts`
Expected: FAIL — `Cannot find module '../src/main'`

- [ ] **Step 3: Write the implementation**

Create `.github/actions/resolve-platform-config/src/main.ts`:

```typescript
import * as core from '@actions/core';
import { ActionInputs, EnvironmentConfig } from './types';
import { validateInputs } from './validate';
import { resolveRepoFile } from './resolve-repo-file';
import { resolveCentralRepo } from './resolve-central-repo';
import { extractAndExportFields } from './extract-fields';

function getInputs(): ActionInputs {
  return {
    environment: core.getInput('environment'),
    configMode: core.getInput('config-mode') as ActionInputs['configMode'],
    repoFilePath: core.getInput('repo-file-path'),
    centralRepoName: core.getInput('central-repo-name'),
    centralRepoOwner: core.getInput('central-repo-owner'),
    centralRepoToken: core.getInput('central-repo-token'),
    centralRepoPathPattern: core.getInput('central-repo-path-pattern'),
    fields: core.getInput('fields') as ActionInputs['fields'],
  };
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);

    if (inputs.configMode === '' || inputs.configMode === 'github-env') {
      core.notice(
        `Config mode: ${inputs.configMode || '(default: github-env implicit)'}`
      );
      core.setOutput('resolved', 'false');
      return;
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

Then create the entry point that ncc bundles. Create `.github/actions/resolve-platform-config/src/index.ts`:

```typescript
import { run } from './main';

run();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .github/actions/resolve-platform-config && npx jest __tests__/main.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run all tests**

Run: `cd .github/actions/resolve-platform-config && npx jest`
Expected: All test suites pass

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/index.ts __tests__/main.test.ts
git commit -m "feat: add main entry point for resolve-platform-config action"
```

---

### Task 9: Replace action.yaml and build dist/

**Files:**
- Modify: `.github/actions/resolve-platform-config/action.yaml` (replace composite with node24)

- [ ] **Step 1: Replace action.yaml**

Replace the entire contents of `.github/actions/resolve-platform-config/action.yaml` with:

```yaml
name: 'Resolve Platform Config'
description: 'Resolves platform config from one of three mutually exclusive sources'

inputs:
  environment:
    description: 'Environment name (e.g. gcp-dev)'
    required: true
  config-mode:
    description: 'Config source: github-env, repo-file, or central-repo'
    required: false
    default: ''
  repo-file-path:
    description: 'Path to tenant repo config file (e.g. .p2p.yaml)'
    required: false
    default: ''
  central-repo-name:
    description: 'Central config repo name'
    required: false
    default: ''
  central-repo-owner:
    description: 'Central config repo owner'
    required: false
    default: ''
  central-repo-path-pattern:
    description: 'Path pattern in central repo ({env} replaced with environment name)'
    required: false
    default: 'environments/{env}/config.yaml'
  central-repo-token:
    description: 'Token for central repo access (PAT, GitHub App token, or GITHUB_TOKEN)'
    required: false
    default: ''
  fields:
    description: 'Field set to resolve: core or full'
    required: false
    default: 'full'

outputs:
  resolved:
    description: 'true if config was resolved from repo-file or central-repo, false otherwise'

runs:
  using: 'node24'
  main: 'dist/index.js'
```

- [ ] **Step 2: Build dist/index.js**

Run: `cd .github/actions/resolve-platform-config && npm run build`
Expected: `dist/index.js` created (and `dist/index.js.map`, `dist/licenses.txt`)

Note: the build entry point is `src/index.ts` (which imports and calls `run()` from `main.ts`). This separation ensures `main.ts` can be imported in tests without triggering `run()` as a side effect.

- [ ] **Step 3: Run all tests one final time**

Run: `cd .github/actions/resolve-platform-config && npm run all`
Expected: lint passes, all tests pass, build succeeds

- [ ] **Step 4: Commit**

```bash
cd .github/actions/resolve-platform-config
git add action.yaml dist/ src/ __tests__/
git commit -m "feat: replace composite action with TypeScript implementation

Replaces the bash/yq composite action with a TypeScript node24 action.
- js-yaml replaces yq dependency
- GitHub API (repos.getContent) replaces actions/checkout for central repo
- @actions/core.exportVariable replaces GITHUB_ENV writes
- Full Jest test suite covers all validation and resolution paths"
```

---

## Chunk 7: CI workflow for dist/ verification

### Task 10: Add check-dist CI workflow

**Files:**
- Create: `.github/workflows/check-dist.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/check-dist.yml`:

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
      - run: npm test
      - run: npm run build
      - name: Compare dist/
        run: |
          if ! git diff --quiet dist/; then
            echo "::error::dist/ is out of date. Run 'npm run build' and commit."
            git diff dist/
            exit 1
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/check-dist.yml
git commit -m "ci: add check-dist workflow for resolve-platform-config action"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `cd .github/actions/resolve-platform-config && npm run all`
Expected: lint, tests, and build all pass

- [ ] **Step 2: Verify dist/ is up to date**

Run: `cd .github/actions/resolve-platform-config && npm run build && git diff --quiet dist/`
Expected: Exit code 0 (no changes)

- [ ] **Step 3: Verify action.yaml inputs match the original**

Compare the input names and defaults in the new `action.yaml` against the spec. All 8 inputs must be present with identical names, descriptions, required flags, and defaults.

- [ ] **Step 4: Push and verify CI**

Run: `git push`
Expected: check-dist workflow runs on the PR and passes
