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
  version:
    uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
    secrets:
      git-token: ${{ secrets.GITHUB_TOKEN }} 

  fastfeedback:
    needs: [version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
```

### Application Versioning

The `p2p-version` workflow has the following behavior:

* When on the main branch:
  * If no versions exist, it starts with v0.0.0
  * If the version exists, it tags the next patch version
  * Always sets the output version
* When not on the main build
  * Never tags
  * Uses the previous tagged version, defaulting to v0.0.0, and adds the git short hash to the end

### GitHub Variables

#### Environments

Create your environments with the following variables:
* BASE_DOMAIN e.g. gcp-dev.cecg.platform.cecg.io
* DPLATFORM environment name from platform-environments e.g. gcp-dev
* PROJECT_ID project id from platform environments e.g. core-platform-efb3c84c
* PROJECT_NUMBER project number for the project id above

Usually you need at least two environments e.g.

* `gcp-dev`
* `gcp-prod`


For an instance of the CECG developer platform on GCP.

A single dev environment is enough for fastfeedback.

Set the following repository variables (these may be set globally for your org):

* `FAST_FEEDBACK` to {"include": [{"deploy_env": "gcp-dev"}]}
* `EXTENDED_TEST` to {"include": [{"deploy_env": "gcp-dev"}]}

And specifically for your app set:

* `TENANT_NAME` as configured in your tenancy in platform environments

### Make tasks

Available env vars for all envs:

* `REGISTRY` that you're authenticated to

Every task will have kubectl access as your tenant

#### p2p-build
#### p2p-functional
#### p2p-nft
#### p2p-build
#### p2p-promote-to-extended-test

### Inputs

#### Inputs: Miscellaneous
-   `working-directory`: (Optional) Relative directory where workflow will run. For example:

    ```text
    working-directory: ./dir_1/subdir_2
    ```

    Without this input, the workflow will run on the root directory of your repository. 
     > **⚠️ NOTE!** Changing the working-directory, instructs the workflow to search for a Makefile in that directory. All subsequent commands within the `Makefile` will subsequently need to be relative to the specified `working-directory`.
