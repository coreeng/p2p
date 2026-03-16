# Configurable Build Tool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow p2p workflow callers to swap the build tool (default `make`) and pass arguments before/after targets.

**Architecture:** Add three new inputs (`build-tool`, `build-tool-args`, `build-target-args`) to all p2p workflows in the call chain. Leaf executors rewrite their `make` invocations. Passthrough workflows accept and forward.

**Tech Stack:** GitHub Actions reusable workflows (YAML)

**Spec:** `docs/superpowers/specs/2026-03-16-configurable-build-tool-design.md`

---

## File Map

| File | Role | Change Type |
|------|------|-------------|
| `.github/workflows/p2p-execute-command.yaml` | Leaf executor — runs the build tool | Add inputs + rewrite `make` call |
| `.github/workflows/p2p-promote-image.yaml` | Leaf executor — runs promotion target | Add inputs + rewrite `make` call |
| `.github/workflows/p2p-workflow-fastfeedback.yaml` | Passthrough — orchestrates fast feedback | Add inputs + forward to children |
| `.github/workflows/p2p-workflow-extended-test.yaml` | Passthrough — orchestrates extended tests | Add inputs + forward to children |
| `.github/workflows/p2p-workflow-prod.yaml` | Passthrough — orchestrates prod deploy | Add inputs + forward to children |

---

## Chunk 1: Leaf Executors

### Task 1: Add build-tool inputs to p2p-execute-command.yaml

**Files:**
- Modify: `.github/workflows/p2p-execute-command.yaml`

- [ ] **Step 1: Add the three new inputs**

In the `inputs:` section of the `workflow_call` trigger (after the existing `artifacts` input around line 75), add:

```yaml
      build-tool:
        description: |
          The build tool to invoke targets with
        required: false
        type: string
        default: 'make'
      build-tool-args:
        description: |
          Arguments passed to the build tool before the target
        required: false
        type: string
        default: ''
      build-target-args:
        description: |
          Arguments passed after the target
        required: false
        type: string
        default: ''
```

- [ ] **Step 2: Rewrite the make invocation**

Change the `run-command` step (currently around line 242-250):

Before:
```yaml
      - name: Run make ${{ inputs.command }}
        id: run-command
        if: ${{ inputs.dry-run == false }}
        working-directory: ${{ inputs.working-directory }}
        env:
          GITHUB_TOKEN: ${{ github.token }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}
        run: |
          make ${{ inputs.command }}
```

After:
```yaml
      - name: Run ${{ inputs.build-tool }} ${{ inputs.command }}
        id: run-command
        if: ${{ inputs.dry-run == false }}
        working-directory: ${{ inputs.working-directory }}
        env:
          GITHUB_TOKEN: ${{ github.token }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}
        run: |
          ${{ inputs.build-tool }} ${{ inputs.build-tool-args }} ${{ inputs.command }} ${{ inputs.build-target-args }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/p2p-execute-command.yaml
git commit -m "feat: add configurable build tool to p2p-execute-command"
```

---

### Task 2: Add build-tool inputs to p2p-promote-image.yaml

**Files:**
- Modify: `.github/workflows/p2p-promote-image.yaml`

- [ ] **Step 1: Add the three new inputs**

In the `inputs:` section (after the existing `checkout-version` input around line 43), add the same three inputs:

```yaml
      build-tool:
        description: |
          The build tool to invoke targets with
        required: false
        type: string
        default: 'make'
      build-tool-args:
        description: |
          Arguments passed to the build tool before the target
        required: false
        type: string
        default: ''
      build-target-args:
        description: |
          Arguments passed after the target
        required: false
        type: string
        default: ''
```

- [ ] **Step 2: Rewrite the make invocation**

Change the `run-promotion` step (currently around line 189-190):

Before:
```yaml
        run: |
          make p2p-promote-to-${{ inputs.promotion-stage }}
```

After:
```yaml
        run: |
          ${{ inputs.build-tool }} ${{ inputs.build-tool-args }} p2p-promote-to-${{ inputs.promotion-stage }} ${{ inputs.build-target-args }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/p2p-promote-image.yaml
git commit -m "feat: add configurable build tool to p2p-promote-image"
```

---

## Chunk 2: Passthrough Workflows

### Task 3: Add build-tool inputs to p2p-workflow-fastfeedback.yaml

**Files:**
- Modify: `.github/workflows/p2p-workflow-fastfeedback.yaml`

- [ ] **Step 1: Add the three new inputs**

In the `inputs:` section (after the existing `artifacts` input around line 67), add:

```yaml
      build-tool:
        description: |
          The build tool to invoke targets with
        required: false
        type: string
        default: 'make'
      build-tool-args:
        description: |
          Arguments passed to the build tool before the target
        required: false
        type: string
        default: ''
      build-target-args:
        description: |
          Arguments passed after the target
        required: false
        type: string
        default: ''
```

- [ ] **Step 2: Forward inputs to all p2p-execute-command.yaml calls**

There are 4 jobs that call `p2p-execute-command.yaml`: `build`, `functional-test`, `nft-test`, `integration-test`. Add to each job's `with:` block:

```yaml
      build-tool: ${{ inputs.build-tool }}
      build-tool-args: ${{ inputs.build-tool-args }}
      build-target-args: ${{ inputs.build-target-args }}
```

- [ ] **Step 3: Forward inputs to p2p-promote-image.yaml call**

The `promote` job calls `p2p-promote-image.yaml`. Add the same three lines to its `with:` block:

```yaml
      build-tool: ${{ inputs.build-tool }}
      build-tool-args: ${{ inputs.build-tool-args }}
      build-target-args: ${{ inputs.build-target-args }}
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/p2p-workflow-fastfeedback.yaml
git commit -m "feat: forward build-tool inputs in p2p-workflow-fastfeedback"
```

---

### Task 4: Add build-tool inputs to p2p-workflow-extended-test.yaml

**Files:**
- Modify: `.github/workflows/p2p-workflow-extended-test.yaml`

- [ ] **Step 1: Add the three new inputs**

In the `inputs:` section (after the existing `artifacts` input around line 61), add:

```yaml
      build-tool:
        description: |
          The build tool to invoke targets with
        required: false
        type: string
        default: 'make'
      build-tool-args:
        description: |
          Arguments passed to the build tool before the target
        required: false
        type: string
        default: ''
      build-target-args:
        description: |
          Arguments passed after the target
        required: false
        type: string
        default: ''
```

- [ ] **Step 2: Forward inputs to p2p-execute-command.yaml call**

The `run-tests` job calls `p2p-execute-command.yaml`. Add to its `with:` block:

```yaml
      build-tool: ${{ inputs.build-tool }}
      build-tool-args: ${{ inputs.build-tool-args }}
      build-target-args: ${{ inputs.build-target-args }}
```

- [ ] **Step 3: Forward inputs to p2p-promote-image.yaml call**

The `promote` job calls `p2p-promote-image.yaml`. Add the same three lines to its `with:` block:

```yaml
      build-tool: ${{ inputs.build-tool }}
      build-tool-args: ${{ inputs.build-tool-args }}
      build-target-args: ${{ inputs.build-target-args }}
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/p2p-workflow-extended-test.yaml
git commit -m "feat: forward build-tool inputs in p2p-workflow-extended-test"
```

---

### Task 5: Add build-tool inputs to p2p-workflow-prod.yaml

**Files:**
- Modify: `.github/workflows/p2p-workflow-prod.yaml`

- [ ] **Step 1: Add the three new inputs**

In the `inputs:` section (after the existing `skip-subnamespaces-create` input around line 57), add:

```yaml
      build-tool:
        description: |
          The build tool to invoke targets with
        required: false
        type: string
        default: 'make'
      build-tool-args:
        description: |
          Arguments passed to the build tool before the target
        required: false
        type: string
        default: ''
      build-target-args:
        description: |
          Arguments passed after the target
        required: false
        type: string
        default: ''
```

- [ ] **Step 2: Forward inputs to p2p-execute-command.yaml call**

The `prod-deploy` job calls `p2p-execute-command.yaml`. Add to its `with:` block:

```yaml
      build-tool: ${{ inputs.build-tool }}
      build-tool-args: ${{ inputs.build-tool-args }}
      build-target-args: ${{ inputs.build-target-args }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/p2p-workflow-prod.yaml
git commit -m "feat: forward build-tool inputs in p2p-workflow-prod"
```

---

## Chunk 3: Validation

### Task 6: Verify internal-ci.yaml dry-run still works

**Files:**
- Read: `.github/workflows/internal-ci.yaml`

- [ ] **Step 1: Verify no changes needed to internal-ci.yaml**

`internal-ci.yaml` calls `p2p-execute-command.yaml` and `p2p-workflow-fastfeedback.yaml` without passing `build-tool` inputs. Verify that the defaults (`make`, `''`, `''`) mean these calls still work unchanged. No code change needed — this is a read-only verification.

- [ ] **Step 2: Grep for any remaining hardcoded `make` calls in p2p workflows**

Run:
```bash
grep -n 'make ' .github/workflows/p2p-*.yaml
```

Expected: zero matches (all `make` references replaced with `${{ inputs.build-tool }}`). The only `make` references should be in the `default: 'make'` lines of the input definitions.

- [ ] **Step 3: Final commit with plan doc**

```bash
git add docs/superpowers/
git commit -m "docs: add design spec and implementation plan for configurable build tool"
```
