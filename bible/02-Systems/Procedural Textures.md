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
  - client/src/textures/recipes/dungeons.ts#paintDungeon
  - client/src/textures/recipes/dungeonRock.ts#paintDungeonRock
  - client/src/textures/recipes/dressing.ts#paintDressing
  - client/src/textures/rock.ts#hewn
  - client/src/textures/recipes/ground.ts#paintTerrain
  - client/src/textures/shipPictures.ts#shipPictures
  - client/src/ships/flagPictures.ts#flagPictures
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
  spar, canvas and iron painted on the same surface and finish. `flagPictures()` answers a flag a side (a player's, a
  friendly ship's, the Grey Tithe's and the pirates'), 64 texels square: the side's ground over a faint weave, and
  the faction's emblem the plates show in its middle, two texels a pixel across and three down, so it stands square
  on a flag half again as long as it is deep.
- `pictureSize(archive, record)` gives a record's size and frames from the catalog; `climateArchive` moves an
  archive to a climate (desert, mountain, temperate, swamp) and season (summer, winter, rain); `PALETTE_RGB` holds
  the 256 colours; `DRESSING_ARCHIVE` names the dressing in the desert's numbering.

## How a picture is painted

A recipe paints a surface at two sub-texels a texel side: each place a material, a tone and a relief. Walls and
rooms are families written as a few words per set (a face, a frame, corner stones, bands, a window); roofs, doors,
dungeons and the archives that stand alone paint by their kind; the ground mixes four classes where they meet by its
climate's rules. A winter set is its summer one with snow, finished alike, so the two differ only where the snow lies.
An animated record's frames share one seed, so only the part that moves, a hearth's fire, changes.

The finish lights the surface from the top left with cast shadows, darkens hollows, ranks each material's places by
tone over its palette shades, and averages each texel's sub-texels to the nearest shade. A picture's seed is its
archive and record.

## The dungeons' sets

The painter paints five dungeon sets in each climate, each with the same five records: two wall strips, a floor, a
ceiling and a trim. Sets 22, 23 and 24 are masonry: rubble and brick walls, flagstones, framed slabs and cobbles.

- **Set 19, the mines**: rock hewn by picks, its chip scars and pick marks lit. One wall has a squared timber post
  spiked to the rock, the other is plain rock. The floor is packed earth with gravel and a few stones. The ceiling
  is lagging boards under a cap beam, with rock showing where boards are missing. The trim is a beam with iron nails
  and an iron strap.
- **Set 20, the caverns**: natural rock. One wall is layered beds, the other the same beds broken into tilted
  planes along fractures; both have a mineral vein and damp streaks. The floor is worn rock, sand and pebbles. The
  ceiling is rough rock with stalactite stubs along a crack. The trim is a rounded rock ledge.

Each climate has its own stone, as for the other sets: sandstone and grey timber in the desert, grey stone and dark
timber in the mountains, warm rubble and brown timber in temperate lands, green and dark stone in the swamp. The
caverns' veins are red in the desert, white in the mountains, rust in temperate lands and teal in the swamp, and
only the swamp's streaks run with slime.

Set 21, the dressing, is what the dungeons' built pieces wear: six pictures 64 by 64, as dense as a dungeon floor.
Record 0 is bones and skulls heaped over dark gaps, ivory to yellowed. Record 1 is carved stone: a band of runes between
two fillets over a panel of knotwork. Record 2 is a plain weave with an undyed border stripe, faded in patches and
frayed. Record 3 is rope, its strands laid on the diagonal. Record 4 is dark hewn rock with black coal seams and glints
of ore. Record 5 is hammered gilt brass, tarnished in the hollows. Each climate carves its own stone and holds the
caverns' vein as its ore. The cloth takes a dye of its land that stands off its stone: indigo in the desert, madder red
in the mountains, weld green in temperate lands, lichen purple in the swamp.

Daggerfall's archives 121 and 321 are arches, so Overlook files its own sets 1000 further on. The dressing is 1021 in
the desert, 1121 in the mountains, 1321 in temperate lands and 1421 in the swamp, and `climateArchive` turns it as it
turns a dungeon set.

## Same bytes everywhere

The maths is IEEE arithmetic only. Sine, cosine, exp, log, atan2, pow and hypot are written out (`portableMath.ts`)
as V8 computes them, since ECMAScript lets each engine round its own. The pictures DFO Online also paints are the
bytes its own painter gives: the tests pin 78 of them. The mines, the caverns and the dressing are Overlook's own: the
tests pin all 64 of their pictures.

## Limits

- Painting is on the thread that asks: about 20 ms for a 64 by 64 wall, 30 ms for a 64 by 128 one and 40 ms for a
  ground tile, warm, in Node. There is no cache and no worker yet; a renderer should paint on demand and keep what
  it painted.
- Pictures are fully opaque; the glass mask is the only extra layer. Nothing here uploads to the GPU.
- Two painters do not wrap at the edge, so their pictures show a seam when repeated: the ploughed field (ground
  record 54), whose furrows are 6 or 7 texels apart, and the diagonal and crossed board floors, 9 texels a board.
- A sine or cosine of more than 2^19 times pi/2 falls back to the engine's own; no recipe comes near one.
- An archive no recipe knows, such as the creature sprites, paints nothing, nor does a frame past a record's own.
