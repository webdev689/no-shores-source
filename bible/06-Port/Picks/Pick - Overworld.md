---
type: pick
area: Gameplay Systems
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/player/travelCamera.js
  - src/player/travelPick.js
  - src/systems/travel/travelPace.js
  - src/scenes/travelView.js
  - src/scenes/travelViewMarks.js
  - src/systems/travel/travelDungeonModels.js
  - src/scenes/travelHorizon.js
dfo_commit: 1c0fd681 (main)
---
# Pick - Overworld

DFO's Overworld (its Travel View): a raised, tilted camera over the real world for fast travel.

## What comes over

- The camera, its clearance over ridges, its rise and fall, the pick, the pace dial and the marks that grow with the
  camera's height ([[Every Island Is Seen Whole and Reached by Nodes]]: "Utilize our proprietary overworld from DFO").

## What stays behind

- The Travel Options port and its autopilot and steering, which are other authors' work.
- Roads, towns, bands, dungeons and quests on the map, and the cloud deck.

## Our version

The overworld layer, `client/src/overworld/` ([[Overworld]]): sea routes round the land, voyages, and the bird's-eye
view of an island's side with its nodes, ours.
