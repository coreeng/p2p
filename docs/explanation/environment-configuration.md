# Environment configuration

The P2P pipeline uses GitHub environments and repository variables to model deployment targets. Each GitHub environment maps to a specific cloud project and cluster. Repository-level variables define which environments participate in each pipeline stage.

See [How to use multiple environments](../how-to/use-multiple-environments.md) for step-by-step setup. See [p2p-execute-command reference](../reference/p2p-execute-command.md) for the full workflow input reference.

## GitHub environments

Create one GitHub environment per deployment target. Common examples:

| Environment name | Purpose |
|-----------------|---------|
| `gcp-dev` | Fast-feedback and extended-test workloads |
| `gcp-prod` | Production workloads |

GitHub environment protection rules (required reviewers, deployment branches) apply normally; P2P workflows reference environments by name through the matrix variables described below. The GitHub environment name must exactly equal its `DPLATFORM` value. The configuration source of truth creates both from `env.Environment`; a matrix entry such as `gcp-dev` therefore selects the `gcp-dev` GitHub environment with `DPLATFORM=gcp-dev`.

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
| `PINNIPED_ENDPOINT` | Complete HTTPS endpoint from `CredentialIssuer.status.strategies[type=ImpersonationProxy].frontend.impersonationProxyInfo.endpoint` |
| `PINNIPED_CA_BUNDLE` | Base64-encoded PEM from the adjacent `impersonationProxyInfo.certificateAuthorityData` field |

For this branch-only spike, an operator must read the endpoint and CA from the cluster's `CredentialIssuer` and publish them manually to the matching GitHub environment. Automating publication through the portal is future work and is out of scope.

## Cloud provider auth variables

### GCP (used by P2P)

P2P derives Google authentication from `TENANT_NAME`, `PROJECT_ID`, and `PROJECT_NUMBER`. The workflow constructs:

- Service account: `p2p-<TENANT_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`
- Workload identity provider: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/p2p-<TENANT_NAME>/providers/p2p-<TENANT_NAME>`

Google Workload Identity Federation continues to authenticate Artifact Registry and supplies the application make target's `GOOGLE_APPLICATION_CREDENTIALS`. It no longer authenticates Kubernetes on the spike branch.

### Kubernetes (Pinniped spike)

GitHub OIDC through Pinniped authenticates Kubernetes requests. P2P derives:

- Audience: `core-platform:<DPLATFORM>:<TENANT_NAME>`
- Authenticator: `github-actions-<TENANT_NAME>`

The platform authenticator also requires the GitHub OIDC token's `environment` claim to equal `DPLATFORM` and its normalized `repository` claim to equal the tenant configuration's GitHub repository `owner/name`. This limits Kubernetes access to the configured tenant repository and environment.

P2P writes an ephemeral kubeconfig under `RUNNER_TEMP` containing the endpoint, embedded CA, namespace, context, and trusted exec-plugin configuration. It does not store a bearer token or client credential certificate. The helper comes from the reusable workflow's exact repository and SHA; the Pinniped CLI is pinned and checksum-verified. Configuration validation and `pinniped whoami` run before Kubernetes work, followed by authorization checks immediately before subnamespace creation and target-namespace deployment.

This behavior exists only on `spike/pinniped-sandbox`; no P2P `v2` or other major version has been published, and live sandbox evidence is not yet claimed.

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
```

**`gcp-dev` environment variables:**

```
BASE_DOMAIN=dev.example.com
INTERNAL_SERVICES_DOMAIN=internal.dev.example.com
DPLATFORM=gcp-dev
PROJECT_ID=core-platform-dev-1a2b3c
PROJECT_NUMBER=123456789012
REGION=europe-west2
PINNIPED_ENDPOINT=https://pinniped.gcp-dev.example.com
PINNIPED_CA_BUNDLE=<base64-encoded-PEM-from-CredentialIssuer>
```

**`gcp-prod` environment variables:**

```
BASE_DOMAIN=prod.example.com
INTERNAL_SERVICES_DOMAIN=internal.prod.example.com
DPLATFORM=gcp-prod
PROJECT_ID=core-platform-prod-4d5e6f
PROJECT_NUMBER=987654321098
REGION=europe-west2
PINNIPED_ENDPOINT=https://pinniped.gcp-prod.example.com
PINNIPED_CA_BUNDLE=<base64-encoded-PEM-from-CredentialIssuer>
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
