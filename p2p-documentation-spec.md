# P2P Documentation Overhaul — Design Spec

## Problem

The repo has a single README.md (213 lines) that mixes tutorial, reference, how-to, and explanation content. Many sections are incomplete (empty headings, cut-off code blocks). There is no `docs/` directory. Several workflows and features are entirely undocumented, including the new configurable build tool inputs.

## Goal

Comprehensive, Diataxis-structured documentation for all p2p-* workflows. Every documented feature must have at least one YAML usage example. The root README becomes a hub that gets people to what they need quickly.

## Scope

- **In scope:** All `p2p-*` reusable workflows. Documentation aimed at both tenant/application teams (primary) and internal platform engineers.
- **Out of scope:** `platform-*` workflows (make-specific, internal to core platform team).

## Diataxis Categories

Documentation is organized into four categories per the [Diataxis framework](https://diataxis.fr):

- **Tutorials** — Learning-oriented. Take the reader by the hand through a complete experience.
- **How-to guides** — Task-oriented. Solve a specific problem for a competent user.
- **Reference** — Information-oriented. Accurate, complete technical descriptions for lookup.
- **Explanation** — Understanding-oriented. Provide context, rationale, and conceptual models.

## File Structure

```
README.md                                  # Hub — quick start + routing
docs/
  tutorials/
    getting-started.md                     # End-to-end: first app through the pipeline
    full-pipeline.md                       # Adding extended-test and prod stages
  how-to/
    pass-secrets-and-env-vars.md           # Using env_vars, container registry secrets
    upload-artifacts.md                    # Configuring artifact uploads per stage
    use-a-custom-build-tool.md             # Swapping make for just/task/etc
    configure-slack-alerts.md              # Setting up failure/success notifications
    use-multiple-environments.md           # Multi-region / multi-env matrix setup
    customise-versioning.md                # Version prefixes, multi-project repos
    skip-stages-on-prs.md                  # skip-fastfeedback-integration-on-prs, dry-run
  reference/
    p2p-version.md                         # Inputs, outputs, behaviour
    p2p-workflow-fastfeedback.md           # Inputs, outputs, secrets, job graph
    p2p-workflow-extended-test.md          # Inputs, outputs, secrets, job graph
    p2p-workflow-prod.md                   # Inputs, outputs, secrets, job graph
    p2p-execute-command.md                 # Inputs, outputs, secrets
    p2p-promote-image.md                   # Inputs, outputs, secrets
    p2p-get-latest-image.md               # Base workflow — inputs, outputs
    p2p-get-latest-image-extended-test.md  # Extended-test wrapper — inputs, outputs, secrets
    p2p-get-latest-image-prod.md           # Prod wrapper — inputs, outputs, secrets
  explanation/
    pipeline-model.md                      # fast-feedback → extended-test → prod promotion
    versioning.md                          # How p2p-version works, tag behaviour, branch rules
    environment-configuration.md           # GitHub environments, variables, matrix JSON format
    make-targets.md                        # Expected make targets, env vars available, lifecycle
```

Total: 23 markdown files (1 README rewrite + 22 docs).

## README.md Design

The root README is a progressive-disclosure hub — enough to get started standalone, with links to go deeper.

### Sections

1. **Title + one-liner** — "P2P — Reusable GitHub Actions Workflows" / "Reusable CI/CD workflows for CECG Core Platform tenants."

2. **Quick Start** — Minimal YAML snippet: p2p-version + p2p-workflow-fastfeedback. ~15 lines with inline comments. A new tenant can copy-paste this and have fast-feedback running.

3. **Workflows table** — One row per workflow, columns: Name (linked to reference doc), Purpose (one-liner).

   | Workflow | Purpose |
   |----------|---------|
   | p2p-version | Semantic versioning from git tags |
   | p2p-workflow-fastfeedback | Build, test (functional + NFT + integration), promote |
   | p2p-workflow-extended-test | Run extended tests, promote to prod registry |
   | p2p-workflow-prod | Deploy to production |
   | p2p-get-latest-image-extended-test | Resolve latest image version in extended-test registry |
   | p2p-get-latest-image-prod | Resolve latest image version in prod registry |

   A second table for internal/lower-level workflows that tenants typically don't call directly but may need to understand:

   | Workflow | Purpose |
   |----------|---------|
   | p2p-execute-command | Leaf executor — runs a build tool target in a configured environment |
   | p2p-promote-image | Authenticates to source/dest registries and runs the promotion make target |
   | p2p-get-latest-image | Base workflow for querying latest image version from artifact registry |

4. **Prerequisites** — Brief list: GitHub environments, required repository variables (`FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD`, `TENANT_NAME`), permissions block. Links to `docs/explanation/environment-configuration.md` for detail.

5. **Documentation** — Table linking to each Diataxis category with short descriptions of what's inside.

   | Category | What's inside |
   |----------|---------------|
   | [Tutorials](docs/tutorials/) | Step-by-step guides to get running |
   | [How-to Guides](docs/how-to/) | Solve specific problems: secrets, artifacts, custom build tools, Slack alerts |
   | [Reference](docs/reference/) | Complete inputs/outputs/secrets for every workflow |
   | [Explanation](docs/explanation/) | Concepts: pipeline model, versioning, environments, make targets |

## Tutorials

### getting-started.md

Takes a new tenant from zero to fast-feedback running on PRs and main.

- Prerequisites: what GitHub environments and variables to create
- Step 1: Create your Makefile with `p2p-build` and `p2p-functional` targets
- Step 2: Create your workflow file calling `p2p-version` + `p2p-workflow-fastfeedback`
- Step 3: Push and see it run
- What happens next: brief explanation of the job graph, link to explanation/pipeline-model.md

### full-pipeline.md

Extends getting-started to add extended-test and prod stages.

- Add `p2p-workflow-extended-test` after fast-feedback
- Add `p2p-workflow-prod` after extended-test
- Add the `p2p-extended-test` and `p2p-prod` make targets
- Configure additional GitHub environments
- Show the complete workflow YAML with all three stages

## How-to Guides

Each how-to follows a consistent format: brief context sentence, then numbered steps with YAML examples.

### pass-secrets-and-env-vars.md

- How to use `secrets.env_vars` to pass secrets as environment variables
- How to use `secrets.container_registry_user` / `container_registry_pat` / `container_registry_url` for private registries
- **Caveat: `env_vars` does not support multi-line values** — document this limitation clearly with an example of what works and what doesn't

### upload-artifacts.md

- How to configure the `artifacts` input with YAML mapping from command name to path globs
- Examples for fastfeedback and extended-test
- How `working-directory` affects artifact path resolution

### use-a-custom-build-tool.md

- How to use `build-tool`, `build-tool-args`, and `build-target-args` inputs (added in PR #140 on branch `configurable-build-tool` — this doc should be written against those changes once merged)
- Example swapping `make` for `just`
- Example passing flags before and after the target

### configure-slack-alerts.md

- How to set up `secrets.slack_webhook_url`
- What gets notified: failures on main for all stages (fastfeedback, extended-test, prod, version, get-latest-image), success notification for prod only
- Example YAML passing the webhook secret through

### use-multiple-environments.md

- How the matrix JSON variables (`FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD`) work
- How `source` and `destination` inputs override which environment matrix is used for each stage
- Example with multiple deploy environments
- How to configure multi-region deployments
- How `app-name` and `tenant-name` inputs work for multi-app repos
- How `skip-subnamespaces-create` works and when to use it

### customise-versioning.md

- How `version-prefix` works for multi-project repos
- Example with a custom prefix like `app-tag`
- How version output changes on main vs PR branches

### skip-stages-on-prs.md

- How `dry-run` works and when to use it
- How `skip-fastfeedback-integration-on-prs` skips integration tests on PRs
- Example YAML showing both options

## Reference Docs

Every reference doc follows this exact template:

```markdown
# <workflow-name>

> One-line description.

## Usage

Minimal YAML snippet showing how to call this workflow.

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|

## Secrets

| Name | Required | Description |
|------|----------|-------------|

## Outputs

| Name | Description |
|------|-------------|

## Job Graph

Execution order with conditions noted.
```

### Content source

Input/secret/output tables are generated directly from the workflow YAML `workflow_call` definitions — nothing paraphrased or invented. Every input gets its actual type, default, and description from the source file.

### Per-workflow notes

- **p2p-version.md** — Include the versioning behaviour rules (main branch vs PR, tag-exists handling) in a "Behaviour" section after the standard template. Include `checkout-version` input, `git-token` required secret, `slack_webhook_url` optional secret, and both outputs (`version` and `previous_version`).
- **p2p-workflow-fastfeedback.md** — Job graph: build → functional-test + nft-test (parallel) → integration-test → promote. Note conditions: integration-test skipped on PRs if `skip-fastfeedback-integration-on-prs` is true; promote and integration-test also run on tag pushes; promote only runs on main/tags.
- **p2p-workflow-extended-test.md** — Job graph: run-tests → promote. Both only run on main branch. Document `version-prefix` input (used to construct checkout ref).
- **p2p-workflow-prod.md** — Job graph: prod-deploy. Only runs on main branch. Has both failure and success Slack notifications. Document `version-prefix` input. Note that `version` is optional (default `''`) unlike fastfeedback and extended-test where it is required.
- **p2p-execute-command.md** — Document as the "leaf executor" that all higher-level workflows call. Include the full list of environment variables it sets (P2P_TENANT_NAME, P2P_APP_NAME, P2P_VERSION, P2P_REGISTRY, P2P_NAMESPACE_*, PLATFORM_ENVIRONMENT, etc.). Document all inputs including `github_env`, `zone` (declared but unused), `app-name`, `tenant-name`, `subnamespace`, `skip-subnamespaces-create`. Note: `pre-targets` and `post-targets` inputs exist but are currently unused. Document the namespace naming logic: when `app-name` equals `TENANT_NAME`, the namespace is just `TENANT_NAME`; otherwise it is `TENANT_NAME-app-name`.
- **p2p-promote-image.md** — Document the promotion mechanism: source registry lookup → skopeo login to both registries → delegates to user's `make p2p-promote-to-<stage>` target (the actual image copy is the user's responsibility in their Makefile). Include the P2P_* variables and auth-related env vars it sets (SOURCE_REGISTRY, SOURCE_ACCESS_TOKEN, DEST_ACCESS_TOKEN, etc.). Document `app-name` and `tenant-name` inputs.
- **p2p-get-latest-image.md** — Document the base workflow that queries the artifact registry for the latest semver tag. Explain the semver sorting logic briefly.
- **p2p-get-latest-image-extended-test.md** — Wrapper around the base workflow with extended-test defaults. Include `slack_webhook_url` secret and `main-branch` input.
- **p2p-get-latest-image-prod.md** — Wrapper around the base workflow with prod defaults. Include `slack_webhook_url` secret and `main-branch` input.

## Explanation Docs

### pipeline-model.md

- The three-stage promotion model: fast-feedback → extended-test → prod
- How images flow between registries at each promotion
- When promotions happen (only on main, only on success; also on tag pushes for fastfeedback)
- Concurrency behaviour: jobs are grouped by environment/tenant/app/subnamespace with `cancel-in-progress: false` — concurrent runs queue rather than cancel
- Diagram or description of the full pipeline flow

### versioning.md

- How p2p-version works: tag lookup, semver increment, hash suffix on PRs
- Tag creation rules (only on main, only when commit differs from last tag)
- version-prefix mechanics
- Relationship between version output and image tags

### environment-configuration.md

- GitHub environments and when to create them
- Repository variables: `FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD` — the matrix JSON format
- Per-environment variables: `BASE_DOMAIN`, `INTERNAL_SERVICES_DOMAIN`, `DPLATFORM`, `PROJECT_ID`, `PROJECT_NUMBER`, `REGION`
- `TENANT_NAME` and how it relates to namespaces and registries
- GCP-specific variables: `WORKLOAD_IDENTITY_PROVIDER`, `SERVICE_ACCOUNT`

### make-targets.md

- Expected make targets for each pipeline stage and what they should do
- Environment variables available to each target (REGISTRY, VERSION, P2P_*, kubectl access)
- The target lifecycle: which targets run in which order, in which subnamespace
- How to structure targets for promotion (p2p-promote-to-extended-test, p2p-promote-to-prod)

## Writing Style Guide

All documentation must follow these rules for consistency across all 21 files. Implementers must use the `elements-of-style:writing-clearly-and-concisely` skill when writing prose.

### General prose

- Apply Strunk's Elements of Style: omit needless words, use active voice, put statements in positive form
- Write in present tense ("the workflow promotes the image" not "the workflow will promote the image")
- Use second person ("you") in tutorials and how-to guides; use impersonal/passive in reference docs ("the input controls..." not "you use this input to...")
- One idea per sentence. Short sentences over long ones
- No filler phrases: "In order to" → "To". "It should be noted that" → delete. "Basically" → delete

### Terminology

Use these terms consistently — do not alternate:

| Use | Don't use |
|-----|-----------|
| workflow | pipeline, action, job file |
| input | parameter, argument, variable (when referring to workflow_call inputs) |
| secret | credential, token (when referring to workflow_call secrets) |
| make target | make task, make command, make recipe |
| fast-feedback | fastfeedback, fast feedback (except in workflow file names) |
| extended-test | extended test (except in workflow file names) |
| tenant | user, consumer, customer (when referring to teams using P2P) |

### Formatting

- Use `backtick code` for: input names, secret names, file paths, make target names, environment variable names, workflow names, YAML values
- Use **bold** only for warnings, caveats, or key terms on first introduction
- Tables for structured data (inputs, secrets, outputs, environment variables). Never prose lists for these
- YAML code blocks use `yaml` language tag and 2-space indent
- YAML examples show only the relevant fragment (the `with:` block or `secrets:` block), not a full workflow file — unless it's a tutorial where the full file is the point
- Every YAML example must be valid — no `...` elisions inside a block. Use comments like `# other inputs omitted` between blocks if needed

### Cross-linking

- Reference docs link to relevant how-to guides: "See [How to pass secrets](../how-to/pass-secrets-and-env-vars.md) for examples"
- How-to guides link to reference docs for full input details: "See the [full input reference](../reference/p2p-workflow-fastfeedback.md#inputs)"
- Explanation docs link to both reference and how-to where relevant
- Use relative paths for all links (`../reference/foo.md` not absolute URLs)

### Document structure

- Every doc starts with a level-1 heading matching the file's purpose
- Tutorials: numbered steps with code blocks at each step
- How-to guides: brief context sentence, then numbered steps
- Reference docs: follow the exact template defined in this spec (Usage → Inputs → Secrets → Outputs → Job Graph)
- Explanation docs: prose with headings breaking up topics. May include diagrams (as text descriptions or ASCII)

## Constraints

- **Every documented feature has at least 1 YAML example** — either inline in the reference doc or in a linked how-to guide
- **env_vars does not support multi-line values** — called out in reference docs and how-to
- **Input tables sourced from workflow YAML** — not paraphrased; accuracy over readability
- **No platform-* workflow documentation** — out of scope
- **Cross-linking** — reference docs link to relevant how-to guides and explanations; how-to guides link to reference docs for full input details
- **Style consistency** — all prose must follow the Writing Style Guide above; use `elements-of-style:writing-clearly-and-concisely` skill when writing
