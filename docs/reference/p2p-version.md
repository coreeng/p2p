# p2p-version.yaml

> Computes and tags the next semantic version for the current commit.

## Usage

```yaml
jobs:
  version:
    uses: coreeng/p2p/.github/workflows/p2p-version.yaml@main
    secrets:
      git-token: ${{ secrets.GITHUB_TOKEN }}
    with:
      main-branch: refs/heads/main
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `main-branch` | string | No | `refs/heads/main` | The ref considered the main branch. Used to decide whether to create a tag and return the bumped version. |
| `dry-run` | boolean | No | `false` | When `true`, skips tag creation. |
| `version-prefix` | string | No | `v` | Prefix prepended to the semantic version number (e.g. `v1.2.3`). |
| `checkout-version` | string | No | `''` | Git ref to check out before computing the version. Defaults to the triggering ref. |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `git-token` | Yes | GitHub token used to authenticate git operations. |
| `slack_webhook_url` | No | Slack incoming webhook URL. When set, a notification is posted on failure (main branch only). |

## Outputs

| Name | Description |
|------|-------------|
| `version` | The computed version string for the current commit (see Behaviour). |
| `previous_version` | The highest existing semver tag, without the version prefix. |

## Job Graph

1. `increment-version` — Determines the version and optionally creates a git tag.
2. `notify-failure` — Runs on failure when on the main branch; sends a Slack alert if `slack_webhook_url` is set. Depends on `increment-version`.

## Behaviour

**On the main branch** (`github.ref == main-branch`, `dry-run == false`): if the current commit does not already carry the latest tag, a new patch-increment tag is created and `version` is set to that new patch version (e.g. `1.2.4`).

**On PR / feature branches**: no tag is created. `version` is set to `<previous-version>-<commit-sha>` (e.g. `1.2.3-abc1234`).

**When the current commit already has the latest tag**: tag creation is skipped and `version` is set to the existing version (i.e. `previous_version`).

In all cases, `previous_version` is the numeric part of the highest existing semver tag (e.g. `1.2.3`), or `0.0.0` if no tags exist.

## See also

- [How to customise versioning](../how-to/customise-versioning.md)
- [Versioning explanation](../explanation/versioning.md)
