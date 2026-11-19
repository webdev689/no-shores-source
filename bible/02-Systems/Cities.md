---
type: system
status: live
code:
  - crates/city/src/lib.rs#plan
  - crates/city/src/lib.rs#settle
  - crates/city/src/footprint.rs#Footprint
  - crates/city/src/terraces.rs#footings
  - crates/city/src/ways.rs#avenue
  - crates/city/src/districts.rs#fill
  - crates/city/src/walls.rs#city_wall
  - crates/city/src/landmarks.rs#landmark
  - crates/city/src/landmarks_inland.rs#sun_dome
  - crates/city/src/social.rs#plaza
  - crates/city/src/stations.rs#stations
  - crates/city/src/courtyard.rs#courtyard
  - crates/city/src/articulation.rs#articulated
  - crates/city/src/collision.rs#boxes_within
  - crates/land/src/pads.rs#Pads
  - crates/land/src/sites.rs#City
  - client/src/city/cityView.ts#CityView
  - client/src/city/cityBuild.ts#buildCity
  - client/src/city/plan.ts#cityClimate
  - client/src/city/blocks.ts#placed
  - client/src/city/tiers.ts#tierFades
  - client/src/city/cityMasses.ts#hullOf
  - client/src/city/solidMesh.ts#meshSolid
  - client/src/city/cityGround.ts#groundPlates
  - client/src/city/cityGround.ts#clearedGround
  - client/src/city/pictures.ts#pictureBook
  - client/src/city/painter.ts#CityPainter
  - client/src/city/cityShaders.ts#PULL_SHARE
---
# Cities

Each of the nine continents has one port city, the same size, each with its own motif
([[Every Island Is Seen Whole and Reached by Nodes]], [[The World as Claude Shapes It]]). A city is planned from its
site by the same rules on the server and in every browser. From the sea and the Overworld it is seen whole; a player
walks only its social space, a plaza the size of Destiny 1's Tower beside its landmark.

## The site

A continent's edits file names its city: an id, a name, the landmark's site within 3 km of the coast, and a motif
([[Land]]). The strokes in the same file shape the ground it stands on: Overlook's headland, Cairnwatch's hill.

| Continent | City | Motif | Its landmark |
|---|---|---|---|
| 1, Saltmere | Overlook | `beacon` | A round lighthouse-citadel on a stepped base, its fire about 300 m over the headland |
| 2 | Cairnwatch | `span` | An aqueduct straight through the city along the coast, square to the world beside the plaza's long side, its arches 60 m over the highest ground, a cistern keep at its head |
| 3 | Elmhaven | `great-hall` | A timber hall of six roofed tiers and a gilded spire |
| 4 | Sunspire | `sun-dome` | A ziggurat of five tiers, a golden dome and a needle spire 340 m up |
| 5 | Goldreach | `granary-ring` | Nine round towers, walled between, round a round keep with a tall conical roof |
| 6 | Mistfall | `stepped-temple` | A pyramid of nine steps, a stair up its seaward face, a shrine on top |
| 7 | Windmere | `windwall` | A circle of standing stones round an altar, and seven windmill towers facing the sea wind |
| 8 | Fenhallow | `drowned-bell` | A bell tower leaning five degrees toward the sea from a stone plinth |
| 9 | Rimeholt | `whalebone-gate` | Two curved tusks rising from a sea wall at the harbour mouth to meet 250 m up |

## The plan

World 2.0's settlement stages, at a city's scale (`city::plan`), on the ground as generated and shaped, before any
city stands on it:

1. **The footprint.** 48 rays out from the landmark, 25 m a step, until the sea, a lake, ground steeper than 0.45, or
   the city's radius of 3,456 m (half DFO's Imperial City). Each ray's reach is smoothed with its neighbours'.
2. **The cells.** A grid square to the world of Daggerfall's RMB blocks, 102.4 m a side, its middle cell on the
   landmark. A cell inside the footprint is built on unless any of it is shore.
3. **The terraces.** Every built cell is levelled to its ground's mean, rounded to 0.25 m. A cell whose ground spans
   more than 14 m, or whose level would stand more than 12 m from a built neighbour's, is left as it is.
4. **The ways in.** Up to five gates where the reach is long and the wall's ground gentle, never on the shore, spaced
   round the wall; the harbour where the nearest shore stops a ray. An avenue joins each to the landmark, over built
   cells only, cheapest where the terraces step least.
5. **The districts.** Seeds sown by World 2.0's rules: markets near the middle and the avenues, the noble quarter and
   temples on high ground, guilds midway out, the harbour by the shore, houses everywhere else. Each built cell joins
   the nearest seed, the borders wandering a little.
6. **The blocks.** Each district's cells are filled with Daggerfall's RMB blocks of its kinds, as its towns mix them
   (taverns among houses, shops round a market), never the same block beside itself ([[RMB Blocks]]).
7. **The works.** The wall along the footprint where the land holds it, 16 m high, a round tower every sixth piece
   and a gatehouse at each gate; a quay along the shore and piers out to sea; a retaining wall wherever a terrace
   stands apart from the ground or terrace beyond it.
8. **The landmark**, of the motif's solids, its great masses dressed as built stone (`articulation`): a stone block
   24 m or more a side gets pilasters a bay of about 9 m apart round its faces and a cornice of trim along its top.
9. **The social space**: a plaza of 260 × 120 m on the landmark's seaward side, walled all round with a parapet
   1.1 m high, the landward side too, since past the landmark's base the ground may be a terrace far below. Its
   section is its own edge, so its floor is walked right to the parapet and only climbing over it warns; its four
   spawns stand 40 m apart, 4 m inside the seaward parapet, looking down over the city. It is laid out as the Tower's
   courtyard (`courtyard`): on the landward side a portico up three steps (a podium, six columns, an entablature and
   a pediment) before a great timber door in an arch, and either side of it an arcade with a lamp in each alcove; in
   the middle a stepped plinth with an obelisk 18 m high capped in gold, a brazier either side and two toward the
   ends; lanterns on the seaward parapet and stone benches facing the sea, midway between the spawns; and bands of
   stone in the paving, a processional way, a border and a ring round the plinth. Its stations stand in the
   arcades' alcoves, as the Tower's merchants stand in its booths (`stations`): in each alcove a counter under its
   hung lamp, the keeper's place behind it facing the plaza, and shelves of their goods against the back wall. By the
   portico, the Reader of Vestiges on one side and the Harbourmaster on the other; then a vault on each side, the
   Quartermaster's armour stands, the Armsmith's racks, and the traders' stalls (a chandler, a fishmonger, a
   cartographer, a tailor, a herbalist and a smith). Its node is
   `<city id>-social`. The landmark and the plaza stand on one platform 12 m over the highest ground under either and
   over every terrace within 250 m of the plaza, so from the plaza the city below is seen whole, over its roofs, as
   from Destiny 1's Tower. Only the cells under the landmark's base rise to it; under the plaza the cells keep
   their own levels and are built on as any other, the plaza's pad standing over its own footprint with its parapet
   for a wall, so what is built beneath it is hidden and the city runs right up to its foot. No terrace wall crosses
   it.

`city::settle` lays the plan's levels on the land as pads, rectangles of ground set to a level that the ground reads
before its own relief (`land::pads`): the terraces, the plaza and the landmark's ground. So the city's ground is the
same to the bit wherever it is sampled, and a window cut round the social space keeps it ([[Land]]).

## Solids and collision

The landmark and the works are solids: blocks, columns, domes, pyramids, gables and arches, each with its place,
size, turn, lean and roll, dressed in a material the browser pictures from the city's climate. `boxes_within` gives
every solid reaching into a rectangle as a box square to the world, which is what a node's room stands bodies
against ([[Server]]). A box stands from the ground up, so a solid whose underside is 2.5 m or more over the plaza's
floor (a roof, a lintel, a hung lamp) is overhead and left out: a body walks under it. A leaning or rolled solid's box
reaches round its base and as far as its top swings out.

## How it is drawn

`CityView` is a drawer for the game's scene, drawn into the scene's own pass. It is handed a plan, the continent's
climate (`cityClimate` of its biome), the RMB blocks the plan names and the forged tables (`setCity`); `drawInto`
draws a frame; `cleared(x, y)` is true on the pads and under every solid's footprint, the quays and piers among
them, for nature to keep off. Every position is measured from the city's middle, so the GPU's floats keep their
precision 3 km out.

| Biome | Climate set |
|---|---|
| temperate-coast, woodland | temperate |
| highland, steppe | mountain |
| desert, savanna | desert |
| rainforest, swamp | swamp |
| tundra | mountain, without snow: its coast lies below its snow line |

Each cell is drawn in a tier by the eye's distance to its middle at its level. Inside a band it is drawn in both
tiers, and a 4 x 4 dither pattern gives each pixel to exactly one, so nothing pops.

| Tier | Out to | What stands |
|---|---|---|
| Whole | 700 m (band from 560 m) | Every building and prop of the cell's block, the forged models instanced per model in their own pictures |
| Masses | 2,600 m (band from 2,200 m) | Each building's masses over 1.5 m high and 6 m² (`buildingMasses`): walls in its wall picture, a gabled, hipped or flat roof in its roof picture. Props are left out; a prop standing for a building is a flat box |
| Hulls | the horizon | One box a building round its masses, walled to its largest's eaves and roofed as it is |

The landmark, the works and the plaza's solids are drawn at every distance, meshed from their specs, their
pictures laid at 24 texels a metre, coarser than the forged models' 40, so their courses read as ashlar from the
plaza and across the city. A block's model stands at its cell's corner plus its placement, at the cell's level,
turned by its yaw ([[RMB Blocks]]).

**The ground.** Every levelled cell has a plate at its level at every distance, so the 1 km land's smoothing never
shows a terrace floating or buried. A block's cell wears its ground tiles in the climate's terrain set, turned as
Daggerfall Unity turns them. An avenue is a road 38.4 m wide toward each paved cell beside it, lawns either side,
with no kerb or border, so a run of avenues reads as one road; the landmark's own ground is paved. The terraces'
retaining walls and a plate's skirts, 30 m down its open sides or to the lower plate beside it, are rubble near the
ground's colour, so the walls between the terraces read as terracing, not as a grid. The whole city is
drawn nearer in depth than it stands (not on screen) by 5 cm and 1.2 % of the distance, above the sea only, since
the 1 km land stands up to about 20 m off a terrace's level; a plate is drawn 3 cm under its level, so a floor laid
at that level shows over it.

**The pictures.** One texture array of at most 252 layers, each picture resampled to 128 texels square, sampled
nearest up close and mipmapped far off. Daggerfall's stone is dark, so a solid's picture may be painted lighter or
warmer, a factor a channel, as its own layer. The ground's tiles and the solids' pictures come first, then the
forged models' by how much the city wears them. Up to four workers paint them; a layer shows its guessed colour until
painted, and what is painted is kept for the next city. Gold, iron and bone are plain colours; the glow is lit warm
and unshaded, brighter at night, and each glowing solid is a lamp ([[Sky]]). Faces are lit as the land is, with a
little light thrown back onto walls from the ground, the lamps' light at night, and the rain's darkening and sheen.
In the game the solids cast into the sun's near and far shadow maps, the near cells' models into the near one, and each
building's masses (its hull past where the masses are drawn) into the far one, a few boxes standing in for a model
whose shadow at the far map's 1.2 m texels is the same; every face and plate is lit through both ([[Game]]).

| Material | Temperate | Desert | Mountain | Swamp |
|---|---|---|---|---|
| Stone | pale limestone ashlar (109.1, lightened, warmed) | sandstone ashlar (9.1) | grey granite (109.1, lightened) | mossy grey blocks (458.1) |
| Trim | carved frieze (161.1, pale) | banded sandstone (42.1) | carved frieze (161.1, grey) | carved frieze (161.1, green-grey) |
| Roof | red tiles (369.2) | terracotta (69.0) | slate (469.2, lightened) | mossy thatch (469.3) |
| Timber | boards (364.1) | plain boards (67.0) | plain boards (67.0) | dark boards (426.1) |
| Plaster | sandstone plaster (312.1) | white plaster (38.1) | sandstone plaster (126.1) | plaster with vines (442.1) |
| Paving | crazy-paved flags (324.2, warmed) | sandstone cobbles (17.1) | square flags (323.2) | crazy-paved flags (324.2) |
| Terrace walls | brown rubble (335.1) | sandstone rubble (17.1) | dark rubble (112.1) | mossy rubble (409.1) |

Winter takes each picture's snowed turn where its set has one, unlightened.

**What it costs.** Cells are grouped by 4 x 4 into chunks, culled against the view; consecutive chunks are one draw
call. Overlook builds in about 1 s and paints its 157 pictures in about 5 s on three workers. In headless
SwiftShader at 1280 x 720:

| From | Triangles | Draw calls |
|---|---|---|
| The plaza, at eye height by its parapet | 60,274 | 138 |
| The platform's edge, looking along the coast | 222,367 | 172 |
| The Beacon, 280 m off | 462,486 | 153 |
| The sea, 3 km off the harbour | 413,188 | 3 |
| 400 m up, 8 km out | 415,338 | 3 |

## Limits

- Only the social space is walked; the city's blocks stand no colliders.
- Streets are the RMB blocks' own; an avenue is an open paved cell, not a street drawn through the blocks.
- A leaning or rolled solid's box is square round all of it, so a body meets it a little early.
- The parapet hides the city just below it from back on the plaza: from a spawn, 4 m in, the city shows from about
  250 m out, and all of it only from the parapet itself.
- Props are drawn only near; flats (trees, people, lamps) and lit windows are not drawn.
- The depth pull lets the city show through land within its share of the distance in front of it.
