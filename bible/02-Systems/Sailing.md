---
type: system
status: live
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/ship.rs#step_ship
  - crates/sailing/src/ship.rs#step_pulled
  - crates/sailing/src/pose.rs#pose_of
  - crates/sailing/src/waters.rs#LandWaters
  - crates/sailing/src/waters.rs#steady_wind
  - crates/sailing/src/waters.rs#OpenSea
  - crates/land/src/exact.rs#fingerprint
  - crates/land-wasm/src/sail.rs#sail_bytes
  - client/src/editor/afloat.ts#Afloat
  - client/src/editor/sailing.ts#Sailing
  - client/src/editor/harbour.ts#Harbour
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
  before the wind, 1 on the quarter, 0.55 in the wind's eye), in the sea's wind, a fifth again. Under sail her rudder
  swings her at her steerage, read at her way over her rig's gain: 3 degrees a second at no way, about 12 at her best
  way in the steady wind. On her oars she swings at 20.
- **The ladder.** W climbs a rung, S comes down one: oars astern, oars at rest, oars ahead, sails set. A and D steer;
  backing water, the helm answers the other way. Shift with A or D pulls her sideways on her oars.
- **A step.** Her swing and her way move toward what her rung asks, at the mod's rates under DFO's responsive helm.
  With her sails struck and her oars at rest, she coasts to a stop, faster for the share of her way her canvas made.
  She moves in her own frame, then swings, as the mod's boat did. Her heading stays in [0, 2π).
- **The wind.** One steady wind blows where the swell runs, at a ship's rated wind (1.5 m/s), until weather drives
  both.
- **Her pose.** She takes the mean of the water under her bow, stern, sides and middle as her height, and its slope
  along and across her as her pitch and roll. The swell replaces the mod's sine bob over a flat sea. She heels into a
  turn as the mod's boat did, once she makes a wake (0.5 m/s). On a lake or river she floats at its level.
- **Her hurts.** A ship's damage holds back the way her sails and her oars may ask ([[Naval Combat]]): bare poles
  leave her 35% of it, and a wreck's oars pull 35%. A sound ship's step is unchanged.
- **The ground.** Her keel has three points: aft, amidships and forward. A point is aground where the water over the
  bed is shallower than her draught. A step grounds her if it puts a point aground that was afloat, or carries one
  already aground onto higher ground. Then she runs on unswung if only her swing grounds her, or swings clear if only
  her way does, as the mod refused only what ran into what she touched; else she is held and loses her way. Oars
  astern take her off a shore. Within a hand of her draught she touches, and the panel says so.
- **The open sea.** A fleet room's waters ([[Server]]): deep water everywhere under the world's swell, and no land.
  The swell rolls whole over any sea 15 m deep or more, so wherever a landmass's sea is that deep, its water is the
  open sea's to the bit.
- **One crate, every machine.** The browser steps her through `land-wasm`'s door, over the open landmass, in ticks of
  1/60 s, a second's at most a request. Its maths is exact or `libm`'s, so a voyage's fingerprint is the same natively
  and as WebAssembly ([[Agree to the Bit]]). The door refuses numbers no ship could have: a way over 10 m/s, a swing
  over 45 degrees a second, a time past the world's.

## The Sloop

The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig is hers: a small gaff sail and a small staysail.
Its handling is the mod's own, unscaled, and its gain (1.159) DFO's for that rig. Under sail on a beam reach she makes
2.4 m/s.

Her model is a `.blend`. `tools/ships/export_ship.py` turns what Blender would render into Overlook's mesh: a header
with her waterline, 20 bytes a vertex (position, normal, colour) and the corners' indices. Her frame is x to her
bow, y to starboard and z up, mirrored from the model's as the world (east, south, up) is, so each face keeps the
model's corner order and reaches the screen counter-clockwise, as the land's and the water's do. The export refuses a
model whose faces are not wound outward. Her waterline is 0.4 m above the model's z = 0, where her beam nears its
widest ([[The Sloop's Trim]]): 6.2 m long, 1.9 m across, her keel 0.6 m below it. The mesh lives on R2 under its hash
([[Generated Files Stay Out of Git]]); its key and her waterline are in `content/ships/ships.json`, and a test holds
the rules' Sloop to that waterline. Her `.blend` is on R2 beside it ([[Ship Models Live on R2]]). Her
cannons are the objects named `Cannon` in it, three a side, fore to aft: the export reads each one's mouth and bore,
and the boxes a ball can strike (her hull, and each sail's canvas), into `ships.json` for [[Naval Combat]].

## In the World Editor

Sail (`B`) puts her to sea at the camera's target, heading where the camera looks; the rules refuse her where the
water is shallower than her draught, and the camera stands back off. Each frame owes her its time in whole ticks, one
request at a time; time spent waiting on the land worker is caught up, a second at most. The ships layer draws her
into the land's pass, lit as the land is, so the water sees her ([[Water]]): none inside her, foam at her bow, and her
wake in the ripples. Picking another landmass brings her in.

With `?room=` in the editor's address, Sail joins a fleet room on the [[Server]] instead, from open water 15 m deep
or more: the room steps her by her orders, a tick at a time, and the browser predicts her by the same rules through
`room-wasm`, correcting her by each snapshot. The water then rolls by the room's clock, so every ship the room shows
rides the wave drawn under her ([[Naval Combat]]).

## Limits

- One hull, the Sloop.
- Alone, the editor steps her; in a fleet room the [[Server]] does, on the open sea, which has no coast or shallows.
- No current, cargo or crew yet. Hulls are kept apart only in a fight ([[Naval Combat]]), as every fleet room is.
- She waits while the land worker makes a close-up (about every 400 m), then catches up.
