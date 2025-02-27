MAKEFLAGS += --warn-undefined-variables

# Set p2p variables for local testing
P2P_TENANT_NAME ?= default-tenant
P2P_APP_NAME ?= default-app
P2P_VERSION ?= $(shell git rev-parse --short HEAD)
P2P_REGISTRY ?= localhost/local
P2P_REGISTRY_FAST_FEEDBACK_PATH ?= fast-feedback
P2P_REGISTRY_EXTENDED_TEST_PATH ?= extended-test
P2P_REGISTRY_PROD_PATH ?= prod
P2P_REGISTRY_FAST_FEEDBACK ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_FAST_FEEDBACK_PATH)
P2P_REGISTRY_EXTENDED_TEST ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_EXTENDED_TEST_PATH)
P2P_REGISTRY_PROD ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_PROD_PATH)
P2P_NAMESPACE ?= $(P2P_APP_NAME)
P2P_NAMESPACE_FUNCTIONAL ?= $(P2P_NAMESPACE)-functional
P2P_NAMESPACE_NFT ?= $(P2P_NAMESPACE)-nft
P2P_NAMESPACE_INTEGRATION ?= $(P2P_NAMESPACE)-integration
P2P_NAMESPACE_EXTENDED ?= $(P2P_NAMESPACE)-extended
P2P_NAMESPACE_PROD ?= $(P2P_NAMESPACE)-prod

P2P_IMAGE_NAMES ?= $(P2P_APP_NAME)

.PHONY: p2p-help
p2p-help:
	@echo "Usage:"
	@grep -E '^\.PHONY: p2p-[a-zA-Z1-9_-]+.*?## .*$$' -h $(MAKEFILE_LIST) | sed -e "s/^\.PHONY: //" | awk 'BEGIN {FS = " ## "}; {printf "  make %-30s %s\n", $$1, $$2}'
	@grep -E '^[a-zA-Z1-9_-]+:.*?## .*$$' -h $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-30s %s\n", $$1, $$2}'

%: p2p_tenant_name = $(P2P_TENANT_NAME)
%: p2p_app_name = $(P2P_APP_NAME)
%: p2p_version = $(P2P_VERSION)

.PHONY: p2p-build ## Build the app
%-app: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-app: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)):$(P2P_VERSION)
%-app: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)) --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)),mode=max

.PHONY: p2p-functional ## Run functional tests
%-functional: p2p_app_url_suffix=-$(P2P_TENANT_NAME)-functional
%-functional: p2p_namespace=$(P2P_NAMESPACE_FUNCTIONAL)
%-functional: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-functional: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional:$(P2P_VERSION)
%-functional: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional,mode=max

.PHONY: p2p-nft ## Run NFT tests
%-nft: p2p_app_url_suffix=-$(P2P_TENANT_NAME)-nft
%-nft: p2p_namespace=$(P2P_NAMESPACE_NFT)
%-nft: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-nft: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft:$(P2P_VERSION)
%-nft: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft,mode=max

.PHONY: p2p-integration ## Run integration tests
%-integration: p2p_app_url_suffix=-$(P2P_TENANT_NAME)-integration
%-integration: p2p_namespace=$(P2P_NAMESPACE_INTEGRATION)
%-integration: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-integration: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration:$(P2P_VERSION)
%-integration: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration,mode=max

.PHONY: p2p-promote-to-extended-test ## Promote to extended test
p2p-promote-to-extended-test:
	$(foreach image, $(P2P_IMAGE_NAMES), \
		corectl p2p promote "$(image):$(P2P_VERSION)" \
			--source-stage "$(P2P_REGISTRY_FAST_FEEDBACK_PATH)" \
			--dest-registry "$(P2P_REGISTRY)" \
			--dest-stage "$(P2P_REGISTRY_EXTENDED_TEST_PATH)" \
	;)

.PHONY: p2p-extended-test ## Run extended tests
%-extended-test: p2p_app_url_suffix=-$(P2P_TENANT_NAME)-extended
%-extended-test: p2p_namespace=$(P2P_NAMESPACE_EXTENDED)
%-extended-test: p2p_registry=$(P2P_REGISTRY_EXTENDED_TEST)
%-extended-test: p2p_image_tag=$(P2P_REGISTRY_EXTENDED_TEST)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended:$(P2P_VERSION)
%-extended-test: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended,mode=max

.PHONY: p2p-promote-to-prod ## Promote to prod
p2p-promote-to-prod:
	$(foreach image, $(P2P_IMAGE_NAMES), \
		corectl p2p promote "$(image):$(P2P_VERSION)" \
			--source-stage "$(P2P_REGISTRY_EXTENDED_TEST_PATH)" \
			--dest-registry "$(P2P_REGISTRY)" \
			--dest-stage "$(P2P_REGISTRY_PROD_PATH)" \
	;)

.PHONY: p2p-prod ## Deploy to prod
%-prod: p2p_app_url_suffix=
%-prod: p2p_namespace=$(P2P_NAMESPACE_PROD)
%-prod: p2p_registry=$(P2P_REGISTRY_PROD)
