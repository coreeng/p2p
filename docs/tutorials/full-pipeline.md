# Setting Up the Full Pipeline

Extend your fast-feedback workflow with extended-test and production deployment. Each stage runs as a separate workflow on its own schedule.

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

## Step 2: Create the extended-test workflow

Extended tests typically run on a schedule rather than on every push — for example, overnight when the cluster is quieter and longer-running tests won't block development.

Create `.github/workflows/extended-test.yaml`:

```yaml
name: Extended Test

on:
  # Run overnight on weekdays
  schedule:
    - cron: '0 22 * * 1-5'
  # Allow manual triggers
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  get-image:
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-extended-test.yaml@v1
    with:
      image-name: my-app
    secrets:
      env_vars: ${{ secrets.env_vars }}

  extended-test:
    needs: [get-image]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
    with:
      version: ${{ needs.get-image.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

`get-image` resolves the latest image that fast-feedback promoted into the extended-test registry path. `extended-test` runs your `p2p-extended-test` make target against that version, then promotes the image to the prod registry path.

Replace `my-app` in `image-name` with the name of your container image as published by `p2p-build`.

## Step 3: Create the prod workflow

Production deployments typically run on a morning schedule — before office hours — so issues surface early in the working day when the team is available.

Create `.github/workflows/prod.yaml`:

```yaml
name: Prod

on:
  # Run before office hours on weekdays
  schedule:
    - cron: '0 7 * * 1-5'
  # Allow manual triggers
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  get-image:
    uses: coreeng/p2p/.github/workflows/p2p-get-latest-image-prod.yaml@v1
    with:
      image-name: my-app
    secrets:
      env_vars: ${{ secrets.env_vars }}

  prod:
    needs: [get-image]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@v1
    with:
      version: ${{ needs.get-image.outputs.version }}
    secrets:
      env_vars: ${{ secrets.env_vars }}
```

## Step 4: Review your workflow files

You now have three separate workflow files:

| File | Trigger | What it does |
|------|---------|--------------|
| `.github/workflows/ci.yaml` | Push/PR to `main` | Version + fast-feedback (build, test, promote) |
| `.github/workflows/extended-test.yaml` | Cron (weekday evenings) + manual | Resolve latest promoted image, run extended tests, promote to prod |
| `.github/workflows/prod.yaml` | Cron (weekday mornings) + manual | Resolve latest promoted image, deploy to production |

The `ci.yaml` file from the [Getting Started](getting-started.md) tutorial stays unchanged.

## How the pipeline flows

The three stages are decoupled by the image registry:

1. **Fast-feedback** (on every push to `main`): versions the commit, builds the image, runs functional/nft/integration tests, and promotes the image to the extended-test registry path.
2. **Extended-test** (scheduled overnight): resolves the latest promoted image in the extended-test registry, runs longer-running tests, and promotes to the prod registry path.
3. **Prod** (scheduled morning): resolves the latest promoted image in the prod registry and deploys it.

Each stage picks up the most recently promoted image independently. A slow extended-test run doesn't block fast-feedback, and prod always deploys whatever passed extended-test most recently.

The `workflow_dispatch` trigger on extended-test and prod lets you run them manually when you need to deploy outside the schedule.

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
