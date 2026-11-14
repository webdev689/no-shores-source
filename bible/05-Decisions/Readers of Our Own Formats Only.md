---
type: decision
date: 2026-11-14
status: in force
---
# Readers of Our Own Formats Only

> On whether the readers of Daggerfall's own files come over, or only the readers of our own formats: "Yes. No
> daggerfall readers."

## What it settles

- DFO Online's readers of Daggerfall's files (`src/formats`: archives, textures, blocks, maps, the heightmap, sounds)
  do not come over. Overlook has no Daggerfall files for them to read ([[Overlook Is Our Own Game]]).
- The readers of our own formats come over: World 2.0's baked regions, the forge's packs, saves and the wire. Each
  lands in TypeScript where the client reads it and in Rust where the server does.
- What the Daggerfall readers taught (streaming large archives in pieces, caching what has been read) informs ours as
  know-how, not code.
