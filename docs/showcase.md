# Showcase deployment contract and implementation plan

Applications can opt in to early browser access after a successful FF build.
The `showcase` workflow-call input is optional, boolean and false by default.
Only the configured main branch may deploy. Existing callers allocate and deploy
nothing new; pull requests never enable Showcase.

The Showcase job needs target resolution and build, reuses the FF target matrix,
passes the current run's version to `p2p-showcase`, and creates a separate
persistent subnamespace and ingress. It has no dependency on functional, NFT,
integration or security jobs. Existing integration and promotion gates remain
unchanged; Showcase failure contributes to aggregate FF failure and notification.
Later unflagged runs leave the deployment running.

Implementation sequence:

1. Add the default-false input and forward effective opt-in to target resolution.
2. Add the post-build matrix job using the existing executor, credentials and locks.
3. Add ingress preflight and Make namespace/image variables for Showcase.
4. Verify opt-out, main-branch restriction, dependencies, version, target allocation
   arguments and the FF application image path; run workflow lint.

Managed target resolution requires a Portal/corectl version supporting
`p2p targets --showcase`. Applications must implement the deploy-only Make target.
Release the compatible P2P workflow before templates forward its input. The
new-app wizard opts in automatically, but does not add a separate workflow.
