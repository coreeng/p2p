# How to Use a Custom Build Tool

> [!WARNING]
> **EXPERIMENTAL — UNSUPPORTED**
>
> This feature is experimental and not yet available on the stable `@v1` branch. To use it, you must reference the `configurable-build-tool` branch directly:
>
> ```yaml
> uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@configurable-build-tool
> ```
>
> This branch may change or be removed without notice. Do not use it in production workflows.

By default, P2P workflows invoke `make` to run build targets. Use the `build-tool`, `build-tool-args`, and `build-target-args` inputs to swap in a different tool or pass extra flags.

## 1. Swap `make` for another tool

Set `build-tool` to the name of the executable you want to use.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@configurable-build-tool
  with:
    version: ${{ needs.version.outputs.version }}
    build-tool: just
```

## 2. Pass flags to the build tool

Use `build-tool-args` for arguments that appear before the target name.

```yaml
with:
  build-tool: make
  build-tool-args: '-j4'
```

## 3. Pass arguments after the target

Use `build-target-args` for arguments that appear after the target name.

```yaml
with:
  build-tool: make
  build-target-args: 'VERBOSE=1'
```

## 4. Understand the invocation pattern

The workflow assembles the command as:

```
<build-tool> <build-tool-args> <target> <build-target-args>
```

For example, with `build-tool: just`, `build-tool-args: --dotenv-path .env`, and `build-target-args: REGISTRY=foo`, the invocation for the build target becomes:

```
just --dotenv-path .env p2p-build REGISTRY=foo
```

## 5. Use on any orchestrator workflow

All four orchestrator workflows accept `build-tool`, `build-tool-args`, and `build-target-args`:

- `p2p-workflow-fastfeedback`
- `p2p-workflow-extended-test`
- `p2p-workflow-prod`
- `p2p-execute-command`

Apply the same inputs to each stage to keep build invocations consistent across your pipeline.

---

For the full input reference for each workflow, see the relevant reference docs:

- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md)
- [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md)
- [p2p-workflow-prod reference](../reference/p2p-workflow-prod.md)
- [p2p-execute-command reference](../reference/p2p-execute-command.md)
