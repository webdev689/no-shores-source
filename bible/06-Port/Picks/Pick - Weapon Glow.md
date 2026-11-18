---
type: pick
area: Gameplay
verdict: Cut
effort: M
status: approved
dfo_paths:
  - src/systems/weaponGlow.js
  - src/systems/weaponGlowLooks.js
  - src/render/weaponGlowGlsl.js
  - src/render/renderer.js
dfo_commit: 1c0fd681
---
# Pick - Weapon Glow

DFO's weapon glow: an animated outline round a weapon's silhouette, hottest at its edge and cooling outward in hard
bands, with a light on the weapon's own edge, each element moving its own way. The owner asked for it to come over,
improved, for Overlook's three elements ([[Your Weapon Glows in Its Element]]); DFO's row on the [[Pick List]] was
marked Cut, and this is its approval.

## What comes over

- The outline field: each texel's distance from the weapon's pixels in its look's own measure, whether it is the
  weapon's edge, and whether the weapon lies below (for embers); worked out once a picture.
- The fire look for Blaze (tongues scrolled up, embers rising) and the shock look for Volt (arcs re-struck twelve
  times a second, a surge, a flickering rim), in Overlook's colours; the shading in hard bands and the rim.
- The 240 s clock on which every rate repeats whole.

## What stays behind

Frost, brand, edge, gilded and tide, which Overlook has no element for; arcane, whose even halo Cosmic replaces with a
swirl and star glints; the Morrowind mesh's rings and charge; the staff glow; the wire words that told peers of a
glow, since only the player's own weapon glows.
