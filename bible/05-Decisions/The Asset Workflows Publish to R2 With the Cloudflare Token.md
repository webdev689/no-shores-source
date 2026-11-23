---
type: decision
date: 2026-11-23
status: in force
---
# The Asset Workflows Publish to R2 With the Cloudflare Token

> "Im getting tired of this my claude token is in the repo and isn't there already a build step in the deploy chain?"

Told that the asset workflows read `R2_TOKEN`, which every run read as empty, while `CLOUDFLARE_TOKEN`, the deploys'
token, is set and works, and asked how to fix it, the owner chose "Use CLOUDFLARE_TOKEN", told that it undoes
[[The Asset Workflows Publish to R2 With a Token for R2 Alone]]: workflows any branch can trigger would hold the token
that deploys the servers.

## What it settles

- Every workflow that uploads to R2 reads the repository's `CLOUDFLARE_TOKEN`, as the `rooms` and `lattice` workflows
  do ([[Toolchain]]).
- In each, only the job that uploads holds it, and that job installs and runs no one else's code
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
- It replaces [[The Asset Workflows Publish to R2 With a Token for R2 Alone]].
