---
type: pick
area: Gameplay
verdict: Cut (the drop arc is named after Destiny's engrams)
effort: M
status: ported
source: project-final
source_paths:
  - src/main.js
  - src/game/loot.js
  - tools/loot-spritebake.mjs
  - rewrite/core/palette.js
  - rewrite/render/spriteFrame.js
source_commit: b0ac719 (main)
---
# Pick - project-final Drops

project-final's loot crystal and how its loot is thrown: a faceted gem in five tiers, baked into a turning sprite with
a halo, popped out of a body to bounce, settle and hover. The owner approved it for Vestiges and every drop
([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]]), and its cache's pour for every chest's
Vestige ([[Every Chest Is DFO's Chest, and Its Vestige Pours Out as project-final's Cache Pours]]).

## What comes over

- **The crystal**: its faces (the waist of five facets, crown, pavilion and forty shards) and its bake (the lean, the
  light, five bands of shade, the darkened outline and the halo blurred from its silhouette), into twelve frames of a
  turn at 27 pixels for 0.7 m.
- **The drop's feel**: the pop and its spread, the pull, the share of speed and of way kept at each bounce, the speed
  it settles under, the rise to hover, the bob and the turn, for the crystal and for ammunition.
- **A turn's frame from its phase.**
- **The cache's pour**: its loot thrown up out of its mouth 0.22 s after the lid begins to open, from 0.65 m over its
  foot, its pop 6.2 m/s and as much as 1.4 more (`CHEST_POP`, `CHEST_POP_DELAY`).

## What stays behind

- The drop rolls, the pickup radius, the 30 s it lies, the weapon XP and the gear it opens to: the game's rules
  ([[Gear]], "Drops").
- The random scatter: the room chooses where a drop rests, and the flight is fitted to land there.
- The ammo bricks, the cache chest's model (the chests are DFO's, [[Pick - Chest]]), the Bits shard and the Scraps hex,
  the WebGL billboards and the atlas files.
- The cache's own loot (a crystal always, a second by chance, Bits and ammunition) and its ring round the chest and its
  scatter: a chest pays as the game's rules say, and its Vestige is fanned toward its opener as a kill's is.
- The tiers' blue and purple: the owner's colours are white, green, yellow, red and cyan blue, taken from the
  rarities. Legendary's red is `#fa5e5a`, a little lighter than project-final's `#f04442`, so its name reads at 4.5:1
  on the kit's presses.
- The smooth glow over the gem: it and the halo are both cut into 8 steps, so a frame keeps to a few dozen colours,
  and colours are rounded where project-final truncates them.
- The halo blended over what stands behind: it is added light, as the line is.
- Taking a drop at any time: a drop is taken only once it can have settled, a Vestige after 94 ticks and ammunition
  after 60, the longest each bounces.
- The heights as they were: a drop leaves and bounces a little higher, so no frame dips into the ground.
- The engram name.

## Our version

The crystal is baked in the page a frame at a time, the first time its turn reaches each, so no picture is kept as a
file and no frame waits on a whole turn (`client/src/combat/vestigeCrystal.ts`). It is drawn as the drops' marks are,
laid flat in one plane since its colours are many, its halo as added light. Thrown up to a spot over the body, a drop
pops at least high enough to land there. The motion is worked out from the flight's arcs rather than stepped, so the
same drop is in the same place on every frame (`client/src/combat/drops.ts#motionAt`). A Vestige poured out of a chest
waits unseen in it while its lid opens its mouth, then leaves from the mouth with the pour's higher pop
(`POURED_FEEL`), the room waiting for that before it can be taken (`POURED_REST_TICKS`). See [[Gear]], "Drops".
