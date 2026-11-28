---
type: pick
area: Gameplay
verdict: Cut and Can't, brought over by the owner's choice
effort: M
status: ported
dfo_paths:
  - src/systems/naval/shipWatch.js
  - src/scenes/naval/navalHost.js
  - src/render/navalRender.js
  - src/systems/naval/navalAI.js
  - src/systems/comeSailAway/comeSailAwayBoat.js
  - src/scenes/comeSailAway/comeSailAwayPool.js
  - src/world/ships/galleonModel.js
  - src/world/ships/carrackModel.js
  - src/world/ships/largeBoatModel.js
dfo_commit: 06b2b991
---
# Pick - Ships' Lanterns

DFO's ships showed their lanterns at night: near ones lit the deck and the water round them (its port of Come Sail
Away's lanterns), far ones were warm points across the water, and a lit ship was seen far while a dark one was seen
only close. The owner asked for it to come over, Come Sail Away's port with it, as an exception to [[Own Work]]
([[Ships' Lanterns Come Over From DFO]]).

## What comes over

- Where the lanterns hang: on poles at the quarters' rails, at the taffrail, by the cabin's door.
- A near lantern's light (its warm colour, its 20 m reach), among the nearest lamps, and off past 51.5 m from the eye
  along the water.
- The far lamps: up to four of a ship's lanterns (the first, the last and spread between), their size from the
  distance, fading in from 45 m over 45 m, in their warm colour, added over the picture.
- Which ships run dark: the Grey Tithe's, and a friendly ship running from an attack.
- Night sight: a lit ship seen to 650 m, a dark one to 220 m, never farther than by day, by every captain's lookout
  and by the player's.
- The cases DFO's tests pinned (`shipwatch.test.js`, the pool's and the boats' lights), as our own tests.

## What stays behind

The lantern's picture DFO read from Daggerfall's files, and the mod's prefabs it hung them on: the lanterns are drawn
on our own hulls. The crew's night watch and the lookout's cry, and DFO's struck pirate showing her lanterns, which the
decision does not ask for. A lantern lit by a
ship's guns firing. The stern windows lit with the lanterns: our hulls' windows are not told apart in their meshes.

## Our version

[[Hulls]] (where each hull's lanterns hang), [[Sailing]] (which ships show them), [[Naval Combat]] (night sight) and
[[Sky]] (their light at night).
