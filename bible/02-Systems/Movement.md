---
type: system
status: live
code:
  - crates/movement/src/step.rs#step_body
  - crates/movement/src/body.rs#TUNING
  - crates/movement/src/body.rs#TICK_SECONDS
  - crates/movement/src/blocks.rs#ground_at
  - crates/movement/src/floats.rs#fingerprint
  - crates/movement-wasm/src/lib.rs#movement_step
  - client/src/rules/movementRules.ts#startMovementRules
  - client/src/testground/player.ts#updatePlayer
---
# Movement

How a body moves, the same on the server and in every browser: walking, running and crouching, up steps and off
edges, jumping and falling, catching a lip to hang, mantle or vault, shimmying along it, and climbing a wall too high
to grab. The [[Test Ground]] plays it with DFO's controls ([[The Player Plays as in DFO]]).

## How it works

- **One crate for every machine.** The `movement` crate holds the rules. A browser runs it as WebAssembly through the
  `movement-wasm` door; the server is to run the same crate natively ([[Clients Predict With the Shared Rules]]). Its
  sines, cosines and arctangents come from `libm`, a pure-Rust maths library compiled into it, so every machine
  rounds them alike ([[Agree to the Bit]]).
- **Ticks.** A body moves in whole ticks of 1/60 s. Each tick takes the body and the player's controls: forward and
  sideways (-1 to 1), the look's bearing, run, mounted, and jump and crouch pressed. A press between two ticks is kept
  for the next. The view turns every frame. The body is drawn eased from the tick before toward the last, so it
  moves smoothly at any frame rate, a tick behind.
- **Blocks.** A course is a list of blocks, each a footprint and a top. The body, a circle of 0.35 m radius, stands
  on the highest top within a step (0.5 m) of its feet, slides along a block's sides, and is stopped by one
  taller than a step.
- **Crossing into a browser.** A body is 22 numbers and its controls 7, little-endian 64-bit floats in one fixed
  order, so no number is rounded on the way. The door keeps the course, and steps the body in memory it reserved once.

## How the body is held

| Mode | What moves it on |
|---|---|
| Ground | Walks, runs, crouches or rides where the controls point. A jump lifts it into the air, or goes over a lip within reach (1.8 m). Pressed still into a wall too high to grab, it climbs. Off an edge higher than a step, it falls |
| Air | Falls under gravity. Pressed into a wall with the lip within reach (1.95 m in the air), it hangs, or goes over a low lip |
| Hang | Sideways shimmies along the lip; forward goes over; crouch lets go |
| Climb | Forward climbs and sideways moves along the wall; a jump kicks off it; at 1.8 m below the lip, it hangs |
| Mantle | Rises first, then goes over onto the lip |
| Vault | Arcs over a lip up to 1.2 m on a block up to 0.8 m deep, landing beyond it |

## Tuning

DFO's numbers ([[The Player Plays as in DFO]]), in `TUNING`: walking 4.43 m/s, running 7.59, crouched 2.53, riding 6
and galloping 12. A jump leaves at 4.5 m/s against gravity of 20 m/s², about half a metre high, crouched at 0.8 of
that. Shimmying and climbing go at 1 m/s. A mantle or vault takes (0.25 + 0.22 × rise) × 1.05 seconds, DFO's time at
middling skill. The eye stands 1.7 m over the feet, 0.8 m crouched.

## Agreement

A scripted run over a small course, through every mode, is fingerprinted: FNV-1a over every number of the body at
every tick. `crates/movement/tests/agree.rs` takes it natively and `client/src/rules/movementRules.test.ts` through
WebAssembly, and both hold the same value.

## Limits

- The ground is the course's blocks on open ground at 0 m; bodies do not stand on the [[Land]] yet.
- Whether the body is mounted is the client's to say; the rules take it as a control.
- No server runs the crate yet; a thin server that two browsers share comes next
  ([[Gameplay Starts With the Shared Rules]]).
