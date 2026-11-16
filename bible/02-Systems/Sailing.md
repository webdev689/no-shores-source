---
type: system
status: planned
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/ship.rs#step_ship
  - crates/sailing/src/pose.rs#pose_of
  - crates/sailing/src/waters.rs#LandWaters
  - crates/sailing/src/floats.rs#fingerprint
---
# Sailing

How a ship sails: the helm from oars to sails, her way and turn, her sails against the wind, her pose on the swell
and where she takes the ground. It is DFO's port of Come Sail Away ([[Come Sail Away's Sailing Comes Over]]),
rebuilt in Rust ([[Pick - Sailing and Naval Combat]]).

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
- **Her pose.** She takes the mean of the water under her bow, stern, sides and middle as her height, and its slope
  along and across her as her pitch and roll. The swell replaces the mod's sine bob over a flat sea. She heels into a
  turn as the mod's boat did, once she makes a wake (0.5 m/s).
- **The ground.** Her keel has three points: aft, amidships and forward. A point is aground where the water over the
  bed is shallower than her draught. A move that grounds a point afloat before is refused, and she loses her way. A
  point already aground may stay so, so oars astern take her off.
- **The Sloop.** The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig is hers: a small gaff sail and
  a small staysail.

## Limits

- One hull, the Sloop.
