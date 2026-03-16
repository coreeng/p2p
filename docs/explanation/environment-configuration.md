# Environment configuration

The P2P pipeline uses GitHub environments and repository variables to model deployment targets. Each GitHub environment maps to a specific cloud project and cluster. Repository-level variables define which environments participate in each pipeline stage.

See [`../how-to/use-multiple-environments.md`](../how-to/use-multiple-environments.md) for step-by-step setup. See [`../reference/p2p-execute-command.md`](../reference/p2p-execute-command.md) for the full workflow input reference.

## GitHub environments

Create one GitHub environment per deployment target. Common examples:

| Environment name | Purpose |
|-----------------|---------|
| `gcp-dev` | Fast-feedback and extended-test workloads |
| `gcp-staging` | Extended-test workloads in a separate project |
| `gcp-prod` | Production workloads |

GitHub environment protection rules (required reviewers, deployment branches) apply normally. The P2P workflows reference environments by name through the matrix variables described below.

## Repository variables

Four repository-level variables control which environments participate in each stage. All four use a JSON matrix format compatible with GitHub Actions `strategy.matrix`.

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

The tenancy name as configured in the platform. This value drives namespace resolution, artifact registry paths, service accounts, and workload identity providers (see [TENANT_NAME mapping](#how-tenant_name-maps-to-platform-resources) below).

```
TENANT_NAME=my-team
```

## Per-environment variables

Each GitHub environment carries variables that describe the target cloud project and cluster. The `p2p-execute-command` workflow reads these automatically.

| Variable | Description |
|----------|-------------|
| `BASE_DOMAIN` | Base DNS domain for the environment (e.g., `dev.example.com`) |
| `INTERNAL_SERVICES_DOMAIN` | Internal services DNS domain |
| `DPLATFORM` | GKE cluster name (used as both the cluster identifier and the `PLATFORM_ENVIRONMENT` env var) |
| `PROJECT_ID` | GCP project ID (e.g., `my-team-dev-1a2b`) |
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

## How `TENANT_NAME` maps to platform resources

`TENANT_NAME` is the single identifier that ties together all platform resources for a tenancy.

**Kubernetes namespaces.** The tenant's root namespace is `<TENANT_NAME>`. Subnamespace names follow the pattern `<TENANT_NAME>-<app-name>-<subnamespace>` (or `<TENANT_NAME>-<subnamespace>` when app name equals tenant name). For example, with tenant `my-team` and app `my-svc`, the functional subnamespace is `my-team-my-svc-functional`.

**Artifact registry paths.** Images are stored under:
```
<REGION>-docker.pkg.dev/<PROJECT_ID>/tenant/<TENANT_NAME>/<stage>/<image>:<version>
```

**Service accounts.** The pipeline authenticates as `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`.

**Workload identity providers.** The OIDC federation pool and provider are both named `p2p-<TENANT_NAME>` within the project.

## Overriding the default matrix with `source` and `destination`

The fast-feedback, extended-test, and prod workflow inputs accept `source` and `destination` parameters that override the repository-level matrix variables.

- On `p2p-workflow-fastfeedback`, `source` overrides `FAST_FEEDBACK` and `destination` overrides `EXTENDED_TEST`.
- On `p2p-workflow-extended-test`, `source` overrides `EXTENDED_TEST` and `destination` overrides `PROD`.
- On `p2p-workflow-prod`, `source` overrides `PROD`.

This allows a single repository to run the same pipeline against different environment sets (e.g., multi-region deployments) by passing explicit JSON matrices at call time.

## Complete GCP example

The following shows a typical variable set for a `gcp-dev` GitHub environment.

**Repository variables:**

```
FAST_FEEDBACK={"include": [{"deploy_env": "gcp-dev"}]}
EXTENDED_TEST={"include": [{"deploy_env": "gcp-dev"}]}
PROD={"include": [{"deploy_env": "gcp-prod"}]}
TENANT_NAME=my-team
```

**`gcp-dev` environment variables:**

```
BASE_DOMAIN=dev.example.com
INTERNAL_SERVICES_DOMAIN=internal.dev.example.com
DPLATFORM=platform-dev
PROJECT_ID=my-team-dev-1a2b3c
PROJECT_NUMBER=123456789012
REGION=europe-west2
```

**`gcp-prod` environment variables:**

```
BASE_DOMAIN=prod.example.com
INTERNAL_SERVICES_DOMAIN=internal.prod.example.com
DPLATFORM=platform-prod
PROJECT_ID=my-team-prod-4d5e6f
PROJECT_NUMBER=987654321098
REGION=europe-west2
```

With this configuration, the pipeline authenticates as:

- Dev: `p2p-my-team@my-team-dev-1a2b3c.iam.gserviceaccount.com`
- Prod: `p2p-my-team@my-team-prod-4d5e6f.iam.gserviceaccount.com`

Images are stored at:

- Dev fast-feedback: `europe-west2-docker.pkg.dev/my-team-dev-1a2b3c/tenant/my-team/fast-feedback/<image>:<version>`
- Prod: `europe-west2-docker.pkg.dev/my-team-prod-4d5e6f/tenant/my-team/prod/<image>:<version>`
