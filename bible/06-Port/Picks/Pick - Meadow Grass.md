---
type: pick
area: Engine and World
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/assets/grass/source/
  - tools/bakeMeadow.mjs
  - src/render/meadowArt.js
  - src/render/grassMeadow.js
  - src/render/labGrass.js
dfo_commit: aee22261
---
# Pick - Meadow Grass

DFO's meadow: the grass style its settings called "hand-drawn tufts, flowers and bushes", the owner's five pixel
sprites stood up as crossed cards in DFO's grass field. The owner asked for it to come over
([[The Owner's Hand-Drawn Meadow Grows Over the Grass]]); its row on the [[Pick List - Engine and World]] was marked
Cut, and this is its approval.

## What comes over

- The owner's five sprites, every pixel as DFO baked them (checked pixel for pixel against DFO's `meadowArt.js`).
- Their atlas, two texels a tuft's pixel, and its chain of levels that keeps each sprite's share drawn, a kept block
  the mean of its drawn texels.
- Each sprite's drawn box, a card cut to it; three cards a tuft near and two far, turned the tuft's own way and fixed
  in the world, a mirrored card turned a half-turn rather than its picture flipped.
- The pick (shares by how lush a patch is, as DFO's tests pinned them), the sizes (a tuft's height law, each sprite's
  scale, a patch's), a tuft's standing lean and its share of the wind, a bush stiffer.
- The colour law: the owner's green moved by its ground to stand a shade lighter over it, the petals and dry stalks
  taking only its light, the far tufts giving way to the ground's colour.
- The density, about two and a quarter tufts a square metre, a far cell holding fewer.

## What stays behind

- The grass field's Daggerfall seams: the ground tiles and climate records it read for where grass grows, the road
  painter's mask, World of Daggerfall's sites, the seasons. No Shores grows the meadow where its own land draws grass.
- The Pixel and Smooth styles and the setting's row; GL's provoking-vertex work; the Bayer discard, which the plants'
  sample fade replaces; the 300 m reach, as No Shores draws its grass to 160 m.
- The PNGs themselves, which stay out of git; `tools/meadow/write.py` writes them into the client.

## Our version

The meadow in the nature layer, drawn with WebGPU after the plants: [[Meadow]].
