---
type: system
status: live
code:
  - client/src/nature/natureView.ts#NatureView
  - client/src/nature/field.ts#NatureField
  - client/src/nature/scatter.ts#scatterTile
  - client/src/nature/ground.ts#landSampler
  - client/src/nature/cast.ts#castOf
  - client/src/nature/coolCasts.ts#COOL_CASTS
  - client/src/nature/warmCasts.ts#WARM_CASTS
  - client/src/nature/shapes.ts#MeshBuilder
  - client/src/nature/natureShader.ts#NATURE_SHADER
  - client/src/nature/cull.ts#tilesInView
  - client/src/nature/slots.ts#SlotStore
---
# Nature

The trees, plants and rocks that dress each continent's [[Land]], one cast for its one biome
([[Each Continent Is One Biome]], [[The Continents' Biomes]]). Every mesh is made in code and coloured by its
vertices ([[Own Work]]), drawn with WebGPU ([[WebGPU Only]]). The same ground grows the same plants for every player.
The casts are Claude's choices ([[The World Is Claude's to Mold]]).

## The casts

Each biome has three to six kinds, each with outlines of its own so they read apart at a distance. Trees come in two
or three forms a kind; every plant is turned, sized and tinted on its own. Most stand a little shorter than their
width says and a few half again as tall, and trunks lean a little, a few more. A broadleaf's crown is a smooth core
with lobes in two layers, a wider, darker ring below and smaller sunlit clumps above, each its own size and shade, so
its outline is ragged. Swamp cypresses and rainforest trees carry broad, flat tiers instead, wider than they are tall,
drooping at their edges and stepping in as they rise. Bushes are woody stems, each ending in a tuft of leaves. Leaves
are shaded as one soft mass over each lobe; only stone shows its facets.

| Biome | Kinds |
|---|---|
| `temperate-coast` | Round-crowned oaks, umbrella pines, gorse flecked yellow (thicker by the coast), meadow grass, grey boulders |
| `highland` | Firs, birches, heather, upland grass, granite boulders |
| `woodland` | Dense oaks and beeches, firs, hazel, ferns, mossy boulders |
| `desert` | Columnar cacti, date palms only by water, dry bushes, red rocks |
| `savanna` | Flat-crowned acacias, baobabs, tall golden grass, flat-topped thorn bushes, ochre boulders |
| `rainforest` | Buttressed giants 40 m tall over a canopy of three trees of their own heights, spreads and greens, palms (thicker by water), tree ferns, understory |
| `steppe` | Birches only by water, silver sagebrush, dry grass, rocks |
| `swamp` | Cypresses flaring onto dark buttresses under broad drooping tiers, short clumps of dark moss under their edges, mangroves only by water, reeds at the water's edge, marsh ferns |
| `tundra` | Stunted spruces, dead trees, dwarf shrubs, snowy rocks |

Near trees are 90 to 300 triangles; far ones 20 to 60.

## Where they grow

The land is cut into tiles 64 m square. Trees, palms, cacti and boulders stand in a tall layer of 8 m slots; shrubs,
grass, ferns and reeds in a low layer of 4 m slots, kept off the tall ones' feet. A slot holds one plant at most. Its
first draw, hashed from its tile and place, picks the kind whose share it falls in; the ground then says whether that
kind grows there:

- **Never** on the sea, a lake or a river, a road, a town or a port, or ground the caller keeps clear.
- **Height.** Trees keep off the beach; reeds and mangroves do not. Trees stop 300 m below the snow line; above it
  only rocks stand, and snow settles on them.
- **Slope.** Trees grow up to a slope of 0.6; rocks stand only where it is steeper than about 0.2.
- **Groves.** Noise at three scales, about 560, 230 and 90 m across, gathers trees into woods and stands, thins them
  to scattered trees at their edges and opens glades between them, where some shrubs and grass prefer to grow. No
  forest stands like an orchard.
- **Water.** Some kinds grow thicker near the coast or fresh water; some grow only there. In the dry biomes most
  kinds grow several times thicker near water.

Each plant stands on the ground's height, sunk a little on a slope.

## The ground

The caller hands over a sampler: at a world point, the ground's height and slope, its water (dry, sea, lake or river),
its mark (a road, a town or a port), and how far it lies from the coast and from fresh water. `landSampler` makes one
from a landmass's 1 km land, along the same splines the GPU draws it by, with the rivers the water gathered at their
width, and from the exact close patch where it reaches, eased in over its outer 24 samples as the land is.

## Drawing

- **Round the eye.** Tiles are kept round the eye: the tall layer out to 3 km, the low one to 0.9 km. A tile is
  scattered once, nearest first, a few milliseconds' worth a frame. Its plants go into slots of a store on the GPU
  that stay put while the tile is kept, a page of sixteen at a time, and leave when it is let go. When the eye
  crosses into another tile, or newly scattered tiles arrive (at most four times a second while some still wait),
  only the list of which slots to draw is made again, and each tile's corner. A changed ground is scattered again
  tile by tile, the old plants drawn until their tile's turn. From more than 3 km above the ground nothing is drawn
  or scattered.
- **Detail.** A tree's near mesh is drawn to 700 m and its far mesh beyond, to 3 km. Shrubs change at 200 m and go at
  700 m; grass, ferns and reeds go at 160 m. From 1 km far trees thin out to a share kept at the reach (a seventh in
  the rainforest, a fifth in the woodland, nearly all in the desert), each widened to fill in. On steep ground they
  thin out further from half a kilometre, so a mountainside reads as trees fading out, not a speckle, and far off a
  plant's colour leans toward the biome's ground. Moss is drawn to 150 m. Distances are taken from the eye in three
  dimensions.
- **No popping.** A plant fades by its samples, not by blending: across the last eighth of the near range the near
  mesh hands its samples to the far one, each taking exactly what the other leaves, and toward the reach and as the
  far trees thin out both give theirs up. Four samples and a dither over two pixels make seventeen steps.
- **Placing.** Each plant is placed from its tile's corner, measured from an anchor beside the eye, so the GPU's
  floats keep their centimetres anywhere in the world. Tiles out of view are culled, and the tiles in view drawn in
  runs, one instanced draw a run.
- **Light.** As the land is lit, its ambient bounced warm from the ground onto a crown's underside and cool from the
  sky onto its top, with a little sun through the leaves. Gusts roll downwind across the land, each plant rocks on its
  own beat and its leaves tremble.
- **Shadows.** In the game the near plants round the eye cast into the sun's shadow map, swaying as they are drawn,
  and every plant is lit through it ([[Game]]): a tree in another's shade, or a wall's, is in shade.
- **Woods from afar.** Past where its trees are drawn, a biome's woods are coloured on the land itself (`woodsOf`):
  its canopy's colour where the grove field puts its groves, as thick as its trees grow, and the forest floor darker
  under them near. So a forest reads from the sea and over an island's side, and stands where its trees stand.
- **Contact shade.** Each plant with a far mesh lays a soft dark disc on the ground under it,
  as wide as its crown, leaning a little the way the sun throws shadows and laid on the ground's slope at its foot,
  fading out by half its near range. Trunks darken toward the ground to meet it.
- **In the frame.** Plants are drawn into the land's pass, four samples a pixel and depth reversed, before the
  [[Water]]'s pass, which hazes them with the rest.

Each frame a page calls `update` with the camera and the ground, then `drawInto` the land's pass after the land.

## Limits

- Only the near plants within the shadow map's square cast; past it the contact shade stands in under each one.
- Low plants keep off the feet of the tall ones in their own tile only: within a couple of metres of a tile's edge,
  grass can grow into a neighbouring tile's boulder or trunk.
- Beyond the close patch the sampler knows no roads, towns or ports: the caller's cleared ground must cover them.
- A new close patch, every 400 m of travel, has every tile scattered again, which takes a few seconds of budget.
- A teleport fills the view from the eye outward over about a second.
- A step into another tile lists every drawn slot again: in the densest biomes (about 230,000 within 3 km) that
  takes some 10 to 15 ms of the frame it happens in, and sends under a megabyte to the GPU.
- The [[World Editor]]'s 3D view and the game do not draw it yet.
