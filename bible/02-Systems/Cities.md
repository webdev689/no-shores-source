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
  - crates/city/src/collision.rs#boxes_within
  - crates/land/src/pads.rs#Pads
  - crates/land/src/sites.rs#City
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
| 2 | Cairnwatch | `span` | An aqueduct straight through the city along the coast, its arches 60 m over the highest ground, a cistern keep at its head |
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
8. **The landmark**, of the motif's solids.
9. **The social space**: a plaza of 260 × 120 m on the landmark's seaward side, level with its foot, walled with a
   parapet on its open sides, its section 2 m inside its edge and its four spawns along the landmark's side. Its node
   is `<city id>-social`.

`city::settle` lays the plan's levels on the land as pads, rectangles of ground set to a level that the ground reads
before its own relief (`land::pads`): the terraces, the plaza and the landmark's ground. So the city's ground is the
same to the bit wherever it is sampled, and a window cut round the social space keeps it ([[Land]]).

## Solids and collision

The landmark and the works are solids: blocks, columns, domes, pyramids, gables and arches, each with its place,
size, turn, lean and roll, dressed in a material the browser pictures from the city's climate. `boxes_within` gives
every solid reaching into a rectangle as a box square to the world, which is what a node's room stands bodies
against ([[Server]]).

## Limits

- Only the social space is walked; the city's blocks stand no colliders.
- Streets are the RMB blocks' own; an avenue is an open paved cell, not a street drawn through the blocks.
- A leaning or rolled solid's box holds the whole of it, so a body meets it early.
