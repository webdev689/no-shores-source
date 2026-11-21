---
type: decision
date: 2026-11-20
status: in force
---
# Model Packs Upload From Any Branch

> Told that the island and ship model workflows upload their Blender packs to R2 from any branch, each named by its
> content hash and never overwritten, and that nothing live reads them until a merge into main deploys the manifest
> naming them, and asked whether uploads should stay open to every branch: "Any branch, as now (Recommended)"

## What it settles

- The `island-modules` and `ships` workflows publish their packs to R2 from any branch, so a branch's pictures and
  tests can load its own new models before it merges ([[Island Modules]], [[Hulls]]).
- Only a merge into main makes a pack live, by deploying the manifest that names it.
