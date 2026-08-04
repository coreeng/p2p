# p2p-execute-command.yaml

> Authenticates to Google Cloud with Workload Identity Federation and to Kubernetes with GitHub OIDC through Pinniped, sets up the P2P environment variables, and runs a `make` target.

> **Spike status:** Pinniped support exists only on `spike/pinniped-sandbox`. No P2P `v2` or other major version containing this behavior has been published, and sandbox validation evidence is not yet claimed.

## Usage

```yaml
jobs:
  build:
    uses: coreeng/p2p/.github/workflows/p2p-execute-command.yaml@spike/pinniped-sandbox
    secrets:
      env_vars: ${{ secrets.ENV_VARS }}
    with:
      command: p2p-build
      version: ${{ needs.version.outputs.version }}
      github_env: sandbox-3-gcp
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `command` | string | Yes | — | The `make` target to run (e.g. `p2p-build`). |
| `github_env` | string | No | `''` | GitHub environment name used for deployment protection rules and concurrency grouping. For non-dry runs it is required in practice and must exactly equal that environment's `DPLATFORM` value. |
| `dry-run` | boolean | No | `false` | When `true`, skips GCP authentication, cluster setup, and the `make` invocation. |
| `region` | string | No | `europe-west2` | GCP region. Overridden by the `REGION` repository/environment variable when set. |
| `subnamespace` | string | No | `''` | Kubernetes subnamespace suffix to create and switch context to before running the command. |
| `app-name` | string | No | `''` | Application name. Must equal the tenant name (each application has its own application tenant). Falls back to `TENANT_NAME` when empty. |
| `tenant-name` | string | No | `''` | Tenant name. Must equal `app-name`. Falls back to the `TENANT_NAME` repository/environment variable when not set. |
| `version` | string | Yes | — | Artifact version passed to the `make` target via `P2P_VERSION`. |
| `checkout-version` | string | No | `''` | Git ref to check out. Ignored when `dry-run` is `true`; the workflow checks out the default ref. |
| `zone` | string | No | `europe-west2-a` | GCP zone. Accepted but unused by the workflow. |
| `pre-targets` | string | No | `''` | Make targets to run before the main command. Accepted but unused by the workflow. |
| `post-targets` | string | No | `''` | Make targets to run after the main command. Accepted but unused by the workflow. |
| `working-directory` | string | No | `'.'` | Directory from which the `make` target is executed. |
| `skip-subnamespaces-create` | boolean | No | `false` | When `true`, skips automatic subnamespace creation even if `subnamespace` is set. |
| `artifacts` | string | No | `''` | YAML-formatted map of command names to artifact paths. Paths matching the active `command` are uploaded after the run. Single-line path entries only. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `env_vars` | No | Newline-delimited `KEY=VALUE` pairs decoded into the job environment before the `make` invocation. Single-line entries only. |
| `container_registry_user` | No | Username for an additional container registry login. |
| `container_registry_pat` | No | Password/PAT for an additional container registry login. Required when `container_registry_user` is set. |
| `container_registry_url` | No | URL of the additional container registry. |

## Outputs

This workflow has no outputs.

## Job Graph

1. `exec` — Single job that performs all steps: checkout, Google WIF auth, Pinniped Kubernetes auth, cluster setup, Docker Buildx setup, skopeo setup, environment variable decoding, P2P variable export, and the `make` invocation.

## Authentication

The spike uses two independent OIDC authentication paths:

- GitHub OIDC through Pinniped authenticates Kubernetes API requests. P2P requests audience `core-platform:<DPLATFORM>:<TENANT_NAME>` and uses the `JWTAuthenticator` named `github-actions-<TENANT_NAME>`.
- Google Workload Identity Federation remains responsible for Artifact Registry access and for the credentials file exposed to the application make target as `GOOGLE_APPLICATION_CREDENTIALS`.

The platform-side `JWTAuthenticator` accepts only the configured environment and the tenant configuration's GitHub repository `owner/name`. The token's `environment` claim must equal `DPLATFORM`, and its normalized `repository` claim must equal that configured tenant repository. P2P cannot widen this boundary.

`PINNIPED_ENDPOINT` must be the complete HTTPS endpoint reported at `CredentialIssuer.status.strategies[type=ImpersonationProxy].frontend.impersonationProxyInfo.endpoint`. `PINNIPED_CA_BUNDLE` must be the base64-encoded PEM reported by the adjacent `certificateAuthorityData` field. For this spike, operators manually publish both values as GitHub environment variables; portal automation is out of scope.

P2P creates the kubeconfig under `RUNNER_TEMP`. It embeds only the endpoint, CA, context, namespace, and exec-plugin configuration; it stores no bearer token or client credential certificate. Whenever the Kubernetes client invokes the Pinniped exec helper, it requests a fresh GitHub OIDC token as needed; the Pinniped credential cache is disabled.

The credential helper is checked out from the reusable workflow's own repository and exact workflow SHA, then moved outside the application workspace before use. The Pinniped CLI download is pinned to `v0.47.0` and verified with its SHA-256 checksum. P2P fails early when configuration is incomplete or `github_env` differs from `DPLATFORM` and verifies the identity with `pinniped whoami`. Before applying a `SubnamespaceAnchor`, it checks `create` authorization when the anchor is absent and `patch` authorization when it already exists. It also checks `Deployment` creation in the target namespace. Make targets can require additional permissions enforced by Kubernetes.

## Environment Variables

The following variables are exported to `GITHUB_ENV` before the `make` target runs and are therefore available inside the target:

| Variable | Value |
|----------|-------|
| `P2P_TENANT_NAME` | Resolved tenant name (`tenant-name` input or `TENANT_NAME` variable). |
| `P2P_APP_NAME` | Value of the `app-name` input. |
| `P2P_VERSION` | Value of the `version` input. |
| `P2P_REGISTRY` | Base Artifact Registry path: `<region>-docker.pkg.dev/<project>/tenant/<tenant>`. |
| `P2P_REGISTRY_FAST_FEEDBACK` | `P2P_REGISTRY/fast-feedback` |
| `P2P_REGISTRY_EXTENDED_TEST` | `P2P_REGISTRY/extended-test` |
| `P2P_REGISTRY_PROD` | `P2P_REGISTRY/prod` |
| `P2P_NAMESPACE_FUNCTIONAL` | `<namespace>-functional` |
| `P2P_NAMESPACE_NFT` | `<namespace>-nft` |
| `P2P_NAMESPACE_INTEGRATION` | `<namespace>-integration` |
| `P2P_NAMESPACE_EXTENDED` | `<namespace>-extended` |
| `P2P_NAMESPACE_PROD` | `<namespace>-prod` |
| `PLATFORM_ENVIRONMENT` | Value of the `DPLATFORM` repository/environment variable. |

**Namespace naming**: each application has its own application tenant, so `app-name` always equals `TENANT_NAME` and `<namespace>` is simply `TENANT_NAME`.

## See also

- [How to pass secrets and environment variables](../how-to/pass-secrets-and-env-vars.md)
- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [Environment configuration](../explanation/environment-configuration.md)
- [Make targets](../explanation/make-targets.md)
