projectDir := $(realpath $(dir $(firstword $(MAKEFILE_LIST))))
os := $(shell uname)

.PHONY: help
help:
	@grep -E '^[a-zA-Z1-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# P2P tasks

.PHONY: p2p-build
p2p-build: ## Build phase
	echo "##### EXECUTING P2P-BUILD #####"
	echo $(REGISTRY)
	echo $(VERSION)

.PHONY: p2p-functional
p2p-functional: ## Execute functional tests
	echo "##### EXECUTING P2P-FUNCTIONAL #####"
	echo $(REGISTRY)
	echo $(VERSION)

.PHONY: p2p-nft
p2p-nft:  ## Execute non-functional tests
	echo "##### EXECUTING P2P-NFT #####"
	echo $(REGISTRY)
	echo $(VERSION)

.PHONY: p2p-dev
p2p-dev:  ## Deploys to dev environment
	echo "##### EXECUTING P2P-DEV #####"
	echo $(REGISTRY)
	echo $(VERSION)

.PHONY: p2p-promote-to-prod
p2p-promote-to-extended-prod:
	echo "##### EXECUTING P2P-PROMOTE-TO-PROD #####"
	echo $(SOURCE_REGISTRY)
	echo $(REGISTRY)
	echo $(VERSION)

.PHONY: p2p-promote-to-extended-test
p2p-promote-to-extended-test:
	echo "##### EXECUTING P2P-PROMOTE-TO-EXTENDED-TEST #####"
	echo $(SOURCE_REGISTRY)
	echo $(REGISTRY)
	echo $(VERSION)

p2p-promote-to-prod:
.PHONY: test-var-print
test-var-print :## Test task
	echo $${TEST_VARIABLE}

