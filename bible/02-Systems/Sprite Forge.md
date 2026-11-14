---
type: system
status: live
code:
  - tools/forge/tools/sprite-forge/layers.py
  - tools/forge/tools/sprite-forge/fanout.py
  - tools/forge/tools/forgeViewer/pack.py
  - tools/forge_publish.py#publish
  - tools/forge_dyes.mjs
  - content/forge/renders.json
---
# Sprite Forge

DFO Online's forge, brought over exactly ([[DFO's Sprite Forge Comes Over Exactly]]). It builds a body, its gear and
its moves in Blender and renders each as strips of pictures. The game composes a figure from the strips at run time.
The [[Test Ground]] shows them.

## What it renders

- **Bodies**: a man and a woman, with a boy and a girl for the townsfolk. Khajiit and Argonians wear bodies of their
  own; every other race is the bare body with its skin coloured as a frame is composed.
- **Layers**: 656 on the man and 662 on the woman. Clothes, armour sets, helms, hair, worn and held weapons, bows,
  staffs, shields, instruments, tools and the horse a rider sits on.
- **Moves**: 78 on each adult body. They include walking, running, fighting with each weapon, casting, dying, climbing,
  riding and playing each instrument. Nine moves turn the body by CC0 motion from Quaternius's library.
- **Views**: five, from the front round to the back. The other three are drawn mirrored.

The first-person frames are pictures of their own: each weapon's idle and its six strokes, the bow's draw and loose,
fists and kicks, held things, and the hands that cast, climb, run, ride and work. DFO kept them outside the studio
folder as its site's art; they are published with the rest.

Each strip is a layer in one move: a row for each view, a cell for each frame, at 62 pixels a metre. Its twin, `_z`,
holds the depth of each pixel in red and green, and the part of the body (torso, arm, head, foot, weapon, drape,
horse, hair) in blue. The forge's index (`forgeLooks.json`) gives each move's cell and the root, where the feet stand.
It also holds each layer's moves, and the order, cover and under values that decide which layer shows where two meet.

## Where it lives

`tools/forge/` holds the forge as DFO laid it out, so its paths work unchanged: the code in `tools/sprite-forge/`, the
packer in `tools/forgeViewer/`, and the horse's sources in `src/assets/horse/`. The size, comment and assets checks
skip the folder. What it makes stays out of git ([[Generated Files Stay Out of Git]]): strips go in `public/art/studio/`,
tables in `src/systems/studioArt/`, packs in `packs/`.

`tools/forge_publish.py` publishes them to the `overlook-forge` bucket on R2 ([[Generated Files on Cloudflare R2]]):

- `publish` packs every picture as lossless WebP with DFO's `pack.py`, uploads the packs, the pack index and the
  tables, and writes `content/forge/renders.json`, which names each by its hash. WebP keeps no PNG chunks, so it first
  reads each first-person frame's place on the 320 by 200 screen (`oFFs`, `boXs`) into the `frames` table.
- `pull` fetches the tables back for the forge to render more. `pull --strips` also unpacks every strip as PNG.

The bucket is public at `pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev` and lets the site and local servers read it.

## Colours

The forge renders dyeable cloth and metal in greys. They take Daggerfall's exact colours
([[The Player Plays as in DFO]]). `tools/forge_dyes.mjs` reads Daggerfall's palette once from `ART_PAL.COL` into the
`dyes` table. The table holds the palette's 256 colours, a 16-colour ramp for each of the ten clothing dyes, and one
for each of the ten metals.

A garment's grey takes its dye's ramp. Armour, its padding, shields, bows, staffs and their sheaths take their metal's.
Leather and chain take steel's; the guild sets keep their own colours. A composed frame is then snapped to the palette,
nearest in OKLab with hue weighed four times light, as DFO's game does.

## Running it

Blender runs as a Python module: `pip install bpy==5.2.3` on Python 3.13, with `scipy`, `cma` and `pillow`. Run
`python3 -I tools/forge_publish.py pull --strips` first, then run the forge from `tools/forge/`, as in DFO:

```
python -I tools/sprite-forge/layers.py --body male --anims walk,idle --layers helm_iron --out public/art/studio/forge/layers
python -I tools/sprite-forge/forgepoints.py --body male
```

A strip whose inputs did not change is kept; `fanout.py` splits a large render into shards. Then
`python3 -I tools/forge_publish.py publish` uploads what changed and rewrites the manifest for a pull request.

The tools that fit the forge to Daggerfall's sprites (`fit.py`, `colour.py`, the `*Reference.mjs` readers) and the
doll and class-look tools need Daggerfall's files and DFO's game code, so they do not run here.
