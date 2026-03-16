# How to Customise Versioning

The P2P version workflow tags commits and produces a version string consumed by all downstream stages. When multiple projects share a repo, use a custom prefix to keep their tags distinct.

## 1. Set a custom version prefix

Pass `version-prefix` to `p2p-version.yaml` to replace the default `v` prefix.

```yaml
version:
  uses: coreeng/p2p/.github/workflows/p2p-version.yaml@v1
  secrets:
    git-token: ${{ secrets.GITHUB_TOKEN }}
  with:
    version-prefix: app-tag
```

Tags become `app-tag0.1.0` instead of `v0.1.0`.

## 2. Understand how the version output changes

The behaviour differs between main and pull requests:

- **On `main`**: creates a git tag (`app-tag0.1.0`) and outputs the bare version (`0.1.0`).
- **On pull requests**: outputs `0.0.0-abc1234` (previous version plus commit hash) and never creates a tag.

## 3. Pass the prefix to extended-test and prod

When you use a custom prefix, pass it to `p2p-workflow-extended-test` and `p2p-workflow-prod` as well. These workflows use the prefix to locate the correct tag when checking out the build.

```yaml
extended-test:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-extended-test.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    version-prefix: app-tag
```

Apply the same `version-prefix` input to your `prod` job:

```yaml
prod:
  uses: coreeng/p2p/.github/workflows/p2p-workflow-prod.yaml@v1
  with:
    version: ${{ needs.version.outputs.version }}
    version-prefix: app-tag
```

---

For the full version workflow input reference, see the [p2p-version reference](../reference/p2p-version.md). For a conceptual overview of how versioning works, see [Versioning](../explanation/versioning.md).
