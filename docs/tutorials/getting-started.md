# Getting Started with P2P

You'll set up a CI workflow that builds, tests, and promotes your application on every push to main.

## Prerequisites

- A GitHub repository
- A Core Platform tenancy
- GitHub environments and variables configured (see [Environment Configuration](../explanation/environment-configuration.md) for the full list)
- At minimum: one environment (e.g., `gcp-dev`), and repo variables `FAST_FEEDBACK` and `TENANT_NAME`

## Step 1: Create your Makefile

Create a `Makefile` at the root of your repository. The `p2p-build` and `p2p-functional` targets are the minimum required for fast-feedback. The platform injects the `REGISTRY` and `VERSION` variables at runtime.

```makefile
# App and tenant name must match your Core Platform tenancy
P2P_TENANT_NAME ?= my-app
P2P_APP_NAME ?= $(P2P_TENANT_NAME)  # app name must equal tenant name

# Download and include the p2p helper makefile
$(shell curl -fsSL "https://raw.githubusercontent.com/coreeng/p2p/v1/p2p.mk" -o ".p2p.mk")
include .p2p.mk

# Define p2p targets as dependency chains
p2p-build:      build-app push-app
p2p-functional: build-functional push-functional deploy-functional run-functional

.PHONY: build-app
build-app:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" .

.PHONY: push-app
push-app:
	docker image push "$(p2p_image_tag)"

.PHONY: build-functional
build-functional:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" tests/functional/

.PHONY: push-functional
push-functional:
	docker image push "$(p2p_image_tag)"

.PHONY: deploy-functional
deploy-functional:
	# Deploy your app and test pod to the functional subnamespace
	kubectl apply -f deploy/functional/ -n "$(p2p_namespace)"

.PHONY: run-functional
run-functional:
	# Run functional tests
	bash scripts/helm-test.sh functional "$(p2p_namespace)" "$(p2p_app_name)" true
```

The `p2p.mk` helper provides variables like `p2p_image_tag`, `p2p_image_cache`, `p2p_namespace`, and `p2p_app_name` derived from your `P2P_TENANT_NAME`, `P2P_APP_NAME`, and the pipeline environment. The p2p targets (`p2p-build`, `p2p-functional`) chain their steps in order.

## Step 2: Create your workflow file

Create `.github/workflows/ci.yaml`:

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  version:
    uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
    secrets:
      git-token: ${{ secrets.GITHUB_TOKEN }}

  fastfeedback:
    needs: [version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

The `version` job runs first and outputs a semantic version string. The `fastfeedback` job picks up that version and runs your build and tests against it.

## Step 3: Push and verify

Commit both files and push to a branch, then open a pull request targeting `main`.

```bash
git add Makefile .github/workflows/ci.yaml
git commit -m "Add P2P fast-feedback workflow"
git push origin my-branch
```

In the GitHub Actions UI you'll see:

1. `version` starts immediately and tags the commit (on `main`) or produces a pre-release version string (on a PR).
2. `fastfeedback` starts once `version` completes. Inside it, the job graph runs:
   - `build` runs first across every environment in `FAST_FEEDBACK`.
   - `source-security-scan` runs independently of `build`.
   - `image-scan` runs once `build` succeeds.
   - `functional-test` and `nft-test` run in parallel once build succeeds.
   - `integration-test` runs after both `functional-test` and `nft-test` succeed.
   - `promote` runs last (on `main` only), after `integration-test`, `image-scan`, and `source-security-scan` have all succeeded, and copies the image into the `EXTENDED_TEST` registry path.

## What happens next

On a pull request, the pipeline runs build, functional, nft, and integration tests but skips promote. On a push to `main`, promote runs and the next pipeline stage can pull the image.

The `p2p-nft` and `p2p-integration` targets are optional. Define them only when you need them; the pipeline exits those steps successfully and continues when they are absent.

See [Pipeline model](../explanation/pipeline-model.md) for the full picture of how stages, environments, and promotion interact. See [Make targets](../explanation/make-targets.md) for the complete list of targets and the environment variables available to them.

## Security scans

Fast-feedback also calls source security scanning and image scanning automatically on each pull request and push. Source security scanning covers source dependency vulnerabilities, restricted or forbidden licenses, and git-tree secrets. Image scanning covers both known CVEs and embedded secrets. At this level, `security-scan-blocking-severity` defaults to `off`, so the scans report findings without blocking the workflow by default.

Look in the workflow summary and uploaded artifact for the details, and on pull requests you'll also get a sticky comment with the latest results.
See [Image scanning](../explanation/image-scanning.md), [Secrets scanning](../explanation/secrets-scanning.md), and [Triage security findings](../how-to/triage-security-findings.md) for what each scan checks and how to respond.

## Multi-component repositories

If your repository contains multiple components, each with its own Makefile and pipeline, use the `working-directory` input to point each workflow call at the right directory:

```yaml
  fastfeedback:
    needs: [version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
      working-directory: ./services/api
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

The workflow looks for a `Makefile` in that directory, and all make targets run relative to it. You can define separate jobs for each component in the same workflow file, each with a different `working-directory`.
