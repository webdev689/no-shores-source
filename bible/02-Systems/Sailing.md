---
type: system
status: planned
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
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
- **The Sloop.** The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig is hers: a small gaff sail and
  a small staysail.

## Limits

- One hull, the Sloop.
