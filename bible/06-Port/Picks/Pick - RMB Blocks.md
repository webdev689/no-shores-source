---
type: pick
area: Engine and World
verdict: Can't as a reader; brought over once as data by the owner's choice
effort: M
status: ported
dfo_paths:
  - src/formats/blocksFile.js
  - src/world/rmbLayout.js
dfo_commit: 1c0fd681 (main), run over the freeware data
---
# Pick - RMB Blocks

Daggerfall's 920 town blocks, which DFO reads from the game's files to fill every town.

## What comes over

- Every block's building and prop placements and ground tiles, read once with DFO's own readers and checked against
  its layout to the hundredth of a degree, as JSON in `content/world/rmb/` ([[RMB Blocks]],
  [[Every Island Is Seen Whole and Reached by Nodes]]: "We will also utilize world 2.0/RMB").

## What stays behind

- The readers themselves: Overlook holds no reader of Daggerfall's files ([[Readers of Our Own Formats Only]]).
- Flats (Daggerfall's sprites), counted but not placed.

## Our version

The city planner fills its cells with these blocks by district ([[Cities]]).
