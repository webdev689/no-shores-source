---
type: system
status: live
code:
  - crates/movement/src/step.rs#step_body
  - crates/movement/src/body.rs#TUNING
  - crates/movement/src/body.rs#TICK_SECONDS
  - crates/movement/src/blocks.rs#ground_at
  - crates/movement/src/blocks.rs#pushed_out
  - crates/movement/src/terrain.rs#Terrain
  - crates/movement/src/heights.rs#Heights
  - crates/movement/src/floats.rs#fingerprint
  - crates/movement-wasm/src/lib.rs#movement_step
  - crates/movement-wasm/src/lib.rs#set_ground
  - crates/room/src/floor.rs#standing_on
  - client/src/rules/movementRules.ts#startMovementRules
  - client/src/player/player.ts#updatePlayer
---
# Movement

How a body moves, by rules built to run the same on a server and in every browser: walking, running and crouching, up steps and off
edges, jumping and falling, catching a lip to hang, mantle or vault, shimmying along it, and climbing a wall too high
to grab. The [[Test Ground]] plays it with DFO's controls ([[The Player Plays as in DFO]]).

## How it works

- **One crate for every machine.** The `movement` crate holds the rules. A browser runs it as WebAssembly through the
  `movement-wasm` door, and the [[Server]] runs the same crate in its rooms
  ([[Clients Predict With the Shared Rules]]). Its sines, cosines and arctangents come from `libm`, a pure-Rust maths
  library compiled into it, so every machine rounds them alike ([[Agree to the Bit]]).
- **Ticks.** A body moves in whole ticks of 1/60 s. Each tick takes the body and the player's controls: forward and
  sideways (held to -1 to 1), the look's bearing (wrapped within half a turn either way, as the fight's rules take it,
  so a browser's step and a room's agree), run, mounted, and jump and crouch pressed. A control that is not a number
  counts as none, so a body never takes one in. A press between two ticks is kept for the next. The view turns
  every frame. The body is drawn eased from the tick before toward the last, so it moves smoothly, a tick behind.
- **Blocks.** A course is a list of blocks, each a footprint and a top. The body, a square reaching 0.35 m each way
  from its centre, stands on the highest top under its centre within a step (0.5 m) of its feet (a footprint holds
  its own edges, so blocks laid side by side hold every point of their seam), slides along a
  block's sides, and is stopped by one taller than a step. A move is judged where the feet end it: stepping down
  beside a taller block, the body is held where the drop would leave it overlapping that block, and slides on.
- **Never inside a block.** Falling past the top of a block beside it, too slowly to clear it, the body is pushed out
  of it the shortest way, never past its far side. A body set down overlapping a block, as a blow's charge may leave
  it, is pushed out the same way before it moves. So no edge or corner holds a body fast.
- **Terrain.** The blocks stand on a terrain: any ground known by its height at a point (`Terrain`), so the rules
  need nothing of the crate that makes it. A node's room stands its bodies on the [[Land]]'s window round its node,
  and its city's boxes as blocks ([[Server]]); the [[Test Ground]] and its rooms use open ground at 0 m. A body that
  joins or respawns in a node's room stands on the ground at its spawn, or on a block's top within a step of it.
  The ground under the feet is the higher of the
  terrain and the highest block top within a step. The feet follow the terrain up and down while a tick's drop is
  no more than a step; past that the body falls, and a fall lands on the terrain. A move whose path rises more
  steeply than the slope limit, or more than a step above the feet, is tried an axis at a time, as against a
  block's side, so the body slides along the rise. Walked slantwise, a slope too steep to walk straight up is
  climbed as steeply as the path rises. The rise is the terrain's own, so a block sunk into a slope is walked onto
  and off again. Climbing down a wall stops at the terrain.
- **A grid of heights.** One terrain is a grid of square cells, each with its height or none (`Heights`), as a
  ship's deck is ([[Sailing]], "Her deck"). In a cell with a height, the ground blends the four cell centres round
  the point by nearness, leaving out any that hold none; a cell with none, or past the grid's end, stands 10 m over
  the highest cell, a wall at that cell's edge that no step or slope takes and no climb starts on, a climb holding
  to blocks alone. A wall is judged along the whole of a move, each cell it passes through in turn and both cells
  beside a corner it crosses, so a run's tick, longer than a cell, never carries a body through a wall one cell thick,
  nor between two walls that meet at a corner. So a passage one cell wide is walked to its end. A vault or a mantle is never
  taken across one of these walls: at a deck's edge the body stays on its side of a rail it jumps at. A course of
  blocks laid over the open sea is held so by its rim (`Heights::rim`): open under the blocks wherever one covers a
  cell's middle, a wall everywhere else, so no body leaves the blocks for the sea. A body standing on it
  faces north (her bow). The browser hands it to its door as numbers (the grid's shape, then each height, NaN for
  none), the same numbers the sea room stands its walkers on.
- **Foes move by the same rules.** A foe's brain asks for the controls a player's keys would, and its room steps its
  body by them as it steps a player's ([[Foes]]); the [[Navmesh]] tries each of its climbs and drops by these rules,
  with those controls, before it lays one.
- **Crossing into a browser.** A body is 22 numbers and its controls 7, little-endian 64-bit floats in one fixed
  order, so no number is rounded on the way. The door keeps the course, and steps the body in memory it reserved once;
  it leaves alone memory too short for a step.
- **Predicting on the land.** The door also keeps a window of the land, handed over as the JSON the land's door cuts
  (`setGround`): every later step stands on it, the same ground to the bit as the node's room, and a body asked to
  stand does so on its ground. Anything that is not a window is open ground at 0 m again. `standOnNode` sets a
  node's window and its city's boxes together, for the browser that predicts a node's room ([[Server]]).

## How the body is held

| Mode | What moves it on |
|---|---|
| Ground | Walks, runs, crouches or rides where the controls point. A jump, once the feet have stood 0.1 s, lifts it into the air, or goes over a lip within reach (1.8 m). Pressed into a wall too high to grab, stopped across its face however it slides along it and looking within 45° of square, it takes hold square to the wall and climbs. Off an edge higher than a step, it falls |
| Air | Falls under gravity. Pressed into a wall with the lip within reach (1.95 m in the air), it hangs, or goes over a low lip |
| Hang | Sideways shimmies along the lip; forward goes over; crouch lets go |
| Climb | Forward climbs and sideways moves along the wall; a jump kicks off it; at 1.8 m below the lip, it hangs |
| Mantle | Rises first, then goes over onto the lip |
| Vault | Arcs over a lip up to 1.2 m on a block up to 0.8 m deep, landing 0.2 m past it, met head on or slantwise |

## Tuning

DFO's numbers ([[The Player Plays as in DFO]]), in `TUNING`: walking 4.43 m/s, running 7.59, crouched 2.53. A jump
leaves at 4.5 m/s against gravity of 20 m/s², about half a metre high; crouched, it leaves at 0.8 of that speed.
Shimmying and climbing go at 1 m/s. Riding goes at 6 m/s and galloping at 12, until Overlook has riding speeds of
its own. A mantle or vault takes (0.25 + 0.22 × rise) × 1.05 seconds, DFO's time at
middling skill. The eye stands 1.7 m over the feet, 0.8 m crouched.

The slope limit is Overlook's own: terrain rising 1.19 m a metre, about 50°, is the steepest walked up, Claude's
choice ([[The World Is Claude's to Mold]]). The pace is the same up a slope as on the flat.

## Agreement

A scripted run over a small course, through every mode, is fingerprinted: FNV-1a over every number of the body at
every tick. `crates/movement/tests/agree.rs` takes it natively and `client/src/rules/movementRules.test.ts` through
WebAssembly, and both hold the same value.

Two runs over real nodes' windows are fingerprinted the same way: across Mistfall's social space on the rainforest
continent, into its parapet, over it and along the terrace beyond, then over a patrol area's open land. The room's
side (`crates/room/tests/agree_node.rs`) takes the windows and boxes the bake cuts and steps them natively; the
browser's (`client/src/rules/nodeWindow.test.ts`) generates the continent and settles its city in the land's door,
cuts the same windows there, and steps them through the movement door. Both hold the same value.

## Limits

- The Test Ground stands bodies on open ground at 0 m; a node's room, and the [[Game]] on foot in a node, stand them
  on the [[Land]].
- A body that lands on terrain steeper than the slope limit stands there and does not slide down, so a jump can
  gain height up a slope too steep to walk.
- A body slides along a rise too steep for its path an axis at a time, as along a block, not along the rise's own
  contour.
- Pushed out of a block it fell beside, a body moves up to 0.35 m sideways in one tick.
- Whether the body is mounted is the client's to say; the rules take it as a control.
- A frame counts for at most 0.1 s, so below 10 frames a second the body moves slower than real time.
