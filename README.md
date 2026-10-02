# P2P — Reusable GitHub Actions Workflows

Reusable CI/CD workflows for Core Platform tenants.

## Quick Start

Add this to `.github/workflows/p2p.yaml` in your repository:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  # Compute the next semantic version from git tags
  version:
    uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
    secrets:
      git-token: ${{ secrets.GITHUB_TOKEN }}

  # Build, test, and promote to extended-test registry
  fastfeedback:
    needs: [version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
```

## Workflows

### Application deployment environment

P2P prepares its environment with one corectl call:

```bash
corectl p2p prepare "$DPLATFORM" --application "$TENANT_NAME" \
  --app-name "$P2P_APP_NAME" --version "$P2P_VERSION" \
  --context "$CORECTL_CONTEXT" --output env >> "$GITHUB_ENV"
```

Corectl reads `config.ingress.enabled` from `app.yaml`, resolves enabled ingress
for the assigned cluster, establishes the registry connection and emits only
`P2P_*` settings. Disabled ingress skips profile lookup. Missing/invalid settings
stop execution without partial environment output or domain fallback.

| Variables | Contract |
|---|---|
| `P2P_TENANT_NAME`, `P2P_APP_NAME`, `P2P_VERSION` | Established application/component and image version inputs |
| `P2P_REGISTRY` | Prepared registry image prefix |
| `P2P_REGISTRY_FAST_FEEDBACK`, `P2P_REGISTRY_EXTENDED_TEST`, `P2P_REGISTRY_PROD` | Stage registry prefixes, with corresponding `_PATH` variables |
| `P2P_NAMESPACE` and stage-specific `P2P_NAMESPACE_*` | Application/component namespace and stage namespaces |
| `P2P_INGRESS_DOMAIN`, `P2P_INGRESS_CLASS` | Target cluster domain/class; empty when ingress is disabled |

Templates consume domain/class environment variables in ordinary deployment YAML.
Ingress enablement is read directly from `config.ingress.enabled` in `app.yaml`;
corectl reads the same boolean to decide whether to resolve a profile. The ingress
contract requires no preparation target, compatibility marker or exchanged file.
All automated template tests use fixed Service routing, including NFT; browser
routing is verified separately. Shared Make defaults preserve standalone/legacy
ingress configuration when no prepared environment is supplied.

Corectl also owns Make-argument validation and literal execution through
`corectl p2p run --command "$COMMAND"`. The workflow contains no Python deployment
or argument-handling implementation. Registry credential refresh and teardown
retain their existing commands. Install compatible corectl before adopting the
workflow, and explicitly update existing generated consumers to use ingress env.

### Primary Workflows

| Workflow | Purpose |
|----------|---------|
| [p2p-version](docs/reference/p2p-version.md) | Semantic versioning from git tags |
| [p2p-workflow-fastfeedback](docs/reference/p2p-workflow-fastfeedback.md) | Build, test (functional + NFT + integration), promote |
| [p2p-workflow-extended-test](docs/reference/p2p-workflow-extended-test.md) | Run extended tests, promote to prod registry |
| [p2p-workflow-prod](docs/reference/p2p-workflow-prod.md) | Deploy to production |
| [p2p-workflow-security-scan](docs/reference/p2p-workflow-security-scan.md) | Run source and latest image security scans |
| [p2p-get-latest-image-extended-test](docs/reference/p2p-get-latest-image-extended-test.md) | Resolve latest image version in extended-test registry |
| [p2p-get-latest-image-prod](docs/reference/p2p-get-latest-image-prod.md) | Resolve latest image version in prod registry |

### Internal Workflows

The primary workflows call these. Call them only through the primary workflows.

| Workflow | Purpose |
|----------|---------|
| [p2p-execute-command](docs/reference/p2p-execute-command.md) | Leaf executor — runs a build tool target in a configured environment |
| [p2p-promote-image](docs/reference/p2p-promote-image.md) | Authenticates to source/dest registries and runs the promotion make target |
| [p2p-get-latest-image](docs/reference/p2p-get-latest-image.md) | Base workflow for querying latest image version from artifact registry |
| [p2p-workflow-source-security-scan](docs/reference/p2p-workflow-source-security-scan.md) | Scans repository source for dependency vulnerabilities, restricted/forbidden licenses, and committed secrets; posts one compact sticky comment and uploads normalized findings. |
| [p2p-workflow-image-scan](docs/reference/p2p-workflow-image-scan.md) | Scans built images for CVEs (Trivy) and embedded secrets (TruffleHog); uploads reports and, when PR comment permissions are granted, posts a sticky comment per stage/environment. Called by fast-feedback, extended-test, prod, and the scheduled security umbrella. |
| p2p-workflow-security-image-scan-stage | Internal scheduled-security child workflow that pairs latest-version discovery and image scanning for one stage/environment. |

## Prerequisites

Before calling the workflows, set up the following:

- **GitHub environments** — at least one for fast-feedback (e.g., `gcp-dev`). See [Environment Configuration](docs/explanation/environment-configuration.md) for details.
- **Repository variables:**

  | Variable | Format | Example |
  |----------|--------|---------|
  | `FAST_FEEDBACK` | JSON matrix | `{"include": [{"deploy_env": "gcp-dev"}]}` |
  | `EXTENDED_TEST` | JSON matrix | `{"include": [{"deploy_env": "gcp-dev"}]}` |
  | `PROD` | JSON matrix | `{"include": [{"deploy_env": "gcp-prod"}]}` |
  | `TENANT_NAME` | string | `my-tenant` |
  | `P2P_RUNNER_LABEL` | string | `ubuntu-24.04` |
  | `P2P_MAKEFLAGS` | optional default Make options | `--jobs=4` |

  `P2P_RUNNER_LABEL` may be defined as an organization variable for a shared default or as a repository variable for a repository-specific override. Callers may also pass the `runner-label` workflow input, which takes precedence. When none is set, P2P uses `ubuntu-24.04`.

  Configure Make options per application with the optional `make-flags` workflow input alongside `runner-label`:

  ```yaml
  with:
    runner-label: ubuntu-24.04
    make-flags: '--jobs=4'
  ```

  A non-empty `make-flags` input takes precedence over `P2P_MAKEFLAGS`, which remains an optional organization/repository fallback. Leave that variable unset to configure each application independently in a monorepo. If both settings are empty, P2P adds no Make options. Pass `--jobs=1` to select serial execution even when the fallback enables parallelism. Declare build, push, deploy, and test dependencies in your Makefile before enabling parallel execution; see [Make parallelism](docs/explanation/make-targets.md#parallel-execution).

- **Per-environment variables** (set on each GitHub environment):

  | Variable | Description |
  |----------|-------------|
  | `BASE_DOMAIN` | External base domain, e.g. `dev.example.com` |
  | `INTERNAL_SERVICES_DOMAIN` | Internal services domain, e.g. `dev-internal.example.com` |
  | `DPLATFORM` | Environment name from platform-environments, e.g. `gcp-dev` |
  | `PROJECT_ID` | Core Platform GCP project ID, e.g. `core-platform-dev-1a2b3c` |
  | `PROJECT_NUMBER` | GCP project number for the project above |
  | `REGION` | GCP region, e.g. `europe-west2` |

See [Environment Configuration](docs/explanation/environment-configuration.md) for details.

## Documentation

| Category | What's inside |
|----------|---------------|
| [Tutorials](docs/tutorials/) | Step-by-step guides to get running |
| [How-to Guides](docs/how-to/) | Solve specific problems: secrets, artifacts, Slack alerts, environments, versioning, security findings |
| [Reference](docs/reference/) | Complete inputs/outputs/secrets for every workflow |
| [Explanation](docs/explanation/) | Concepts: pipeline model, versioning, environments, make targets, security scanning |
