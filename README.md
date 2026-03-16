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

### Primary Workflows

| Workflow | Purpose |
|----------|---------|
| [p2p-version](docs/reference/p2p-version.md) | Semantic versioning from git tags |
| [p2p-workflow-fastfeedback](docs/reference/p2p-workflow-fastfeedback.md) | Build, test (functional + NFT + integration), promote |
| [p2p-workflow-extended-test](docs/reference/p2p-workflow-extended-test.md) | Run extended tests, promote to prod registry |
| [p2p-workflow-prod](docs/reference/p2p-workflow-prod.md) | Deploy to production |
| [p2p-get-latest-image-extended-test](docs/reference/p2p-get-latest-image-extended-test.md) | Resolve latest image version in extended-test registry |
| [p2p-get-latest-image-prod](docs/reference/p2p-get-latest-image-prod.md) | Resolve latest image version in prod registry |

### Internal Workflows

The primary workflows call these. Call them only through the primary workflows.

| Workflow | Purpose |
|----------|---------|
| [p2p-execute-command](docs/reference/p2p-execute-command.md) | Leaf executor — runs a build tool target in a configured environment |
| [p2p-promote-image](docs/reference/p2p-promote-image.md) | Authenticates to source/dest registries and runs the promotion make target |
| [p2p-get-latest-image](docs/reference/p2p-get-latest-image.md) | Base workflow for querying latest image version from artifact registry |

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
| [How-to Guides](docs/how-to/) | Solve specific problems: secrets, artifacts, Slack alerts, environments, versioning |
| [Reference](docs/reference/) | Complete inputs/outputs/secrets for every workflow |
| [Explanation](docs/explanation/) | Concepts: pipeline model, versioning, environments, make targets |
