---
type: system
status: live
code:
  - client/src/game/dungeonMap/dungeonMap.ts#DungeonMap
  - client/src/game/dungeonMap/mapCamera.ts#toPaper
  - client/src/game/dungeonMap/mapCamera.ts#restView
  - client/src/game/dungeonMap/mapReveal.ts#Reveal
  - client/src/game/dungeonMap/mapStoreys.ts#storeysOf
  - client/src/game/dungeonMap/mapStoreys.ts#kindAt
  - client/src/game/dungeonMap/mapKept.ts#writeKept
  - client/src/game/dungeonMap/mapInk.ts#MapInk
  - client/src/game/dungeonMap/mapInk.ts#mapFloats
  - client/src/game/dungeonMap/mapShaders.ts#MAP_FACES_SHADER
  - client/src/game/dungeonMap/mapShaders.ts#MAP_INK_SHADER
  - client/src/game/dungeonMap/mapPaper.ts#paperNode
  - client/src/game/dungeonMap/mapPointer.ts#listenToMap
  - client/src/game/dungeonDrawers.ts#DungeonDrawers
---
# Dungeon Map

DFO's ink map of a dungeon, rebuilt for No Shores ([[Pick - Dungeon Map]], the calls' "The 3D map" in
[[Dungeons as Claude Builds Them]]): the dungeon drawn in ink on parchment, turned and tilted, cut above the storey
looked at, storey by storey or all at once, with the player, the way in, the portal, the stairs and the company on it.
Only what the player has walked or seen is drawn, never the whole dungeon.

## How it works

- **Opening.** In a dungeon the land map's key (N, `landMap`) opens it, where on land it raises the [[Held Map]];
  N again or Escape shuts it. It covers the whole view at once: the game's own picture is drawn first and the map over
  it, and the interface shows nothing over the paper but the map's own words and marks and the controls' sheet. The
  player stands still while it is up, as with the held map (the frame takes it as `looking`), and the pointer is let
  go. While it is up every key is the map's, so nothing in the game behind it acts.
- **The view** (`mapCamera.ts`). The plan seen along one line, no perspective: a point (x east, y south, z up) lies at
  u = a cos(yaw) - b sin(yaw), v = (a sin(yaw) + b cos(yaw)) sin(pitch) - (z - z0) cos(pitch) from the paper's middle,
  times the scale, where (a, b) is the point less the view's middle and z0 the floor looked at; pitch a quarter turn
  and yaw 0 is the flat plan, north up. It rests at yaw -0.62 and pitch 1.12, and tilts between 0.2 and a quarter
  turn. Q and E turn it an eighth of a turn, R and F tilt it 0.16; a right drag turns it 0.008 radians a pixel and
  tilts it 0.006. Keys ease it there at 10 a second, the short way round. P lays the flat plan, turned to the nearest
  whole turn, and P again goes back to the view before. A left drag pans, the wheel zooms about the pointer as the held
  map's wheel does, + and - zoom by 1.35, the arrows pan 60 px. It zooms between 1 and 14 paper pixels a metre.
- **At rest.** Opened with no view kept, it fits what is explored in 0.92 of the paper, never under 4 px a metre, and
  is centred on the player instead where the fit would leave them more than 0.42 of the paper from its middle.
- **Storeys** (`mapStoreys.ts`). The map reads a layout's `storeys`, `floors`, `storeyM` and `stairs` where it has
  them, and a layout without them as one storey at 0 m with no flights. Cells are storey-major. A flight's cells are
  named by `stairs` on both its storeys; any cell code but a room's, a corridor's and rock is open air over the storey
  under. It opens cut over the player's storey. PgUp or ] steps the cut a storey up, PgDn or [ a storey down, the view
  keeping the new floor where the old one lay; Home goes back to the player's storey, centred on them. L shows every
  storey, each cut over its own floor, its flights never cut, and each storey but the one looked at inked at 0.3.
  The words over the paper say "Storey 2 of 3, you are on 1" where a dungeon has more than one.
- **The reveal** (`mapReveal.ts`, DFO's own law over our 3.2 m cells). The feet are read five times a second, opened
  or not, onto a metre's grid, the walked trail; a step between two reads up to 3 m is walked through, a longer one is
  a carry. From each metre newly walked, 144 lines of sight run across the floor up to 20 m, a sample every 0.5 m,
  each stopped by rock, by a solid that stands over 1.2 m above the floor it was cast from, or by the floor rising more
  than 1.2 m from one cell to the next. Sight goes down a flight onto the storey under (past the flight's middle) and
  across open air, never up a flight nor onto the storey over. A cell is drawn once walked or seen; a flight's cell on
  both its storeys.
- **Kept** (`mapKept.ts`). Each dungeon's view and its revealed cells are kept in the browser's storage under
  `noShores.dungeonMaps`, by the dungeon's ask (the same dungeon at any tier shares one), for the last 30 dungeons,
  the oldest written going first: on shutting the map, on leaving the dungeon, and every 3 s while new cells come in.
- **The ink** (`mapShaders.ts`, `mapInk.ts`). The map draws the dungeon's own mesh, the very buffers the dungeon's
  view holds (`DungeonView.mesh`), with two pipelines of its own on the game's device, into targets of its own, then
  over the finished picture. The first pass draws each face whose normal looks toward the eye, so a room's near wall
  is never drawn and the room lies open from any side; only where its cell (read a little into the room it faces) is
  walked or seen, and only under the cut, 2.6 m over the floor looked at. A face keeps its full ink down to 2 m under
  the cut and fades to 0.3 over the next 8 m. It writes a face's facing and shade into one target and its strength,
  its pencil and its depth into a second: floors (facing up more than cos 70) a graphite (74, 74, 80) wash with
  1 m flagstones in running bond (joints 0.24, doubled where a stone would be under 10 px), ceilings 0.18, walls
  washed by a light from the paper's upper left however it is turned with upright hatching on the shaded side, and a
  flight's risers a faint 0.15 with no crease against their treads, so a stair does not read as a black band. The
  second pass inks (58, 40, 22) where the drawing starts or stops, where neighbouring facings' dot is under 0.8, and
  where the depth bends by over 0.3 m across a pixel, the pen trembling by noise (0.6 to 2.2 px) and the line
  max(1, round(min(2.5, 0.6 + 0.1 x scale))) px, all over parchment (238, 222, 190) with a faint grain.
- **The marks** (`mapPaper.ts`), laid by the interface over the ink: the player's caret, red, turned with the map;
  the company's carets, blue, each named under the pointer; the way in's staff, pulsing, once seen; the return portal
  once seen; each flight's steps, named "Stairs down to storey 2" or "Stairs up to storey 1" under the pointer. A mark
  on another storey than the one looked at is drawn faint. Only the mark nearest the pointer, within 14 px, is named.
  The compass (radius 24 px, at the paper's upper right) is inked by the second pass, its ring squashed with the
  tilt and its needle to the north. The dungeon's name stands at the top left, the storey line and the chests counted
  under it. No key's tip is written on the paper.
- **The chests counted.** The line under the storey's ("Chests 2 of 5") comes from `PAPER.chests`, the hook the
  dungeon chests' count is hung on; until the gear carries that count it says nothing.

## Limits

- An Elite Dungeon's drowned floors are not washed in water: the map draws the dungeon's mesh, and their water is a
  mesh of its own.
- The pad opens the map only where a button is bound to the land map's control, and has no turn or storey buttons of
  its own.
