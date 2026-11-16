---
type: pick
area: Engine and World, Gameplay
verdict: Clean navmesh; Cut tactics, blows and motor
effort: L
status: approved
dfo_paths:
  - src/ai/nav/navmesh.js
  - src/ai/nav/navBake.js
  - src/ai/triRaster.js
  - src/ai/tactics.js
  - src/ai/tacticsClock.js
  - src/ai/tells.js
  - src/ai/foeBlows.js
  - src/ai/blowShapes.js
  - src/ai/cover.js
  - src/ai/enhancedMotor.js
  - src/characters/foeSpacing.js
  - src/render/foeTelegraph.js
  - src/player/lockOn.js
dfo_commit: 1c0fd681b5 (main)
---
# Pick - Enhanced AI

DFO's Enhanced AI: the navmesh foes route on, the tactics brain that shares a target between them in turns and
holds a ring around it, and TELL's telegraphed blows with poise and the stagger. The owner approved it: "port our
enhanced ai from dfo as it handles enemies and build upon it to utilize the new features"
([[Combat Is Soulframe's, With DFO's Enhanced AI]]).

## What comes over

- The navmesh, the owner's own: the heightfield, its regions, contours and polygons, the route search and the funnel,
  rebuilt in Rust and baked from the course's blocks.
- The brain's tactics: senses, the melee and ranged turns, the ring, backing off, fleeing, kiting, walking only the
  way a foe faces, and foes kept apart. Rebuilt in Rust, foes moving by the [[Movement]] rules as players do.
- TELL: the telegraphed blows' shapes, wind-ups, iron blows, the punish, perfect dodges, feints, chains and poise,
  rebuilt in Rust in [[Combat]] and [[Foes]]; the ground's mark as a WebGPU pass.
- The mobile lock-on's chest point and its letting go, folded into the soft lock ([[Combat]]).

## What stays behind

- DFU's enemy motor, which the brain stood on, and every table it read: the enemy, mobile and class tables, skills and
  weapon templates. Foes stand on Overlook's own kinds and the [[Movement]] rules.
- Cover by billboards: Overlook has none yet; the course's blocks stop sight and shots.
- Revenants (RVN), the anti-grief rules for doorways and pools, and the switch back to DFU's classic motor.

## Our version

[[Combat]] and [[Foes]].
