# CECG Developer Platform P2P 

This is a reusable Github Actions P2P for CECG's Developer Platform

## Version 1

Supported quality dates:
* fastfeedback


Usage:

```
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
  fastfeedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
```

### GitHub Variables

#### Environments

Create your environments with the following variables:
* BASE_DOMAIN e.g. gcp-dev.cecg.platform.cecg.io
* DPLATFORM environment name from platform-environments e.g. gcp-dev
* PROJECT_ID project id from platform environments e.g. core-platform-efb3c84c
* PROJECT_NUMBER project number for the project id above

Usuaully you need at least two environments e.g.

* `gcp-dev`
* `gcp-prod`

For an instance of the CECG developer platform on GCP.

To configure the quality 

### Make tasks

#### p2p-build
#### p2p-functional
#### p2p-nft
#### p2p-build
#### p2p-promote-to-extended-test



