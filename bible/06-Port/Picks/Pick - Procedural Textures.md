---
type: pick
area: Engine and World
verdict: Cut, brought over whole by the owner's choice
effort: L
status: ported
dfo_paths:
  - src/world/procTex/
  - src/world/climateSwaps.js
dfo_commit: b37cc444 (ccr-cab30c1a-oddrwb)
---
# Pick - Procedural Textures

DFO's procedural textures: every picture its forged world wears, and the ground's twelve terrain sets, painted in
code over Daggerfall's texture archives and palette.

## What comes over

- The engine, the materials and features, the finish and every recipe, with the climate and season swaps, painting
  the same bytes DFO paints for every one of its 1,851 pictures ([[Every Island Is Seen Whole and Reached by Nodes]]:
  "B. It all comes over").
- The pictures' uses, worked out from the forged models' tables in `content/forged/`.

## What stays behind

- The IndexedDB cache, the worker, the install onto DFO's texture door and the version law.
- Painters no picture uses, and the paths no picture takes.

## Our version

The textures layer, `client/src/textures/` ([[Procedural Textures]]), with its own sine, cosine and power, so a
picture is the same bytes in every browser.
