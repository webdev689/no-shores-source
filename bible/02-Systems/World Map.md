---
type: system
status: live
code:
  - content/world/layout.json
  - content/world/open.json
  - crates/land/src/sites.rs#locked
  - crates/world/src/layout.rs#Layout
  - crates/world/src/check.rs#check
  - crates/world/src/geometry.rs#doubled_area
  - crates/world/src/waters.rs#Waters
  - crates/world/src/traffic.rs#Traffic
  - crates/world/src/traffic_routes.rs#berth
  - crates/world/src/ports.rs#MAIN_PORTS
  - client/src/rules/watersRules.ts#startWatersRules
---
# World Map

The world's structure, as [[The World Map]] decides it: one ocean the size of Tamriel's frame, nine hand-placed
continents, thousands of static isles, and discoveries that come and go. This note says how it is built. Built so far:
the layout file, the rules it keeps, the [[World Editor]] that paints it, the [[Land]] generated from it, and the
sea's waters and friendly traffic as rules and doors, which the [[Game]] and the [[Held Map]] draw.

## The layers

Each layer reads the one above it and owns its own data ([[Generated Files Stay Out of Git]]):

| Layer | What it holds | Made by | Kept |
|---|---|---|---|
| The layout | The ocean frame, each continent's position and outline, each static isle's place and seed | Us, in the World Editor | In git, as a small authored file |
| The land | Terrain, rivers, soil and biomes for each continent and isle, and the seabed around them | The land crate: relief, erosion, rivers and lakes from the layout, the climate and the owner's edits, the same on any machine ([[Land]]) | The owner's edits in git, in `content/world/land/`; baking to R2 by region is planned |
| The settlements | Towns, ports, roads and buildings | Towns, ports, roads and carved rivers: drawn by the owner in the World Editor's Land mode. Cities: all nine planned by the city crate on World 2.0's stages, six of them laid in ruins ([[Cities]]) | In each landmass's edits file |
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
- **No fog of war.** The [[Held Map]] at sea shows every continent, port and node from the first time it is raised
  ([[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]); the
  client holds every continent's outline. The sea room tells a client about an isle it rolled only once that player
  has found it or is close enough to see it, so a hidden isle cannot be read out of the client.
- **Discoveries** are rolled by the server in the open sea of hostile waters: a place and a seed. Every client near
  one generates the same island from the seed, as DFO's spawned dungeons are shared. The server lets one go ten
  minutes after the last player leaves. How they are rolled, built, landed on and scavenged: [[Islands]].

## Seen whole, reached by nodes

The player reaches an island only at its nodes ([[Every Island Is Seen Whole and Reached by Nodes]]). From the
Overworld's bird's-eye view of the side of an island, they choose a node (a mission, a dungeon, a social space, a
patrol area, a world boss, an outpost site) and are taken there. A node is one section of the land, and its edge warns the player to
go back. The rest of the island and of its city is the same ground the [[Land]] generates, drawn in less detail with
distance, never reached. Each island has one major port city; Saltmere's is Overlook.

Patrol areas and missions open as a pass is done on each ([[Patrol Zones and Missions Open as Their Pass Is Done]]).
`content/world/open.json` lists the open ones by id. Every other patrol area and mission is locked; social spaces,
dungeons, world bosses and outpost sites never are. A locked node still shows where the player picks a landing, greyed with a lock
([[Overworld]]), but neither a click on it nor a gate toward it ([[Layouts]], "Gates") takes anyone there, and its room
turns every player away ([[Server]]). A pass opens a node by adding its id to the list; a test holds the list to
patrol and mission nodes of the edits files, each once. The rooms read the list from the node files, so a change
reaches them at the next bake: a merge redeploys them, and locally `npm run bake` or `npm run server` bakes first.

## Regions

Every island is cut into three regions
([[Each Island Has Three Regions, and Saltmere's Three Patrol Zones Stay, Linked]],
[[Passages as Claude Builds Them]], "The regions"), each holding its own nodes, as
`content/world/regions.json` lists them: its name, its centre (a point its nodes lie round: its patrol zone's where it
has one), its anchorage 3 km off the coast where the coast is nearest the centre, and its nodes, each in the
region whose centre is nearest. Each point of an island's land lies in the region whose centre is nearest. Saltmere's
three are the Beacon Shore (Overlook and the Saltgrass Downs), the Weirlands (the Gullwing Vale) and the Grey Reach
(the Driftwood Moors), a patrol zone in each; every other island keeps one patrol zone, the one by its port city, in
its first region, and its other two regions hold nodes alone. An instance's gate leads only from a patrol zone of its
own region ([[Layouts]], "How a layout is planned"); one in a region with no patrol zone is landed at from the sea.
Each patrol zone of an island holds a gate toward each other one: Saltmere's three link each to both others
([[Layouts]], "Gates"). At sea the held map lights the regions of the island whose waters the ship is in and sails
for their anchorages ([[Held Map]], "Choosing").

A page playing alone opens any node, locked or not: with no `?room=`, `?at=<id>` arrives there, and `&spawn=` and
`&view=` picture it ([[Toolkit]], "Browser QA").

## Waters

The sea is split into nine waters, one an island ([[The Waters Come From the Islands]], [[The Sea as Claude Shapes It]]). The `world` crate judges them
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
| continent-2 | The Lattice | The Cairn Straits |
| continent-3 | The Lattice | The Elmwater |
| continent-4 | Grey Tithe | The Sunscorch Coves |
| continent-5 | The Lattice | The Gilded Reach |
| continent-6 | The Lattice | The Mistwrack |
| continent-7 | The Lattice | The Windward Levy |
| continent-8 | The Lattice | The Fen Deeps |
| continent-9 | Grey Tithe | The Rimeholt Deep |

- The six ruined cities' waters (Cairnwatch's, Elmhaven's, Goldreach's, Mistfall's, Windmere's and Fenhallow's) are
  the Lattice's, and the Grey Tithe's ships sail them; the Grey Tithe holds the two living ports' waters past home,
  Sunspire's and Rimeholt's ([[The Ruined Cities' Waters Are the Lattice's, and Their Ruins Are Overtaken]]). Every
  point of a water is held as its island's water is. The doors name a holder "home", "grey-tithe" or "lattice".
- `borders()` says which waters touch: the pairs whose sea cells lie side by side on a 10 km grid. On today's layout
  there are 17: 1-2, 1-3, 1-4, 1-5, 1-8, 1-9, 2-5, 2-6, 2-9, 3-7, 3-8, 3-9, 4-5, 4-8, 5-6, 7-8 and 7-9.
- `grid(cell_m)` judges the frame at each cell's middle, row by row from the north-west: one byte a cell, the
  continent's index for sea, 255 for land. The [[Held Map]] tints from it and lights at sea the water under its
  pointer; which water the ship and a course's end lie in it asks of the rule itself, which the grid's cells blur by a
  coast.
- Speed: a bucket grid of 32 km cells lists, for each bucket, every coast edge that can be nearest to some point in it,
  so a query looks at a few dozen edges; each bucket lists the isles that can be nearest the same way. `water_at`
  takes about 0.4 µs natively; `grid(4_800.0)`, 1024 × 640 cells, about 80 ms natively in release and 100 ms in
  WebAssembly. A cell that is not a positive finite number is refused.
- Only + − × ÷ and square roots on 64-bit floats, so every machine gives the same answer ([[Agree to the Bit]]).

## Traffic

Friendly ships sail between the port cities all the time, seen from land and sea (`traffic.rs`, `traffic_routes.rs`).
The numbers are Claude's, under the owner's "Friendly ships should dynamically travel. Visible on land and sea".

- **Main ports.** Three port cities remain: Overlook in home waters, Sunspire and Rimeholt in the Grey Tithe's
  ([[Three Port Cities Remain, and the Others Are Desolate and Destroyed]]). `ports.rs` holds the list
  (`MAIN_PORTS`, `is_main_port`) for the traffic, the city crate and the page; the other six cities are no ports.
- **Ports.** The caller passes in the cities (the crate reads no files); the traffic keeps those that are port cities,
  on a continent the layout holds, with a roadstead clear inside the frame, in the order given.
- **Roadstead.** Where a port's ships come and go: the nearest point of its own coast to the city's centre, 3 km out
  to sea away from the centre, then on outward in 500 m steps until it is at least 1 km clear of every coast and isle,
  in whole metres. A port whose way out leaves the frame first gets none, and no ships.
- **Berths.** No ship lies on the roadstead itself, where a player's new ship puts in. Each course has two berths off
  each of its ports' roadsteads, on the line through it square to the course's last leg there: its arrivals lie 300 m
  to starboard of the way in, its departures leave from 300 m to the other side, so arriving and leaving ships keep
  to their own sides. A berth that would come within 200 m of one another course laid there first moves out 200 m at a
  time, at most 900 m out, within the roadstead's 1 km of open water (`BERTH_M`). Each of a course's two ways then runs
  from its departure berth along the course to its arrival berth. Over a day no lying ship comes within 150 m of
  another ship at any of the three ports, and none within 225 m of a roadstead (`traffic_tests.rs`); before the
  berths two or more hulls lay on Overlook's roadstead at once a third of the time.
- **Routes.** Between every pair of the port cities, first with second, first with third, second with third, so
  each port trades with both others and the lanes cross the most waters; each pair sails up to three courses ([[Friendly Ships Take Several Courses, About Five in View, Sailing Visibly]]).
  The shortest is planned round land: A* over a mask of 5 km cells whose middles are at least 3 km clear of every
  coast and isle (eight neighbours, no corner cut past an unclear cell, ties to the lower cell), from each roadstead's
  nearest clear cell it reaches by a clear leg; then string-pulled, each leg running as far ahead as it can while it
  stays more than 800 m from every coast edge and isle, checked exactly in whole metres (no edge met, and each end of
  either segment clear of the other), so a hull drawn on it stays off the land. The other two leave each port 30
  degrees either side of the shortest's first heading, to the clear cell nearest the point 100 km out, one
  way leaving and the other arriving so each keeps to one side, every stretch planned as the shortest is; a side no
  clear water makes, or more than 1.3 times the shortest's length, is left out. Today all nine courses sail: Overlook
  to Sunspire 1,402, 1,421 and 1,468 km, Overlook to Rimeholt 1,601, 1,611 and 1,681 km, Sunspire to Rimeholt 2,950,
  2,959 and 3,032 km. Out of Overlook they leave on five headings, two of its Sunspire courses sharing the narrow sea
  east of it; out of Sunspire and Rimeholt on three each. Planning them takes about 0.2 s natively, twice the one
  course each; a sea room's harbours take the ports' roadsteads alone (`Traffic::roadsteads`), planning no course.
- **Schedule.** On each course a ship leaves each end every 3,000 s of world time, departure n at its course's start
  plus n × 3,000 s, the nine courses' starts a ninth of that apart, so two courses that share a stretch out of a port
  (each of Sunspire's and Rimeholt's ways out carries a course to each of the other two ports) never send ships out
  together; each sails at 60 m/s, the pace dial's slowest step, to the other end. There it lies at its berth 600 s
  (`DWELL_S`), heading as it came in, and is then gone. About five ships are within 60 km of Overlook's roadstead at
  any moment, counting those lying there (5.2 on a day's mean). World time is seconds since the Unix epoch, passed in,
  so every machine computes the same ships for the same time. The waters' table the door returns carries the pace
  (`friendly_speed_m_s`), so the page reckons ships on between answers at the rules' own pace.
- **A ship.** Its id is `n << 8 | route << 1 | direction` (direction 0 from the route's first port). Its hull comes
  from a fixed hash of its id: a sloop 4 times in 10, a schooner 3, a brig 2, a frigate 1. It carries its position,
  the unit way it sails along its leg, the metres sailed and its way's length, berth to berth.
- `ships_near(centre, radius_m, time_s)` works in closed form: per way, the stretches of its path within the radius
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
| `waters_ship` | `ship(id, timeS)` | One ship by id, packed the same; nothing when it is not sailing |

## Weather and travel

- The weather is one field over the whole map, computed from world time (seconds since the Unix epoch) and position
  by the shared Rust rules (`crates/world/src/weather.rs`), so the wind a ship sails by is the wind the server judges.
  It is built from + - * / and square root alone ([[Agree to the Bit]]).
- Weather systems about 600 km across drift eastward at 10 m/s, so a front crosses an island in about a day, and
  change as they go over about six hours. Each is smooth noise over space and time, never stepping. At a point and a
  moment it gives the wind's way and strength and the sea state, 0 (calm) to 1 (storm), in four bands: calm under
  0.2, moderate to 0.5, rough to 0.8 and storm above. Over days at many points the sea is calm about 15% of the time,
  moderate 50%, rough 25% and in a storm 10%; the field's measured quantiles set those shares.
- The wind veers smoothly across a system about the prevailing westerlies (the swell's; ships sail by the sky's,
  [[Weather]]); its strength follows the sea state, from a calm's 2 m/s through 4, 9 and 15 m/s at the bands' meetings
  to a storm's 25 m/s.
- The open water shelters the sea: the fetch, the open water upwind of a point out to 60 km (marched by the
  clearance to the nearest coast, in steps of 500 m at least), leaves the swell a quarter of its height at under 2 km
  and all of it at 60 km, the share taken as the mean over five rays, the wind's and 10 and 20 degrees either side.
  Within 3 km of a port's roadstead the sea is calm, the swell 0.3 of a moderate sea's whatever the weather, easing
  back to the open sea's over the next 500 m ([[Water]]).
- DFO's dynamic weather and clouds draw from the sky's own field (`crates/sky`), rewritten for WebGPU ([[WebGPU Only]],
  [[Weather and Day and Night Come From DFO, Much Improved]], [[Weather]]).
- Ships sail faster than real speed, and faster still in the Overworld, DFO's raised travel camera over the same
  world. The speeds are tuning numbers, set by playing.

## Limits

- No isles are placed yet; the nine continents are drawn and each has its biome ([[The Continents' Biomes]]).
- This weather drives the swell alone: the wind ships sail by, and the clouds, rain and fog drawn, are the sky's
  ([[Weather]]).
