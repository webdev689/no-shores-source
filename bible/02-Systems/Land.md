---
type: system
status: live
code:
  - crates/land/src/relief.rs#relief
  - crates/land/src/biome.rs#biome_of
  - crates/land/src/erosion.rs#erode_coarse
  - crates/land/src/water.rs#water
  - crates/land/src/landmass.rs#generate
  - crates/land/src/edits.rs#dab
  - crates/land/src/places.rs#check_places
  - crates/land/src/sites.rs#check_sites
  - crates/land/src/ground.rs#height_at
  - crates/land-wasm/src/lib.rs#land_open
  - client/src/rules/landRules.ts#startLand
---
# Land

The ground of each landmass, generated from its painted coast ([[World Map]]), shaped by the owner, and the same on
the server and in every browser. The owner decided the generator makes the land and the owner molds it.

## How it works

- **The window.** Each continent is generated on its own grid of 1 km cells: its coast's bounds and 40 km of sea
  around it. The painted coast decides land and sea, never the heights: land stays at 1 m or more and the seabed at
  -2 m or less, so the coast stays where it was painted. A coast of fewer than 3 points, or a window over 6 million
  cells, is refused with a reason instead of generated.
- **The relief.** The land rises inland from the coast to uplands, about 650 m at 140 km in. Ranges stand where a slow
  ridge network, about 380 km across, crosses the interior, up to the climate's range height. The hills' grain
  grows with height. The seabed falls with distance from the coast.
- **Erosion.** World 2.0's law: stream power with an implicit step, sediment laid where the slope can no longer carry
  it, lakes that keep what they are given, and slopes that slide past their talus. It runs 40 steps of 2,000 years on
  a 2 km grid, and what it changed is laid back on the 1 km land, so valleys follow the water and the land keeps its
  grain.
- **Water.** A priority flood fills every hollow to its spill and finds each cell's way down. A river starts where
  the water a cell gathers reaches 1 m³/s, and runs to the sea or into a larger river. A lake fills a hollow that
  holds water 0.5 m deep anywhere, out to its rim.
- **Climate.** Each continent is generated in its biome's climate ([[The Continents' Biomes]]): its rain drives
  erosion and the rivers, its ruggedness the hills' grain, and its range height the mountains. The numbers are World
  2.0's profiles', with the range height doubled: World 2.0 adds it to Daggerfall's own relief, which this land has no
  copy of. A landmass with no biome uses a placeholder (800 mm of rain, ranges to 2,600 m), the steppe's.
- **The biome on the map.** The World Editor draws a continent's low ground in its biome's colour, from World 2.0's
  biome table, and snow above its snow line: the height where the mean temperature, falling 6.5 °C a kilometre
  (World 2.0's lapse rate), reaches -2 °C. The tundra's lies at 615 m, the desert's never reached.
- **Seed.** The world's seed salted with the landmass's id, which never changes, so the same layout makes the same
  land on any machine.

## The owner's edits

Each landmass's shaping is kept in `content/world/land/<id>.json`: brush strokes, each a tool, a radius of 1 to
200 km, a strength, a falloff and the points it was dabbed at in whole metres. Raise and Lower move the ground 1 to
500 m a dab; Smooth and Flatten move it 1 to 100 % of the way. A Flatten stroke also keeps its `level_m`, -500 to
9,000 m. The falloff is smooth unless the stroke says linear or flat.

Strokes apply after erosion and before the water, so the owner's shapes are final and the rivers and lakes run over
them. Each dab reads the ground the dabs before it left; land stays at 1 m or more and sea at -2 m or less, so a
brush never moves the coast. A test holds every file in the repository to its rules and its written form, and to a
continent of the layout.

## Places

The same file holds the places the owner draws, each with an id that never changes:

| Place | Kept as | Its rules |
|---|---|---|
| A carved river | Its course from source to mouth, its width (5 to 300 m) and depth (1 to 30 m) | Its source on the land |
| A road | Its course and its width (2 to 30 m) | All of it on the land |
| A town | Its area, a ring of points | A ring that never crosses itself, on the land, overlapping no other town |
| A port | One point | On the land within 3 km of the coast |
| The port city, one at most | Its name, the middle its landmark stands at, and its motif | Its middle on the land within 3 km of the coast; a name of 1 to 48 characters; a motif of lowercase letters and hyphens |
| A node | Its kind (social, patrol, mission, dungeon or boss), its name, its section (a ring of points) and its spawns | A ring that never crosses itself, on the land along every edge, holding 0.01 to 9 km²; a name of 1 to 48 characters; at least one spawn, every one inside its section; an id that does not end `-social` |

The city and the nodes are the places a player reaches ([[World Map]]): a node is one section of the land, and its
spawns are where a player lands and respawns. A city's own social space takes the city's id and `-social`, which is
why no node may. The city's wall stands 3,456 m from its middle ([[The World as Claude Shapes It]]).

A place's id is lowercase letters, digits and hyphens, and no other place in the file has it. The World Editor
names new places `river-N`, `road-N`, `town-N`, `port-N` and `node-N`. It snaps a road's points to ports, other roads' points
and town edges, so roads meet what they lead to exactly. A road's ends are not required to meet anything.

A road or a town is on the land along every edge, not only at its points, so a road never crosses a bay. A file
holds at most 200,000 dabs, a place at most 10,000 points, and a course at most 5,000 km.

## The ground anywhere

What the server judges a body against and every client draws. `Ground::height_at` gives the ground at any point to
the metre, and `water_at` what water stands there: sea, a lake, a river, or none.

- The 1 km land is interpolated by Catmull-Rom, with a grain of 4 m at a 250 m scale on the land. The land and the
  seabed are each splined on their own side of the painted coast, and within 1 km of it they meet along it: the
  coast is the painted line to the metre, its corners rounded, never the cells' steps. Past that kilometre, land
  stands at least 0.5 m up and the seabed 0.5 m down.
- A lake's water reaches a cell past its cells, to where the ground meets its surface, so its shore is a curve.
- A town's area is levelled to the mean of its ground, easing back to the land over 150 m past its edge.
- A river's channel is a trough cut under its surface, levelling into banks that ease back to the land over 10 m,
  down as well as up where the land lies under it; its surface never rises downstream. A gathered river's surface
  never stands above the ground off a lake, and its course ends where the painted coast crosses it. A river the water
  gathered keeps the level the flood gave it, so it crosses a lake at the lake's surface. Hand-carved
  rivers keep their width and depth; the rivers the water gathered take World 2.0's width and depth for their flow
  (2.4 √q + 1.5 m wide).
- A road's bed is its ground smoothed along it, eased back to the land over a 4 m shoulder.

The land's WebAssembly door gives the browser the same answers.

## Agreeing to the bit

The land crate uses only exact maths ([[Agree to the Bit]]): its noise is hashed gradient noise made of + - * / and
square root, and its sine and cosine are fdlibm's polynomials on the same operations. Clippy refuses the platform's
`sin`, `exp`, `powf` and their kin across the workspace. A fingerprint of every ground height's bits is tested
natively (`crates/land/tests/agree.rs`) and through WebAssembly (`landRules.test.ts`) against the same value, and so
are a fingerprint of the ground sampled on a road, along a river, in a town and across the land, and one of the
sea's swell ([[Water]]) over the land's margin at a moment of world time.

## In the browser

`crates/land-wasm` is the land's WebAssembly door. The World Editor runs it in a worker, so the page stays
responsive while a continent generates: about 1.5 s for 200,000 km² and 4 s for 500,000 km² on one core.

One landmass at a time is open for shaping. The editor also generates the others as previews (`keep: false`), which
leave the open one alone. The door answers for the open landmass:

- `land_patch`: the ground over a grid of up to 1,024 samples a side. Each sample has its height, its water's
  surface, how far past fresh water's edge it lies (beyond a river's channel, or above a lake's surface), and a mark
  for a road, a town or a port. The editor's close-up draws it, its water's edge drawn where that distance is 0.
- `land_sample`: the ground at a list of points. Each point has its height, its water (dry, sea, lake or river) with
  the water's surface, and the sea's swell over it at a given moment ([[Water]]). The answer also holds fingerprints
  of the heights and of the sea. The game will call it.

Each landmass's view also carries the sea's swell, its waves, for the browser to draw; and each cell's distance from
the painted coast and its height carried over the coast, so the browser draws the coast as the ground has it.

## Limits

- Only continents are generated; isles are not placed yet.
- A hand-carved river is cut where the ground is sampled; the 1 km land under it, and the rivers the water gathers,
  do not follow it.
- The 2D map, and the 3D view farther than 8 km, show places on the 1 km cells they cross, so a road reads as a
  band a kilometre wide. Closer, the close-up draws them at their true width on the exact ground, sampled every 4 m.
- A biome sets only the climate, the ground's colour and the snow line: no plants, soils or rocks yet.
