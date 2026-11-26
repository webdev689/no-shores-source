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
  - crates/city/src/board.rs#board
  - crates/city/src/mail.rs#mail_counter
  - crates/city/src/courtyard.rs#visitor_spots
  - crates/city/src/lib.rs#social_open
  - content/world/social.json
  - crates/city/src/courtyard.rs#courtyard
  - crates/city/src/hub/mod.rs#overlook
  - crates/city/src/hub/ground.rs#walks
  - crates/city/src/hub/dress.rs#dress
  - crates/city/src/hub/plants.rs#plants
  - crates/city/src/hub/harbour.rs#harbour
  - crates/city/src/ramps.rs#lay
  - crates/city/src/articulation.rs#articulated
  - crates/city/src/collision.rs#boxes_within
  - crates/city/src/ruins.rs#is_ruined
  - crates/city/src/ruins.rs#broken_landmark
  - crates/city/src/ruins.rs#street_rubble
  - crates/city/src/ruins.rs#wrecks
  - crates/city/src/overtaken.rs#crown
  - crates/city/src/overtaken.rs#crusted
  - crates/city/src/overtaken.rs#spire
  - crates/city/src/lights.rs#lights
  - client/src/city/streetLamps.ts#streetLamps
  - client/src/city/nightLights.ts#poolMapSteps
  - client/src/city/windowLights.ts#windowGlow
  - client/src/sky/glowPoints.ts#GlowPoints
  - crates/land/src/pads.rs#Pads
  - crates/land/src/sites.rs#City
  - client/src/city/cityView.ts#CityView
  - client/src/city/cityBuild.ts#buildCity
  - client/src/city/cityBuild.ts#cityBuildSteps
  - client/src/city/steps.ts#stepWithin
  - client/src/city/plan.ts#cityClimate
  - client/src/city/blocks.ts#placed
  - client/src/city/tiers.ts#tierFades
  - client/src/city/cityMasses.ts#hullOf
  - client/src/city/solidMesh.ts#meshSolid
  - crates/city/src/rock.rs#mesh
  - crates/city/src/rock.rs#boxes
  - client/src/rules/rockMesh.ts#rockMesh
  - client/src/city/cityGround.ts#groundPlates
  - client/src/city/cityGround.ts#clearedGround
  - client/src/city/pictures.ts#pictureBook
  - client/src/city/windowCuts.ts#cutAtWindows
  - client/src/city/painter.ts#CityPainter
  - client/src/city/cityShaders.ts#PULL_SHARE
  - client/src/city/ruins.ts#buildingRuin
  - client/src/city/overtaken.ts#buildingGrowth
  - client/src/city/overtaken.ts#heapGrowth
  - client/src/city/overtaken.ts#wreckCrust
  - client/src/city/overtaken.ts#worksGrowth
  - client/src/city/crystalFormations.ts#FORMATIONS
  - client/src/city/crystalInstances.ts#crystalInstances
  - client/src/city/crystalInstances.ts#WreckCrust
  - client/src/city/tiers.ts#middleFade
  - client/src/city/cityBuild.ts#detailRuns
  - client/src/game/wrecks.ts#withWrecks
---
# Cities

Each of the nine continents has one city, the same size, each with its own motif
([[Every Island Is Seen Whole and Reached by Nodes]], [[The World as Claude Shapes It]]). Three of them are port
cities, Overlook, Sunspire and Rimeholt; the other six, Cairnwatch, Elmhaven, Goldreach, Mistfall, Windmere and
Fenhallow, are ruins, desolate and destroyed ([[Three Port Cities Remain, and the Others Are Desolate and Destroyed]],
"Ruins" below, [[The Sea as Claude Shapes It]]). A city is planned from its
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

World 2.0's settlement stages ([[Pick - World 2.0 Settlements]]), at a city's scale (`city::plan`), on the ground as
generated and shaped, before any city stands on it:

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
   and a gatehouse at each gate, each piece footed on the lowest ground under it and as much taller, so none is
   walked under on a slope; a quay along the shore and piers out to sea; a retaining wall wherever a terrace
   stands apart from the ground or terrace beyond it.
8. **The landmark**, of the motif's solids, its great masses dressed as built stone (`articulation`): a stone block
   24 m or more a side gets pilasters a bay of about 9 m apart round its faces and a cornice of trim along its top.
9. **The social space**: a plaza of 260 × 120 m on the landmark's seaward side, walled all round with a parapet
   1.1 m high, the landward side too, since past the landmark's base the ground may be a terrace far below. Its
   section is its own edge, so its floor is walked right to the parapet and only climbing over it warns; its four
   spawns stand 40 m apart, 4 m inside the seaward parapet, looking down over the city. It is laid out as the Tower's
   courtyard (`courtyard`), as every city's but Overlook's is (Overlook's is its hub, below): on the landward side a portico up three steps (a podium, six columns, an entablature and
   a pediment) before a great timber door in an arch, and either side of it an arcade with a lamp in each alcove; in
   the middle a stepped plinth with an obelisk 18 m high capped in gold, a brazier either side and two toward the
   ends; lanterns on the seaward parapet and stone benches facing the sea, midway between the spawns; and bands of
   stone in the paving, a processional way, a border and a ring round the plinth. Its stations stand in the
   arcades' alcoves, as the Tower's merchants stand in its booths (`stations`): in each alcove a counter under its
   hung lamp, the keeper's place behind it facing the plaza, and shelves of their goods against the back wall. By the
   portico, the Mage on one side and the Harbourmaster on the other; then a vault on each side; on the Mage's side the
   Armorsmith's armour stands, the Weaponsmith's racks, the Tailor's bolts of cloth and the Tack's saddles; on the
   other the three factions' counters, each between two banner stands with its light on the counter (the
   Stormcallers', the Lamplighters' and the Veiled's), and a chandler's stall
   ([[Overlook's Keepers Are the Mage, the Smiths, the Tailor, the Tack and Shape]], [[Factions]]). Eight quiet
   places stand clear of every solid for a visitor who keeps no counter (`visitor_spots`): by each brazier, landward
   of the two outer benches and before the portico's two ends, where Shape stands one week each. In Overlook's hub
   alone the bounty board stands (`board`, [[Activities]]), on the notice board's landing against the Watch Court's
   west range (`hub::BOARD_LANDING_M`), a metre in from its back and facing the court, read from the landing more
   than 8 m from every counter and every place of Shape's. It is two timber posts and a timber face 3.6 m wide, six
   plaster notices in two rows, a lamp and a small gable roof, so the hub draws, collides and lights it as the rest.
   It is no station and no keeper stands at it; a player reads it from 2 m before its face, where its counter is. On
   the court's west side between the landing and the west vault house, 12 m landward of the middle and 42 m across,
   stands the mail counter (`mail`, [[Gear]], "The mail"), a station of its own: a timber counter with two parcels,
   the Postmaster behind it facing the court, served a metre before it as a stall is, and behind him a rack of
   pigeonholes holding letters under a lamp, more
   than 8 m from every other counter, Shape's spots, the arrivals and the board. Its node is
   `<city id>-social`. The landmark and the plaza stand on one platform 12 m over the highest ground under either and
   over every terrace within 250 m of the plaza, so from the plaza the city below is seen whole, over its roofs, as
   from Destiny 1's Tower. Only the cells under the landmark's base rise to it; under the plaza the cells keep
   their own levels and are built on as any other, the plaza's pad standing over its own footprint with its parapet
   for a wall, so what is built beneath it is hidden and the city runs right up to its foot. No terrace wall crosses
   it.

   **Overlook's hub** (`hub`; [[Overlook Becomes a Hub of Courts and Ways, After the Tower]], every call in
   [[Overlook's Hub as Claude Shapes It]]) lays Overlook's social space as courts and ways after the Tower: the
   Watch Court where players land, stone ranges with arched passages to the West Court and the Forge Yard, the Beacon
   Walk's market and the portico, the Hall of the Arts inside the Beacon's base with the three factions' chapels, the
   Stair Yard, and sealed gates: one where the platform runs on round the base either side, and one at the harbour
   way's head, where the city's switchback meets the Stair Yard's edge, a stone wall from the east sealed wall along
   that edge with the gate in it across the switchback's top landing ([[The Harbourmaster Stands in the Market, Rain Spares the Trees, and Patrol Nodes Always Stand]]). Below it the harbour way runs down the
   switchback and ramps to the quay and its pier, where two ships lie moored at their posts, seen and not walked (a
   player's ship docked in a place lies there instead, [[Game]], "On foot"). Each
   keeper stands in a stall of their own placed by its sockets; the Harbourmaster's and the chandlery stand in the
   Beacon Walk's market, in its outer bays between the lamp posts, backs on the base's face and facing the walk. Its ways are laid as
   flagstone walks, every corner where they meet curved, and its gardens' ground as lawn and the Forge Yard's as earth
   under them ([[The Hub's Paths Are Smooth and Rounded]]); each court is a scene of its own pieces
   ([[The Hub's Pieces Tell a Story, and Its Paths Are Paved Apart]]), its trees and bushes the land's own plants
   ([[The Hub's Plants Are the World's Low-Poly Ones]], [[Nature]]). Its townsfolk walk its ways ([[Game]]), and in it
   a fall of 6 m or more kills ([[Reach]]).
10. **Ramps** (`ramps`): every avenue's terraces are joined by a ramp the road's width, and a switchback climbs at
   each avenue's head; Overlook's harbour way is laid down them to the quay, sealed at its head.
11. **Lights** (`lights`), Overlook's alone and never a ruin's ([[Overlook's City Below Is Lit at Night, in Detail]]):
   a lamp post every four ground tiles (25.6 m) along each edge of an avenue's road, 0.8 m in from the paving's edge,
   standing on the pad over it, so on a ramp at the ramp's height; a lantern every 20 m along the quay's seaward edge
   and every 24 m down both edges of each pier, a pair at its head; and on the heads of the two piers nearest the
   harbour, the harbour mouth's light, the tallest. Each keeps 0.5 m clear of every solid that rises over its foot,
   off the plaza and the landmark's base, and 6 m from every other. The page adds the blocks' own streets' lamps, which
   only it can place, holding their ground tiles (`streetLamps.ts`): just in from a dirt tile's edge where the street
   ends beside it within its block, 2 m clear of every building's box (so of its doorways too) and 0.6 m of every
   prop's, and 22 m from every other light, by one rule in the plan's order, the same on every machine.

**Open and locked.** Only Overlook's social space opens for now (`content/world/social.json`, read by the city crate and the page;
[[Only Overlook's Social Space Opens for Now]]): the bake writes every other city's social node as closed, and the
room opens none on it. In the page, Sunspire's and Rimeholt's social spaces, the two other ports, say "Opens later"
over their landing (the same file's `later`) and cannot be chosen; the six desolate cities' social spaces show no mark
and cannot be landed at; and a page asked to start at any of them starts in Overlook. Shape visits Overlook alone (the same file's `shapeVisits`),
the only social node whose file carries his places.

**Its people.** Each keeper stands behind their counter in their own dress (`client/src/game/keepers.ts`), Elder
Maren Hale behind the Lamplighters'; the Harbourmaster and the chandler as the townsfolk are. While the room says Shape
is here, he stands at his week's place, facing the plaza's middle (the plan's own plaza, `plazaBounds`, however far
the ring reaches past it), his mark over him, E within 3 m opening his wares. In Overlook's hub his places stand
clear of the townsfolk: 1.7 m or more from every way's line (a walker keeps 0.7 m right of it and over a metre from
him) and over a metre from every post; two of his eight stand before the harbour way's gate and in the market's west
end.

`city::settle` lays the plan's levels on the land as pads, rectangles of ground set to a level that the ground reads
before its own relief (`land::pads`): the terraces, the plaza and the landmark's ground. So the city's ground is the
same to the bit wherever it is sampled, and a window cut round the social space keeps it ([[Land]]). Past a pad's
edge the land blends into its level within a metre, and where the pad on top changes each side blends to their
middle, toward a level at most a step (0.5 m, `BLEND_MOST_M`) off its own, so a lip a body would step is a slope it
walks, the ground runs on without a ledge along a ramp's side, and a terrace standing higher sinks at most a quarter
of a metre at its edge, where its wall stands: blended all the way, the floor beside the wall would sink, and a body
walked into the dip would be carried up and over it.
A seam hidden under a later pad (the cells under the plaza) shows nothing (`Pads::seam_near`), and at a pad's
corner, where one edge borders the land and the next an earlier pad, each edge blends on its own side. A window
keeps every pad whose seam reaches into it.

## Solids and collision

The landmark and the works are solids: blocks, columns, domes, pyramids, gables and arches, each with its place,
size, turn, lean and roll, dressed in a material the browser pictures from the city's climate. `boxes_within` gives
every solid reaching into a rectangle as a box square to the world, which is what a node's room stands bodies
against ([[Server]]). A box keeps the solid's underside, so a roof, a lintel or a hung lamp over the floor is a box a
body walks under ([[Movement]]). A leaning or rolled solid's box reaches round its base and as far as its top swings
out.

**Natural rock** (`rock`) is four more shapes for what the ground cannot hold, since the land has one height a point
and never overhangs ([[Zones Rise and Fall, Above and Below Ground]]): a cave roof, a thick slab spanning a cavern
that stands on its underside; an overhang, a mass set against a face at its own -y end with a lip jutting toward +y
from 55 % of its height; a rock arch across its width, two legs with broad feet and a head from 62 % of its height;
and a tunnel mouth, two jambs and a head from 60 % of its height set into the rock at its +y end, with a brow jutting
over the opening at its -y end. Each is made from its size and a seed alone. It is a few boxes of its own frame
(`rock::parts`), and each box is drawn as a lump inside it: the box's sides cut into cells about 0.75 m across, each
corner pulled onto the round-cornered body inside the box and then in along its normal by the land's exact noise
(broad bulges 5 m across and crags 1.6 m across), by up to a quarter of the box's half each way and 1.2 m on its
sides, up to 56 % and 2.8 m underneath; a side set against the ground, a face or the rock stays flat and full. So `rock::boxes`, each part's
box turned and stood at the rock's place, holds every vertex drawn, and a body walks under a roof, through an arch or
a tunnel mouth, and up an overhang's face only until its head meets the lip (`crates/city/tests/rock_walks.rs`). The
browser makes the same vertices to the bit (`rules/rockMesh.ts` writes the exact noise again; both pin the same
fingerprints). A city's boxes (`boxes_within`) and a layout's (`crates/layout/src/collide.rs`) take a rock's parts'
boxes, a part turned off the world's axes in strips that keep within 0.45 m of it
([[What a Body Meets Keeps to What Is Drawn]]).

## How it is drawn

`CityView` is a drawer for the game's scene, drawn into the scene's own pass. It is handed a plan, the continent's
climate (`cityClimate` of its biome), the RMB blocks the plan names and the forged tables; `drawInto`
draws a frame; `cleared(x, y)` is true on the pads and under every solid's footprint, the quays and piers among
them, for nature to keep off. Every position is measured from the city's middle, so the GPU's floats keep their
precision 3 km out.

**Built a few steps a frame.** The game hands a city over with `beginCity`: its drawing is worked out in small steps
(`cityBuildSteps`: a cell's pieces, a model forged, a piece's masses and its crystal, a solid, 4,096 vertices laid) and put on the
GPU a buffer a step, and before each frame is recorded (`prepare`) the build takes steps for 2 ms while an older city
stands drawn, 24 ms while none does (behind the veil, which waits on it). The city drawn before is drawn, lit and kept clear until the new one is whole,
then the new one in its place, so nothing half-built shows. A landmass's city is built so once it opens, and its
layouts' city again whenever the layouts within 4 km change ([[Layouts]]). A city begun again before it is whole is
let go. The [[World Editor]] builds in one go (`setCity`); either way the same city is made, to the byte.

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
plaza and across the city. Natural rock is drawn as its lumps' triangles, each lit flat so it reads as faceted crags, its
picture laid from the axis each triangle faces most; it wears its material's picture as any solid does, rubble for
rock, which a layout's stone turns to its own (the Downs' chalk). A block's model stands at its cell's corner plus its placement, at the cell's level,
turned by its yaw ([[RMB Blocks]]).

**The ground.** Every levelled cell has a plate at its level at every distance, so the 1 km land's smoothing never
shows a terrace floating or buried. A block's cell wears its ground tiles in the climate's terrain set, turned as
Daggerfall Unity turns them. An avenue is a road 38.4 m wide toward each paved cell beside it, lawns either side,
with no kerb or border, so a run of avenues reads as one road; the landmark's own ground is paved. The terraces'
retaining walls and a plate's skirts, 30 m down its open sides or to the lower plate beside it, are rubble near the
ground's colour, so the walls between the terraces read as terracing, not as a grid. The whole city is
drawn nearer in depth than it stands (not on screen) by 5 cm and 1.2 % of the distance, above the sea only, since
the 1 km land stands up to about 20 m off a terrace's level (`PULL_WGSL`); a plate is drawn 3 cm under its level, so a
floor laid at that level shows over it. Where a city or a layout is drawn, a figure's lowest quarter metre is pulled
the same way, fading to none above it, and so is its contact shade, so the walks, lawns and paving under it no longer
cut its soles off; nothing at a body's height (a hit's star, a weapon's glow) moves in depth.

**The pictures.** One texture array of at most 252 layers, each picture resampled to 128 texels square, sampled
nearest up close and mipmapped far off. A building's windows are cut to their picture's frame as the city's climate
turns the picture, a climate's turn holding its own kind of window. A window's panes are clear in its picture's alpha: an open building's
windows draw them as nothing (`CLEAR_GLASS`), so they are seen through, its room's lining cut away behind each
(`cutAtWindows`), while a closed building's windows are drawn whole. Daggerfall's stone is dark, so a solid's picture may be painted lighter or
warmer, a factor a channel, as its own layer. The ground's tiles and the solids' pictures come first, then the
forged models' by how much the city wears them. Up to four workers paint them; a layer shows its guessed colour until
painted, and what is painted is kept for the next city. Gold, iron, bone, cloth and water are painted in the shader
on the texels a picture would have, 24 a metre
([[The Hub's Fidelity Goes Beyond the Limits, by Procedural Textures]]): wrought iron's hammer marks, pits and rust,
most on what faces up; gilding burnished and worn through to the bronze; bone's grain and yellowing; cloth's dye under a
weave of uneven threads, taken unevenly; still water (`water`: a fountain, a trough) deep green-blue, its face stirring
slowly. A picture is lighter or darker in patches some metres wide, so its repeats do not line up. A walk's flagstones
(`path`) wear their own picture over the paving's, the flags in courses, lighter and warmer, so a way reads apart from
the ground; a garden's lawn (`lawn`) and a working yard's trodden earth (`earth`) wear their climate's own grass and
dirt. These three take their pattern on top from the world, not the piece, so their pieces join as one surface where
they meet or overlap (`solidMesh.ts`, `grounded`). The glow is lit warm and unshaded, brighter at night, each flame
flickering on its own, and each glowing solid is a lamp ([[Sky]]). Faces are lit as the land is, with a
little light thrown back onto walls from the ground, the lamps' light at night, and the rain's darkening and sheen.
In the game the solids cast into the sun's near and far shadow maps, the near cells' models into the near one, and each
building's masses (its hull past where the masses are drawn) into the far one, a few boxes standing in for a model
whose shadow at the far map's 1.2 m texels is the same; every face and plate is lit through both ([[Game]]). An open
building's windows let the sun into its rooms through their clear panes: its models cast through a pass that reads
their pictures (`MODEL_CLEAR_CAST_SHADER`), every other model through one that reads none.

| Material | Temperate | Desert | Mountain | Swamp |
|---|---|---|---|---|
| Stone | pale limestone ashlar (109.1, lightened, warmed) | sandstone ashlar (9.1) | grey granite (109.1, lightened) | mossy grey blocks (458.1) |
| Trim | carved frieze (161.1, pale) | banded sandstone (42.1) | carved frieze (161.1, grey) | carved frieze (161.1, green-grey) |
| Roof | red tiles (369.2) | terracotta (69.0) | slate (469.2, lightened) | mossy thatch (469.3) |
| Timber | boards (364.1) | plain boards (67.0) | plain boards (67.0) | dark boards (426.1) |
| Plaster | sandstone plaster (312.1) | white plaster (38.1) | sandstone plaster (126.1) | plaster with vines (442.1) |
| Paving | crazy-paved flags (324.2, warmed) | sandstone cobbles (17.1) | square flags (323.2) | crazy-paved flags (324.2) |
| Terrace walls, a ruin's rubble | brown rubble (335.1) | sandstone rubble (17.1) | dark rubble (112.1) | mossy rubble (409.1) |

Winter takes each picture's snowed turn where its set has one, unlightened.

**At night**, Overlook's city below the hub is lit ([[Overlook's City Below Is Lit at Night, in Detail]], [[Sky]]),
everything coming up through the dusk as the lamps do (`lampsLit`):

- **Windows.** A forged model's window panes (its glass picture's glass texels) glow warm, each window lit or dark as
  one: a model's pieces, its triangles joined by their corners, are numbered in its vertices (`pieceNumbers`). Far
  off, each mass's and hull's walls are laid with windows as the forged buildings lay them (one a storey, 3.2 m,
  apart, 2 m wide over a 0.9 m sill, the run's ends 0.5 m clear), drawn 1.8 m tall, and evened out to the share lit
  where a window is narrower than a pixel, so far walls read warm without shimmering. Each window draws, from its
  building's place and its own number, whether it is lit tonight and when it goes dark, by its cell's district
  (`windowLights.ts`):

  | District | Lit at dusk | Going dark |
  |---|---|---|
  | Markets | 62 % | 21:30 to 05:00 |
  | Harbour | 58 % | 22:00 to the dawn |
  | Houses | 45 % | 21:00 to 02:30 |
  | Guilds | 42 % | 21:00 to 01:00 |
  | Noble quarter | 50 % | 20:30 to 23:30 |
  | Temples | 32 % | burning till the dawn |

- **Lamps and lanterns.** Each light's post is a forged model of its kind, drawn by instance in the near cells: an
  iron post, its lantern burning in the glow's colour and an iron cap. Its flame is a glowing point (`glowPoints.ts`)
  drawn over the finished picture after the water, never less than 2.2 pixels across, so the lit city reads from
  the sea; a lantern's and the mouth's lay a column of their light on the water under them, rippling. The pools of
  light round them are a light map of the city, 3.2 m a texel, written once as the city is built: each lamp's pool
  falls off as the square of the way out to its reach (a lamp's 9 m, a lantern's 8, the mouth's 14), pools adding
  where they meet. The ground, the solids and the buildings read it at night, up to a few metres over their cell's
  level, so a wall by a lamp is lit at its foot. None of them is one of the sky's sixteen lamps.

**What it costs.** Cells are grouped by 4 x 4 into chunks, culled against the view; consecutive chunks are one draw
call. Overlook's build is about 0.8 to 1 s of work in Node, some 118,000 steps: about 500 frames at 2 ms, 40 at
24 ms. Most steps take microseconds; a model's forging is one step, the largest about 10 ms in Node. Its 157
pictures are painted in about 5 s on three workers. In headless
SwiftShader at 1280 x 720:

| From | Triangles | Draw calls |
|---|---|---|
| The plaza, at eye height by its parapet | 60,274 | 138 |
| The platform's edge, looking along the coast | 222,367 | 172 |
| The Beacon, 280 m off | 462,486 | 153 |
| The sea, 3 km off the harbour | 413,188 | 3 |
| 400 m up, 8 km out | 415,338 | 3 |

## Ruins

Which cities are ports has one source, the world crate's `MAIN_PORTS` (`is_main_port`); every other city is a ruin
(`ruins::is_ruined`), and its plan says so (`ruined`). A ruin is planned by the same rules as a port city, on the same
site: its footprint, cells, terraces, ways, districts, landmark's place and social space are where a port city's would
be, so its land, its nodes and its plaza's floor stand as they would. Then what stands on it is broken:

- **Its name** is "Ruins of" and the city's name (`ruined_name`): its social space's node, its title on arriving and
  landing, and the landing list name it so.
- **Its landmark** is broken off at a third of its height over the platform: a solid wholly above the break is gone,
  a block, column or frustum through it ends there with the taper it had, a dome, gable or arch through it falls
  whole, and a light it carried is out, iron where it glowed.
- **Its wall** is breached at one piece in three and at every gate: each breach is a heap of rubble 4.5 m high where
  the piece stood, a gate's arch gone into one across the gateway. Its towers and gatehouses stand to half their
  height over the ground, roofless.
- **Its harbour's** piers are broken off at 40 % of their length from the quay. Two wrecks lie in it (`wrecks`): a
  Sloop 70 m one side of the harbour's way out and a Schooner 80 m the other, each where the water first lies more
  than 4 m deep from 170 m out (none where no such water lies within 750 m), heeled 25 degrees, one to each side,
  its heading across the way out turned a little by the city's seed. The page draws each with the ships layer's
  mesh, every face more than 2 m over its highest deck left out (its masts and spars), settled in the water to its
  deck's middle height and shaded 0.6 as light as a ship afloat, in no side's colours (its pictures as painted, no
  flag), at the size every ship is drawn at: at sea the Overworld's four times and the size coming in
  (`shownScale`), true size on foot.
- **Its ways** are strewn with rubble: four heaps in each avenue's cell, each 3 to 7 m by 2 to 5 m and 0.8 to 2 m
  high, turned at random, seeded by the cell; none within 110 m of the plaza, so no heap stands in its node.
- **Its plaza** is walkable and empty: its counters stand bare, without their goods, and no station is kept, so no
  keeper or townsfolk stand there, no counter is served by its room, and nothing is offered (`stations`): with no
  counters its room is no social space, so it sends no wares, no emblems of the day and no crate's price. Its room's
  boxes are a port city's but for the goods and what of the landmark is gone.
- **Its buildings** are broken where the page stands them (`ruins.ts`), each by its place to the centimetre, the same
  on every machine: one in four has fallen to a heap of rubble over its hull's footprint, a quarter of its walls'
  height and at least 1.5 m; the rest are broken off at 35 to 75 % of their height, never above their lowest wing's
  eaves, so roofless, the edge ragged, each 1.5 m square of wall fallen up to 3 m lower or half its standing height,
  their walls darkened toward the break, at the break 78 % darker. Near, the forged model is cut at the break in the
  shader and drawn from both faces, an open shell, its level faces over a quarter of the break's height (its upper
  floors and ceilings) left out too; its shadow is cast as if every corner above the break stood at it, lidded there.
  Its masses and hull end at the break, open at the top and drawn from both faces, so a ruin reads as one at every
  distance, from the sea and the Overworld too. A ruin's windows stay dark at night and its streets unlit.

Every heap is a frustum of rubble, its top 0.3 of its base, dressed in the climate's terrace rubble. At sea a ruin
shows no port icon over its harbour and offers no docking there; its island's other landings stay ([[Game]],
"Landings").

### Overtaken by the Lattice

Every ruin is overtaken by the Lattice's red crystal, the ruined port's people turned to it where they stood
([[The Ruined Cities' Waters Are the Lattice's, and Their Ruins Are Overtaken]]); a port city has none. The crystal is
drawn in its own material (`crystal.ts`): red in the sun, purple in its shadows, its core glowing. Every piece is a
six-sided spire, a body three quarters of its height tapering to 0.8 of its width, then a point (`spire`, laid alike by
the crate and the page), or a shard, one six-sided point two sevenths as wide as it is high; leaned out from what
it grows from, rolled a little, its six faces cut flat. All of it is seeded, by the city in the crate and by each
building's place to the centimetre in the page, the same on every machine.

- **The landmark** is crowned on what it kept (`crown`): on the broadest flat top among its highest kept solids (a
  block, or a column or frustum broken off at the break, its top as tapered there), as that solid stands, turned or
  leaning. From the middle of that top a spire 85 % of the height the landmark lost, leaning 3 to 7 degrees; 5 to 8
  great spires round it, a quarter to two thirds as tall, leaning 11 to 34 degrees out; 14 to 20 small ones round
  the top's rim, leaning out 29 to 63 degrees; every foot on that top, within 0.9 of its half breadth. Every other
  kept top at the same height (a span's piers, a ring of columns) bears a lesser crown: a spire from its middle a
  fifth to a third as tall as the great one's, at most 5.4 times its top's width, and 2 to 4 round its rim. It is
  among the landmark's solids, so the room's boxes hold it. Its three tallest spires light the night.
- **The rubble** of the ways and the breaches is crusted (`crusted`): 2 to 5 shards on each heap's upper slopes, 0.5
  to 1.6 m high, 3 more on a breach's fall, 1 to 2.8 m. They are among the works, which the page draws; no room
  holds them, as every heap lies outside the plaza's window and no other node's window reaches the city.
- **The formations.** The page's crystal is 40 formations made once, the same on every load (`FORMATIONS`), four of
  each of ten kinds, each meshed as a forged model is and placed by instance, turned and sized there. Each grows out
  along its own east from its foot:
  - a heavy break's cluster: 3 to 4 spires 3 to 6.5 m and 8 to 12 shards 0.5 to 1.6 m, spread 2 m either way;
  - a light break's: 2 to 3 spires 1.5 to 3.2 m and 4 to 7 shards 0.4 to 1.2 m;
  - a mass: a main spire 6 m in the middle, nearly upright, 5 to 8 more round it 2 to 4.5 m and 6 to 10 shards,
    spread 3 m every way, leaning every way;
  - a great formation: a main spire 18 m, leaning 4 degrees, 4 to 6 more round it 5 to 13.5 m leaning 14 to 40
    degrees, and 6 to 10 shards 0.8 to 3 m, spread 4 m every way: never one lone needle;
  - a sheet: 16 to 22 shards 0.3 to 0.8 m over a wall's face 4 m wide and 3 m high;
  - a vein's two shards 1.1 m apart up a wall; a doorway's 4 to 6 shards 0.8 to 2.2 m; a window's 3, 0.4 to 1 m; a
    patch's 4 to 7 shards 0.4 to 1.6 m leaning every way; and a heap's heart, 3 to 5 spires 1.5 to 4.5 m and 4 to 7
    shards.
- **A broken building** (`buildingGrowth`, standing buildings only, not props) grows from its kept masses (its
  wings, each broken off at the break), never from the box round them: 12 % are untouched, 33 % heavily overtaken,
  the rest lightly.
  - Heavily: 2 to 3 heavy break clusters on its wings' wall tops, leaning out, each the wing's standing height over
    3.5 times its own (0.9 to 2); a mass rooted on the floor of its largest wing's open shell, rising well over the
    break (the larger of that wing's smaller half over 2.5 and its standing height over 4, 0.6 to 2.5 times its own),
    so the building is mostly crystal over its break; 2 to 4 sheets over its wings' walls from the ground up, the
    wing's height over 3 times their own (0.6 to 2); windows' shards at 1.8 m on each long side of its largest wing;
    1 to 2 patches through the paving 1.5 to 4 m out from that wing's walls, none where another wing stands.
  - Lightly: 1 to 2 light break clusters, and a sheet one time in two.
  - Both: veins climbing from the ground toward the break, a formation every 2.2 m, one in five missing, at every
    outer corner of every wing (none at a corner standing inside another wing) heavily and at about half of them
    lightly, and heavily at a seam of each long side of its largest wing; a doorway's formation at the foot of a
    long side of its largest wing.
- **A fallen building's heap** (`heapGrowth`): but for the untouched share, a heap's formation rises from its heart,
  half way up the heap, the heap's height over 2 times its size (0.8 to 1.6).
- **The great formations** stand across the city, drawn at every distance, so the skyline seen from the water is
  broken by crystal everywhere:
  - on every tower and gatehouse tower of the wall, on its broken top, 1 to 1.6 times their size; in every breach,
    0.9 to 1.3; at the broken end of every pier, 0.8 to 1.1; along the quay, at three in five places 60 m apart, 0.7
    to 1 (`worksGrowth`);
  - rooted with a heavily overtaken building's mass, the largest wing's standing height over 4 (0.8 to 1.8), and
    out of a fallen heap of 150 m² or more, the root of its area over 14 (0.8 to 1.6), each by a chance that grows
    from 3 % at the grid's edge to 45 % at its middle with the square of the nearness (`GREAT_CHANCE`): the
    overtaking spread from the heart.
- **The harbour's wrecks** (`wreckCrust`) are crusted at the waterline: patches round the hull as long and broad as
  its ship's, one about every 3 m, three in ten missing, set out as large as the wreck is drawn (the ships' size: at
  sea larger, true size on foot), drawn at every distance. It is written again only once the ships' size has moved
  by more than a fiftieth since it was last written (`WreckCrust`), into the same instances.
- **The plaza stays clear:** nothing the page lays reaches into the 110 m window round the plaza, as no rubble lies
  there; only the crown on the landmark stands within it.
- **Near and far.** Each formation is laid by chunk (`crystalInstances.ts`), and a pass draws only the chunks it sees
  (the view's, or a shadow cascade's), each formation's chunks joined into as few draws as run. The great formations are
  drawn at every distance; a heavy building's clusters and mass in the middle distance, the chunks within 1 200 m of the
  eye (`MIDDLE_M`), each formation fading out by its own distance over the 300 m short of that, dithered as the
  buildings' tiers are (`middleFade`), so none pops; its shadow is not faded, and stops with the chunk at `MIDDLE_M`. A
  port city draws no crystal pass at all. Everything else the page grows is drawn in the near cells with the forged
  models, dithered as they are. The rubble's crust is drawn in the chunks within the near tier's reach (`detailRuns`).
  All of it casts into both shadows but the near cells' and the crust, which cast into the near one. A spire's body has
  no top meshed: its tip stands on it.
- **At night** a ruin's crystal glows brighter than any other crystal a city draws (its core 0.8 alight, against
  0.45), so a ruin is a scatter of red on a dark coast; each great formation lights a lamp of the crystal's
  light (`CRYSTAL_LAMP`) a third of the way up it, reaching 6 m more than it stands tall, at most 30 m; with the
  crown's three, the sky's nearest lamps are chosen from them as from any city's.
- **Its cost**, over the six ruins (`ruinBudget.test.ts` holds each under its limits): 101 276 to 157 326 triangles of
  solids (the crown, the heaps, the works); 1 172 to 1 439 great formations, 287 120 to 352 356 triangles, and as many
  lamps, of which a view sees a part (from each plaza looking at its landmark 161 844 to 182 240; measured once from the
  sea 600 m off Mistfall's harbour, 297 860); from the landmark, before the view's culling, 861 980 to 1 001 722
  triangles of the middle distance's crystal and 483 380 to 586 910 of the near cells'; each city built in 0.96 to 1.24
  s where its buildings whole take 0.48 to 0.68 s.

## Limits

- Only the social space is walked; the city's blocks stand no colliders.
- Streets are the RMB blocks' own; an avenue is an open paved cell, not a street drawn through the blocks.
- A leaning or rolled solid's box is square round all of it, so a body meets it a little early.
- The parapet hides the city just below it from back on the plaza: from a spawn, 4 m in, the city shows from about
  250 m out, and all of it only from the parapet itself.
- Props are drawn only near; flats (trees, people, lamps) are not drawn: a lit city's street lamps stand by its own
  rule instead.
- Only Overlook is lit at night. A far mass's windows stand where the forged building's would on a plain wall: a
  door's place or a lower wing's gable is not left out. An open building's panes stay clear at night, its room unlit.
- The city's lamps light its ground and walls through its light map only: a figure, a ship or the land under it
  takes none of their light, and the light map's pools ignore what stands between a lamp and a wall.
- The depth pull lets the city show through land within its share of the distance in front of it.
- A ruin's building's break is ragged by squares, not broken stone; inside its open shell the forged model's own
  faces show, lit from the side seen. At sea a wreck is drawn as large as the ships, and so larger than the city
  round it.
- Fallen buildings' heaps and the ways' rubble are not walked against: only the plaza is.
- A wreck is drawn only once its ship's mesh has come from the ships' bucket, and casts no shadow.
