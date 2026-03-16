# Configurable Build Tool for P2P Workflows

## Problem

All p2p reusable workflows hardcode `make` as the build tool. Teams using alternative build tools (`just`, `task`, `gradle`, etc.) cannot use these workflows without maintaining a `Makefile` wrapper.

## Solution

Add three new workflow inputs to allow callers to swap the build tool while keeping `make` as the default. The invocation pattern becomes:

```
<build-tool> <build-tool-args> <target> <build-target-args>
```

## New Inputs

Added to every p2p workflow that invokes the build tool directly or calls a child workflow that does:

```yaml
build-tool:
  description: 'The build tool to invoke targets with'
  required: false
  type: string
  default: 'make'
build-tool-args:
  description: 'Arguments passed to the build tool before the target (e.g., -j4, --dotenv-path .env)'
  required: false
  type: string
  default: ''
build-target-args:
  description: 'Arguments passed after the target (e.g., REGISTRY=foo VERSION=bar)'
  required: false
  type: string
  default: ''
```

## Affected Workflows

### Leaf executors (direct build tool calls rewritten)

**`p2p-execute-command.yaml`** — 1 call site:
- `make ${{ inputs.command }}` becomes `${{ inputs.build-tool }} ${{ inputs.build-tool-args }} ${{ inputs.command }} ${{ inputs.build-target-args }}`
- Step name updates from `Run make ${{ inputs.command }}` to `Run ${{ inputs.build-tool }} ${{ inputs.command }}`

**`p2p-promote-image.yaml`** — 1 call site:
- `make p2p-promote-to-${{ inputs.promotion-stage }}` becomes `${{ inputs.build-tool }} ${{ inputs.build-tool-args }} p2p-promote-to-${{ inputs.promotion-stage }} ${{ inputs.build-target-args }}`

### Passthrough workflows (accept inputs, forward to children)

- **`p2p-workflow-fastfeedback.yaml`** — forwards to `p2p-execute-command` (build, functional-test, nft-test, integration-test) and `p2p-promote-image` (promote)
- **`p2p-workflow-extended-test.yaml`** — forwards to `p2p-execute-command` (run-tests) and `p2p-promote-image` (promote)
- **`p2p-workflow-prod.yaml`** — forwards to `p2p-execute-command` (prod-deploy)

### Not touched

- `platform-*.yaml` workflows — these have make-specific conventions (e.g., `feature=` variable assignments) baked into their steps
- `p2p-version.yaml`, `p2p-get-latest-image*.yaml` — no build tool invocations

## Backwards Compatibility

Fully backwards compatible. All three inputs default to values that reproduce the current behavior (`make`, `''`, `''`). No caller changes required.

## Example Usage

A caller using `just` instead of `make`:

```yaml
jobs:
  fastfeedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
      build-tool: just
```

A caller passing additional arguments:

```yaml
jobs:
  fastfeedback:
    uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
    with:
      version: ${{ needs.version.outputs.version }}
      build-tool: make
      build-tool-args: '-j4'
      build-target-args: 'VERBOSE=1'
```
