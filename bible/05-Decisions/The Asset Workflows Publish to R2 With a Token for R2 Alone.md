---
type: decision
date: 2026-11-22
status: in force
---
# The Asset Workflows Publish to R2 With a Token for R2 Alone

> Asked for a named yes to moving every workflow that publishes to R2 off the repository's `CLOUDFLARE_TOKEN` and onto
> `R2_TOKEN`, a token for R2 alone, since those workflows run on a push to any branch: "The token is already in
> secrets"

## What it settles

- Every workflow that publishes to R2 reads the repository's `R2_TOKEN` secret, and only the `rooms` workflow holds
  `CLOUDFLARE_TOKEN`, which deploys the Workers and the accounts' database ([[Toolchain]]).
- `R2_TOKEN` is already among the repository's secrets.
- It keeps [[Generated Files on Cloudflare R2]] and [[Model Packs Upload From Any Branch]] as they are.

Taken further by [[The Audit's Leftovers Are Fixed as Claude Suggested]]: in each of those workflows only a job that
installs no package, and uploads what a job without the token built, holds `R2_TOKEN`.
