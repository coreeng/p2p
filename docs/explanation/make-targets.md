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
| `P2P_TENANT_NAME` | `my-team` | Tenant name |
| `P2P_APP_NAME` | `my-svc` | App name passed to the workflow |
| `P2P_VERSION` | `1.2.4` | Version string |
| `P2P_REGISTRY` | `europe-west2-docker.pkg.dev/my-project/tenant/my-team` | Base registry for the tenant |
| `P2P_REGISTRY_FAST_FEEDBACK` | `<P2P_REGISTRY>/fast-feedback` | Fast-feedback registry path |
| `P2P_REGISTRY_EXTENDED_TEST` | `<P2P_REGISTRY>/extended-test` | Extended-test registry path |
| `P2P_REGISTRY_PROD` | `<P2P_REGISTRY>/prod` | Prod registry path |
| `P2P_NAMESPACE_FUNCTIONAL` | `my-team-my-svc-functional` | Functional test subnamespace |
| `P2P_NAMESPACE_NFT` | `my-team-my-svc-nft` | NFT subnamespace |
| `P2P_NAMESPACE_INTEGRATION` | `my-team-my-svc-integration` | Integration test subnamespace |
| `P2P_NAMESPACE_EXTENDED` | `my-team-my-svc-extended` | Extended-test subnamespace |
| `P2P_NAMESPACE_PROD` | `my-team-my-svc-prod` | Prod subnamespace |

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

The following Makefile shows all standard P2P targets with placeholder implementations. Replace the placeholder commands with the actual build, test, and deploy logic.

```makefile
IMAGE := $(P2P_REGISTRY_FAST_FEEDBACK)/my-svc

.PHONY: p2p-build p2p-functional p2p-nft p2p-integration \
        p2p-extended-test p2p-prod \
        p2p-promote-to-extended-test p2p-promote-to-prod

# Build and push the application image
p2p-build:
	docker build -t $(IMAGE):$(VERSION) .
	docker push $(IMAGE):$(VERSION)

# Functional tests — runs in P2P_NAMESPACE_FUNCTIONAL
p2p-functional:
	kubectl apply -f deploy/functional/ -n $(P2P_NAMESPACE_FUNCTIONAL)
	# run tests...

# Non-functional tests — runs in P2P_NAMESPACE_NFT
p2p-nft:
	kubectl apply -f deploy/nft/ -n $(P2P_NAMESPACE_NFT)
	# run tests...

# Integration tests — runs in P2P_NAMESPACE_INTEGRATION
p2p-integration:
	kubectl apply -f deploy/integration/ -n $(P2P_NAMESPACE_INTEGRATION)
	# run tests...

# Extended tests — runs in P2P_NAMESPACE_EXTENDED
p2p-extended-test:
	kubectl apply -f deploy/extended/ -n $(P2P_NAMESPACE_EXTENDED)
	# run tests...

# Production deploy — runs in P2P_NAMESPACE_PROD
p2p-prod:
	kubectl apply -f deploy/prod/ -n $(P2P_NAMESPACE_PROD)

# Promote fast-feedback image to extended-test
p2p-promote-to-extended-test:
	skopeo copy \
	  --src-creds oauth2accesstoken:$(SOURCE_ACCESS_TOKEN) \
	  --dest-creds oauth2accesstoken:$(DEST_ACCESS_TOKEN) \
	  docker://$(SOURCE_REGISTRY)/fast-feedback/my-svc:$(VERSION) \
	  docker://$(P2P_REGISTRY_EXTENDED_TEST)/my-svc:$(VERSION)

# Promote extended-test image to prod
p2p-promote-to-prod:
	skopeo copy \
	  --src-creds oauth2accesstoken:$(SOURCE_ACCESS_TOKEN) \
	  --dest-creds oauth2accesstoken:$(DEST_ACCESS_TOKEN) \
	  docker://$(SOURCE_REGISTRY)/extended-test/my-svc:$(VERSION) \
	  docker://$(P2P_REGISTRY_PROD)/my-svc:$(VERSION)
```

## See also

- [How to use a custom build tool](../how-to/use-a-custom-build-tool.md)
- [Pipeline model](pipeline-model.md)
- [p2p-execute-command reference](../reference/p2p-execute-command.md)
- [p2p-promote-image reference](../reference/p2p-promote-image.md)
