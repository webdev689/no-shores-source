---
type: system
status: live
code:
  - tools/flora/species.py
  - tools/flora/grow.py#colonise
  - tools/flora/growers.py#grown
  - tools/flora/detail.py#surfaces
  - tools/flora/near.py#encoded
  - tools/flora/sprites.py#impostor
  - tools/flora/atlas.py#layers
  - tools/flora/bake.py#bake_biome
  - tools/flora/publish.py#published
  - content/nature/flora.json
---
# Flora

How every plant the [[Nature]] draws is made: grown in Blender as a detailed model from a seed, and baked two ways,
a low-poly near mesh and sprites for far away ([[Flora Is Baked From Detailed Models]]). All of it is code in
`tools/flora/`: no outside models, textures or scans ([[Own Work]]). The look is stylised realism, textured, in the
family of the land and the water, never palette-snapped ([[The World Is Claude's to Mold]]).

## What it grows

`species.py` names every biome's kinds in the order and with the names of the client's casts, the forms each kind is
grown in and their seeds, sizes and colours. A form's grower (`growers.py`) makes its skeleton:

- **Broadleaves, birches, acacias, baobabs, mangroves, umbrella pines, dead trees, shrubs**: space colonisation
  (`grow.py`). Points scattered through the crown's shape (a core with lobes, a flat disc, a dome) draw branches
  out of the trunk toward them; each branch's thickness follows the pipe model, its area the sum of its children's.
  A spray of leaves hangs at every outer twig. Mangroves stand on arching prop roots.
- **Rainforest trees and swamp cypresses**: tiers one over another with air between them, each a broad disc of
  crown the trunk's boughs grow into, drooping at its rim and stepping in as they rise, over a trunk flaring onto
  buttress fins. A cypress has four thin tiers from a third of its height, wide gaps between them and moss hanging
  under each tier's outer half; a giant three deep tiers from two fifths of its height; a canopy tree three deep tiers
  close together from a quarter of its height, so from above and afar their crowns close into one roof.
- **Buttress fins**: slabs of wood with thickness, thickest at the trunk and thinning to the toe, rounded over their
  top edge and curving a little along the ground.
- **Firs and spruces**: whorls of seven to nine drooping boughs round a straight trunk, the cone as wide as the
  cast's width at its foot, longer at each tier's foot, needle sprays all along each bough and up the leader to its
  tip.
- **Umbrella pines**: a tall trunk forking into a broad, flat, dense crown of needle tufts, each a burst of needles
  out of a ball round its twig's end.
- **Palms, ferns and tree ferns**: fronds arching from the crown, leaflets along both sides of each.
- **Cacti**: a ribbed column with arms that turn up. **Bushes**: woody stems fanning from one foot, a tuft at each
  end. **Grass and reeds**: tufts of tapering blades. **Boulders**: an icosphere pushed out by noise, stepped into
  strata, cut flat underneath, moss or snow tinting its top.

`detail.py` dresses the skeleton: bark tubes with UVs in picture units, thousands of single leaves (a leaf's outline
of six corners), needles, leaflets and blades, each leaf its own shade and the flecks of gorse and heather. The bark,
stone and leaf pictures are made in code (`pictures.py`): noise that wraps at the picture's edges, so a picture tiles
round a trunk and along it with no seam, and a normal map from its height.

## How it bakes

- **The near mesh** (`near.py`): the trunk and the thickest limbs that fit as tapered rings of 3 to 12 sides; the
  sprays gathered by k-means into crossed pairs of cards; fronds as bent strips; grass as three crossed cards; a
  boulder at a low subdivision. Budgets: a tree's wood and cards 600 triangles (a cypress's moss and a cactus's
  domes come on top, to 900 at most), a shrub 240, a grass, fern or reed 60, a rock 300. Each corner carries its
  normal (cards take the crown's, so a crown lights as one mass), its tangent for the normal map, its uv, a tint,
  the ambient occlusion the detailed model casts on it (24 rays), and its wind weight, still at the foot and freest
  at the top and the crown's rim. A card covers half its group's reach, so a crown is a few leaves deep along a
  view, and is cut to the rectangle round its picture's leaves, so the GPU shades little air: a spray strung
  along a bough is pictured turned to lie along its picture.
- **The card pictures**: a kind's first form gives its pictures. A spray card shows the form's own sprays round a
  group's middle, grown again alone and seen face on, so its outline is ragged; a frond is laid flat; a tuft is seen
  from two sides; a strand of moss hangs.
- **The sprites** (`sprites.py`): the impostor sheet, 8 azimuths by 4 elevations (0, 25, 50 and 75 degrees), each
  frame 128 px showing the model's bounding sphere. It is rendered by Cycles in one pass of 32 turned copies. The
  box of a frame that any frame fills is kept, and the far quad covers only that.
- **Every picture** is three emission-only renders, so a pixel holds exactly what is asked: the albedo darkened by
  ambient occlusion, the normal (the card's own frame, or the model's for a sprite), and the leaf share. Each is
  unpremultiplied by its coverage and bled outward into the empty pixels, so an edge keeps its own colour and a mip
  never darkens.
- **The atlas** (`atlas.py`): a biome's sheets two to a layer and its card pictures (256 px) sixteen to a layer, a
  kind's together. A layer is two PNGs, albedo with coverage and normal with leaf share, its six mip levels laid
  beside it; each mip keeps every frame's share of pixels over a half, so alpha-cut leaves keep their cover far off.

A near mesh's file is a little-endian vertex count, then 36 bytes a vertex in the game's frame (x east, y south, z
up): position (3 floats), normal and leaf share (4 signed bytes), tangent and the bitangent's sign (4 signed bytes),
uv (2 floats), tint halved and ambient occlusion (4 bytes), wind weight and whether the uv wraps in the bark picture
(4 bytes).

## The manifest

`content/nature/flora.json`: the R2 base, a layer's side, the mip count and the sheet's frames; then by biome its
layers' albedo and normal keys, and by kind its forms. A form names its mesh, its triangle count, the layer its cards
and bark lie in, the bark picture's place, its height and reach at size 1, its contact shade, whether it is leafy, its
crown's breadth and colour from above, and its sprites (layer, the sheet's top, the bounding sphere's middle in the
game's frame and its radius) when it is drawn far.

## Running it

bpy is Blender as a Python module: `pip install bpy==5.3.0` on Python 3.13.

| Command | What it does |
|---|---|
| `python -I tools/flora/bake.py <folder> [biome ...] [--samples N]` | Bakes into a folder, about 10 minutes a biome on four cores |
| `python -I tools/flora/publish.py [--baked <folder>]` | Uploads a bake (or bakes first) to R2 under the files' hashes, checks each answers, and writes the manifest |
| `python -I tools/flora/test_flora.py` | The same seed grows the same bytes; mips keep cover |

The `flora` workflow runs the test and publishes on every change to `tools/flora/`, on any branch. Its first job
holds no secret: it bakes and stages the files for R2, and its log ends with the manifest. A second job uploads them
with the repository's `R2_TOKEN` ([[Toolchain]]), and a commit then takes the manifest into
`content/nature/flora.json`.
It publishes from any branch, not only `main` (Claude's call, [[Flora Is Baked From Detailed Models]]): R2 names each
object by its hash, so a branch's run overwrites nothing, and a branch must publish its flora for its pictures to
load before it merges. A cloud
session publishes from where it is ([[Generated Files on Cloudflare R2]]).

## Limits

- The sprites' frames are blended, not morphed: between two azimuths a far plant shows a soft double image.
- A sprite stands at its bounding sphere's middle, so on a steep slope its foot can show a little above or below the
  ground.
- The card pictures of a kind come from its first form.
