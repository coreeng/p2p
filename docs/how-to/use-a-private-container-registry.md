# How to Use a Private Container Registry

If your make targets need to pull base images or dependencies from a private container registry, pass registry credentials to the P2P workflows. The workflow calls `docker login` automatically before your make targets run.

## 1. Store your credentials as repository secrets

Add the following secrets under **Settings > Secrets and variables > Actions**:

- `REGISTRY_USER` — your registry username
- `REGISTRY_PAT` — a personal access token or password for the registry
- `REGISTRY_URL` (optional) — the registry URL (e.g., `ghcr.io`). Omit this to default to Docker Hub.

## 2. Pass the secrets to your workflow

```yaml
fastfeedback:
  needs: [version]
  uses: coreeng/p2p/.github/workflows/p2p-workflow-fastfeedback.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
  secrets:
    container_registry_user: ${{ secrets.REGISTRY_USER }}
    container_registry_pat: ${{ secrets.REGISTRY_PAT }}
    container_registry_url: ${{ secrets.REGISTRY_URL }}
    # other secrets omitted
```

When both `container_registry_user` and `container_registry_pat` are set, the workflow calls `docker login` before running any make targets. If `container_registry_url` is omitted, `docker login` defaults to Docker Hub.

## 3. Apply to all stages

Pass the same secrets to every workflow that runs make targets — fast-feedback, extended-test, and prod — so your targets can pull from the private registry in every stage.

## Reference

- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md) — full list of secrets
- [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md) — full list of secrets
- [p2p-workflow-prod reference](../reference/p2p-workflow-prod.md) — full list of secrets
- [p2p-execute-command reference](../reference/p2p-execute-command.md) — underlying executor secrets
- [How to pass secrets and environment variables](pass-secrets-and-env-vars.md) — passing `env_vars` to make targets
