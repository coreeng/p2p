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

Repository variables select the environments for each stage and identify the application tenant.

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

## Runner selection

Every primary P2P workflow accepts an optional `runner-label` input. When it is empty, P2P reads `P2P_RUNNER_LABEL` from the calling repository's organization or repository variables. A repository value overrides an organization value. When neither is set, P2P uses `ubuntu-24.04`.

Use an organization variable to set one runner label for multiple repositories. Restrict the variable to selected repositories while rolling out a new runner, then widen access when those workflows have passed.

## Per-environment variables

Each GitHub environment carries variables that describe the target cloud project and cluster. The `p2p-execute-command` workflow reads these automatically.

| Variable | Description |
|----------|-------------|
| `BASE_DOMAIN` | Base DNS domain for the environment (e.g., `dev.example.com`) |
| `INTERNAL_SERVICES_DOMAIN` | Internal services DNS domain |
| `DPLATFORM` | GKE cluster name (used as both the cluster identifier and the `PLATFORM_ENVIRONMENT` env var) |
| `PROJECT_ID` | GCP project ID for the Core Platform environment (e.g., `core-platform-dev-1a2b`) |
| `PROJECT_NUMBER` | GCP project number (e.g., `123456789012`) |
| `REGION` | Default GCP region (e.g., `europe-west2`); used when the workflow's `region` input is empty |

## Cloud provider auth variables

### GCP (used by P2P)

P2P derives authentication from `TENANT_NAME`, `PROJECT_ID`, and `PROJECT_NUMBER`. No additional auth variables are needed in GitHub environments for GCP. The workflow constructs:

- Service account: `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`
- Workload identity provider: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/p2p-<TENANT_NAME>/providers/p2p-<TENANT_NAME>`

### AWS (platform workflows)

For platform-level workflows (not P2P execute-command), AWS auth uses `AWS_ROLE_ARN`.

### Azure (platform workflows)

For platform-level workflows, Azure auth uses `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`.

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
P2P_RUNNER_LABEL=ubuntu-24.04
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
