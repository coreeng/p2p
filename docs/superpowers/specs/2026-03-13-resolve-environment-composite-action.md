# Resolve Environment Composite Action

## Problem

Environment config resolution logic is duplicated across three low-level workflows (`p2p-execute-command`, `p2p-promote-image`, `p2p-get-latest-image`), each containing ~60 lines of identical shell for central repo checkout, tenant file parsing, field extraction, and derived variable recomputation. The current overlay design also layers sources on top of each other, which adds complexity without a clear use case — users should pick one mechanism.

## Design

### Composite action: `.github/actions/resolve-environment/action.yaml`

A single composite action that:

1. Validates that exactly one config mode is selected
2. Resolves environment variables from the chosen source
3. Recomputes derived variables
4. Replaces all duplicated resolution logic across workflows

### Config modes

Three mutually exclusive modes, selected via `config-mode`:

| Mode | Source | Description |
|------|--------|-------------|
| `github-env` | GitHub Environment variables (`vars.*`) | Existing default. Environment variables are already set via the job-level `env:` block — resolution is a no-op. |
| `repo-file` | Tenant repo config file | A YAML file checked into the tenant's repo containing per-environment config under an `environments:` key. |
| `central-repo` | Central org config repo | A centrally-managed repo accessed via GitHub App token, containing per-environment YAML files at a configurable path pattern. |

When `config-mode` is empty (default), `vars.*` are used implicitly — same as `github-env` but without documenting intent.

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `environment` | yes | | Environment name (e.g. `gcp-dev`) |
| `config-mode` | no | `""` | `github-env`, `repo-file`, or `central-repo` |
| `repo-file-path` | no | | Path to tenant repo config file (e.g. `.p2p.yaml`) |
| `central-repo-name` | no | | Central config repo name |
| `central-repo-owner` | no | | Central config repo owner |
| `central-repo-path-pattern` | no | `environments/{env}/config.yaml` | Path pattern in central repo (`{env}` replaced with environment name via bash substitution) |
| `central-repo-token` | no | | Pre-generated token for central repo access |
| `fields` | no | `full` | `core` or `full` |

### Field sets

| Set | Fields |
|-----|--------|
| `core` | `PROJECT_ID`, `PROJECT_NUMBER`, `REGION` |
| `full` | `core` + `BASE_DOMAIN`, `INTERNAL_SERVICES_DOMAIN` |

`DPLATFORM` and `PLATFORM_ENVIRONMENT` are set to the environment name when `fields` is `full`. They are not set for `core` (used by lookup-only jobs like `p2p-get-latest-image` and the `lookup` job in `p2p-promote-image`).

### Field presence validation

When `config-mode` is `repo-file` or `central-repo`, the action validates that every field in the requested set is present and non-empty in the resolved config. If any field is missing, the action fails with a clear error naming the missing field, the source, and the environment. For example:

```
::error::Field 'BASE_DOMAIN' (path: .ingressDomains[0].domain) not found in repo-file '.p2p.yaml' for environment 'gcp-dev'
```

This prevents silent misconfiguration — if you've chosen a config source, it must fully satisfy the requested field set.

### Derived variables

When resolution occurs (mode is `repo-file` or `central-repo`), derived variables are recomputed from resolved values:

- `REGISTRY` = `${REGION}-docker.pkg.dev/${PROJECT_ID}/tenant/${TENANT_NAME}`
- `SERVICE_ACCOUNT` = `p2p-${TENANT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`
- `WORKLOAD_IDENTITY_PROVIDER` = `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/p2p-${TENANT_NAME}/providers/p2p-${TENANT_NAME}`

### Outputs

| Output | Description |
|--------|-------------|
| `resolved` | `true` if config was resolved from `repo-file` or `central-repo`, `false` otherwise |

### Validation rules

| Condition | Result |
|-----------|--------|
| `config-mode: repo-file` without `repo-file-path` | Fail |
| `config-mode: central-repo` without `central-repo-name` | Fail |
| `config-mode: central-repo` without `central-repo-owner` | Fail |
| `config-mode: central-repo` without `central-repo-token` | Fail |
| `config-mode: ""` with any `repo-file-*` or `central-repo-*` inputs non-empty | Fail (force explicit intent) |
| `config-mode: github-env` with any `repo-file-*` or `central-repo-*` inputs set | Ignore (explicit no-op) |

### Token generation

The `actions/create-github-app-token` step must remain in the calling workflow because composite actions cannot access secrets. The caller generates the token and passes it via `central-repo-token`.

### Central repo checkout

In `central-repo` mode, the composite action checks out the central config repo using `actions/checkout` with `path: /tmp/<central-repo-name>` to avoid clobbering the tenant repo checkout that has already occurred. Since the `sparse-checkout` parameter needs the resolved path at expression-evaluation time (before any shell runs), the action uses a preliminary `run` step to compute the resolved path via bash substitution and set it as a step output, then references that output in the checkout step's `sparse-checkout` parameter.

### Prerequisites

- **`repo-file` mode:** The tenant repo must already be checked out before the composite action is invoked. The calling workflow's existing `actions/checkout` step (which runs before resolution) satisfies this.
- **`central-repo` mode:** The caller must generate a GitHub App token and pass it via `central-repo-token`. The composite action handles the central repo checkout internally.

### Config file format

Both `repo-file` and `central-repo` modes expect the same YAML structure:

```yaml
# repo-file mode: file contains all environments
environments:
  gcp-dev:
    platform:
      projectId: my-project-dev
      projectNumber: "123456"
      region: europe-west2
    ingressDomains:
      - domain: dev.example.com
    internalServices:
      domain: internal.dev.example.com

# central-repo mode: each file contains a single environment
# (at path e.g. environments/gcp-dev/config.yaml)
platform:
  projectId: my-project-dev
  projectNumber: "123456"
  region: europe-west2
ingressDomains:
  - domain: dev.example.com
internalServices:
  domain: internal.dev.example.com
```

### Path pattern substitution

The `central-repo-path-pattern` input uses `{env}` as a placeholder, replaced via bash string substitution (`${pattern//\{env\}/$environment}`) inside the composite action. This is consistent with the current implementation's shell-based replacement.

## Calling workflow changes

### Low-level workflows

Each low-level workflow replaces its ~60 lines of resolution shell with:

1. A conditional `actions/create-github-app-token` step (only when `config-mode: central-repo`)
2. A single `uses: ./.github/actions/resolve-environment` step

The existing `env-config-*` inputs are renamed to the new scheme. This is a non-breaking change because the feature branch has not been released — no external callers use the current input names.

**`p2p-execute-command.yaml`:**
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

**`p2p-get-latest-image.yaml`:** Same pattern but `fields: core`.

**`p2p-promote-image.yaml`:** Both the `lookup` and `promote-image` jobs use the action — `lookup` with `fields: core` for the source environment, `promote-image` with `fields: full` for the destination.

### Mid-level workflows

These define the same config inputs and pass them through unchanged to the low-level workflows they call. No resolution logic in these files:

- `p2p-workflow-fastfeedback.yaml`
- `p2p-workflow-extended-test.yaml`
- `p2p-workflow-prod.yaml`

### Wrapper workflows

These pass through the config inputs to `p2p-get-latest-image.yaml`:

- `p2p-get-latest-image-extended-test.yaml`
- `p2p-get-latest-image-prod.yaml`

## Backwards compatibility

- `config-mode` defaults to `""`, which uses `vars.*` implicitly — identical to current behaviour for all existing callers who do not set any config inputs
- The `env-config-*` input names from the current feature branch are renamed to the new `config-mode` / `repo-file-*` / `central-repo-*` scheme. This is safe because the feature branch has not been merged or released — no external callers exist yet
- Callers that don't set any config inputs get the same behaviour as before
- The `central-repo-path-pattern` input now defaults to `environments/{env}/config.yaml`, whereas previously no default was set. This is a convenience improvement — callers using central-repo mode no longer need to specify the path pattern if they follow the default convention
