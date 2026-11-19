---
type: pick
area: Engine and World
verdict: Cut
effort: L
status: approved
dfo_paths:
  - DUNGEONS_2.0.md
  - bible/03-World/Dungeons.md
  - src/world/forge/forgeGrid.js
  - src/world/forge/forgeMesh.js
  - src/world/forge/forgeBlock.js
  - src/world/forge/forgeDungeon.js
  - src/world/forge/forgePictures.js
  - src/systems/dungeon/heartLaw.js
  - src/scenes/dungeon/heartPart.js
dfo_commit: 648073ab (ccr-cab30c1a-oddrwb)
---
# Pick - Dungeons 2.0

DFO's Dungeons 2.0: the Forge, which lays every dungeon in blocks of DFO's own, rooms and corridors carved on a grid of
3.2 m cells from a seed, and the dungeon engine's parts that make a dungeon play better without moving a block
([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]]).

## What comes over

- **The Forge's block law**: the 16 by 16 grid; rooms by a seeded split, in each style's count, size, height and shape
  (rectangles, an L two times in five); the edge contracts between blocks side by side; ways through the rock by the
  cheapest route, a spanning tree and a share of loops; the check that a block is one walk, a failed seed taking the
  next sub-seed, sixteen times, then the simplest form.
- **The Forge's mesh**: floors, ceilings and walls from the cells, trim bands at a wall's foot and head, doorway
  frames where a room meets a corridor, pillars at a great room's inner corners, each face by its picture's role.
- **Its population**, as far as Overlook uses it: the way in's exit door against rock, markers on a room's quiet
  floor, a torch on each room's wall and every fourth corridor cell, no foe in the way-in room.
- **The heart**: the room farthest from the way in is held by its guardian, and a cache beside it opens when it falls.

## What stays behind

- Stairs and storeys: [[Movement]] and the [[Navmesh]] stand one floor at a point.
- Doors and their locks, traps and their notice and disarm, poison, magicka drains, last fire and its rest, scenery
  flats, light hues by flame, block names, the director's noise and patrols: each needs a system Overlook does not
  have, or only repeats what its garrison already does.
- The blocks' people, fixed foes, castle courts and riddle vaults, the source dungeons' squares and kinds, curated
  blocks, the plan's print and saves: all of them Daggerfall's dungeons or DFO's saves.
- DELVE II's wave and puzzle encounters and their vaults.
- The cave and mine styles: their rock picture (archive 120) is not one the procedural textures paint.

## Our version

The `dungeon` crate, its dungeons' rooms in the [[Server]], and the [[Game]]'s way in and out of them: [[Dungeons]].
