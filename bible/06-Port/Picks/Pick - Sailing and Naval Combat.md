---
type: pick
area: Gameplay Systems
verdict: Clean, Cut and Can't, brought over by the owner's choices
effort: L
status: approved
dfo_paths:
  - src/systems/comeSailAway/
  - src/scenes/comeSailAway/
  - src/systems/helmWay.js
  - src/systems/seaHelm.js
  - src/systems/naval/
  - src/world/ships/ownBoats/
  - src/systems/naval/navalDirector.js
  - src/world/ships/galleonRig.js
  - src/world/ships/largeBoatRig.js
dfo_commit: ce0bb33c20 (main); fc2a8e63d1 (ccr-aff93cb4-gw1nto-audit) for ownBoats and sailAssist
---
# Pick - Sailing and Naval Combat

DFO's sailing (its port of Come Sail Away, [[Come Sail Away's Sailing Comes Over]]) and its naval combat
([[Naval, Living World, Professions and Synth Come Over Leaner]]), adapted to Overlook.

## What comes over

- **The helm**: way and turn with their easing, the handling each hull and its cargo give, the sails' power against the
  wind for each rig, beaching and collisions. DFO's own helm feel, peace way, laden rest and sail assist with it.
- **The boats**: DFO's own hulls (`ownBoats`), built in code, with their rigs and moving parts.
- **The sails**: DFO's animated canvas (its rigs' poses, Come Sail Away's sail wind and trim), on the owner's
  Sloop's own sails ([[Sailing]]).
- **Naval combat**: ballistics, shots and shot kinds, damage, gunnery, ramming, boarding and the captains' AI. Their
  effects and sounds are drawn in the browser.
- **Pirates at sea**: DFO's director, trimmed to pirates alone
  ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]): they come over the horizon round a player on the
  [[Overworld]] and go once far off, and an encounter pans the view down to the fight.

## How it is adapted

- What decides is rebuilt in Rust, stepped in the room's ticks and agreeing to the bit ([[Agree to the Bit]]); DFO let
  each shooter's browser decide its hits.
- A hull rides the [[Water]]'s swell: its height, pitch and roll from the swell under its bow, stern and beam, in place
  of the mod's sine bob over a flat sea.
- It grounds on the [[Land]]: the ground's depth under its hull against its draft, in place of Daggerfall's tile map.
- Wind: one steady wind along the swell's bearing, until weather drives both.
- The water parts round a hull: no water inside it, a wake and bow spray (ripples and foam).

## What stays behind

- Daggerfall's data the mod and DFO read: map pixels for the wind and the ports, the terrain tile map, its textures,
  sounds and lore names, and DFU's crimes and loot tables.

## Order

1. Sailing on the swell: one hull, boarded and sailed in the World Editor's 3D view. Built: [[Sailing]], with the
   owner's Sloop.
2. The naval combat core: broadsides between the player's hull and one captain. Built: [[Naval Combat]], a pirate
   captain on a second Sloop.
3. Boarding, ramming, crew, quays and ports.
4. Pirates on the Overworld, and the pan to combat when one comes for the player.
