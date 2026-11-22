---
type: pick
area: Gameplay
verdict: Cut (the drop arc is named after Destiny's engrams)
effort: M
status: ported
source: project-final
source_paths:
  - src/game/loot.js
  - tools/loot-spritebake.mjs
  - rewrite/core/palette.js
  - rewrite/render/spriteFrame.js
source_commit: b0ac719 (main)
---
# Pick - project-final Drops

project-final's loot crystal and how its loot is thrown: a faceted gem in five tiers, baked into a turning sprite with
a halo, popped out of a body to bounce, settle and hover. The owner approved it for Vestiges and every drop
([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]]).

## What comes over

- **The crystal**: its faces (the waist of five facets, crown, pavilion and forty shards) and its bake (the lean, the
  light, five bands of shade, the darkened outline and the halo blurred from its silhouette), into twelve frames of a
  turn at 27 pixels for 0.7 m.
- **The drop's feel**: the pop and its spread, the pull, the share of speed and of way kept at each bounce, the speed
  it settles under, the rise to hover, the bob and the turn, for the crystal and for ammunition.
- **A turn's frame from its phase.**

## What stays behind

- The drop rolls, the pickup radius, the 30 s it lies, the weapon XP and the gear it opens to: Overlook's rules
  ([[Gear]], "Drops").
- The random scatter: the room chooses where a drop rests, and the flight is fitted to land there.
- The ammo bricks, the cache chest, the Bits shard and the Scraps hex, the WebGL billboards and the atlas files.
- The tiers' blue and purple: the owner's colours are white, green, yellow, red and cyan blue.
- The engram name.

## Our version

The crystal is baked in the page the first time a rarity is shown, so no picture is kept as a file
(`client/src/combat/vestigeCrystal.ts`), and drawn as the drops' marks are, its halo as added light. The motion is
worked out from the flight's arcs rather than stepped, so the same drop is in the same place on every frame
(`client/src/combat/drops.ts#motionAt`). See [[Gear]], "Drops".
