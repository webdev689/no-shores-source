---
type: pick
area: Gameplay
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/scenes/spoilsPool.js
  - src/render/spoilsGlow.js
  - src/scenes/lootLines.js
  - src/world/gate/gateSpew.js
dfo_commit: 1c0fd681
---
# Pick - Loot Drops

DFO's visible spoils: each piece thrown out of a body, bouncing to rest, then lying as its own picture with a thin
line of its rarity's colour rising from it, taller the rarer it is, a glint climbing the line, the rarest pulsing.
The owner asked for "Visible loot drops (see DFO)" ([[Loot Drops Are Seen, and Ranged Weapons Carry Ammo]]); DFO's rows
on the [[Pick List]] were marked Cut and Clean, and this is their approval.

## What comes over

- The flight: pieces fanned out from the body, bouncing once or twice, coming to rest.
- The look: the piece's own picture standing on the ground, the rarity line rising from it by its rarity's height,
  the glint and the pulse; the line rising as the piece comes to rest.
- The chime at rest for a rare piece.

## What stays behind

Physical Items (demifiend000's mod), the clatter from the Handheld Torches mod, Daggerfall's sounds and loot tables,
the quick-loot list and the press to take: Overlook's drops are taken by walking over them, as its Vestiges already
are.
