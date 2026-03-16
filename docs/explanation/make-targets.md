# Make targets

The P2P pipeline calls the tenant's `Makefile` at each stage. The pipeline passes a defined set of environment variables to every target and expects targets to be present for the stages that are in use. Targets that are absent from the Makefile cause the pipeline step to succeed and continue rather than fail.

See [p2p-execute-command reference](../reference/p2p-execute-command.md) and [p2p-promote-image reference](../reference/p2p-promote-image.md) for full workflow reference.

## Expected targets per stage

### Fast-feedback

| Target | Subnamespace | Description |
|--------|-------------|-------------|
| `p2p-build` | (none) | Builds and pushes the image to the fast-feedback registry |
| `p2p-functional` | `functional` | Runs functional tests |
| `p2p-nft` | `nft` | Runs non-functional tests |
| `p2p-integration` | `integration` | Runs integration tests (after functional and nft) |

### Extended-test

| Target | Subnamespace | Description |
|--------|-------------|-------------|
| `p2p-extended-test` | `extended` | Runs extended, longer-running tests |

### Prod

| Target | Subnamespace | Description |
|--------|-------------|-------------|
| `p2p-prod` | `prod` | Deploys the application to production |

### Promotion

| Target | Called by | Description |
|--------|----------|-------------|
| `p2p-promote-to-extended-test` | `p2p-promote-image` | Copies image from fast-feedback to extended-test registry |
| `p2p-promote-to-prod` | `p2p-promote-image` | Copies image from extended-test to prod registry |

## Environment variables available to all targets

The `p2p-execute-command` workflow sets the following environment variables before calling `make`:

### Core variables

| Variable | Value | Description |
|----------|-------|-------------|
| `REGISTRY` | `<REGION>-docker.pkg.dev/<PROJECT_ID>/tenant/<TENANT_NAME>` | Base registry path for the tenant |
| `VERSION` | The version string from `p2p-version` | Image tag to build or deploy |
| `PLATFORM_ENVIRONMENT` | Same as `DPLATFORM` | Cluster/platform name |

### P2P variables

| Variable | Example value | Description |
|----------|--------------|-------------|
| `P2P_TENANT_NAME` | `my-app` | Tenant name |
| `P2P_APP_NAME` | `my-app` | App name passed to the workflow |
| `P2P_VERSION` | `1.2.4` | Version string |
| `P2P_REGISTRY` | `europe-west2-docker.pkg.dev/my-project/tenant/my-app` | Base registry for the tenant |
| `P2P_REGISTRY_FAST_FEEDBACK` | `<P2P_REGISTRY>/fast-feedback` | Fast-feedback registry path |
| `P2P_REGISTRY_EXTENDED_TEST` | `<P2P_REGISTRY>/extended-test` | Extended-test registry path |
| `P2P_REGISTRY_PROD` | `<P2P_REGISTRY>/prod` | Prod registry path |
| `P2P_NAMESPACE_FUNCTIONAL` | `my-app-functional` | Functional test subnamespace |
| `P2P_NAMESPACE_NFT` | `my-app-nft` | NFT subnamespace |
| `P2P_NAMESPACE_INTEGRATION` | `my-app-integration` | Integration test subnamespace |
| `P2P_NAMESPACE_EXTENDED` | `my-app-extended` | Extended-test subnamespace |
| `P2P_NAMESPACE_PROD` | `my-app-prod` | Prod subnamespace |

When the app name equals the tenant name, the namespace pattern is `<TENANT_NAME>-<subnamespace>` (without the repeated app name segment).

## kubectl access

Every target runs with a kubeconfig already configured for the tenant's GKE cluster. The context is set to the subnamespace for the current step. For example, `p2p-functional` runs with the current namespace set to `P2P_NAMESPACE_FUNCTIONAL`.

Targets can call `kubectl` directly without any additional setup.

## Subnamespace lifecycle

The pipeline creates subnamespaces automatically before calling the relevant make target (unless `skip-subnamespaces-create` is set). Subnamespaces are Hierarchical Namespace Controller (HNC) `SubnamespaceAnchor` resources created under the tenant's root namespace. They persist across runs.

| Target | Subnamespace used |
|--------|------------------|
| `p2p-build` | (no subnamespace; runs in root namespace context) |
| `p2p-functional` | `<tenant>[-<app>]-functional` |
| `p2p-nft` | `<tenant>[-<app>]-nft` |
| `p2p-integration` | `<tenant>[-<app>]-integration` |
| `p2p-extended-test` | `<tenant>[-<app>]-extended` |
| `p2p-prod` | `<tenant>[-<app>]-prod` |

## Optional targets

If a make target does not exist in the Makefile, `make` exits with a non-zero code for that target. The pipeline treats a missing target as a no-op and continues to the next step. This means:

- A project that has no integration tests can simply omit `p2p-integration` from its Makefile.
- A project that has no extended tests can omit `p2p-extended-test`.
- The pipeline does not fail; it skips the step.

## Additional variables for promotion targets

The `p2p-promote-image` workflow sets additional variables when calling `p2p-promote-to-extended-test` and `p2p-promote-to-prod`:

| Variable | Description |
|----------|-------------|
| `SOURCE_REGISTRY` | Full base registry URL for the source environment |
| `SOURCE_ACCESS_TOKEN` | OAuth2 access token for the source registry |
| `DEST_ACCESS_TOKEN` | OAuth2 access token for the destination registry |
| `SOURCE_AUTH_OVERRIDE` | Path to the source GCP credentials file |
| `DEST_AUTH_OVERRIDE` | Path to the destination GCP credentials file |

These variables allow promotion targets to authenticate to both the source and destination registries when copying images. A typical promotion target uses skopeo or `docker buildx imagetools` with these tokens.

## Minimal Makefile example

The following Makefile shows the standard P2P structure. It uses the `p2p.mk` helper for consistent variable naming and the dependency-chain pattern for p2p targets. Replace the placeholder commands with actual build, test, and deploy logic.

```makefile
# App and tenant name must match the Core Platform tenancy
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

# Build targets
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

# Push targets — all images pushed the same way
.PHONY: push-%
push-%:
	docker image push "$(p2p_image_tag)"

# Deploy targets — deploy the app and tests to the appropriate subnamespace
.PHONY: deploy-%
deploy-%:
	helm upgrade --install "$(p2p_app_name)" your-chart -n "$(p2p_namespace)" \
		--set image.repository="$(p2p_registry)/$(p2p_app_name)" \
		--set image.tag="$(p2p_version)" \
		--atomic

# Run targets — execute tests in the subnamespace
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

# Promotion targets — use skopeo with the auth tokens provided by the pipeline
.PHONY: p2p-promote-to-extended-test
p2p-promote-to-extended-test:
	skopeo copy \
	  --src-creds oauth2accesstoken:$(SOURCE_ACCESS_TOKEN) \
	  --dest-creds oauth2accesstoken:$(DEST_ACCESS_TOKEN) \
	  docker://$(SOURCE_REGISTRY)/fast-feedback/$(p2p_app_name):$(VERSION) \
	  docker://$(P2P_REGISTRY_EXTENDED_TEST)/$(p2p_app_name):$(VERSION)

.PHONY: p2p-promote-to-prod
p2p-promote-to-prod:
	skopeo copy \
	  --src-creds oauth2accesstoken:$(SOURCE_ACCESS_TOKEN) \
	  --dest-creds oauth2accesstoken:$(DEST_ACCESS_TOKEN) \
	  docker://$(SOURCE_REGISTRY)/extended-test/$(p2p_app_name):$(VERSION) \
	  docker://$(P2P_REGISTRY_PROD)/$(p2p_app_name):$(VERSION)
```

## See also

- [How to use a custom build tool](../how-to/use-a-custom-build-tool.md)
- [Pipeline model](pipeline-model.md)
- [p2p-execute-command reference](../reference/p2p-execute-command.md)
- [p2p-promote-image reference](../reference/p2p-promote-image.md)
