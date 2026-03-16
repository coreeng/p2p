# Pipeline model

The P2P pipeline promotes container images through three sequential stages: `fast-feedback`, `extended-test`, and `prod`. Each stage runs a defined set of make targets against the image produced in the previous stage. An image advances to the next stage only when all targets in the current stage succeed and the pipeline is running on the `main` branch (or a tag push).

## The three stages

### Fast-feedback

The fast-feedback stage builds the application image and runs rapid validation tests. It executes four make targets in sequence:

1. `p2p-build` — builds and pushes the image to the fast-feedback registry.
2. `p2p-functional` — runs functional tests in the `functional` subnamespace.
3. `p2p-nft` — runs non-functional tests in the `nft` subnamespace. (`p2p-functional` and `p2p-nft` run in parallel, both depending only on `p2p-build`.)
4. `p2p-integration` — runs integration tests in the `integration` subnamespace, after both functional and nft tests pass.

On success and on `main` branch or tag, the pipeline runs `p2p-promote-to-extended-test` to copy the image from the fast-feedback registry into the extended-test registry.

The `source` input (default: `${{ vars.FAST_FEEDBACK }}`) controls which environments run the fast-feedback jobs. The `destination` input (default: `${{ vars.EXTENDED_TEST }}`) controls which environments receive the promoted image.

See [`../reference/p2p-workflow-fastfeedback.md`](../reference/p2p-workflow-fastfeedback.md).

### Extended-test

The extended-test stage runs deeper, longer-running tests against the promoted image. It executes one make target:

- `p2p-extended-test` — runs extended tests in the `extended` subnamespace.

The stage only runs on `main` branch. Before executing, the workflow resolves the latest promoted image version from the extended-test registry using `p2p-get-latest-image-extended-test`. On success, the pipeline runs `p2p-promote-to-prod` to copy the image into the prod registry.

The `source` input (default: `${{ vars.EXTENDED_TEST }}`) controls the test environments. The `destination` input (default: `${{ vars.PROD }}`) controls the promotion targets.

See [`../reference/p2p-workflow-extended-test.md`](../reference/p2p-workflow-extended-test.md).

### Prod

The prod stage deploys the promoted image to production. It executes one make target:

- `p2p-prod` — deploys the application in the `prod` subnamespace.

The stage only runs on `main` branch. Before executing, the workflow resolves the latest promoted image version from the prod registry using `p2p-get-latest-image-prod`.

The `source` input (default: `${{ vars.PROD }}`) controls which environments receive the deployment.

See [`../reference/p2p-workflow-prod.md`](../reference/p2p-workflow-prod.md).

## Image flow between registries

Images move between three registry paths within the tenant's Artifact Registry:

```
<region>-docker.pkg.dev/<project>/tenant/<tenant>/fast-feedback/<image>:<version>
<region>-docker.pkg.dev/<project>/tenant/<tenant>/extended-test/<image>:<version>
<region>-docker.pkg.dev/<project>/tenant/<tenant>/prod/<image>:<version>
```

The promotion targets copy images between these paths using skopeo. `p2p-promote-to-extended-test` copies from `fast-feedback` to `extended-test`. `p2p-promote-to-prod` copies from `extended-test` to `prod`. The image tag (the version) remains unchanged across all promotions.

## Pipeline flow diagram

```
PR branch                    main branch / tag push
─────────────────────        ──────────────────────────────────────────────────────────

p2p-build ──────────────────► p2p-build
    │                              │
    ├─► p2p-functional             ├─► p2p-functional ─┐
    │                              │                    ├─► p2p-integration
    └─► p2p-nft                    └─► p2p-nft ─────────┘
                                                            │
                                                            │ (main/tag only)
                                                            ▼
                                               p2p-promote-to-extended-test
                                               [fast-feedback → extended-test]
                                                            │
                                                            ▼
                                               p2p-get-latest-image-extended-test
                                                            │
                                                            ▼
                                                   p2p-extended-test
                                                            │
                                                            │ (main only)
                                                            ▼
                                                  p2p-promote-to-prod
                                               [extended-test → prod]
                                                            │
                                                            ▼
                                                p2p-get-latest-image-prod
                                                            │
                                                            ▼
                                                        p2p-prod
```

## When promotions happen

Promotions only occur when:

- The pipeline is running on the `main` branch (`refs/heads/main`) or a tag push.
- All preceding jobs in the stage succeeded.

On PR branches, fast-feedback runs `p2p-build`, `p2p-functional`, `p2p-nft`, and optionally `p2p-integration` (skippable via `skip-fastfeedback-integration-on-prs`), but never promotes.

## Concurrency behaviour

Every job within `p2p-execute-command` uses a concurrency group keyed on:

```
<github_env>/<tenant_name>-<app_name>-<subnamespace>
```

The `cancel-in-progress` flag is set to `false`. When two pipeline runs target the same environment, tenant, app, and subnamespace simultaneously, the second run queues rather than cancelling the first. This prevents in-flight deployments from being interrupted by newer commits.

## Role of `p2p-get-latest-image-*` workflows

The extended-test and prod stages are triggered independently of the fast-feedback stage (typically on a separate schedule or workflow dispatch). They do not receive the version directly from fast-feedback. Instead, they call `p2p-get-latest-image-extended-test` or `p2p-get-latest-image-prod` to query the Artifact Registry for the most recently promoted image in the relevant registry path. The returned version is then passed into the stage's execute-command jobs.

See [`../reference/p2p-get-latest-image-extended-test.md`](../reference/p2p-get-latest-image-extended-test.md) and [`../reference/p2p-get-latest-image-prod.md`](../reference/p2p-get-latest-image-prod.md).
