---
type: pick
area: Gameplay
verdict: Clean trees and navmesh; Cut perception, firing positions and director
effort: L
status: approved
source: project-final
source_paths:
  - src/game/enemy.js
  - src/game/enemyShared.js
  - src/game/behaviorTree.js
  - src/game/enemyMelee.js
  - src/game/enemyRanged.js
  - src/game/firingPositions.js
  - src/game/director.js
  - src/game/navmesh.js
  - test/game/behaviorTree.test.js
  - test/game/enemyLkp.test.js
  - test/game/firingPositions.test.js
  - test/game/director.test.js
source_commit: b0ac719 (main)
---
# Pick - project-final AI

project-final's combat brain above its navmesh: what a foe believes, where it stands, how it flanks, and how hard the
fight presses. The owner approved it on top of DFO's Enhanced AI ([[project-final's AI Comes Over Onto DFO's]]).

## What comes over

- **Perception**: awareness that rises with sight and hearing and bleeds away; the last place a target was seen, and
  the search there; a newly alerted foe waking idle allies within 12 m.
- **Firing positions**: cover and open firing lanes worked out from the navmesh at bake time, with no hand placement,
  and the scoring that picks a spot against where a foe believes its target is.
- **Flanking**: the ranged and melee trees' choice to flank, take cover or press.
- **The combat director**: one heat meter, rising as the player deals damage and kills and falling as they are hurt,
  that loosens or tightens the attack caps and the foes' aggression.
- **The ground heightfield**: the navmesh bake's `ground` input, a terrain's height at any point, with a floor below 0
  for the seabed.

## What stays behind

- project-final's navmesh itself: the game's is DFO's port of it, with DFO's fixes ([[Navmesh]]).
- Its attack tokens: DFO's board of turns already holds them ([[Foes]]).
- Halo's and Bungie's names in its comments and notes, and the crystal faction's bodies, whose coming is still open
  ([[Enemy Factions Start With the Grey Tithe]]).

## Our version

[[Foes]] and [[Navmesh]], as each part is built.
