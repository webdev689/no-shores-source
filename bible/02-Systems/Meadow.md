---
type: system
status: live
code:
  - client/src/nature/meadowArt.ts#MEADOW_SPRITES
  - client/src/nature/meadowAtlas.ts#meadowLevels
  - client/src/nature/meadowLaw.ts#pick
  - client/src/nature/meadowLaw.ts#texelOver
  - client/src/nature/meadowField.ts#MeadowField
  - client/src/nature/meadowField.ts#grassShare
  - client/src/nature/meadowShader.ts#MEADOW_SHADER
  - client/src/nature/meadowView.ts#MeadowView
  - tools/meadow/write.py#sprite
---
# Meadow

The owner's handcrafted grass over the land: a tall tuft, the same tuft cut short, a tuft of flowers, a dry tuft and a
bush, five pixel sprites DFO keeps as the owner's ([[Pick - Meadow Grass]],
[[The Owner's Handcrafted Meadow Grows Over the Grass]]), stood up as crossed cards round the eye. It grows beside the
[[Nature]] layer's plants and is drawn after them, in the land's pass.

## The sprites

`tools/meadow/write.py <dir>` writes the owner's PNGs (DFO keeps them in `src/assets/grass/source/`) into
`client/src/nature/meadowArt.ts` as pixel pictures, their colours exactly as drawn, a pixel drawn or not and none
between; the PNGs stay out of git. Each sprite's drawn box, the least rectangle holding its pixels, is what its card is
cut to, so no pixel is shaded where the sprite draws nothing.

The atlas lays the five side by side in cells of 64 texels, the 32-pixel tufts at two texels a pixel and the bush at
one, each foot on its cell's bottom, three cells of air after them. Its chain of levels halves to a texel, and keeps
each sprite's share of its cell drawn at every level: the blocks kept are those of the most drawn texels, a kept block
the mean of its drawn texels, so a far tuft of flowers is as sparse as a near one and air never darkens an edge. The
second level is the owner's tufts again, texel for texel. A tuft reads one texel of one level, nearest, by how fast
its card's height runs across the pixel.

## Where it grows

The land is cut into cells 16 m square, kept while within 160 m of the eye (and 24 m past, so a step back reads none
again), read nearest first, 3 ms of them a frame. A cell reads a grid of 9 by 9 points of the plants' own ground:
its height, and how much of it is grass (`grassShare`), as the land draws its grass: none on water, a road, a town or
what the caller keeps clear (the cities' and layouts' solids and yards); less as stone shows through a slope from 0.3
to 0.45, as the highland's dirt comes in from 200 m to 1600 m, under the snow line, and on the beach along the coast.
A landmass whose biome's low ground is not grass (the desert, the tundra) grows none. Where the ground changes (a new
close patch), the cells over the plants' changed tiles are read again, their old grids drawn until their turn.

## The tufts

A cell holds 576 tufts where all of it is grass, about two and a quarter a square metre, drawn by the GPU from its grid
alone. Each tuft's draws are a hash of its cell and its number, so a cell grows the same meadow whenever it comes back:

- where it stands in the cell, a little clustered, and whether it grows there (its grass share);
- its height, 0.25 m to 0.72 m, and how lush its patch is: its own tint pulled a little over half way to noise over the cells at
  about 16 m and 64 m, so whole patches run lush or poor;
- its sprite: of each 256 draws, a poor patch grows 72 tall tufts, 118 short, 2 flowering, 61 dry and 3 bushes, a lush
  one 147, 63, 35, 5 and 6 (`pick`);
- its card's side: its height times its sprite's scale (4/3 a tuft, 2.25 the bush) and its patch's (0.8 poor to 1.25
  lush);
- its turn, a mirror, and its standing lean, a bush keeping a third of it.

Near, a tuft is three cards 60° apart; past 0.3 of the reach two, each tuft letting its third go at its own distance
over the band before. Its foot follows the slope, each corner as high as the ground under it. It sways in the
plants' wind, gusts rolling downwind across the land, a bush six tenths as far.

## Its colour and light

The owner's green is lighter and bluer than a grass ground, so each texel is moved by its ground: the biome's low
ground over the ground the tall tuft's green would stand a shade lighter over, held between 0.5 and 1.6. A texel takes
that ratio's hue as far as it is green and only its light where it is not, so the green becomes the ground's own and
the petals and dry stalks keep their colours (`texelOver`). A patch's tint lightens or darkens it in four bands, and
from 0.12 of the reach to 0.6 it gives way to the ground's colour. It is lit as the plants are (the sky, the sun
through the shadow map, the lamps, rain), its foot shaded, and each card's face takes a low sun whole when turned to it
and half when turned away.

## Drawing

Cells in view are drawn nearest first, a draw a cell, its tufts thinned toward the reach: from 88 m a cell draws a
falling share of its tufts, the last of them fading out by the samples of the pixel as the plants fade. The shader
draws a tuft it does not grow, or one past its share, nowhere.

## Limits

- Not on an island's ground, which no grid can read yet, the Test Ground or a dungeon.
- No setting turns it down or off: the Graphics tab holds the resolution alone.
- Its cost on a real GPU is unmeasured (some 180,000 tufts within the reach on open grass).
- The baked grass of [[Flora]] grows on beside it.
