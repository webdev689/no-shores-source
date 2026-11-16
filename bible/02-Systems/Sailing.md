---
type: system
status: live
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/ship.rs#step_ship
  - crates/sailing/src/pose.rs#pose_of
  - crates/sailing/src/waters.rs#LandWaters
  - crates/sailing/src/waters.rs#steady_wind
  - crates/sailing/src/floats.rs#fingerprint
  - crates/land-wasm/src/sail.rs#sail_bytes
  - client/src/editor/sailing.ts#Sailing
  - client/src/ships/shipView.ts#ShipView
  - tools/ships/export_ship.py#main
---
# Sailing

How a ship sails: the helm from oars to sails, her way and turn, her sails against the wind, her pose on the swell
and where she takes the ground. It is DFO's port of Come Sail Away ([[Come Sail Away's Sailing Comes Over]]),
rebuilt in Rust ([[Pick - Sailing and Naval Combat]]). The owner sails the Sloop in the [[World Editor]].

## How it works

- **The laws.** The `sailing` crate holds Come Sail Away's handling and its sails' curves, under DFO's responsive
  helm. Her way under sail is her canvas (each sail at the crest of its curve) by the point of sail (0.9 running dead
  before the wind, 1 on the quarter, 0.55 in the wind's eye), in the sea's wind, a fifth again. Her rudder swings her
  at her steerage: 3 degrees a second at no way, 14 at 4.5 m/s.
- **The ladder.** W climbs a rung, S comes down one: oars astern, oars at rest, oars ahead, sails set. A and D steer;
  backing water, the helm answers the other way. Shift with A or D pulls her sideways on her oars.
- **A step.** Her swing and her way move toward what her rung asks, at the mod's rates under DFO's responsive helm.
  Struck, she coasts to a stop, faster for the share of her way her canvas made. She moves in her own frame, then
  swings, as the mod's boat did. Her heading stays in [0, 2π).
- **The wind.** One steady wind blows where the swell runs, at a ship's rated wind (1.5 m/s), until weather drives
  both.
- **Her pose.** She takes the mean of the water under her bow, stern, sides and middle as her height, and its slope
  along and across her as her pitch and roll. The swell replaces the mod's sine bob over a flat sea. She heels into a
  turn as the mod's boat did, once she makes a wake (0.5 m/s). On a lake or river she floats at its level.
- **The ground.** Her keel has three points: aft, amidships and forward. A point is aground where the water over the
  bed is shallower than her draught. A move that grounds a point afloat before is refused, and she loses her way. A
  point already aground may stay so, so oars astern take her off.
- **One crate, every machine.** The browser steps her through `land-wasm`'s door, over the open landmass, in ticks of
  1/60 s, a second's at most a request. Its maths is exact or `libm`'s, so a voyage's fingerprint is the same natively
  and as WebAssembly ([[Agree to the Bit]]). The door refuses numbers that are not a ship.

## The Sloop

The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig is hers: a small gaff sail and a small staysail.
Its handling is the mod's own, unscaled, and its gain (1.159) DFO's for that rig. Under sail on a beam reach she makes
2.4 m/s.

Her model is a `.blend`. `tools/ships/export_ship.py` turns it into Overlook's mesh: 20 bytes a vertex (position,
normal, colour), indices, and a header with her waterline. Her waterline is 0.4 m above the model's base, where her
beam nears its widest: 6.2 m long, 1.9 m across, her keel 0.6 m below it. Both the `.blend` and the mesh live on R2
under their hashes, named in `content/ships/ships.json` ([[Generated Files Stay Out of Git]]).

## In the World Editor

Sail (`B`) puts her to sea at the camera's target, heading where the camera looks; the rules refuse her where the
water is shallower than her draught. Each frame owes her its time in whole ticks (six at most, one request at a
time). The ships layer draws her into the land's pass, lit as the land is, so the water sees her ([[Water]]): none
inside her, foam at her bow, and her wake in the ripples.

## Limits

- One hull, the Sloop. Her cannons are not yet named for the exporter.
- The editor steps her; no room hosts a ship yet.
- No current, collisions with other hulls, cargo, crew, or naval combat yet.
