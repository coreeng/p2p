# How to Use Multiple Environments

The P2P workflows use matrix variables to control which GitHub environments each stage deploys to. You can override the defaults and add regions.

## 1. Set environments with matrix JSON variables

The `FAST_FEEDBACK`, `EXTENDED_TEST`, and `PROD` repository variables control which environments each stage targets. Each variable holds a JSON matrix string.

Single environment:

```json
{"include": [{"deploy_env": "gcp-dev"}]}
```

Multiple environments (the stage runs once per entry):

```json
{"include": [{"deploy_env": "gcp-dev"}, {"deploy_env": "gcp-staging"}]}
```

Set these as GitHub Actions repository variables in your repo settings.

## 2. Override environments with `source` and `destination`

The `source` and `destination` inputs on `p2p-workflow-fastfeedback` and `p2p-workflow-extended-test` override the `FAST_FEEDBACK` and `EXTENDED_TEST` matrix variables respectively. Use them when you need workflow-level control instead of repo-level variables.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    source: '{"include": [{"deploy_env": "custom-env"}]}'
```

## 3. Override region with `region`

The `region` input defaults to `europe-west2`. Override it per workflow call when your environment runs in a different region.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    region: us-central1
```

## 4. Skip subnamespace creation

Set `skip-subnamespaces-create: true` when you manage namespaces yourself and want the workflow to leave them unchanged.

```yaml
fastfeedback:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    skip-subnamespaces-create: true
```

---

For the full list of environment-related variables and how they interact, see [Environment configuration](../explanation/environment-configuration.md).

See the [full input reference](../reference/p2p-workflow-fastfeedback.md#inputs) for all available options on the fast-feedback workflow.
