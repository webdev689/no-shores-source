---
type: system
status: planned
code:
  - content/world/layout.json
  - crates/world/src/layout.rs#Layout
  - crates/world/src/check.rs#check
  - crates/world/src/geometry.rs#doubled_area
  - crates/world/src/waters.rs#Waters
  - crates/world/src/traffic.rs#Traffic
  - crates/world/src/ports.rs#MAIN_PORTS
  - client/src/rules/watersRules.ts#startWatersRules
---
# World Map

The world's structure, as [[The World Map]] decides it: one ocean the size of Tamriel's frame, nine hand-placed
continents, thousands of static isles, and discoveries that come and go. This note says how it is built. Built so far:
the layout file, the rules it keeps, the [[World Editor]] that paints it, the [[Land]] generated from it, and the
sea's waters and friendly traffic as rules and doors (nothing draws them yet).

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

## Waters

The sea is split into nine waters, one an island ([[The Waters Come From the Islands]]). The `world` crate judges them
(`waters.rs`):

- A point of sea belongs to the island whose coast (its continent's outline) is nearest, by straight-line distance in
  metres; a tie goes to the lower continent index. A point inside an outline or a static isle's circle, or on its
  coast, is land and has no water; an isle's sea belongs to the island nearest, as any sea does. A point that is not a
  finite number has no water.
- Each water's holder and name come from the table `WATERS`, by continent id. Claude named the waters; the owner can
  change any name.

| Continent | Holder | Name |
|---|---|---|
| continent-1 | Home: no hostile ship | The Lantern Sea |
| continent-2 | Contested | The Cairn Straits |
| continent-3 | Grey Tithe | The Elmwater |
| continent-4 | Pirates | The Sunscorch Coves |
| continent-5 | Pirates | The Gilded Reach |
| continent-6 | Pirates | The Mistwrack |
| continent-7 | Grey Tithe | The Windward Levy |
| continent-8 | Grey Tithe | The Fen Deeps |
| continent-9 | Grey Tithe | The Rimeholt Deep |

- The contested seam: a point whose nearest coast is continent-4's or continent-8's, and which is at most 200 km
  farther from the other one's coast than from its own (about 100 km either side of their border), is contested
  whatever its water's holder. It keeps its water's name.
- `borders()` says which waters touch: the pairs whose sea cells lie side by side on a 10 km grid. On today's layout
  there are 17: 1-2, 1-3, 1-4, 1-5, 1-8, 1-9, 2-5, 2-6, 2-9, 3-7, 3-8, 3-9, 4-5, 4-8, 5-6, 7-8 and 7-9. 4-8 is the
  only border between a pirate water and a Tithe water.
- `grid(cell_m)` judges the frame at each cell's middle, row by row from the north-west: one byte a cell, the
  continent's index for sea with bit 0x80 set on the seam, 255 for land. The [[Held Map]] tints from it.
- Speed: a bucket grid of 32 km cells lists, for each bucket, every coast edge that can be nearest to some point in it,
  so a query looks at a few dozen edges; each bucket lists the isles that can be nearest the same way. `water_at`
  takes about 0.4 µs natively; `grid(4_800.0)`, 1024 × 640 cells, about 80 ms natively in release and 100 ms in
  WebAssembly. A cell that is not a positive finite number is refused.
- Only + − × ÷ and square roots on 64-bit floats, so every machine gives the same answer ([[Agree to the Bit]]).

## Traffic

Friendly ships sail between the port cities all the time, seen from land and sea (`traffic.rs`, `traffic_routes.rs`).
The numbers are Claude's, under the owner's "Friendly ships should dynamically travel. Visible on land and sea".

- **Main ports.** Three port cities remain: Overlook, Sunspire and Rimeholt, one for each holder of the waters
  ([[Three Port Cities Remain, and the Others Are Desolate and Destroyed]]). `ports.rs` holds the list
  (`MAIN_PORTS`, `is_main_port`) for the traffic, the city crate and the page; the other six cities are no ports.
- **Ports.** The caller passes in the cities (the crate reads no files); the traffic keeps those that are port cities,
  on a continent the layout holds, with a roadstead clear inside the frame, in the order given.
- **Roadstead.** Where a port's ships come and go: the nearest point of its own coast to the city's centre, 3 km out
  to sea away from the centre, then on outward in 500 m steps until it is at least 1 km clear of every coast and isle,
  in whole metres. A port whose way out leaves the frame first gets none, and no ships.
- **Routes.** One between every pair of the port cities, first with second, first with third, second with third, so
  each port trades with both others and the lanes cross the most waters. Each is planned round land: A* over a mask
  of 5 km cells whose middles are at least 3 km clear of every coast and isle (eight neighbours, no corner cut past an
  unclear cell, ties to the lower cell), from each roadstead's nearest clear cell it reaches by a clear leg; then
  string-pulled, each leg running as far ahead as it can while it stays more than 800 m from every coast edge and isle,
  checked exactly in whole metres (no edge met, and each end of either segment clear of the other), so a hull drawn on
  it stays off the land. Today: Overlook to Sunspire 1,402 km, Overlook to Rimeholt 1,601 km, Sunspire to Rimeholt
  2,950 km across the open sea. Opening the waters and planning them takes about 0.5 s in WebAssembly.
- **Schedule.** On each route a ship leaves each end every 1,200 s of world time, departure n at n × 1,200 s, and sails
  at 5 m/s to the other end, where she is gone. World time is seconds since the Unix epoch, passed in, so every
  machine computes the same ships for the same time.
- **A ship.** Her id is `n << 8 | route << 1 | direction` (direction 0 from the route's first port). Her hull comes
  from a fixed hash of her id: a sloop 4 times in 10, a schooner 3, a brig 2, a frigate 1. She carries her position,
  the unit way she sails along her leg, the metres sailed and her route's length.
- `ships_near(centre, radius_m, time_s)` works in closed form: per route, the stretches of its path within the radius
  give the distances sailed that put a ship there, and those give the departures; each is then placed exactly.
  `ship(id, time_s)` places one ship. A time or radius that is not a finite number, or a negative radius, finds none.

### The doors

The game page already loads `room.wasm`, which has the world and gear crates, so the doors live there
(`crates/room-wasm/src/waters_door.rs`), and `client/src/rules/watersRules.ts` wraps them. The page passes the layout's
text and the nine cities it already reads from the land files (`client/src/game/worldData.ts`), so there is one
source of each.

| Door | TypeScript | What it answers |
|---|---|---|
| `waters_open` | `open(layoutText, ports)` | The table: each water's continent index, id, name, holder and island's level band; the borders; the port cities' ids; each port city's id, name and roadstead; each route's ports, length and path |
| `waters_at` | `waterAt(point)` | The water at a point as one grid byte; null on land |
| `waters_grid` | `grid(cellM)` | Columns and rows as u32s, then a byte a cell; cells finer than 1,000 m, or not a finite number, are refused |
| `waters_ships` | `shipsNear(centre, radiusM, timeS)` | The ships near a point, 11 f64s each: id, route, from port, to port, hull, x, y, way x, way y, metres sailed, route length |
| `waters_ship` | `ship(id, timeS)` | One ship by id, packed the same; nothing when she is not sailing |

## Weather and travel

- The weather is one field over the whole map, computed from world time and position by the shared Rust rules, so the
  wind a ship sails by is the wind the server judges. DFO's dynamic weather and clouds draw from it, rewritten for
  WebGPU ([[WebGPU Only]]).
- Ships sail faster than real speed, and faster still in the Overworld, DFO's raised travel camera over the same
  world. The speeds are tuning numbers, set by playing.

## Limits

- No isles are placed yet; the nine continents are drawn and each has its biome ([[The Continents' Biomes]]).
