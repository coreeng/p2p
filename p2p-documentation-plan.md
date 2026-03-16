# P2P Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Use the `elements-of-style:writing-clearly-and-concisely` skill when writing all prose.

**Goal:** Create comprehensive Diataxis-structured documentation for all p2p-* reusable workflows.

**Architecture:** 23 markdown files organized into tutorials, how-to guides, reference docs, and explanation docs under `docs/`, plus a rewritten README hub. Reference docs are generated from workflow YAML. All prose follows the style guide in the spec.

**Tech Stack:** Markdown, GitHub Actions workflow YAML (read-only, as source of truth for reference docs)

**Spec:** `p2p-documentation-spec.md` (in repo root)

---

## File Map

| File | Role | Task |
|------|------|------|
| `README.md` | Hub — quick start + routing | Task 1 |
| `docs/reference/p2p-version.md` | Reference — version workflow | Task 2 |
| `docs/reference/p2p-execute-command.md` | Reference — leaf executor | Task 2 |
| `docs/reference/p2p-promote-image.md` | Reference — promotion workflow | Task 2 |
| `docs/reference/p2p-get-latest-image.md` | Reference — image lookup base | Task 2 |
| `docs/reference/p2p-get-latest-image-extended-test.md` | Reference — image lookup extended-test | Task 2 |
| `docs/reference/p2p-get-latest-image-prod.md` | Reference — image lookup prod | Task 2 |
| `docs/reference/p2p-workflow-fastfeedback.md` | Reference — fast-feedback orchestrator | Task 3 |
| `docs/reference/p2p-workflow-extended-test.md` | Reference — extended-test orchestrator | Task 3 |
| `docs/reference/p2p-workflow-prod.md` | Reference — prod orchestrator | Task 3 |
| `docs/explanation/pipeline-model.md` | Explanation — promotion model | Task 4 |
| `docs/explanation/versioning.md` | Explanation — version mechanics | Task 4 |
| `docs/explanation/environment-configuration.md` | Explanation — environments and variables | Task 4 |
| `docs/explanation/make-targets.md` | Explanation — make target lifecycle | Task 4 |
| `docs/tutorials/getting-started.md` | Tutorial — first app through fast-feedback | Task 5 |
| `docs/tutorials/full-pipeline.md` | Tutorial — adding extended-test and prod | Task 5 |
| `docs/how-to/pass-secrets-and-env-vars.md` | How-to — secrets and env vars | Task 6 |
| `docs/how-to/upload-artifacts.md` | How-to — artifact uploads | Task 6 |
| `docs/how-to/configure-slack-alerts.md` | How-to — Slack notifications | Task 6 |
| `docs/how-to/use-multiple-environments.md` | How-to — multi-env and multi-app setup | Task 7 |
| `docs/how-to/customise-versioning.md` | How-to — version prefixes | Task 7 |
| `docs/how-to/skip-stages-on-prs.md` | How-to — dry-run and skipping stages | Task 7 |
| `docs/how-to/use-a-custom-build-tool.md` | How-to — swapping make (depends on PR #140) | Task 7 |

---

## Chunk 1: Reference Docs + README

Reference docs come first because tutorials, how-to guides, and explanations all link to them. They are generated directly from workflow YAML — read the source file, extract all inputs/secrets/outputs, and write the tables.

### Task 1: Rewrite README.md

**Files:**
- Modify: `README.md`

**Context:** The current README is a 213-line mix of everything. Replace it entirely with the hub structure from the spec: title, quick start, workflows table, prerequisites, documentation links.

- [ ] **Step 1: Read the existing README.md and all workflow YAML files**

Read `README.md` and all `.github/workflows/p2p-*.yaml` files to extract accurate workflow names and purposes.

- [ ] **Step 2: Write the new README.md**

Replace the entire file with:

1. Title + one-liner
2. Quick Start — minimal YAML calling `p2p-version` + `p2p-workflow-fastfeedback` with inline comments
3. Workflows table — 6 primary workflows (p2p-version, fastfeedback, extended-test, prod, get-latest-image-extended-test, get-latest-image-prod) linked to their reference docs, plus a secondary table for internal workflows (p2p-execute-command, p2p-promote-image, p2p-get-latest-image)
4. Prerequisites — brief list of GitHub environments and required variables (`FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD`, `TENANT_NAME`), permissions block, link to `docs/explanation/environment-configuration.md`
5. Documentation table — links to each Diataxis category directory with short descriptions

Follow the style guide from the spec: second person in the quick start, `backtick code` for all input/variable/file names, keep it scannable.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as progressive-disclosure hub"
```

---

### Task 2: Reference docs — utility workflows

**Files:**
- Create: `docs/reference/p2p-version.md`
- Create: `docs/reference/p2p-execute-command.md`
- Create: `docs/reference/p2p-promote-image.md`
- Create: `docs/reference/p2p-get-latest-image.md`
- Create: `docs/reference/p2p-get-latest-image-extended-test.md`
- Create: `docs/reference/p2p-get-latest-image-prod.md`

**Context:** These are the lower-level and utility workflows. Each reference doc follows the exact template: one-line description, Usage snippet, Inputs table, Secrets table, Outputs table, Job Graph (where applicable). Generate input tables directly from the workflow YAML `workflow_call` definitions.

- [ ] **Step 1: Create `docs/reference/` directory**

```bash
mkdir -p docs/reference
```

- [ ] **Step 2: Write p2p-version.md**

Read `.github/workflows/p2p-version.yaml`. Extract all inputs (`main-branch`, `dry-run`, `version-prefix`, `checkout-version`), secrets (`git-token` required, `slack_webhook_url` optional), outputs (`version`, `previous_version`). Follow the reference template. Add a "Behaviour" section after Job Graph documenting: main branch tagging rules, PR version format (previous + hash), tag-exists handling. Include `git-token` as a required secret.

- [ ] **Step 3: Write p2p-execute-command.md**

Read `.github/workflows/p2p-execute-command.yaml`. Extract all inputs (including `command`, `github_env`, `dry-run`, `region`, `subnamespace`, `app-name`, `tenant-name`, `version`, `checkout-version`, `zone`, `pre-targets`, `post-targets`, `working-directory`, `skip-subnamespaces-create`, `artifacts`, `build-tool`, `build-tool-args`, `build-target-args`). Note that `zone`, `pre-targets`, and `post-targets` are declared but unused. Document all P2P_* environment variables set by the workflow. Document the namespace naming logic: when `app-name` equals `TENANT_NAME`, the namespace is `TENANT_NAME`; otherwise `TENANT_NAME-app-name`. Use impersonal voice for reference.

- [ ] **Step 4: Write p2p-promote-image.md**

Read `.github/workflows/p2p-promote-image.yaml`. Extract all inputs and secrets. Document the promotion mechanism: authenticates to source and destination registries via skopeo, then delegates to the user's `make p2p-promote-to-<stage>` target. List the auth-related env vars available to the make target (SOURCE_REGISTRY, SOURCE_ACCESS_TOKEN, DEST_ACCESS_TOKEN, etc.) and the P2P_* variables.

- [ ] **Step 5: Write p2p-get-latest-image.md**

Read `.github/workflows/p2p-get-latest-image.yaml`. Extract all inputs (including `registry-path`, `tenant-name`, `image-name` required, `dry-run`, `region`, `working-directory`, `environment` required), secrets (`env_vars`), output (`version`). Briefly describe the semver sorting logic.

- [ ] **Step 6: Write p2p-get-latest-image-extended-test.md**

Read `.github/workflows/p2p-get-latest-image-extended-test.yaml`. Extract all inputs (including `main-branch`, `environment`, `image-name` required, `registry-path`, `tenant-name`, `region`, `working-directory`, `dry-run`) and secrets (including `slack_webhook_url`). Note it wraps `p2p-get-latest-image` with extended-test defaults (`registry-path: 'extended-test'`).

- [ ] **Step 7: Write p2p-get-latest-image-prod.md**

Read `.github/workflows/p2p-get-latest-image-prod.yaml`. Extract all inputs (including `main-branch`, `environment`, `image-name` required, `registry-path`, `tenant-name`, `region`, `working-directory`, `dry-run`) and secrets (including `slack_webhook_url`). Note it wraps `p2p-get-latest-image` with prod defaults (`registry-path: 'prod'`).

- [ ] **Step 8: Commit**

```bash
git add docs/reference/
git commit -m "docs: add reference docs for utility p2p workflows"
```

---

### Task 3: Reference docs — orchestrator workflows

**Files:**
- Create: `docs/reference/p2p-workflow-fastfeedback.md`
- Create: `docs/reference/p2p-workflow-extended-test.md`
- Create: `docs/reference/p2p-workflow-prod.md`

**Context:** These are the primary workflows tenants call. Each follows the reference template. The Job Graph section is particularly important — document execution order, parallelism, conditions, and what triggers promotion.

- [ ] **Step 1: Write p2p-workflow-fastfeedback.md**

Read `.github/workflows/p2p-workflow-fastfeedback.yaml`. Extract all inputs (including `dry-run`, `main-branch`, `checkout-version`, `app-name`, `tenant-name`, `version` required, `region`, `source`, `destination`, `working-directory`, `skip-fastfeedback-integration-on-prs`, `skip-subnamespaces-create`, `artifacts`, `build-tool`, `build-tool-args`, `build-target-args`), secrets (`env_vars`, `container_registry_user`, `container_registry_pat`, `container_registry_url`, `slack_webhook_url`), output (`version`).

Job Graph: build → functional-test + nft-test (parallel, both need build) → integration-test (needs both) → promote (needs integration-test). Conditions: integration-test runs unless `skip-fastfeedback-integration-on-prs` is true AND not on main/tags; promote only on main or tag pushes. Slack failure alert on main.

Link to relevant how-to guides: pass-secrets-and-env-vars, upload-artifacts, skip-stages-on-prs, configure-slack-alerts.

- [ ] **Step 2: Write p2p-workflow-extended-test.md**

Read `.github/workflows/p2p-workflow-extended-test.yaml`. Extract all inputs (including `source`, `destination`, `version-prefix`, `skip-subnamespaces-create`, `artifacts`, `build-tool`, `build-tool-args`, `build-target-args`), secrets, output.

Job Graph: run-tests → promote. Both only on main. `checkout-version` constructed from `version-prefix` + `version`. Slack failure alert on main.

- [ ] **Step 3: Write p2p-workflow-prod.md**

Read `.github/workflows/p2p-workflow-prod.yaml`. Extract all inputs. Note `version` is optional (default `''`) unlike other workflows. Document `version-prefix` input.

Job Graph: prod-deploy. Only on main. Both failure AND success Slack notifications.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/
git commit -m "docs: add reference docs for orchestrator p2p workflows"
```

---

## Chunk 2: Explanation Docs

### Task 4: Explanation docs

**Files:**
- Create: `docs/explanation/pipeline-model.md`
- Create: `docs/explanation/versioning.md`
- Create: `docs/explanation/environment-configuration.md`
- Create: `docs/explanation/make-targets.md`

**Context:** Explanation docs provide conceptual understanding. They answer "why" and "how does this work" rather than "how do I do X". Use impersonal voice. Link to reference docs and how-to guides where relevant.

- [ ] **Step 1: Create `docs/explanation/` directory**

```bash
mkdir -p docs/explanation
```

- [ ] **Step 2: Write pipeline-model.md**

Explain the three-stage promotion model: fast-feedback → extended-test → prod. Cover:
- What each stage does and what make targets run in each
- How images flow between registries at each promotion (fast-feedback registry → extended-test registry → prod registry)
- When promotions happen (only on main branch or tag pushes, only on success)
- Concurrency behaviour: jobs grouped by environment/tenant/app/subnamespace with `cancel-in-progress: false` — concurrent runs queue
- The role of `p2p-get-latest-image-*` workflows in the extended-test and prod stages (resolving the latest promoted image version)

Link to reference docs for each workflow.

- [ ] **Step 3: Write versioning.md**

Explain how `p2p-version` works. Cover:
- Tag lookup: finds the latest tag matching `<version-prefix><semver>`, defaults to `v0.0.0` if none
- Semver increment: always increments patch
- Main branch: creates a new tag if the current commit differs from the last tagged commit
- PR branches: uses `<previous-version>-<git-hash>` format, never tags
- `version-prefix` for multi-project repos (e.g., `app-tag` prefix)
- `previous_version` output and when it differs from `version`
- Relationship between version output and image tags in the registry

Link to reference/p2p-version.md and how-to/customise-versioning.md.

- [ ] **Step 4: Write environment-configuration.md**

Explain the GitHub environment and variable setup. Cover:
- GitHub environments: when and why to create them (at least one per stage)
- Repository variables: `FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD` — the matrix JSON format `{"include": [{"deploy_env": "..."}]}`
- Per-environment variables: `BASE_DOMAIN`, `INTERNAL_SERVICES_DOMAIN`, `DPLATFORM`, `PROJECT_ID`, `PROJECT_NUMBER`, `REGION`
- `TENANT_NAME` and how it maps to Kubernetes namespaces and artifact registry paths
- GCP-specific: `WORKLOAD_IDENTITY_PROVIDER`, `SERVICE_ACCOUNT` (derived from `TENANT_NAME` and `PROJECT_ID`/`PROJECT_NUMBER`)
- How `source` and `destination` inputs override the default matrix variables

Include a complete example of environment variable values for a GCP setup.

- [ ] **Step 5: Write make-targets.md**

Explain the make target contract. Cover:
- Expected targets per stage: `p2p-build`, `p2p-functional`, `p2p-nft`, `p2p-integration`, `p2p-extended-test`, `p2p-prod`
- Promotion targets: `p2p-promote-to-extended-test`, `p2p-promote-to-prod`
- Environment variables available to all targets: `REGISTRY`, `VERSION`, `P2P_TENANT_NAME`, `P2P_APP_NAME`, `P2P_VERSION`, `P2P_REGISTRY`, `P2P_REGISTRY_FAST_FEEDBACK`, `P2P_REGISTRY_EXTENDED_TEST`, `P2P_REGISTRY_PROD`, `P2P_NAMESPACE_*`, `PLATFORM_ENVIRONMENT`
- kubectl access: every target runs with kubectl configured as the tenant
- Subnamespace lifecycle: which targets run in which subnamespace (functional, nft, integration, extended, prod)
- Optional targets: if a target doesn't exist (e.g., `p2p-integration`), the step is skipped
- Auth env vars for promotion targets: `SOURCE_REGISTRY`, `SOURCE_ACCESS_TOKEN`, `DEST_ACCESS_TOKEN`, etc.

Include a minimal Makefile example showing the standard targets.

- [ ] **Step 6: Commit**

```bash
git add docs/explanation/
git commit -m "docs: add explanation docs for pipeline, versioning, environments, make targets"
```

---

## Chunk 3: Tutorials

### Task 5: Tutorial docs

**Files:**
- Create: `docs/tutorials/getting-started.md`
- Create: `docs/tutorials/full-pipeline.md`

**Context:** Tutorials take the reader by the hand. Use second person ("you"). Every step has a code block. The reader should be able to follow along and have a working pipeline at the end.

- [ ] **Step 1: Create `docs/tutorials/` directory**

```bash
mkdir -p docs/tutorials
```

- [ ] **Step 2: Write getting-started.md**

Walk through setting up fast-feedback from scratch:

1. Prerequisites — what GitHub environments and variables to create (brief, link to explanation/environment-configuration.md for detail)
2. Create your Makefile — `p2p-build` and `p2p-functional` targets (show a complete, minimal Makefile)
3. Create your workflow file — full YAML calling `p2p-version` + `p2p-workflow-fastfeedback` (show the complete `.github/workflows/ci.yaml`)
4. Required permissions block
5. Push and verify — what to expect in the GitHub Actions UI
6. What happens next — brief description of the job graph (build → functional-test + nft-test → integration-test → promote), link to explanation/pipeline-model.md

- [ ] **Step 3: Write full-pipeline.md**

Extend the getting-started tutorial to add extended-test and prod:

1. Prerequisites — additional GitHub environments and variables for extended-test and prod
2. Add the `p2p-extended-test` and `p2p-prod` make targets
3. Add `p2p-get-latest-image-extended-test` + `p2p-workflow-extended-test` to your workflow
4. Add `p2p-get-latest-image-prod` + `p2p-workflow-prod` to your workflow
5. Add promotion make targets (`p2p-promote-to-extended-test`, `p2p-promote-to-prod`)
6. Show the complete workflow YAML with all three stages wired together
7. How the pipeline flows end-to-end — link to explanation/pipeline-model.md

- [ ] **Step 4: Commit**

```bash
git add docs/tutorials/
git commit -m "docs: add getting-started and full-pipeline tutorials"
```

---

## Chunk 4: How-to Guides

### Task 6: How-to guides — secrets, artifacts, Slack

**Files:**
- Create: `docs/how-to/pass-secrets-and-env-vars.md`
- Create: `docs/how-to/upload-artifacts.md`
- Create: `docs/how-to/configure-slack-alerts.md`

**Context:** Each how-to starts with a brief context sentence, then numbered steps with YAML examples. Use second person. Link to reference docs for full input details.

- [ ] **Step 1: Create `docs/how-to/` directory**

```bash
mkdir -p docs/how-to
```

- [ ] **Step 2: Write pass-secrets-and-env-vars.md**

Cover:
1. Using `secrets.env_vars` — YAML example passing `KEY=value` pairs. **Caveat: `env_vars` does not support multi-line values.** Show what works (`SECRET_KEY=abc123`) and what breaks (multi-line certificates, JSON blobs).
2. Using `container_registry_user` / `container_registry_pat` / `container_registry_url` — YAML example authenticating to a private registry.
3. Link to reference/p2p-execute-command.md for the full list of env vars set by the workflow.

- [ ] **Step 3: Write upload-artifacts.md**

Cover:
1. The `artifacts` input format — YAML mapping from command name to path globs
2. Example for fastfeedback (show `p2p-build`, `p2p-functional`, `p2p-nft`, `p2p-integration` keys)
3. Example for extended-test (show `p2p-extended-test` key)
4. How `working-directory` affects path resolution — if you set `working-directory: ./service`, artifact paths are relative to `./service`
5. Link to reference docs for fastfeedback and extended-test.

- [ ] **Step 4: Write configure-slack-alerts.md**

Cover:
1. Store the webhook URL as a repo secret (e.g., `P2P_SLACK_WEBHOOK_URL`)
2. Pass it to workflows as `slack_webhook_url` — YAML example for fastfeedback, extended-test, prod, and version
3. What gets notified: failures on main for fastfeedback, extended-test, prod, version, and get-latest-image; success on prod only
4. Link to reference docs.

- [ ] **Step 5: Commit**

```bash
git add docs/how-to/
git commit -m "docs: add how-to guides for secrets, artifacts, and Slack alerts"
```

---

### Task 7: How-to guides — environments, versioning, skipping, build tool

**Files:**
- Create: `docs/how-to/use-multiple-environments.md`
- Create: `docs/how-to/customise-versioning.md`
- Create: `docs/how-to/skip-stages-on-prs.md`
- Create: `docs/how-to/use-a-custom-build-tool.md`

- [ ] **Step 1: Write use-multiple-environments.md**

Cover:
1. How `FAST_FEEDBACK`, `EXTENDED_TEST`, `PROD` matrix JSON variables work — show the format
2. Example with multiple deploy environments (e.g., `{"include": [{"deploy_env": "gcp-dev"}, {"deploy_env": "gcp-staging"}]}`)
3. How `source` and `destination` inputs override which matrix is used per stage
4. How the `region` input works for multi-region deployments — YAML example overriding the default region
5. How `app-name` and `tenant-name` inputs work for multi-app repos — when `app-name` differs from `TENANT_NAME`, namespaces get prefixed
6. How `skip-subnamespaces-create` works and when to use it (e.g., when you manage namespaces yourself)
7. Link to explanation/environment-configuration.md for full variable reference.

- [ ] **Step 2: Write customise-versioning.md**

Cover:
1. Using `version-prefix` for multi-project repos — YAML example with `version-prefix: app-tag`
2. How version output changes: tags become `app-tag0.1.0` instead of `v0.1.0`
3. How `checkout-version` in extended-test and prod uses the prefix to construct the git ref
4. Link to explanation/versioning.md and reference/p2p-version.md.

- [ ] **Step 3: Write skip-stages-on-prs.md**

Cover:
1. Using `dry-run: true` — what it skips (cloud auth, build tool invocation, promotions) and what it still runs (checkout, env setup)
2. Using `skip-fastfeedback-integration-on-prs: true` — skips integration tests on PRs but still runs them on main and tags
3. YAML example showing both options
4. Link to reference/p2p-workflow-fastfeedback.md.

- [ ] **Step 4: Write use-a-custom-build-tool.md**

**Note:** This doc depends on PR #140 (`configurable-build-tool` branch). Write it against the inputs as specified in the spec (`build-tool`, `build-tool-args`, `build-target-args`). If PR #140 is not yet merged, add a note at the top: "Requires P2P version X.X.X or later."

Cover:
1. Using `build-tool: just` to swap make for just — YAML example
2. Using `build-tool-args` for flags before the target — example with `build-tool-args: '--dotenv-path .env'`
3. Using `build-target-args` for arguments after the target — example with `build-target-args: 'VERBOSE=1'`
4. The invocation pattern: `<build-tool> <build-tool-args> <target> <build-target-args>`
5. Available on all p2p-workflow-* workflows and p2p-execute-command
6. Link to reference docs.

- [ ] **Step 5: Commit**

```bash
git add docs/how-to/
git commit -m "docs: add how-to guides for environments, versioning, skipping stages, and custom build tools"
```

---

## Chunk 5: Cross-linking and Final Review

### Task 8: Cross-link all docs and final polish

**Files:**
- Modify: all 23 markdown files

**Context:** Ensure every doc links to related docs per the spec's cross-linking rules. Reference docs link to how-to guides. How-to guides link to reference docs. Explanation docs link to both. Verify all relative paths are correct.

- [ ] **Step 1: Audit cross-links**

Read every file in `docs/` and `README.md`. For each file, check:
- Reference docs: do they link to relevant how-to guides?
- How-to guides: do they link to reference docs for full input details?
- Explanation docs: do they link to both reference and how-to?
- Tutorials: do they link to explanation docs for deeper understanding?
- README: do all workflow table links point to existing reference files?

- [ ] **Step 2: Add missing cross-links**

Add any missing links. Use relative paths (`../reference/foo.md`, `../how-to/bar.md`).

- [ ] **Step 3: Verify all links resolve**

```bash
grep -rn '](\.\.*/[^)]*\.md' docs/ README.md | while IFS=: read -r file line content; do
  dir=$(dirname "$file")
  echo "$content" | grep -oP '\]\(\K[^)]*\.md[^)]*' | while read -r link; do
    resolved="$dir/$link"
    if [ ! -f "$resolved" ]; then
      echo "BROKEN in $file: $link (resolved to $resolved)"
    fi
  done
done
```

Fix any broken links.

- [ ] **Step 4: Style consistency check**

Review all files against the style guide in the spec:
- Consistent terminology (workflow not pipeline, input not parameter, tenant not user)
- `backtick code` for all technical names
- Tables for structured data, not prose lists
- Second person in tutorials/how-to, impersonal in reference/explanation
- No filler phrases

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "docs: add cross-links and apply style consistency"
```
