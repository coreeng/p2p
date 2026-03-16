# Setting Up the Full Pipeline

Extend your fast-feedback pipeline with extended testing and production deployment.

## Prerequisites

- Completed the [Getting Started](getting-started.md) tutorial
- Additional GitHub environments for extended-test and prod (e.g., `gcp-prod`)
- Additional repo variables: `EXTENDED_TEST` and `PROD`

## Step 1: Add make targets

Add the `p2p-extended-test`, `p2p-prod`, `p2p-promote-to-extended-test`, and `p2p-promote-to-prod` targets to your `Makefile`. The complete updated `Makefile`:

```makefile
.PHONY: p2p-build p2p-functional p2p-extended-test p2p-prod \
        p2p-promote-to-extended-test p2p-promote-to-prod

p2p-build:
	@echo "Building image $(REGISTRY)/myapp:$(VERSION)"
	docker build -t $(REGISTRY)/myapp:$(VERSION) .
	docker push $(REGISTRY)/myapp:$(VERSION)

p2p-functional:
	@echo "Running functional tests against $(REGISTRY)/myapp:$(VERSION)"
	./scripts/functional-tests.sh $(REGISTRY)/myapp:$(VERSION)

p2p-extended-test:
	@echo "Running extended tests against $(REGISTRY)/myapp:$(VERSION)"
	./scripts/extended-tests.sh $(REGISTRY)/myapp:$(VERSION)

p2p-promote-to-extended-test:
	@echo "Promoting $(REGISTRY)/myapp:$(VERSION) to extended-test"
	./scripts/promote.sh $(REGISTRY)/myapp:$(VERSION) extended-test

p2p-prod:
	@echo "Deploying $(REGISTRY)/myapp:$(VERSION) to prod"
	./scripts/deploy-prod.sh $(REGISTRY)/myapp:$(VERSION)

p2p-promote-to-prod:
	@echo "Promoting $(REGISTRY)/myapp:$(VERSION) to prod"
	./scripts/promote.sh $(REGISTRY)/myapp:$(VERSION) prod
```

## Step 2: Add extended-test to your workflow

The extended-test stage has two jobs. `get-image-extended-test` resolves the latest image that fast-feedback promoted into the `extended-test` registry path. `extended-test` then runs your `p2p-extended-test` make target against that resolved version.

Add these two jobs to `.github/workflows/ci.yaml`:

```yaml
  get-image-extended-test:
    needs: [fastfeedback]
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-extended-test.yaml@v1
    with:
      image-name: myapp
    secrets:
      env_vars: ${{ secrets.env_vars }}

  extended-test:
    needs: [get-image-extended-test]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
    with:
      version: ${{ needs.get-image-extended-test.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

`get-image-extended-test` only runs on `main` (not on PRs), so the entire extended-test stage is skipped on pull requests. Replace `myapp` in `image-name` with the name of your container image as published by `p2p-build`.

## Step 3: Add prod to your workflow

The prod stage follows the same pattern. `get-image-prod` resolves the latest image promoted into the `prod` registry path by the extended-test promote step, and `prod` deploys it.

Add these two jobs to `.github/workflows/ci.yaml`:

```yaml
  get-image-prod:
    needs: [extended-test]
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-prod.yaml@v1
    with:
      image-name: myapp
    secrets:
      env_vars: ${{ secrets.env_vars }}

  prod:
    needs: [get-image-prod]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@v1
    with:
      version: ${{ needs.get-image-prod.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

## Step 4: Complete workflow

The complete `.github/workflows/ci.yaml` with all three stages wired together:

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

  get-image-extended-test:
    needs: [fastfeedback]
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-extended-test.yaml@v1
    with:
      image-name: myapp
    secrets:
      env_vars: ${{ secrets.env_vars }}

  extended-test:
    needs: [get-image-extended-test]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
    with:
      version: ${{ needs.get-image-extended-test.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}

  get-image-prod:
    needs: [extended-test]
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-prod.yaml@v1
    with:
      image-name: myapp
    secrets:
      env_vars: ${{ secrets.env_vars }}

  prod:
    needs: [get-image-prod]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@v1
    with:
      version: ${{ needs.get-image-prod.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

## How the pipeline flows

Every push to `main` triggers this sequence:

1. `version` increments the semantic version and tags the commit.
2. `fastfeedback` builds the image, runs functional, nft, and integration tests, then promotes the image to the `extended-test` registry path.
3. `get-image-extended-test` queries the registry for the latest image in `extended-test`.
4. `extended-test` runs your long-running tests against that image, then promotes it to the `prod` registry path.
5. `get-image-prod` queries the registry for the latest image in `prod`.
6. `prod` deploys that image to your production environment.

Each stage only runs if the previous stage succeeded, and the `get-image-*` steps decouple the version produced by promotion from the version passed into the next test stage. This means a slow extended-test run always picks up the most recently promoted image, not necessarily the one from the same pipeline run.

See [Pipeline Model](../explanation/pipeline-model.md) for a detailed explanation of how promotion, environments, and the registry path conventions work together.
