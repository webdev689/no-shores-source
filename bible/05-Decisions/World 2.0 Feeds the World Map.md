---
type: decision
date: 2026-11-14
status: in force
---
# World 2.0 Feeds the World Map

> On a Rust reader of World 2.0's baked regions, so the server can check the ground: "Approved #2 for future
> proofing. Also one of the first big tasks is laying out the world map. Deciding its structure. World 2.0 plays into
> that"

## What it settles

- Laying out the world map, and deciding its structure, is one of the first big tasks.
- World 2.0's generators (geology, climate, erosion, drainage, rivers, soil, biomes, settlements, the editor) come over
  and feed it. Its Tamriel canon layer does not.
- The server reads the same baked regions in Rust, so the ground a client stands on is ground the server agrees with
  ([[Agree to the Bit]]).
