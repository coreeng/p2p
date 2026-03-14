# Resolve Environment Composite Action Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated environment config resolution logic across 3 workflows with a single composite action enforcing mutually exclusive config modes.

**Architecture:** A composite action at `.github/actions/resolve-environment/action.yaml` handles validation, config loading, field extraction, and derived variable recomputation. Calling workflows pass a `config-mode` input to select one of three modes (`github-env`, `repo-file`, `central-repo`). Mid-level and wrapper workflows pass config inputs through unchanged.

**Tech Stack:** GitHub Actions composite actions, YAML, bash, yq

**Spec:** `docs/superpowers/specs/2026-03-13-resolve-environment-composite-action.md`

---

## Chunk 1: Create the composite action

### Task 1: Create composite action with input validation

**Files:**
- Create: `.github/actions/resolve-environment/action.yaml`

- [ ] **Step 1: Create the action file with inputs and validation step**

```yaml
name: 'Resolve Environment'
description: 'Resolves environment config from one of three mutually exclusive sources'

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
    description: 'Pre-generated token for central repo access'
    required: false
    default: ''
  fields:
    description: 'Field set to resolve: core or full'
    required: false
    default: 'full'

outputs:
  resolved:
    description: 'true if config was resolved from repo-file or central-repo, false otherwise'
    value: ${{ steps.resolve.outputs.resolved || 'false' }}

runs:
  using: 'composite'
  steps:
    - name: Validate config-mode inputs
      shell: bash
      env:
        CONFIG_MODE: ${{ inputs.config-mode }}
        REPO_FILE_PATH: ${{ inputs.repo-file-path }}
        CENTRAL_REPO_NAME: ${{ inputs.central-repo-name }}
        CENTRAL_REPO_OWNER: ${{ inputs.central-repo-owner }}
        CENTRAL_REPO_TOKEN: ${{ inputs.central-repo-token }}
        FIELDS: ${{ inputs.fields }}
      run: |
        set -euo pipefail

        # Validate config-mode value
        if [[ -n "$CONFIG_MODE" && "$CONFIG_MODE" != "github-env" && "$CONFIG_MODE" != "repo-file" && "$CONFIG_MODE" != "central-repo" ]]; then
          echo "::error::Invalid config-mode '${CONFIG_MODE}'. Must be one of: github-env, repo-file, central-repo"
          exit 1
        fi

        # Validate fields value
        if [[ "$FIELDS" != "core" && "$FIELDS" != "full" ]]; then
          echo "::error::Invalid fields '${FIELDS}'. Must be one of: core, full"
          exit 1
        fi

        # Validate repo-file mode has required inputs
        if [[ "$CONFIG_MODE" == "repo-file" && -z "$REPO_FILE_PATH" ]]; then
          echo "::error::config-mode is 'repo-file' but repo-file-path is not set"
          exit 1
        fi

        # Validate central-repo mode has required inputs
        if [[ "$CONFIG_MODE" == "central-repo" ]]; then
          [[ -z "$CENTRAL_REPO_NAME" ]] && echo "::error::config-mode is 'central-repo' but central-repo-name is not set" && exit 1
          [[ -z "$CENTRAL_REPO_OWNER" ]] && echo "::error::config-mode is 'central-repo' but central-repo-owner is not set" && exit 1
          [[ -z "$CENTRAL_REPO_TOKEN" ]] && echo "::error::config-mode is 'central-repo' but central-repo-token is not set" && exit 1
        fi

        # Validate no config inputs when mode is empty (force explicit intent)
        # Note: central-repo-path-pattern is excluded because it has a non-empty default
        if [[ -z "$CONFIG_MODE" ]]; then
          if [[ -n "$REPO_FILE_PATH" || -n "$CENTRAL_REPO_NAME" || -n "$CENTRAL_REPO_OWNER" || -n "$CENTRAL_REPO_TOKEN" ]]; then
            echo "::error::config-mode is not set but repo-file or central-repo inputs are provided. Set config-mode explicitly."
            exit 1
          fi
        fi

        echo "::notice::Config mode: ${CONFIG_MODE:-'(default: github-env implicit)'}"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yq '.' .github/actions/resolve-environment/action.yaml > /dev/null`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add .github/actions/resolve-environment/action.yaml
git commit -m "feat: create resolve-environment composite action with input validation"
```

### Task 2: Add repo-file resolution mode

**Files:**
- Modify: `.github/actions/resolve-environment/action.yaml`

- [ ] **Step 1: Add repo-file resolution step after validation**

Add these steps after the validation step in `action.yaml`:

```yaml
    - name: Resolve config from tenant repo file
      id: repo-file
      if: ${{ inputs.config-mode == 'repo-file' }}
      shell: bash
      env:
        REPO_FILE_PATH: ${{ inputs.repo-file-path }}
        ENVIRONMENT: ${{ inputs.environment }}
      run: |
        set -euo pipefail
        if [[ ! -f "$REPO_FILE_PATH" ]]; then
          echo "::error::Config file '${REPO_FILE_PATH}' not found"
          exit 1
        fi
        if ! yq -e ".environments.${ENVIRONMENT}" "$REPO_FILE_PATH" > /dev/null 2>&1; then
          echo "::error::Environment '${ENVIRONMENT}' not found in '${REPO_FILE_PATH}'"
          exit 1
        fi
        echo "::notice::Resolving environment config from ${REPO_FILE_PATH} (${ENVIRONMENT})"
        yq ".environments.${ENVIRONMENT}" "$REPO_FILE_PATH" > /tmp/resolved-config.yaml
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yq '.' .github/actions/resolve-environment/action.yaml > /dev/null`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add .github/actions/resolve-environment/action.yaml
git commit -m "feat: add repo-file resolution mode to resolve-environment action"
```

### Task 3: Add central-repo resolution mode

**Files:**
- Modify: `.github/actions/resolve-environment/action.yaml`

- [ ] **Step 1: Add path resolution and checkout steps**

Add these steps after the repo-file step:

```yaml
    - name: Resolve central repo path
      id: central-path
      if: ${{ inputs.config-mode == 'central-repo' }}
      shell: bash
      env:
        PATH_PATTERN: ${{ inputs.central-repo-path-pattern }}
        ENVIRONMENT: ${{ inputs.environment }}
      run: |
        RESOLVED_PATH="${PATH_PATTERN//\{env\}/$ENVIRONMENT}"
        echo "path=${RESOLVED_PATH}" >> "$GITHUB_OUTPUT"

    - name: Checkout central environment config
      if: ${{ inputs.config-mode == 'central-repo' }}
      uses: actions/checkout@v6
      with:
        repository: ${{ inputs.central-repo-owner }}/${{ inputs.central-repo-name }}
        token: ${{ inputs.central-repo-token }}
        path: /tmp/${{ inputs.central-repo-name }}
        sparse-checkout: |
          ${{ steps.central-path.outputs.path }}

    - name: Resolve config from central repo
      id: central-repo
      if: ${{ inputs.config-mode == 'central-repo' }}
      shell: bash
      env:
        CENTRAL_REPO_NAME: ${{ inputs.central-repo-name }}
        RESOLVED_PATH: ${{ steps.central-path.outputs.path }}
      run: |
        set -euo pipefail
        CENTRAL_CONFIG_PATH="/tmp/${CENTRAL_REPO_NAME}/${RESOLVED_PATH}"
        if [[ ! -f "$CENTRAL_CONFIG_PATH" ]]; then
          echo "::error::Config file not found at '${RESOLVED_PATH}' in central repo '${CENTRAL_REPO_NAME}'"
          exit 1
        fi
        echo "::notice::Resolving environment config from ${CENTRAL_REPO_NAME} (${RESOLVED_PATH})"
        cp "$CENTRAL_CONFIG_PATH" /tmp/resolved-config.yaml
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yq '.' .github/actions/resolve-environment/action.yaml > /dev/null`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add .github/actions/resolve-environment/action.yaml
git commit -m "feat: add central-repo resolution mode to resolve-environment action"
```

### Task 4: Add field extraction, validation, and derived variable recomputation

**Files:**
- Modify: `.github/actions/resolve-environment/action.yaml`

- [ ] **Step 1: Add field extraction and resolve output step**

Add after the central-repo step:

```yaml
    - name: Extract and validate fields
      id: resolve
      if: ${{ inputs.config-mode == 'repo-file' || inputs.config-mode == 'central-repo' }}
      shell: bash
      env:
        FIELDS: ${{ inputs.fields }}
        ENVIRONMENT: ${{ inputs.environment }}
        CONFIG_MODE: ${{ inputs.config-mode }}
        SOURCE_LABEL: ${{ inputs.config-mode == 'repo-file' && inputs.repo-file-path || inputs.central-repo-name }}
      run: |
        set -euo pipefail
        CONFIG=$(cat /tmp/resolved-config.yaml)

        # Define field mappings
        CORE_FIELDS=(
          "PROJECT_ID:.platform.projectId"
          "PROJECT_NUMBER:.platform.projectNumber"
          "REGION:.platform.region"
        )
        FULL_FIELDS=(
          "BASE_DOMAIN:.ingressDomains[0].domain"
          "INTERNAL_SERVICES_DOMAIN:.internalServices.domain"
        )

        # Select fields based on mode
        if [[ "$FIELDS" == "full" ]]; then
          FIELD_LIST=("${CORE_FIELDS[@]}" "${FULL_FIELDS[@]}")
        else
          FIELD_LIST=("${CORE_FIELDS[@]}")
        fi

        # Extract and validate each field
        for pair in "${FIELD_LIST[@]}"; do
          key="${pair%%:*}"
          path="${pair#*:}"
          val=$(echo "$CONFIG" | yq "${path} // empty")
          if [[ -z "$val" ]]; then
            echo "::error::Field '${key}' (path: ${path}) not found in ${CONFIG_MODE} '${SOURCE_LABEL}' for environment '${ENVIRONMENT}'"
            exit 1
          fi
          echo "${key}=${val}" >> "$GITHUB_ENV"
        done

        # Set DPLATFORM and PLATFORM_ENVIRONMENT for full mode
        if [[ "$FIELDS" == "full" ]]; then
          echo "DPLATFORM=${ENVIRONMENT}" >> "$GITHUB_ENV"
          echo "PLATFORM_ENVIRONMENT=${ENVIRONMENT}" >> "$GITHUB_ENV"
        fi

        echo "resolved=true" >> "$GITHUB_OUTPUT"

    - name: Recompute derived env vars
      if: ${{ steps.resolve.outputs.resolved == 'true' }}
      shell: bash
      run: |
        echo "REGISTRY=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/tenant/${{ env.TENANT_NAME }}" >> "$GITHUB_ENV"
        echo "SERVICE_ACCOUNT=p2p-${{ env.TENANT_NAME }}@${{ env.PROJECT_ID }}.iam.gserviceaccount.com" >> "$GITHUB_ENV"
        echo "WORKLOAD_IDENTITY_PROVIDER=projects/${{ env.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/p2p-${{ env.TENANT_NAME }}/providers/p2p-${{ env.TENANT_NAME }}" >> "$GITHUB_ENV"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yq '.' .github/actions/resolve-environment/action.yaml > /dev/null`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add .github/actions/resolve-environment/action.yaml
git commit -m "feat: add field extraction, validation, and derived var recomputation"
```

## Chunk 2: Update low-level workflows

### Task 5: Update `p2p-execute-command.yaml`

**Files:**
- Modify: `.github/workflows/p2p-execute-command.yaml:76-91` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-execute-command.yaml:127-227` (replace resolution steps with composite action call)

- [ ] **Step 1: Replace input definitions**

Replace the 4 `env-config-*` inputs (lines 76-91) with:

```yaml
      config-mode:
        description: 'Config source: github-env, repo-file, or central-repo'
        required: false
        type: string
        default: ''
      repo-file-path:
        description: 'Path to tenant repo config file (e.g. .p2p.yaml)'
        required: false
        type: string
        default: ''
      central-repo-name:
        description: 'Central config repo name'
        required: false
        type: string
        default: ''
      central-repo-owner:
        description: 'Central config repo owner'
        required: false
        type: string
        default: ''
      central-repo-path-pattern:
        description: 'Path pattern in central repo ({env} replaced with environment name)'
        required: false
        type: string
        default: 'environments/{env}/config.yaml'
```

- [ ] **Step 2: Replace resolution steps with composite action call**

Remove the 7 resolution steps (lines 127-227: "Generate environment reader token" through "Recompute derived env vars"). Replace with:

```yaml
      - name: Generate environment reader token
        id: env-token
        if: ${{ inputs.config-mode == 'central-repo' }}
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.P2P_ENV_APP_ID }}
          private-key: ${{ secrets.P2P_ENV_APP_PRIVATE_KEY }}
          owner: ${{ inputs.central-repo-owner }}
          repositories: ${{ inputs.central-repo-name }}

      - name: Resolve environment config
        uses: ./.github/actions/resolve-environment
        with:
          environment: ${{ inputs.github_env }}
          config-mode: ${{ inputs.config-mode }}
          repo-file-path: ${{ inputs.repo-file-path }}
          central-repo-name: ${{ inputs.central-repo-name }}
          central-repo-owner: ${{ inputs.central-repo-owner }}
          central-repo-path-pattern: ${{ inputs.central-repo-path-pattern }}
          central-repo-token: ${{ steps.env-token.outputs.token }}
          fields: full
```

- [ ] **Step 3: Validate YAML syntax**

Run: `yq '.' .github/workflows/p2p-execute-command.yaml > /dev/null`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/p2p-execute-command.yaml
git commit -m "refactor: use resolve-environment action in p2p-execute-command"
```

### Task 6: Update `p2p-get-latest-image.yaml`

**Files:**
- Modify: `.github/workflows/p2p-get-latest-image.yaml:39-54` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-get-latest-image.yaml:91-178` (replace resolution steps)

- [ ] **Step 1: Replace input definitions**

Replace the 4 `env-config-*` inputs (lines 39-54) with the same 5 new inputs as Task 5 Step 1.

- [ ] **Step 2: Replace resolution steps with composite action call**

Remove the 7 resolution steps (lines 91-178: "Generate environment reader token" through "Recompute derived env vars"). Replace with:

```yaml
      - name: Generate environment reader token
        id: env-token
        if: ${{ inputs.config-mode == 'central-repo' }}
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.P2P_ENV_APP_ID }}
          private-key: ${{ secrets.P2P_ENV_APP_PRIVATE_KEY }}
          owner: ${{ inputs.central-repo-owner }}
          repositories: ${{ inputs.central-repo-name }}

      - name: Resolve environment config
        uses: ./.github/actions/resolve-environment
        with:
          environment: ${{ env.ENV_NAME }}
          config-mode: ${{ inputs.config-mode }}
          repo-file-path: ${{ inputs.repo-file-path }}
          central-repo-name: ${{ inputs.central-repo-name }}
          central-repo-owner: ${{ inputs.central-repo-owner }}
          central-repo-path-pattern: ${{ inputs.central-repo-path-pattern }}
          central-repo-token: ${{ steps.env-token.outputs.token }}
          fields: core
```

- [ ] **Step 3: Validate YAML syntax**

Run: `yq '.' .github/workflows/p2p-get-latest-image.yaml > /dev/null`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/p2p-get-latest-image.yaml
git commit -m "refactor: use resolve-environment action in p2p-get-latest-image"
```

### Task 7: Update `p2p-promote-image.yaml`

**Files:**
- Modify: `.github/workflows/p2p-promote-image.yaml:45-60` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-promote-image.yaml:88-173` (replace lookup job resolution steps)
- Modify: `.github/workflows/p2p-promote-image.yaml:223-316` (replace promote-image job resolution steps)

This file has TWO resolution blocks — one in the `lookup` job (source env, `fields: core`) and one in the `promote-image` job (dest env, `fields: full`).

**Note:** The current `promote-image` job only sets `DPLATFORM` during resolution, not `PLATFORM_ENVIRONMENT`. The composite action with `fields: full` sets both. This is an intentional normalization — the existing code was inconsistent with `p2p-execute-command.yaml` which sets both.

- [ ] **Step 1: Replace input definitions**

Replace the 4 `env-config-*` inputs (lines 45-60) with the same 5 new inputs as Task 5 Step 1.

- [ ] **Step 2: Replace lookup job resolution steps**

Remove the 7 resolution steps in the `lookup` job (lines 88-173: "Generate environment reader token" through "Recompute derived env vars"). Replace with:

```yaml
      - name: Generate environment reader token
        id: env-token
        if: ${{ inputs.config-mode == 'central-repo' }}
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.P2P_ENV_APP_ID }}
          private-key: ${{ secrets.P2P_ENV_APP_PRIVATE_KEY }}
          owner: ${{ inputs.central-repo-owner }}
          repositories: ${{ inputs.central-repo-name }}

      - name: Resolve source environment config
        uses: ./.github/actions/resolve-environment
        with:
          environment: ${{ env.ENV_NAME }}
          config-mode: ${{ inputs.config-mode }}
          repo-file-path: ${{ inputs.repo-file-path }}
          central-repo-name: ${{ inputs.central-repo-name }}
          central-repo-owner: ${{ inputs.central-repo-owner }}
          central-repo-path-pattern: ${{ inputs.central-repo-path-pattern }}
          central-repo-token: ${{ steps.env-token.outputs.token }}
          fields: core
```

The existing "Export resolved source config" step (line 175-181) remains unchanged.

- [ ] **Step 3: Replace promote-image job resolution steps**

Remove the 7 resolution steps in the `promote-image` job (lines 223-316: "Generate environment reader token" through "Recompute derived env vars"). Replace with:

```yaml
      - name: Generate environment reader token
        id: env-token
        if: ${{ inputs.config-mode == 'central-repo' }}
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.P2P_ENV_APP_ID }}
          private-key: ${{ secrets.P2P_ENV_APP_PRIVATE_KEY }}
          owner: ${{ inputs.central-repo-owner }}
          repositories: ${{ inputs.central-repo-name }}

      - name: Resolve destination environment config
        uses: ./.github/actions/resolve-environment
        with:
          environment: ${{ inputs.dest_github_env }}
          config-mode: ${{ inputs.config-mode }}
          repo-file-path: ${{ inputs.repo-file-path }}
          central-repo-name: ${{ inputs.central-repo-name }}
          central-repo-owner: ${{ inputs.central-repo-owner }}
          central-repo-path-pattern: ${{ inputs.central-repo-path-pattern }}
          central-repo-token: ${{ steps.env-token.outputs.token }}
          fields: full
```

- [ ] **Step 4: Validate YAML syntax**

Run: `yq '.' .github/workflows/p2p-promote-image.yaml > /dev/null`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/p2p-promote-image.yaml
git commit -m "refactor: use resolve-environment action in p2p-promote-image"
```

## Chunk 3: Update mid-level and wrapper workflows

### Task 8: Update mid-level workflows (fastfeedback, extended-test, prod)

**Files:**
- Modify: `.github/workflows/p2p-workflow-fastfeedback.yaml:66-81` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-workflow-fastfeedback.yaml` (replace pass-throughs in all job `with:` blocks)
- Modify: `.github/workflows/p2p-workflow-extended-test.yaml:62-77` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-workflow-extended-test.yaml` (replace pass-throughs)
- Modify: `.github/workflows/p2p-workflow-prod.yaml:55-70` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-workflow-prod.yaml` (replace pass-throughs)

- [ ] **Step 1: Update `p2p-workflow-fastfeedback.yaml`**

Replace the 4 `env-config-*` input definitions with the same 5 new inputs (same names and types as Task 5 Step 1).

In every job's `with:` block, replace the 4 pass-through lines:
```yaml
      env-config-file: ${{ inputs.env-config-file }}
      env-config-repo: ${{ inputs.env-config-repo }}
      env-config-repo-owner: ${{ inputs.env-config-repo-owner }}
      env-config-path-pattern: ${{ inputs.env-config-path-pattern }}
```
with:
```yaml
      config-mode: ${{ inputs.config-mode }}
      repo-file-path: ${{ inputs.repo-file-path }}
      central-repo-name: ${{ inputs.central-repo-name }}
      central-repo-owner: ${{ inputs.central-repo-owner }}
      central-repo-path-pattern: ${{ inputs.central-repo-path-pattern }}
```

This applies to all 5 jobs: `build`, `functional-test`, `nft-test`, `integration-test`, `promote`.

- [ ] **Step 2: Update `p2p-workflow-extended-test.yaml`**

Same pattern as Step 1. Replace inputs and pass-throughs in both jobs: `run-tests`, `promote`.

- [ ] **Step 3: Update `p2p-workflow-prod.yaml`**

Same pattern as Step 1. Replace inputs and pass-throughs in the single job: `prod-deploy`.

- [ ] **Step 4: Validate YAML syntax for all three files**

Run:
```bash
yq '.' .github/workflows/p2p-workflow-fastfeedback.yaml > /dev/null && \
yq '.' .github/workflows/p2p-workflow-extended-test.yaml > /dev/null && \
yq '.' .github/workflows/p2p-workflow-prod.yaml > /dev/null
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/p2p-workflow-fastfeedback.yaml \
       .github/workflows/p2p-workflow-extended-test.yaml \
       .github/workflows/p2p-workflow-prod.yaml
git commit -m "refactor: rename config inputs in mid-level workflows"
```

### Task 9: Update wrapper workflows (get-latest-image-extended-test, get-latest-image-prod)

**Files:**
- Modify: `.github/workflows/p2p-get-latest-image-extended-test.yaml:42-57` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-get-latest-image-extended-test.yaml:75-78` (replace pass-throughs)
- Modify: `.github/workflows/p2p-get-latest-image-prod.yaml:42-57` (replace `env-config-*` inputs)
- Modify: `.github/workflows/p2p-get-latest-image-prod.yaml:75-78` (replace pass-throughs)

- [ ] **Step 1: Update both wrapper workflows**

Same pattern as Task 8: replace input definitions and pass-through lines with the new naming scheme.

- [ ] **Step 2: Validate YAML syntax**

Run:
```bash
yq '.' .github/workflows/p2p-get-latest-image-extended-test.yaml > /dev/null && \
yq '.' .github/workflows/p2p-get-latest-image-prod.yaml > /dev/null
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/p2p-get-latest-image-extended-test.yaml \
       .github/workflows/p2p-get-latest-image-prod.yaml
git commit -m "refactor: rename config inputs in get-latest-image wrapper workflows"
```

## Chunk 4: Update PR

### Task 10: Push and update PR description

- [ ] **Step 1: Push all changes**

```bash
git push origin feat/environment-config-resolution
```

- [ ] **Step 2: Update PR title and description**

Update PR #133 via `gh api repos/{owner}/{repo}/pulls/133 --method PATCH` (not `gh pr edit`, which fails due to missing `read:project` scope).

New title: `feat: resolve-environment composite action with mutually exclusive config modes`

New description should cover:
- The composite action and its purpose (DRY, mutual exclusivity)
- The three config modes with their inputs
- Field sets (core vs full) and presence validation
- Backwards compatibility (default empty config-mode = vars.*)
- Files changed table
