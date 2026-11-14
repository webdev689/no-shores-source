---
type: system
status: planned
code: []
---
# World Map

The world's structure, as [[The World Map]] decides it: one ocean the size of Tamriel's frame, nine hand-placed
continents, thousands of static isles, and discoveries that come and go. This note says how it is built; nothing is
built yet.

## The layers

Each layer reads the one above it and owns its own data ([[Generated Files Stay Out of Git]]):

| Layer | What it holds | Made by | Kept |
|---|---|---|---|
| The layout | The ocean frame, each continent's position and outline, each static isle's place and seed | Us, in the World Editor | In git, as a small authored file |
| The land | Terrain, rivers, soil and biomes for each continent and isle, and the seabed around them | World 2.0's generators, from the layout and each continent's climate profile | Baked offline to R2, streamed by region |
| The settlements | Towns, ports, roads and buildings | World 2.0's settlement generator and our editors | Baked with the land |
| The persistent state | Who first discovered each isle; what players own and change | The server | PostgreSQL ([[PostgreSQL]]) |
| The passing state | Discoveries, weather, sea state | The shared Rust rules, from seeds and world time | Nowhere: regenerated identically from the seed |

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
  each first and tells a client about an isle only once it may know of it, so a hidden isle cannot be read out of the
  client.
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

- Which nine of World 2.0's ten climates the continents take, and the continents' outlines, are the owner's to choose
  ([[Open Questions]]).
- Whether "hidden until discovered" hides an isle from each player until they find it, or from everyone until anyone
  does, is open ([[Open Questions]]).
