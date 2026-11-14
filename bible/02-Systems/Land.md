---
type: system
status: live
code:
  - crates/land/src/relief.rs#relief
  - crates/land/src/erosion.rs#erode_coarse
  - crates/land/src/water.rs#water
  - crates/land/src/landmass.rs#generate
  - crates/land-wasm/src/lib.rs#land_open
  - client/src/rules/landRules.ts#startLand
---
# Land

The ground of each landmass, generated from its painted coast ([[World Map]]), shaped by the owner, and the same on
the server and in every browser. The owner decided the generator makes the land and the owner molds it.

## How it works

- **The window.** Each continent is generated on its own grid of 1 km cells: its coast's bounds and 40 km of sea
  around it. The painted coast decides land and sea, never the heights: land stays at 1 m or more and the seabed at
  -2 m or less, so the coast stays where it was painted.
- **The relief.** The land rises inland from the coast to uplands, about 650 m at 140 km in. Ranges stand where a slow
  ridge network, about 380 km across, crosses the interior, up to the climate's range height. The hills' grain
  grows with height. The seabed falls with distance from the coast.
- **Erosion.** World 2.0's law: stream power with an implicit step, sediment laid where the slope can no longer carry
  it, lakes that keep what they are given, and slopes that slide past their talus. It runs 40 steps of 2,000 years on
  a 2 km grid, and what it changed is laid back on the 1 km land, so valleys follow the water and the land keeps its
  grain.
- **Water.** A priority flood fills every hollow to its spill and finds each cell's way down. A river starts where
  the water a cell gathers reaches 1 m³/s, and runs to the sea or into a larger river. A lake stands wherever a
  hollow holds water 0.5 m deep.
- **Climate.** Every landmass uses one placeholder climate (800 mm of rain, ranges to 2,600 m) until the owner
  chooses the nine ([[Open Questions]]). Choosing generates the land again under the owner's edits.
- **Seed.** The world's seed salted with the landmass's id, which never changes, so the same layout makes the same
  land on any machine.

## Agreeing to the bit

The land crate uses only exact maths ([[Agree to the Bit]]): its noise is hashed gradient noise made of + - * / and
square root. Clippy refuses the platform's `sin`, `exp`, `powf` and their kin across the workspace. A fingerprint
of every ground height's bits is tested natively (`crates/land/tests/agree.rs`) and through WebAssembly
(`landRules.test.ts`) against the same value.

## In the browser

`crates/land-wasm` is the land's WebAssembly door. The World Editor runs it in a worker, so the page stays
responsive while a continent generates: about 1.5 s for 200,000 km² and 4 s for 500,000 km² on one core.

## Limits

- Only continents are generated; isles are not placed yet.
- One climate for every landmass until the owner chooses.
