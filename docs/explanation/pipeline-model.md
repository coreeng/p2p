# Pipeline model

The P2P pipeline promotes container images through three stages: fast-feedback, extended-test, and prod. Each stage runs as a **separate GitHub Actions workflow** on its own trigger and schedule. The image registry connects the stages: each stage promotes its image to the next registry path, and the next stage resolves the latest promoted image independently.

## The three stages

### Fast-feedback

The fast-feedback stage builds the application image and runs rapid validation tests. It executes four make targets in sequence:

1. `p2p-build` — builds and pushes the image to the fast-feedback registry.
2. `p2p-functional` — runs functional tests in the `functional` subnamespace.
3. `p2p-nft` — runs non-functional tests in the `nft` subnamespace. (`p2p-functional` and `p2p-nft` run in parallel, both depending only on `p2p-build`.)
4. `p2p-integration` — runs integration tests in the `integration` subnamespace, after both functional and nft tests pass.

On success and on `main` branch or tag, the pipeline runs `p2p-promote-to-extended-test` to copy the image from the fast-feedback registry into the extended-test registry.

The `source` input (default: `${{ vars.FAST_FEEDBACK }}`) controls which environments run the fast-feedback jobs. The `destination` input (default: `${{ vars.EXTENDED_TEST }}`) controls which environments receive the promoted image.

See [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md).

### Extended-test

The extended-test stage runs deeper, longer-running tests against the promoted image. It executes one make target:

- `p2p-extended-test` — runs extended tests in the `extended` subnamespace.

**This stage runs in its own workflow file**, typically on a cron schedule (e.g., weekday evenings). Running extended tests overnight keeps them off the critical path — developers get fast-feedback results in minutes, while longer-running tests run when the cluster is quieter and results are ready by morning.

Before executing, the workflow calls `p2p-get-latest-image-extended-test` to resolve the most recently promoted image from the extended-test registry. On success, it runs `p2p-promote-to-prod` to copy the image into the prod registry.

The `source` input (default: `${{ vars.EXTENDED_TEST }}`) controls the test environments. The `destination` input (default: `${{ vars.PROD }}`) controls the promotion targets.

See [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md) and the [full pipeline tutorial](../tutorials/full-pipeline.md) for a complete example.

### Prod

The prod stage deploys the promoted image to production. It executes one make target:

- `p2p-prod` — deploys the application in the `prod` subnamespace.

**This stage also runs in its own workflow file**, typically on a morning cron schedule (e.g., weekday mornings before office hours). Deploying early in the working day means issues surface when the team is available to respond.

Before executing, the workflow calls `p2p-get-latest-image-prod` to resolve the most recently promoted image from the prod registry.

The `source` input (default: `${{ vars.PROD }}`) controls which environments receive the deployment.

See [p2p-workflow-prod reference](../reference/p2p-workflow-prod.md) and the [full pipeline tutorial](../tutorials/full-pipeline.md) for a complete example.

## Image flow between registries

Images move between three registry paths within the tenant's Artifact Registry:

```
<region>-docker.pkg.dev/<project>/tenant/<tenant>/fast-feedback/<image>:<version>
<region>-docker.pkg.dev/<project>/tenant/<tenant>/extended-test/<image>:<version>
<region>-docker.pkg.dev/<project>/tenant/<tenant>/prod/<image>:<version>
```

The promotion targets copy images between these paths using skopeo. `p2p-promote-to-extended-test` copies from `fast-feedback` to `extended-test`. `p2p-promote-to-prod` copies from `extended-test` to `prod`. The image tag (the version) remains unchanged across all promotions.

## Pipeline flow diagram

The three stages run as separate workflows, connected by the image registry:

```
┌─────────────────────────────────────────────────────┐
│ ci.yaml (push/PR to main)                           │
│                                                     │
│ p2p-build                                           │
│   ├── p2p-functional ──┐                            │
│   │                    ├── p2p-integration          │
│   └── p2p-nft ─────────┘         │                  │
│                                  │ (main/tag only)  │
│                                  ▼                  │
│                 p2p-promote-to-extended-test        │
│                 [fast-feedback → extended-test]     │
└─────────────────────────┬───────────────────────────┘
                          │
                   image registry
                          │
┌─────────────────────────▼──────────────────────────┐
│ extended-test.yaml (cron: evenings + manual)       │
│                                                    │
│ p2p-get-latest-image-extended-test                 │
│   │                                                │
│   ▼                                                │
│ p2p-extended-test                                  │
│   │                                                │
│   ▼                                                │
│ p2p-promote-to-prod                                │
│ [extended-test → prod]                             │
└─────────────────────────┬──────────────────────────┘
                          │
                   image registry
                          │
┌─────────────────────────▼──────────────────────────┐
│ prod.yaml (cron: mornings + manual)                │
│                                                    │
│ p2p-get-latest-image-prod                          │
│   │                                                │
│   ▼                                                │
│ p2p-prod                                           │
└────────────────────────────────────────────────────┘
```

## Why separate workflows

Each stage serves a distinct purpose and runs on its own schedule:

- **Fast-feedback validates every change.** It runs on every pull request and every merge to `main`, keeping the development loop short. Promotion to the integration registry is restricted to merges to `main` and tag pushes. Integration testing on PR pushes is configurable for faster integrated testing at the cost of more churn. See `run-fastfeedback-integration-on-prs` in the [fast-feedback reference](../reference/p2p-workflow-fastfeedback.md).
- **Extended-test exercises expensive or long-running behaviour.** These tests run on a schedule (typically overnight) against the latest version that passed fast-feedback. Running them once per day for a known-good version controls cost and cluster load while still catching deeper issues.
- **Prod deploys on a predictable cadence.** A daily morning schedule takes the most recent well-tested version — from extended-test if configured, or from fast-feedback otherwise — and deploys it. A predictable deployment window means issues surface when the team is available to respond.

All three stages support `workflow_dispatch` for manual runs outside the schedule, covering urgent deployments and re-runs of failed stages.

## When promotions happen

Promotions only occur when:

- All preceding jobs in the stage succeeded.
- For fast-feedback: the workflow is running on the `main` branch or a tag push.
- For extended-test and prod: the workflow is running on `main` (enforced by the workflow's own trigger — cron and `workflow_dispatch` always run against the default branch).

On PR branches, fast-feedback runs `p2p-build`, `p2p-functional`, `p2p-nft`, and optionally `p2p-integration` (enabled via `run-fastfeedback-integration-on-prs`), but never promotes.

## Concurrency behaviour

Every job within `p2p-execute-command` uses a concurrency group keyed on:

```
<github_env>/<tenant_name>-<subnamespace>
```

Since each application has its own application tenant, the tenant name uniquely identifies the app. The pipeline sets `cancel-in-progress` to `false`, so when two runs target the same environment, tenant, and subnamespace simultaneously, the second run queues rather than cancels the first. This keeps in-flight deployments safe from interruption by newer commits.

## Role of `p2p-get-latest-image-*` workflows

Because each stage runs in its own workflow on its own schedule, extended-test and prod receive no version string from fast-feedback. Instead, each stage calls `p2p-get-latest-image-extended-test` or `p2p-get-latest-image-prod` to query the Artifact Registry for the most recently promoted image in the relevant registry path, then passes that version into the stage's execute-command jobs.

This decoupling means a slow extended-test run always picks up the latest image that fast-feedback promoted — not necessarily the one from a specific fast-feedback run. Similarly, prod deploys whatever passed extended-test most recently.

See [p2p-get-latest-image-extended-test reference](../reference/p2p-get-latest-image-extended-test.md) and [p2p-get-latest-image-prod reference](../reference/p2p-get-latest-image-prod.md).

## See also

- [How to use multiple environments](../how-to/use-multiple-environments.md)
- [How to skip stages on pull requests](../how-to/skip-stages-on-prs.md)
- [Versioning](versioning.md)
- [Environment configuration](environment-configuration.md)
- [Make targets](make-targets.md)
