---
type: decision
date: 2026-11-14
status: in force
---
# The Server Gets Its Own Rules

> On DFO's servers importing client game code (item rules, inventory, loot, survival, and on the server branch
> Daggerfall Unity's effects, spellcasting, enchantments and world tick), so a Rust server needs its own: "Approved"

## What it settles

- The Rust server does not run DFO's client code or Daggerfall Unity's translations. Every rule it applies is our own,
  written in the shared Rust rules crate ([[Server-Authoritative Multiplayer]],
  [[Clients Predict With the Shared Rules]]).
- DFO's server branch is studied for its design (input replay, a fixed simulation step, levels built on the server, a
  server-side home per character), not carried as code.
