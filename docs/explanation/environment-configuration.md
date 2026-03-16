# Environment configuration

The P2P pipeline uses GitHub environments and repository variables to model deployment targets. Each GitHub environment maps to a specific cloud project and cluster. Repository-level variables define which environments participate in each pipeline stage.

See [How to use multiple environments](../how-to/use-multiple-environments.md) for step-by-step setup. See [p2p-execute-command reference](../reference/p2p-execute-command.md) for the full workflow input reference.

## GitHub environments

Create one GitHub environment per deployment target. Common examples:

| Environment name | Purpose |
|-----------------|---------|
| `gcp-dev` | Fast-feedback and extended-test workloads |
| `gcp-prod` | Production workloads |

GitHub environment protection rules (required reviewers, deployment branches) apply normally; P2P workflows reference environments by name through the matrix variables described below.

## Repository variables

Four repository-level variables control which environments participate in each stage; all four use a JSON matrix format compatible with GitHub Actions `strategy.matrix`.

### `FAST_FEEDBACK`

Defines the environments that run `p2p-build`, `p2p-functional`, `p2p-nft`, and `p2p-integration`.

```json
{"include": [{"deploy_env": "gcp-dev"}]}
```

Multiple environments run jobs in parallel:

```json
{"include": [{"deploy_env": "gcp-dev"}, {"deploy_env": "gcp-dev-eu"}]}
```

### `EXTENDED_TEST`

Defines the environments that run `p2p-extended-test` and receive the promoted image from fast-feedback.

```json
{"include": [{"deploy_env": "gcp-dev"}]}
```

### `PROD`

Defines the environments that run `p2p-prod` and receive the promoted image from extended-test.

```json
{"include": [{"deploy_env": "gcp-prod"}]}
```

### `TENANT_NAME`

The application tenant name as configured in the platform. Each application has its own application tenant, so `TENANT_NAME` is both the tenant name and the app name. This value drives namespace resolution, artifact registry paths, service accounts, and workload identity providers (see [TENANT_NAME mapping](#how-tenant_name-maps-to-platform-resources) below).

```
TENANT_NAME=my-app
```

## Per-environment variables

Each GitHub environment carries variables that describe the target cloud project and cluster. The `p2p-execute-command` workflow reads these automatically.

| Variable | Description |
|----------|-------------|
| `BASE_DOMAIN` | Base DNS domain for the environment (e.g., `dev.example.com`) |
| `INTERNAL_SERVICES_DOMAIN` | Internal services DNS domain |
| `DPLATFORM` | GKE cluster name (used as both the cluster identifier and the `PLATFORM_ENVIRONMENT` env var) |
| `PROJECT_ID` | GCP project ID for the Core Platform environment (e.g., `core-platform-dev-1a2b`) |
| `PROJECT_NUMBER` | GCP project number (e.g., `123456789012`) |
| `REGION` | GCP region (e.g., `europe-west2`); overrides the workflow's `region` input |

## Cloud provider auth variables

### GCP (used by P2P)

P2P derives authentication from `TENANT_NAME`, `PROJECT_ID`, and `PROJECT_NUMBER`. No additional auth variables are needed in GitHub environments for GCP. The workflow constructs:

- Service account: `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`
- Workload identity provider: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/p2p-<TENANT_NAME>/providers/p2p-<TENANT_NAME>`

### AWS (platform workflows)

For platform-level workflows (not P2P execute-command), AWS auth uses `AWS_ROLE_ARN`.

### Azure (platform workflows)

For platform-level workflows, Azure auth uses `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`.

## Resolving configuration with the `resolve-platform-config` action

The `resolve-platform-config` action is a reusable composite action that resolves environment configuration and exports all platform and P2P variables in a single step. It replaces the manual setup that `p2p-execute-command` performs internally, making the same variables available to custom workflows and jobs that do not call `p2p-execute-command`.

The action supports three configuration modes:

- **`github-env`** (default) — reads variables from GitHub environment settings, the same mechanism described in [Per-environment variables](#per-environment-variables) above. The action exports only P2P convenience variables; the platform fields are already present in the job environment.
- **`repo-file`** — reads a YAML config file checked into the repository. The file contains an `environments` map keyed by environment name, with each entry holding the platform fields (`projectId`, `projectNumber`, `region`, domains). This mode removes the dependency on GitHub environment variables entirely.
- **`central-repo`** — fetches the config file from a separate repository via sparse checkout. Each environment has its own file. This mode suits organizations that manage environment configuration centrally across many repositories.

In all three modes the action computes the same derived authentication variables (`REGISTRY`, `SERVICE_ACCOUNT`, `WORKLOAD_IDENTITY_PROVIDER`) and the full set of P2P convenience variables (`P2P_TENANT_NAME`, `P2P_APP_NAME`, `P2P_VERSION`, registry paths, and namespace variants). These match the variables that `p2p.mk` produces, so Makefiles work identically whether they run locally or in CI.

See [resolve-platform-config reference](../reference/resolve-platform-config.md) for the complete input, output, and variable reference.

## How `TENANT_NAME` maps to platform resources

`TENANT_NAME` is the single identifier that ties together all platform resources for a tenancy.

**Kubernetes namespaces.** The tenant's root namespace is `<TENANT_NAME>`. Since app name equals tenant name, subnamespace names follow the pattern `<TENANT_NAME>-<subnamespace>`. For example, with tenant `my-app`, the functional subnamespace is `my-app-functional`.

**Artifact registry paths.** Images are stored under:
```
<REGION>-docker.pkg.dev/<PROJECT_ID>/tenant/<TENANT_NAME>/<stage>/<image>:<version>
```

**Service accounts.** The pipeline authenticates as `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`.

**Workload identity providers.** The OIDC federation pool and provider are both named `p2p-<TENANT_NAME>` within the project.

## Overriding the default matrix with `source` and `destination`

The fast-feedback, extended-test, and prod workflow inputs accept `source` and `destination` inputs that override the repository-level matrix variables.

- On `p2p-workflow-fastfeedback`, `source` overrides `FAST_FEEDBACK` and `destination` overrides `EXTENDED_TEST`.
- On `p2p-workflow-extended-test`, `source` overrides `EXTENDED_TEST` and `destination` overrides `PROD`.
- On `p2p-workflow-prod`, `source` overrides `PROD`.

A single repository can therefore run the same pipeline against different environment sets — such as multi-region deployments — by passing explicit JSON matrices at call time.

## Complete GCP example

The following shows a typical variable set for a `gcp-dev` GitHub environment.

**Repository variables:**

```
FAST_FEEDBACK={"include": [{"deploy_env": "gcp-dev"}]}
EXTENDED_TEST={"include": [{"deploy_env": "gcp-dev"}]}
PROD={"include": [{"deploy_env": "gcp-prod"}]}
TENANT_NAME=my-app
```

**`gcp-dev` environment variables:**

```
BASE_DOMAIN=dev.example.com
INTERNAL_SERVICES_DOMAIN=internal.dev.example.com
DPLATFORM=platform-dev
PROJECT_ID=core-platform-dev-1a2b3c
PROJECT_NUMBER=123456789012
REGION=europe-west2
```

**`gcp-prod` environment variables:**

```
BASE_DOMAIN=prod.example.com
INTERNAL_SERVICES_DOMAIN=internal.prod.example.com
DPLATFORM=platform-prod
PROJECT_ID=core-platform-prod-4d5e6f
PROJECT_NUMBER=987654321098
REGION=europe-west2
```

With this configuration, the pipeline authenticates as:

- Dev: `p2p-my-app@core-platform-dev-1a2b3c.iam.gserviceaccount.com`
- Prod: `p2p-my-app@core-platform-prod-4d5e6f.iam.gserviceaccount.com`

Images are stored at:

- Dev fast-feedback: `europe-west2-docker.pkg.dev/core-platform-dev-1a2b3c/tenant/my-app/fast-feedback/<image>:<version>`
- Prod: `europe-west2-docker.pkg.dev/core-platform-prod-4d5e6f/tenant/my-app/prod/<image>:<version>`

## See also

- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [p2p-execute-command reference](../reference/p2p-execute-command.md)
- [Pipeline model](pipeline-model.md)
