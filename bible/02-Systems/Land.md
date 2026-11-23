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
  - crates/land/src/ground_window.rs#window
  - crates/land/src/outcrops.rs#stands
  - crates/land-wasm/src/lib.rs#land_open
  - crates/land-wasm/src/settled.rs#land_window
  - crates/land-wasm/src/settled.rs#land_city_plan
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
holds at most 200,000 dabs, and the editor dabs no more once its edits hold that many, so it never saves a file it
cannot open; a place holds at most 10,000 points, and a course at most 5,000 km.

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
- A road's bed is its ground smoothed along it, eased back to the land over a 4 m shoulder. A layout's paths are laid
  as roads after the land is made (`add_roads`), each point of a course 8 m from the next, but for its runs' ways
  and the stretches of its ways over a basin's terrace or ramp and its edge, whose floors are carved to their levels
  already.
- A layout's sculpt carves the land round its patrol area or instance ([[Layouts]]): its network's floor (basins and
  canyons) is left as it is and everything else in its claim is raised into a massif with stepped cliffs, fading back
  to the land over 140 m past the claim. It is applied to the land before the towns, rivers and roads, never raises
  the sea or the 35 m of strand inland from the coast, and only raises: the coast stays where it was painted. Where
  sculpts meet, each one's rise is held under the faces rising from every other's floor (its basins, canyons, climbs,
  runs and the gorges out through its gates), at the faces' own steepness past their tops, so no layout's massif or
  fade buries another's floor, and where two floors meet both stay open with no step. Its
  climbs are capsules whose level runs from one share of the massif's height to another along them: on a climb the
  land is its level, and off it, over 2 m, whichever is lower of the floor's face and the climb's own face rising
  from it, so a way up is cut into the rock with a drop on its floor's side; a lookout is a climb of no length at the
  top, and a basin's shelf or platform a climb level along it inside the floor, raised over it as an embankment. The floor's distance counts the climbs, so a section reaches up them, and the floor's level at a point
  (`floor_level`) is the nearest floor's or climb's, a raised floor's wherever the land stands at it: 0 for a floor,
  a climb's level where it is nearer, so a face's foot and dead rock are measured over a terrace or a ramp as over the
  land's own floor. `floor_share` is that level as a share of the massif's height, where a climb or a valley starts. Its raised floors
  (`levels`, capsules as climbs are) are floor at a height: a place standing high, a way graded between places. The
  land is cut to them first, then to its climbs, so a terrace stands on a raised floor as on the land's own; their
  edges wander as a floor's do; and an outcrop standing on one rises from its level. A point within a raised
  floor's own reach takes the level of the floor whose line runs nearest of those it stands on, as the ways were
  graded along their lines, so a wide stretch of way never holds its level over the next as it ramps on, nor a floor's
  wandered edge over a way; past every floor's own reach, in the wander, it takes the nearest wandered edge's. Round a roofed
  floor (a cavern's hollow and tunnel, `roofed`) every face rises in 4 m, out to 20 m past its widest edge and easing
  back to the 16 m run over 8 m more, so the rock a cave roof rests on stands whole under all its edges and the cliff
  its tunnel opens in stands sheer. A climb's and a raised floor's
  level is a share of the massif's local height (its rise varied by a slow noise), faded past the claim as the land is,
  and the floor's level reads them the same way. A terraced sculpt's top (`terraced`, a layout with heights) stands
  in plateaus at 0.45, 0.72 and the whole of that height, where a slower noise crosses its steps, each riser a cliff;
  within 24 m of a floor, raised floor, climb or run the rock is held at least 0.4 of the height over its level, then
  falls in 6 m to its plateau, so no body climbs out and a lookout stands on the top. Each bucket finds every
  capsule within that hold, so the top steps nowhere along a bucket's edge. Its runs ([[Layouts]], "Runs") are cut
  into its rock the same way. Where capsules meet (a run's at a bend, a climb's at its lookout) the level is a blend
  of the near capsules', weighted by how near each is (within 3 m), so the land climbs round the bend and beside a
  climb's top without a step. Its wings are capsules
  that carry its claim past its ring, so the massif stands round a run that leaves the zone, or round the river its
  brief names, and fades back past the wing. Neither is written when empty. Each sculpt measures its claim's edge
  once a 32 m bucket: where a bucket lies wholly in the claim or wholly past its fade, the fade is 1 or 0 with no
  measuring, the same to the bit; a 2 km close-up of carved ground samples in about a quarter of a second.
- A sculpt's outcrops stand on its floor, each a shape with a middle, a radius, a tall and an angle (clockwise from
  north), written `[x, y, radius, tall, shape, angle]`; four numbers, `[x, y, radius, tall]`, read as a mesa at
  angle 0. Every shape stands in as many bands as fit, up to its most, each face rising over at least 8 m (`BAND_M`,
  two of the close-up's 4 m samples), so the close-up draws its faces and never a point; on a small outcrop the flat
  top gives way to its face. The stepped shapes part each face from the next by a 6 m ledge, so one of the close-up's
  steps always lies nearly flat on it, and their flat top is the last face's ledge: a mesa is up to four faces under
  a flat top over 0.55 of its radius (two faces from a radius of 49 m, three from 80 m), and a crag up to four under
  a flat top over a quarter of its radius (two from 30 m, three from 48 m). The rounded shapes' faces meet: a tor is
  a stack of up to three domes leaning along its angle; a whaleback a low ridge whose top runs 2.5 times its radius
  either way along its angle; a knoll a steep-sided hill of up to three faces, each easing onto a soft shoulder; a
  hummock one low face under a flat top over up to half its radius. Each edge wanders out by up to 35 % over three
  quarters of its radius, so a broad outcrop's faces are no steeper than a small one's. An outcrop never rises past
  its tall or its footprint (`footprint`: its radius, wandered out, round its spine), whose bounds, its reach, are
  how the sculpt's buckets find it.

The land's WebAssembly door gives the browser the same answers.

## A node's window

A node's room is to stand bodies on the real ground ([[Reach]], [[Movement]]), but generating a continent's land
takes more memory than a Cloudflare room's 128 MB. So the land crate cuts a small window of the ground round the
node at build time, for the room, and every browser predicting with it, to read.

`Ground::window` takes a rect, west to east and north to south, and keeps:

- the 1 km cells any point in it reads: from the cell before the one its spline starts in to two after, of the land,
  the coast's distance, the heights carried over the coast and the lakes' levels. A cut grid keeps the whole grid's
  corner and its cells' numbers (`first_column`, `first_row`), so a point finds its cell by the same sums;
- each river and road with a segment within its reach of the rect, whole, each town within 150 m of it, and each
  sculpt and pad reaching into it.

Inside the rect, the window's `height_at` and `water_at` give the same bits as the whole ground's. A ground saves to
JSON and loads to the same bits; its course index is not saved but built again on load, and a saved ground whose
layers do not hold the same cells is refused. A test cuts a 2 km window
at a river's mouth on the rainforest continent, with a town, a road and a carved river added, and checks 4,300 points
in it to the bit: it keeps 36 cells and saves to about 80 KB.

The bake cuts each node's window with its city settled on the land, over the section's bounds and 100 m past them
([[Server]]). A node's window keeps 16 to 36 cells; the 99 of them save to about 0.44 MB in all.

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
leave the open one alone. The open landmass has its city settled on it, as the bake settles it: planned with the RMB
index's blocks when the caller passes the index's text, else with none, which gives the same terraces and walls. The
city is settled again whenever the ground is laid again (new edits, or the water run after a stroke), and a city that
cannot be planned is listed among the landmass's problems. The door answers for the open landmass:

- `land_patch`: the ground over a grid of up to 1,024 samples a side. Each sample has its height, its water's
  surface, how far past fresh water's edge it lies (beyond a river's channel, or above a lake's surface), and a mark
  for a road, a town or a port. The editor's close-up draws it, its water's edge drawn where that distance is 0.
- `land_sample`: the ground at a list of points. Each point has its height, its water (dry, sea, lake or river) with
  the water's surface, and the sea's swell over it at a given moment ([[Water]]). The answer also holds fingerprints
  of the heights and of the sea. The game will call it.
- `land_window`: the ground over a rect, cut as a node's window, as JSON: every number the same, to the bit, as the
  window the bake writes for the rect a node's room names. The movement door and the fight's rules stand a predicted
  body on it ([[Movement]], [[Combat]]), and a room played alone stands its bodies on it.
- `land_boxes`: the boxes of the city a body runs into within a rect, west, north, east, south and top.
- `land_city_plan`: the city's plan as JSON, for the drawing, or null for a landmass with no city.

Each landmass's view also carries the sea's swell, its waves, for the browser to draw; and each cell's distance from
the painted coast and its height carried over the coast, so the browser draws the coast as the ground has it.

## Limits

- Only continents are generated; isles are not placed yet.
- A hand-carved river is cut where the ground is sampled; the 1 km land under it, and the rivers the water gathers,
  do not follow it.
- The 2D map, and the 3D view farther than 8 km, show places on the 1 km cells they cross, so a road reads as a
  band a kilometre wide. Closer, the close-up draws them at their true width on the exact ground, sampled every 4 m.
- A biome sets the climate, the ground's colour and the snow line here; its plants and rocks are [[Nature]]'s.
- A preview (`keep: false`) has no city settled on it.
- A window keeps every course that reaches it whole, so a long river crossing it is carried end to end. Outside its
  rect a window still answers, but not as the whole ground would.
