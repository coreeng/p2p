# ADR-0002: Client-owned command overrides in P2P workflows

## Status

Accepted.

## Context

Some repositories need runner-specific setup or a specialised implementation of a P2P command, such as a cached container build. This logic must run in the same job as the command, while vendor-specific details must remain outside P2P. GitHub reusable workflows do not allow callers to inject arbitrary steps into a called job.

## Decision

P2P workflows will accept an optional `command-overrides` input containing a comma-separated list of exact P2P command names. An empty value preserves the current behaviour.

```yaml
with:
  command-overrides: p2p-build,p2p-functional
```

In this example, `p2p-build` and `p2p-functional` use the repository composite action. Every other command follows the default P2P route.

For an unlisted command, P2P performs its default setup and runs `make <command>`. For a listed command, P2P performs its common job setup and invokes the caller's fixed composite action at `.github/actions/p2p-command/action.yml`, passing the command, working directory, and the same execution environment available to the default Make step. The action owns both command-specific setup and execution: it may call Make explicitly or replace it entirely. Its failure fails the job; P2P never falls back after an override starts.

P2P validates the list and continues to own checkout, authentication, shared environment, job structure, and post-command processing. Vendor-specific actions and configuration remain in the caller repository.

## Considered options

- **Runtime output flags:** rejected because they split ownership between setup and execution, introduce a fragile handshake, and risk double execution or accidental fallback.
- **Separate setup and execution selectors, or a manifest file:** rejected as unnecessary configuration. A command override can perform setup and still call the default Make target when desired.
- **JSON input:** rejected in favour of a comma-separated list because the values are simple command identifiers and caller readability matters more than general-purpose structure.
- **Caller-owned workflows:** rejected because callers would have to duplicate P2P's job graph and shared behaviour.
- **Arbitrary steps or action paths as inputs:** rejected because GitHub Actions requires step structure and `uses` targets to be statically defined.

## Consequences

Callers gain full, same-job control over selected commands without exposing vendor concepts in P2P. The fixed action path is a convention that P2P must validate clearly, and custom implementations are responsible for preserving the observable result of the command, including required Buildx image-loading behaviour.
