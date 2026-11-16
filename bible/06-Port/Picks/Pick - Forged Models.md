---
type: pick
area: Engine and World
verdict: Cut, brought over whole by the owner's choice
effort: L
status: ported
dfo_paths:
  - src/world/buildings/
  - src/world/props/
  - src/world/kit/
  - src/world/dungeon/plan/seedLanes.js
  - src/world/chairSeat.js
  - src/world/interior/fabricInteriorKit.js
dfo_commit: b37cc444 (ccr-cab30c1a-oddrwb)
---
# Pick - Forged Models

DFO's Building Forge, Prop Forge and Room Kit: Daggerfall's town buildings, props and rooms' pieces made again in
code from their measured plans, boxes and faces.

## What comes over

- The three forges, the same geometry to the bit for every building, prop and kit piece, and their measured tables
  as JSON in `content/forged/` ([[Every Island Is Seen Whole and Reached by Nodes]]).
- New: each building's plan as solid masses, for drawing it far off.

## What stays behind

- Registration on DFO's custom-model door, aliases, and the tools that measured the tables from the game's files.

## Our version

The models layer, `client/src/models/` ([[Forged Models]]), drawn in the cities ([[Cities]]).
