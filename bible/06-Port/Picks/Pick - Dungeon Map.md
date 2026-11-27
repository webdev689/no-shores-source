---
type: pick
area: Presentation and Tooling
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/ui/automap/automapSheet.js
  - src/systems/automap/automapFloors.js (read only)
  - src/ui/automap/automapDoor.js
  - src/ui/automap/automapViewKeep.js
  - src/ui/ink/inkDungeonGL.js
  - src/ui/ink/inkDungeonSolid.js
  - src/ui/ink/inkAutomap.js
  - src/systems/automap/automap.js (the walked trail only)
dfo_commit: 06b2b991 (main)
---
# Pick - Dungeon Map

DFO's solid dungeon map: the dungeon inked on the held map's parchment, turned and tilted, cut above a storey,
with the player, the way in, the company and the stairs on it, and only what was walked or seen
([[Dungeons Go Deeper, With Storeys, Stairs, More Ways and DFO's 3D Map]]).

## What comes over

- **The view**: the orbit's rest (yaw -0.62, pitch 1.12), its tilt's range (0.2 to a quarter turn), the keys' turn
  and tilt (an eighth of a turn, 0.16), a right drag's (0.008, 0.006 radians a pixel), the easing at 10 a second the
  short way round, the plan on P and back, the zoom to 14 px a metre and the rest view of at least 4, fitting what is
  explored in 0.92 and centred on the player past 0.42 off centre; the view kept per dungeon for the last 30.
- **The ink**: the one-sided mesh drawn only where it faces the eye (the cutaway), two passes, the graphite floors
  with flagstones in running bond, the walls' light from the paper's upper left and their hatching, the faint risers,
  and the pen's lines where coverage changes, at creases and where the depth bends, trembling, on parchment.
- **Storeys**: cut at the player's storey, PgUp and PgDn a storey at a time, L for all of them at 0.3.
- **The walked trail**: the feet read five times a second onto a metre's grid, a step of up to 3 m walked through;
  the sight cast from each new metre across the floor, 20 m, stopped by rock, solids and a rise.
- **The marks**: the player's caret, the way in's pulsing staff, the company, the stairs, the compass of radius 24.
- **What its tests pinned** that is behaviour: the projection and its inverse, the clamp of the tilt, the zoom about
  the pointer, the rest view's fit and its centring, the kept views' age, the trail's fill, and the sight's stops.

## What stays behind

- Every part of the automap that is Daggerfall Unity's: the classic window, its model and picker, its camera, chrome,
  markers and notes, and Daggerfall's dungeon blocks and their data ([[Own Work]]). Our own numbers stand in for the
  parts that came from it: the cut over the floor (2.6 m, where it took Daggerfall Unity's eye and bias), and the fade
  under it (full to 2 m, then to 0.3 over 8 m).
- DFO's floor derivation for dungeons with no storeys (`automapFloors.js`): our layouts name their storeys.
- Water's waves, the notes a player writes, teleporters, campfires, echoes and quest marks: No Shores has none of
  them in its dungeons, or they are drawn elsewhere.
- The browser's 2D canvas for the marks and words: No Shores draws with WebGPU and its own interface
  ([[WebGPU Only]], [[The Interface Uses No HTML, Now or Later]]).

## Our version

[[Dungeon Map]]: opened with the land map's key in a dungeon, over the whole view, drawn from the dungeon's own mesh
on the game's device.
