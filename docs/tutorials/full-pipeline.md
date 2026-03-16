# Setting Up the Full Pipeline

Extend your fast-feedback workflow with extended-test and production deployment.

## Prerequisites

- Completed the [Getting Started](getting-started.md) tutorial
- Additional GitHub environments for extended-test and prod (e.g., `gcp-prod`)
- Additional repo variables: `EXTENDED_TEST` and `PROD`

## Step 1: Add make targets

Add the `p2p-extended-test`, `p2p-prod`, `p2p-promote-to-extended-test`, and `p2p-promote-to-prod` targets to your `Makefile`. The complete updated `Makefile`:

```makefile
# App and tenant name must match your Core Platform tenancy
P2P_TENANT_NAME ?= my-app
P2P_APP_NAME ?= $(P2P_TENANT_NAME)  # app name must equal tenant name

# Download and include the p2p helper makefile
$(shell curl -fsSL "https://raw.githubusercontent.com/coreeng/p2p/v1/p2p.mk" -o ".p2p.mk")
include .p2p.mk

# Define p2p targets as dependency chains
p2p-build:         build-app           push-app
p2p-functional:    build-functional    push-functional    deploy-functional    run-functional
p2p-nft:           build-nft           push-nft           deploy-nft           run-nft
p2p-integration:   build-integration   push-integration   deploy-integration   run-integration
p2p-extended-test: build-extended-test push-extended-test deploy-extended-test run-extended-test
p2p-prod:                                                 deploy-prod

.PHONY: build-app
build-app:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" .

.PHONY: build-functional
build-functional:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" tests/functional/

.PHONY: build-nft
build-nft:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" tests/nft/

.PHONY: build-integration
build-integration:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" tests/integration/

.PHONY: build-extended-test
build-extended-test:
	docker buildx build $(p2p_image_cache) --tag "$(p2p_image_tag)" tests/extended/

.PHONY: build-%
build-%:
	@echo "WARNING: $@ not implemented"

.PHONY: push-%
push-%:
	docker image push "$(p2p_image_tag)"

.PHONY: deploy-%
deploy-%:
	helm upgrade --install "$(p2p_app_name)" your-chart -n "$(p2p_namespace)" \
		--set image.repository="$(p2p_registry)/$(p2p_app_name)" \
		--set image.tag="$(p2p_version)" \
		--atomic

.PHONY: run-functional
run-functional:
	bash scripts/helm-test.sh functional "$(p2p_namespace)" "$(p2p_app_name)" true

.PHONY: run-nft
run-nft:
	bash scripts/helm-test.sh nft "$(p2p_namespace)" "$(p2p_app_name)" true

.PHONY: run-integration
run-integration:
	bash scripts/helm-test.sh integration "$(p2p_namespace)" "$(p2p_app_name)" false

.PHONY: run-extended-test
run-extended-test:
	bash scripts/helm-test.sh extended "$(p2p_namespace)" "$(p2p_app_name)" false

.PHONY: run-%
run-%:
	@echo "WARNING: $@ not implemented"
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

See [Pipeline model](../explanation/pipeline-model.md) for a detailed explanation of how promotion, environments, and the registry path conventions work together. See [Make targets](../explanation/make-targets.md) for the full list of targets and environment variables available in each stage.

## Multi-component repositories

If your repository has multiple components that each need their own full pipeline, pass `working-directory` to every workflow call for that component. Each component gets its own set of jobs pointing at its directory:

```yaml
  api-version:
    uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
    secrets:
      git-token: ${{ secrets.GITHUB_TOKEN }}
    with:
      version-prefix: api-

  api-fastfeedback:
    needs: [api-version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.api-version.outputs.version }}
      working-directory: ./services/api
    secrets:
      env_vars: ${{ secrets.env_vars }}

  # Repeat for api-extended-test, api-prod, etc.
```

Use a distinct `version-prefix` per component so each gets independent version tags. See [How to customise versioning](../how-to/customise-versioning.md) for details.
