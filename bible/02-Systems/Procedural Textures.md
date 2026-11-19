---
type: system
status: live
code:
  - client/src/textures/picture.ts#paintPicture
  - client/src/textures/picture.ts#pictureUses
  - client/src/textures/catalog.ts#pictureSize
  - client/src/textures/climate.ts#climateArchive
  - client/src/textures/palette.ts#PALETTE_RGB
  - client/src/textures/portableMath.ts#pow
  - client/src/textures/finish.ts#finish
  - client/src/textures/render.ts#render
  - client/src/textures/recipes/walls.ts#paintWall
  - client/src/textures/recipes/rooms.ts#paintRoom
  - client/src/textures/recipes/things.ts#paintThing
  - client/src/textures/recipes/ground.ts#paintTerrain
  - client/src/textures/shipPictures.ts#shipPictures
  - content/forged/buildings.json
---
# Procedural Textures

DFO Online's procedural textures, brought over whole ([[Pick - Procedural Textures]],
[[Every Island Is Seen Whole and Reached by Nodes]]). They paint every picture the forged buildings, props and room kit
wear, and the ground's twelve tile sets, in code. The pictures are filed as Daggerfall files its textures, by archive
and record, at Daggerfall's sizes and in its palette, so every model's mapping holds. No texture file is read.

## The public calls

- `paintPicture(archive, record, frame, uses)` answers a picture, or null where nothing is painted: `width`, `height`,
  `rgba` (the top row first, every texel opaque) and `glass` (1 a texel for a window's panes, top row first too, or
  null for a picture with no window).
- `pictureUses({ buildings, props, roomkit })` reads the forged tables in `content/forged/` into what each picture is
  named for (`wall`, `roof`, `window`, `door`, `floor`, `ceiling`, `slope`, `prop`, `cloth`), carried to every
  climate's and season's turn of it. Within an archive that holds many kinds, the use chooses what is painted.
  `pictureArchives(uses)` lists the archives those uses name.
- `shipPictures()` answers the five pictures a ship's parts wear ([[Sailing]]): hull and deck from the ship archive,
  spar, canvas and iron painted on the same surface and finish.
- `pictureSize(archive, record)` gives a record's size and frames from the catalog; `climateArchive` moves an
  archive to a climate (desert, mountain, temperate, swamp) and season (summer, winter, rain); `PALETTE_RGB` holds
  the 256 colours.

## How a picture is painted

A recipe paints a surface at two sub-texels a texel side: each place a material, a tone and a relief. Walls and
rooms are families written as a few words per set (a face, a frame, corner stones, bands, a window); roofs, doors,
dungeons and the archives that stand alone paint by their kind; the ground mixes four classes where they meet by its
climate's rules. A winter set is its summer one with snow, finished alike, so the two differ only where the snow lies.
An animated record's frames share one seed, so only the part that moves, a hearth's fire, changes.

The finish lights the surface from the top left with cast shadows, darkens hollows, ranks each material's places by
tone over its palette shades, and averages each texel's sub-texels to the nearest shade. A picture's seed is its
archive and record.

## Same bytes everywhere

The maths is IEEE arithmetic only. Sine, cosine, exp, log, atan2, pow and hypot are written out (`portableMath.ts`)
as V8 computes them, since ECMAScript lets each engine round its own. The pictures are the bytes DFO Online's own
painter gives: the tests pin 78 of them.

## Limits

- Painting is on the thread that asks: about 20 ms for a 64 by 64 wall, 30 ms for a 64 by 128 one and 40 ms for a
  ground tile, warm, in Node. There is no cache and no worker yet; a renderer should paint on demand and keep what
  it painted.
- Pictures are fully opaque; the glass mask is the only extra layer. Nothing here uploads to the GPU.
- Two painters do not wrap at the edge, so their pictures show a seam when repeated: the ploughed field (ground
  record 54), whose furrows are 6 or 7 texels apart, and the diagonal and crossed board floors, 9 texels a board.
- A sine or cosine of more than 2^19 times pi/2 falls back to the engine's own; no recipe comes near one.
- An archive no recipe knows, such as the creature sprites, paints nothing, nor does a frame past a record's own.
