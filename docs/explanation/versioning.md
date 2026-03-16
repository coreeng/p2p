# Versioning

The `p2p-version` workflow produces a semantic version string for each pipeline run. The version drives image tagging in the registry and determines which commit the pipeline checks out when deploying.

See [`../reference/p2p-version.md`](../reference/p2p-version.md) for full input/output reference. See [`../how-to/customise-versioning.md`](../how-to/customise-versioning.md) for customisation patterns.

## Tag lookup

The workflow fetches the full git history (`fetch-depth: 0`) and scans all existing tags. It looks for tags matching the pattern `<version-prefix><major>.<minor>.<patch>` using the regex `^<version-prefix>[0-9]+\.[0-9]+\.[0-9]+$`. Tags are sorted with `--version-sort` in descending order and the highest matching tag is selected as the previous version.

If no matching tag exists, the previous version defaults to `<version-prefix>0.0.0`.

## Semver increment

The workflow always increments the patch component. Given a previous version of `1.2.3`, the next version is `1.2.4`. Major and minor increments are not performed automatically; they require manual tagging.

## Behaviour on the main branch

When the pipeline runs on `main` (or the configured `main-branch` input) and the current commit differs from the commit that carries the latest tag, the workflow:

1. Creates a new git tag `<version-prefix><next-patch>` on the current commit.
2. Outputs the new version (e.g., `1.2.4`) as the `version` output.

When the current commit already has the latest tag, the workflow outputs the existing version without creating a new tag. This handles reruns and scenarios where the pipeline is triggered on a commit that was already tagged.

## Behaviour on PR branches

On any branch other than `main`, the workflow never creates a tag. The `version` output takes the form `<previous-version>-<full-git-hash>`, for example `1.2.3-a3f8c2d1...`. This version identifies the exact commit without polluting the tag namespace.

## The `version-prefix` input

The `version-prefix` input (default: `v`) prepends a string to every version number. In a single-app repository this produces tags like `v1.2.3`. In multi-project repositories, a distinct prefix per project prevents tag collisions:

- prefix `app-tag` produces tags `app-tag0.1.0`, `app-tag0.1.1`, etc.
- The version output strips the prefix, so `version` = `0.1.1`, not `app-tag0.1.1`.

## The `previous_version` output

The workflow always emits a `previous_version` output. This is the version before the patch increment, with the prefix stripped. It equals the highest existing tag's version or `0.0.0` if no tags exist. It is available regardless of branch or whether a new tag was created.

## Version and image tags

The `version` output becomes the image tag in every registry path. `p2p-build` pushes:

```
<registry>/fast-feedback/<image>:<version>
```

Promotion targets retag or copy the image using the same version string:

```
<registry>/extended-test/<image>:<version>
<registry>/prod/<image>:<version>
```

On `main`, the version is a clean semver string (e.g., `1.2.4`). On PR branches, the version includes the git hash (e.g., `1.2.3-a3f8c2d1...`), making PR images distinguishable from released images and preventing them from being selected as the latest promoted version by `p2p-get-latest-image-*`.
