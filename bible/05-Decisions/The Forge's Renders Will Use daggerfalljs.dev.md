---
type: decision
date: 2026-11-14
status: in force
---
# The Forge's Renders Will Use daggerfalljs.dev

> Asked which domain should serve the forge's renders: "daggerfalljs.dev"

> Told that its DNS is at Porkbun and must move to Cloudflare before Cloudflare can serve the renders from it, and
> asked whether to move it, use a Cloudflare Worker, or wait: "Leave it for now"

## What it settles

- The [[Sprite Forge]]'s renders stay at the R2 bucket's own `r2.dev` address for now
  ([[Generated Files on Cloudflare R2]]).
- When they move, they are served from a name under `daggerfalljs.dev`, once its DNS is on Cloudflare.
