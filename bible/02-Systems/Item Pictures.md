---
type: system
status: live
code:
  - tools/item-pictures/models.py#RESOURCES
  - tools/item-pictures/scene.py#look
  - tools/item-pictures/pixels.py#glyph
  - tools/item-pictures/write.py#ammunition_file
  - client/src/combat/resourcePictures.ts
  - client/src/combat/ammoBoxPictures.ts
  - client/src/combat/ammoCratePictures.ts
  - client/src/game/shipGlyphs.ts
---
# Item Pictures

The pictures of the items that are things rather than signs: each island's resource, the Ammo box and crate, and the
ship's materials and modules. Each is a model built in Blender and baked to a pixel glyph
([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]]). The signs are drawn by hand in code:
currencies, elements, statuses, nodes, the Arts' emblems and the officers' posts. A Vestige is its crystal, baked in
the page ([[Gear]], "Drops").

## How it works

- **The models** (`models.py`): each item is a few shapes (boxes, spheres, rods, rings, and a loft for the hull and
  the sail) in the colours its hand-drawn glyph had. With each comes its view: how far round, how high up, and how far
  it is rolled on the view, so a long, thin one lies on the diagonal.
- **The render** (`scene.py`): Cycles on the CPU at 24 samples, under a grey sky and a sun from the camera's upper
  left, as the kit's bevels are lit. The orthographic camera is fitted round the model with a cell spare all round,
  and ammunition's is fitted to its whole turn, so it holds its size as it turns. A cell is 8 by 8 render pixels.
- **The glyph** (`pixels.py`): each cell is the mean of its pixels and is kept where it is half covered. Its colours
  are cut to 11 by k-means, the same each run. The outline is traced round it as the hand-drawn glyphs' is: an empty
  cell beside a drawn one, side by side, never at a corner. The letters go outline first, then light to dark.
- **Written into the client** (`write.py`), about 7 s for the whole bake:
  - into `client/src/combat/`: the resources at 18 cells (`resourcePictures.ts`); the Ammo box and crate still at 18,
    and their turns, 12 frames of 0.038 m a pixel (`ammoBoxPictures.ts`, `ammoCratePictures.ts`).
  - into `client/src/game/shipGlyphs.ts`: the ship's materials and modules at 24, with the officers' posts drawn by
    `posts.py` on `pix.py`'s canvas.
  - Prettier then lays them out, so writing them again changes nothing that did not change.
  - These rows are kept in git, as the owner chose ([[Generated Files Stay Out of Git]]).
- **Drawn.** The screens draw a glyph at a whole multiple of its cells: an 18-cell one at 36, a 24-cell one at 48, 96
  or 264 ([[Interface]], "Pictures"). A resource's picture is the resource as it is carried; its node in the world is
  the forge's picture of the place it is gathered from ([[Game]]). Ammunition turns as it hovers ([[Gear]], "Drops").

| Command | Does |
|---|---|
| `python3 -I tools/item-pictures/write.py [sheet.png]` | Bakes every picture, writes the four files, and a sheet of them at 8 times |
| `python3 -I tools/item-pictures/test_pixels.py` | Checks a render is made a glyph as the hand-drawn ones are, without Blender |

bpy is Blender as a Python module, as for the [[Flora]]: `pip install bpy==5.3.0` on Python 3.13; the sheet needs
Pillow.

## Limits

- `test_pixels.py` is run by hand: no workflow runs it.
- Whatever is thinner than half a cell is lost, so the models thicken their stalks, wires and ropes past life.
- The files are what one machine's Cycles wrote: whether another's writes every cell the same is not checked.
