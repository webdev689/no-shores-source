---
type: system
status: planned
code:
  - content/world/layout.json
  - content/world/open.json
  - crates/land/src/sites.rs#locked
  - crates/world/src/layout.rs#Layout
  - crates/world/src/check.rs#check
  - crates/world/src/geometry.rs#doubled_area
---
# World Map

The world's structure, as [[The World Map]] decides it: one ocean the size of Tamriel's frame, nine hand-placed
continents, thousands of static isles, and discoveries that come and go. This note says how it is built. Built so far:
the layout file, the rules it keeps, the [[World Editor]] that paints it, and the [[Land]] generated from it.

## The layers

Each layer reads the one above it and owns its own data ([[Generated Files Stay Out of Git]]):

| Layer | What it holds | Made by | Kept |
|---|---|---|---|
| The layout | The ocean frame, each continent's position and outline, each static isle's place and seed | Us, in the World Editor | In git, as a small authored file |
| The land | Terrain, rivers, soil and biomes for each continent and isle, and the seabed around them | The land crate: relief, erosion, rivers and lakes from the layout, the climate and the owner's edits, the same on any machine ([[Land]]) | The owner's edits in git, in `content/world/land/`; baking to R2 by region is planned |
| The settlements | Towns, ports, roads and buildings | Towns, ports, roads and carved rivers: drawn by the owner in the World Editor's Land mode. Buildings, and World 2.0's settlement generator, come later | In each landmass's edits file |
| The persistent state | Who first discovered each isle; what players own and change | The server | Cloudflare D1 ([[Accounts Start as Guests, on Cloudflare D1]]) |
| The passing state | Discoveries, weather, sea state | The shared Rust rules, from seeds and world time | Nowhere: regenerated identically from the seed |

## The layout file

`content/world/layout.json` holds the layout: each continent's id, its outline as a closed ring of points, and its
climate profile once chosen; each static isle's id, centre, radius, seed and climate. A point is `[x, y]`, whole metres
east and south of the frame's north-west corner. The owner paints the continents into it with the [[World Editor]].

The `world` crate reads it (`layout.rs`) and checks it (`check.rs`), in integer arithmetic only (`geometry.rs`):

| Rule | From the decision |
|---|---|
| Every point within the frame, 4,915,200 × 3,072,000 m | Tamriel's frame at DFO's scale |
| At most nine continents while drafting; exactly nine when finished | Nine continents |
| Each continent between 161,600 and 940,000 km² | Daggerfall's whole map up to Hammerfell |
| An outline has three points or more and never crosses or touches itself | A coast is one closed line |
| No two continents overlap | Continents spread across the ocean |
| An isle is smaller than the smallest continent, inside the frame, and clear of every continent and other isle | Much smaller islands in the open sea |
| Every id is unique, for good | Places, saves and discoveries refer to it |

A test reads the repository's layout file and holds it to these rules, so a layout that breaks one cannot merge.

## Scale and precision

Positions are metres from the frame's corner, up to about 4.9 million. A 32-bit float has steps of half a metre at that
distance, so positions are 64-bit on the server and in the client's world logic, and the GPU draws everything
relative to the camera. The server and its rules use the same units ([[Agree to the Bit]]).

## Continents and biomes

Each continent is one biome ([[Each Continent Is One Biome]]). It carries a climate profile, starting from one of
World 2.0's ten (temperature, rainfall, prevailing wind, seasons, ruggedness, wetness, rocks), and the profile is not
varied across the continent into other biomes. Which biome each continent is: [[The Continents' Biomes]].

## Static isles and discoveries

- **Static isles** are fixed by the layout: a place, a seed and one biome. Thousands are too many to hand-shape, so
  each is generated from its seed by the same generators, identically everywhere. The server holds who discovered
  each first.
- **Fog of war.** Each player's map starts dark and clears where they have been. The server keeps each character's
  charted ground and the isles they have found, and tells a client about an isle only once that player has found it
  or is close enough to see it, so a hidden isle cannot be read out of the client. For now the [[Held Map]] keeps what
  a player has discovered in their browser, and the client holds every continent's outline.
- **Discoveries** are rolled by the server in the open sea between landmasses: a place and a seed. Every client near
  one generates the same island from the seed, as DFO's spawned dungeons are shared. The server lets one go a while
  after the last player leaves.

## Seen whole, reached by nodes

The player reaches an island only at its nodes ([[Every Island Is Seen Whole and Reached by Nodes]]). From the
Overworld's bird's-eye view of the side of an island, they choose a node (a mission, a dungeon, a social space, a
patrol area, a world boss) and are taken there. A node is one section of the land, and its edge warns the player to
go back. The rest of the island and of its city is the same ground the [[Land]] generates, drawn in less detail with
distance, never reached. Each island has one major port city; Saltmere's is Overlook.

Patrol areas and missions open as a pass is done on each ([[Patrol Zones and Missions Open as Their Pass Is Done]]).
`content/world/open.json` lists the open ones by id. Every other patrol area and mission is locked; social spaces,
dungeons and world bosses never are. A locked node still shows where
the player picks a landing, greyed with a lock ([[Overworld]]), but neither a click on it nor a gate toward it
([[Layouts]], "Gates") takes anyone there, and its room turns every player away ([[Server]]). A pass opens a node by
adding its id to the list; a test holds the list to patrol and mission nodes of the edits files, each once.

A page playing alone opens any node, locked or not: with no `?room=`, `?at=<id>` arrives there, and `&spawn=` and
`&view=` picture it ([[Toolkit]], "Browser QA").

## Weather and travel

- The weather is one field over the whole map, computed from world time and position by the shared Rust rules, so the
  wind a ship sails by is the wind the server judges. DFO's dynamic weather and clouds draw from it, rewritten for
  WebGPU ([[WebGPU Only]]).
- Ships sail faster than real speed, and faster still in the Overworld, DFO's raised travel camera over the same
  world. The speeds are tuning numbers, set by playing.

## Limits

- No isles are placed yet; the nine continents are drawn and each has its biome ([[The Continents' Biomes]]).
