---
type: decision
date: 2026-11-14
status: in force
---
# Generated Files on Cloudflare R2

> "Why stay out of git?"

> "Yes"

## What it settles

- What our tools generate (forge renders, world bakes, builds) is stored in Cloudflare R2, addressed by the hash of
  its content, and served through a CDN. Git holds the sources and the tools ([[Generated Files Stay Out of Git]]).
- Hand-made source assets (a sculpted model, a recorded sound) are sources, not generated files.
