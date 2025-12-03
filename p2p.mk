# Avoid surprises
MAKEFLAGS += --warn-undefined-variables
SHELL := /bin/bash

# Parse app.yaml and export all config values as p2p_app_config_* environment variables
P2P_APP_FILE := app.yaml
ifneq ($(wildcard $(P2P_APP_FILE)),)
P2P_APP_PAIRS := $(shell awk '\
  BEGIN { indent_unit = 0 } \
  /^[[:space:]]*\#/ || /^[[:space:]]*$$/ || /^---/ { next } \
  { \
    match($$0, /^[[:space:]]*/); \
    spaces = RLENGTH; \
    if (indent_unit == 0 && spaces > 0) indent_unit = spaces; \
    indent = (indent_unit > 0) ? int(spaces / indent_unit) : 0; \
    gsub(/^[[:space:]]+/, ""); \
    n = index($$0, ":"); \
    key = substr($$0, 1, n-1); \
    val = substr($$0, n+1); \
    gsub(/^[[:space:]]+/, "", val); \
    gsub(/[[:space:]]+\#.*$$/, "", val); \
    path[indent] = key; \
    if (val != "" && path[0] == "config") { \
      p = "p2p_app"; \
      for (i = 0; i <= indent; i++) p = p "_" path[i]; \
      print p "=" val; \
    } \
  }' $(P2P_APP_FILE) 2>/dev/null)
$(foreach pair,$(P2P_APP_PAIRS),$(eval $(word 1,$(subst =, ,$(pair))) := $(word 2,$(subst =, ,$(pair)))))
$(foreach pair,$(P2P_APP_PAIRS),$(eval export $(word 1,$(subst =, ,$(pair)))))
endif

# Set p2p variables for local testing
P2P_TENANT_NAME ?= default-tenant
P2P_APP_NAME ?= default-app
P2P_VERSION ?= 0.0.0-$(shell git rev-parse --short HEAD)
P2P_REGISTRY ?= localhost/local
P2P_REGISTRY_FAST_FEEDBACK_PATH ?= fast-feedback
P2P_REGISTRY_EXTENDED_TEST_PATH ?= extended-test
P2P_REGISTRY_PROD_PATH ?= prod
P2P_REGISTRY_FAST_FEEDBACK ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_FAST_FEEDBACK_PATH)
P2P_REGISTRY_EXTENDED_TEST ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_EXTENDED_TEST_PATH)
P2P_REGISTRY_PROD ?= $(P2P_REGISTRY)/$(P2P_REGISTRY_PROD_PATH)
ifeq ($(P2P_TENANT_NAME),$(P2P_APP_NAME))
P2P_NAMESPACE := $(P2P_APP_NAME)
else
P2P_NAMESPACE := $(P2P_TENANT_NAME)-$(P2P_APP_NAME)
endif
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

.PHONY: p2p-image
p2p-image:
	@echo $(P2P_IMAGE_NAMES) | awk '{ print $$1 }'

.PHONY: p2p-images
p2p-images:
	@echo $(P2P_IMAGE_NAMES)

.PHONY: p2p-build ## Build the app
%-app: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-app: p2p_image=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))
%-app: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)):$(P2P_VERSION)
%-app: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)) --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME)),mode=max

.PHONY: p2p-functional ## Run functional tests
%-functional: p2p_app_url_suffix=-functional
%-functional: p2p_namespace=$(P2P_NAMESPACE_FUNCTIONAL)
%-functional: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-functional: p2p_image=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional
%-functional: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional:$(P2P_VERSION)
%-functional: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-functional,mode=max

.PHONY: p2p-nft ## Run NFT tests
%-nft: p2p_app_url_suffix=-nft
%-nft: p2p_namespace=$(P2P_NAMESPACE_NFT)
%-nft: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-nft: p2p_image=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft
%-nft: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft:$(P2P_VERSION)
%-nft: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-nft,mode=max

.PHONY: p2p-integration ## Run integration tests
%-integration: p2p_app_url_suffix=-integration
%-integration: p2p_namespace=$(P2P_NAMESPACE_INTEGRATION)
%-integration: p2p_registry=$(P2P_REGISTRY_FAST_FEEDBACK)
%-integration: p2p_image=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration
%-integration: p2p_image_tag=$(P2P_REGISTRY_FAST_FEEDBACK)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration:$(P2P_VERSION)
%-integration: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-integration,mode=max

.PHONY: p2p-promote-to-extended-test ## Promote to extended test
p2p-promote-to-extended-test:
	$(foreach image, $(P2P_IMAGE_NAMES), \
		skopeo copy --all --preserve-digests \
			docker://$(SOURCE_REGISTRY)/$(P2P_REGISTRY_FAST_FEEDBACK_PATH)/$(image):$(P2P_VERSION) \
			docker://$(REGISTRY)/$(P2P_REGISTRY_EXTENDED_TEST_PATH)/$(image):$(P2P_VERSION) \
	;)

.PHONY: p2p-extended-test ## Run extended tests
%-extended-test: p2p_app_url_suffix=-extended
%-extended-test: p2p_namespace=$(P2P_NAMESPACE_EXTENDED)
%-extended-test: p2p_registry=$(P2P_REGISTRY_EXTENDED_TEST)
%-extended-test: p2p_image=$(P2P_REGISTRY_EXTENDED_TEST)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended
%-extended-test: p2p_image_tag=$(P2P_REGISTRY_EXTENDED_TEST)/$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended:$(P2P_VERSION)
%-extended-test: p2p_image_cache=--cache-from=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended --cache-to=type=gha,scope=$(if $(filter-out undefined,$(origin 1)),$(1),$(P2P_APP_NAME))-extended,mode=max

.PHONY: p2p-promote-to-prod ## Promote to prod
p2p-promote-to-prod:
	$(foreach image, $(P2P_IMAGE_NAMES), \
		skopeo copy --all --preserve-digests \
			docker://$(SOURCE_REGISTRY)/$(P2P_REGISTRY_EXTENDED_TEST_PATH)/$(image):$(P2P_VERSION) \
			docker://$(REGISTRY)/$(P2P_REGISTRY_PROD_PATH)/$(image):$(P2P_VERSION) \
	;)

.PHONY: p2p-prod ## Deploy to prod
%-prod: p2p_app_url_suffix=
%-prod: p2p_namespace=$(P2P_NAMESPACE_PROD)
%-prod: p2p_registry=$(P2P_REGISTRY_PROD)
