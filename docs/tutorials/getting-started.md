# Getting Started with P2P

You'll set up a CI workflow that builds, tests, and promotes your application on every push to main.

## Prerequisites

- A GitHub repository
- A CECG Core Platform tenancy
- GitHub environments and variables configured (see [Environment Configuration](../explanation/environment-configuration.md) for the full list)
- At minimum: one environment (e.g., `gcp-dev`), and repo variables `FAST_FEEDBACK` and `TENANT_NAME`

## Step 1: Create your Makefile

Create a `Makefile` at the root of your repository. The `p2p-build` and `p2p-functional` targets are the minimum required for fast-feedback. The `REGISTRY` and `VERSION` variables are injected by the platform at runtime.

```makefile
.PHONY: p2p-build p2p-functional

p2p-build:
	@echo "Building image $(REGISTRY)/myapp:$(VERSION)"
	docker build -t $(REGISTRY)/myapp:$(VERSION) .
	docker push $(REGISTRY)/myapp:$(VERSION)

p2p-functional:
	@echo "Running functional tests against $(REGISTRY)/myapp:$(VERSION)"
	./scripts/functional-tests.sh $(REGISTRY)/myapp:$(VERSION)
```

`p2p-build` runs first and is responsible for producing and publishing your container image. `p2p-functional` runs after build completes and should exercise your application's core behaviour.

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
   - `functional-test` and `nft-test` run in parallel once build succeeds.
   - `integration-test` runs after both `functional-test` and `nft-test` succeed.
   - `promote` runs last (on `main` only) and copies the image into the `EXTENDED_TEST` registry path.

## What happens next

On a pull request, the pipeline runs build, functional, nft, and integration tests but skips the promote step. On a push to `main`, promote runs and the image becomes available to the next pipeline stage.

The `p2p-nft` and `p2p-integration` targets are optional. If they don't exist in your `Makefile`, those steps exit successfully and the pipeline continues.

See [Pipeline model](../explanation/pipeline-model.md) for the full picture of how stages, environments, and promotion interact. See [Make targets](../explanation/make-targets.md) for the complete list of targets and the environment variables available to them.
