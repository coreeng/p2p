# CECG Core Platform P2P 

This is a reusable Github Actions P2P for CECG's Core Platform

## Version 1

Supported quality gates:
* fastfeedback


Usage:

```yaml
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
## Additional Fields

In addition to the above mentioned fields there are a few optional on all jobs:


```yaml
fastfeedback:
    needs: [version]
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      dry-run: false
      working-directory: "."
      main-branch: main
      version-prefix: v
    secrets:
      container_registry_user: ${{ secrets.CONTAINER_REGISTRY_USER }}
      container_registry_pat: ${{ secrets.CONTAINER_REGISTRY_PAT }}
      env_vars: |
          SECRET_USER=${{ secrets.SECRET_USER }}
          SECRET_PASSWORD=${{ secrets.SECRET_PASSWORD }}        
```

### Artifact uploads (artifacts)

Both the fastfeedback and extended-test workflows support an optional `artifacts` input.

- Type: `string`
- Format: YAML mapping from **command name** (e.g. `p2p-build`, `p2p-functional`, `p2p-nft`, `p2p-integration`, `p2p-extended-test`) to a **list of path/glob patterns** to upload.
- Behavior:
  - If `artifacts` is not set or does not contain a key for the current command, no artifacts are uploaded.
  - When configured, artifacts from matching paths are uploaded per job after `make <command>` completes.
  - Paths are interpreted **relative to the `working-directory` input** of the reusable workflow (default `.` / repo root). For example, if you set `working-directory: ./service`, then an artifact path `path/to/reports/**` refers to `service/path/to/report/**` in the repository.

Example opting in for fastfeedback:

```yaml
fastfeedback:
  needs: [version]
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    artifacts: |
      p2p-build:
        - reports/build/**
      p2p-functional:
        - reports/functional/**
        - reports/shared/**
      p2p-nft:
        - reports/nft/**
      p2p-integration:
        - reports/integration/**
```

Example opting in for extended-test:

```yaml
extended-test:
  needs: [fastfeedback]
  uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    artifacts: |
      p2p-extended-test:
        - reports/extended/**
```
### secrets.env_vars

This is a way you can pass secrets to be exposed as environment variables for your makefile to use. This will also ensure
your secrets stay secret and hidden from any inputs on the CI jobs.

### secrets.container_registry_user && container_registry_pat

These will be used to authenticate to tenant provided registry with tenant's own account. Check the documentation on how to generate these for dockerhub.

### secrets.container_registry_url

Tenant provided registry url. If unspecified, the default of dockerhub will be used

### dry_run

Typically used for syntax testing. Will run most jobs without actually connecting to them or calling the makefile tasks.
Defaults to false

### working-directory

Used to specify where your makefile is. Defaults tot he root of the project.

### main-branch

The default main branch. This is used to on p2p fast feedback to trigger promotion to extended-test, as other branches won't be promoted.

### version-prefix
By default, version will be created and used assuming `v` prefix, such as `v0.25.0`. You can override this to the desired value, for example, if you have multiple projects on the same repo, since tags will be created based on this prefix.
 
### Application Versioning

The `p2p-version` workflow has the following behaviour:

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
* INTERNAL_SERVICES_DOMAIN e.g. gcp-dev-internal.cecg.platform.cecg.io
* DPLATFORM environment name from platform-environments e.g. gcp-dev
* PROJECT_ID project id from platform environments e.g. core-platform-efb3c84c
* PROJECT_NUMBER project number for the project id above

Usually you need at least two environments e.g.

* `gcp-dev`
* `gcp-prod`


For an instance of the CECG Core Platform on GCP.

A single dev environment is enough for fastfeedback.

Set the following repository variables (these may be set globally for your org):

* `FAST_FEEDBACK` to {"include": [{"deploy_env": "gcp-dev"}]}
* `EXTENDED_TEST` to {"include": [{"deploy_env": "gcp-dev"}]}
* `PROD` to {"include": [{"deploy_env": "gcp-prod"}]}
And specifically for your app set:

* `TENANT_NAME` as configured in your tenancy in platform environments

### Make tasks

Available env vars for all envs:

* `REGISTRY` that you're authenticated to
* `INTERNAL_SERVICES_DOMAIN` to access internal services like Grafana

Every task will have kubectl access as your tenant

#### p2p-build
#### p2p-functional
#### p2p-integration 
#### p2p-nft
#### p2p-promote-to-extended-test

If you want to execute task after the `extended-test` or `prod` promotion, you can, by setting a dependency on your promotion task, for example:
```
.PHONY: p2p-promote-to-extended-test
p2p-promote-to-extended-test: promote-image-to-extended-tests deploy-to-dev
...

### Inputs

#### Inputs: Miscellaneous
-   `working-directory`: (Optional) Relative directory where workflow will run. For example:

    ```text
    working-directory: ./dir_1/subdir_2
    ```

    Without this input, the workflow will run on the root directory of your repository. 
     > **⚠️ NOTE!** Changing the working-directory, instructs the workflow to search for a Makefile in that directory. All subsequent commands within the `Makefile` will subsequently need to be relative to the specified `working-directory`.
