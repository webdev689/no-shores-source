---
type: system
status: planned
code:
  - content/world/layout.json
  - crates/world/src/layout.rs#Layout
  - crates/world/src/check.rs#check
  - crates/world/src/geometry.rs#doubled_area
---
# World Map

The world's structure, as [[The World Map]] decides it: one ocean the size of Tamriel's frame, nine hand-placed
continents, thousands of static isles, and discoveries that come and go. This note says how it is built. Built so far:
the layout file, the rules it keeps, and the [[World Editor]] that paints it.

## The layers

Each layer reads the one above it and owns its own data ([[Generated Files Stay Out of Git]]):

| Layer | What it holds | Made by | Kept |
|---|---|---|---|
| The layout | The ocean frame, each continent's position and outline, each static isle's place and seed | Us, in the World Editor | In git, as a small authored file |
| The land | Terrain, rivers, soil and biomes for each continent and isle, and the seabed around them | World 2.0's generators, from the layout and each continent's climate profile | Baked offline to R2, streamed by region |
| The settlements | Towns, ports, roads and buildings | World 2.0's settlement generator and our editors | Baked with the land |
| The persistent state | Who first discovered each isle; what players own and change | The server | PostgreSQL ([[PostgreSQL]]) |
| The passing state | Discoveries, weather, sea state | The shared Rust rules, from seeds and world time | Nowhere: regenerated identically from the seed |

## The layout file

`content/world/layout.json` holds the layout: each continent's id, its outline as a closed ring of points, and its
climate profile once chosen; each static isle's id, centre, radius, seed and climate. A point is `[x, y]`, whole metres
east and south of the frame's north-west corner. The file starts empty: the owner places the continents.

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

Each continent carries a climate profile, starting from one of World 2.0's ten (temperature, rainfall, prevailing
wind, seasons, ruggedness, wetness, rocks). World 2.0's climate and biome generation varies that profile across the
continent with latitude, height, rain shadow and distance from the sea, which keeps each landmass distinct inside its
main biome.

## Static isles and discoveries

- **Static isles** are fixed by the layout: a place, a seed and one biome. Thousands are too many to hand-shape, so
  each is generated from its seed by the same generators, identically everywhere. The server holds who discovered
  each first.
- **Fog of war.** Each player's map starts dark and clears where they have been. The server keeps each character's
  charted ground and the isles they have found, and tells a client about an isle only once that player has found it
  or is close enough to see it, so a hidden isle cannot be read out of the client.
- **Discoveries** are rolled by the server in the open sea between landmasses: a place and a seed. Every client near
  one generates the same island from the seed, as DFO's spawned dungeons are shared. The server lets one go a while
  after the last player leaves.

## Weather and travel

- The weather is one field over the whole map, computed from world time and position by the shared Rust rules, so the
  wind a ship sails by is the wind the server judges. DFO's dynamic weather and clouds draw from it, rewritten for
  WebGPU ([[WebGPU Only]]).
- Ships sail faster than real speed, and faster still in the Overworld, DFO's raised travel camera over the same
  world. The speeds are tuning numbers, set by playing.

## Limits

- Which nine of World 2.0's ten climates the continents take is decided later, and the continents' outlines are
  ours to draw ([[Open Questions]]).
