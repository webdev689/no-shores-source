---
type: pick
area: Engine and World
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/world/gen2/settle/settlementGen.js
  - WORLD_2.0.md
dfo_commit: 4383c9cb (ccr-aff93cb4-gw1nto)
---
# Pick - World 2.0 Settlements

World 2.0's settlement generator: a town made from its ground in stages, its footprint, ways in, districts, streets,
plots and buildings, with its terrain shaped as part of it.

## What comes over

- The stages and their laws as the specification: the footprint by rays, gates scored by reach and slope, the
  harbour, main roads found over a cost grid, districts sown by rule and the ground terraced
  ([[Every Island Is Seen Whole and Reached by Nodes]]: "We will also utilize world 2.0/RMB").

## What stays behind

- Its streets, plots and prefab buildings: a port city fills its cells with RMB blocks instead.
- Its region sampler and Daggerfall-shaped records.

## Our version

The city crate, `crates/city` ([[Cities]]), rebuilt in Rust at a city's scale.
