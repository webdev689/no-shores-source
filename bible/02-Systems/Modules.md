---
type: system
status: live
code:
  - tools/modules/kit.py#organic
  - tools/modules/kit.py#exported
  - tools/modules/bake.py#baked
  - tools/modules/publish.py#main
  - tools/modules/catalogue.py#BUILDERS
  - content/modules/modules.json
  - crates/city/src/modules.rs#solids
  - crates/city/src/modules.rs#pads
  - crates/layout/src/modules.rs#seat
  - crates/layout/src/modules.rs#hub
  - crates/layout/src/ledges.rs#cut
  - tools/modules/stairs.py#builder
  - tools/modules/bridge.py#builder
  - crates/layout/src/pieces_land.rs#stone_bridge
  - client/src/city/modules.ts#loadModules
---
# Modules

Handcrafted playspaces, each built in Blender by a script of its own and placed whole by a layout
([[Handcrafted Playspaces Are Scripted in Blender]]). A module is three things: its surfaces, each in one of the
game's materials and drawn in the climate's picture as the [[Cities]]' solids are; its parts, the boxes a body
stands on and runs into; and its sockets, where a way or a floor meets it. Some also level the ground under their
floors (pads). All of it is code in `tools/modules/`: no outside models or scans ([[Own Work]]).

## The kit

`kit.py` holds what every module is built from, in Blender's frame (x east, y north, z up) with its origin at the
middle of its foot:

- **Cut stone**: a block with bevelled edges and faces roughened by noise, so it reads as old and handled.
- **Columns, stairs and battlements**: round columns, flights of steps (each step a part), and merlons along a wall's
  edge.
- **Organic rock** (`organic`): ellipsoids merged into one surface by a voxel remesh, cut into crags and bulges by
  noise, cut flat where a body stands on it, then decimated to a triangle budget. Every natural form is made this
  way: a cave's shelf, a column of dripstone, a boulder.
- **Arches**: a round bar cut out of a wall.

`exported` turns a module into the game's frame (x east, y south, z up: Blender's y turned round): its surfaces
grouped by material, its parts, its sockets, its pads and its size, the box round its surfaces. The surface groups
are written with paving last, since the first group carries the parts and paving is never run into.

## The modules

- **The Old Stones** (`old-stones`, a shrine's): a dais of two broken tiers of cut stone, 1.4 m each, a flight up
  each side of the lower and up the east and west of the upper, a ring of eleven megaliths round the top, some fallen
  to lie at their tier's foot with rubble and a rock in the gap they left, and one leaning, an altar at its middle. Its paving is laid in rows of slabs of their own lengths over a bed of
  rubble that shows where a slab is gone.
- **The cavern chamber** (`cavern-chamber`, every cavern's): under the cave roof, 28 m square. A shelf of merged
  boulders 2.2 m high runs along its back, climbed by worn steps at one end, with a dolmen, its stones and a cauldron
  on it. Two waisted columns of dripstone stand floor to roof. Stalagmites crowd its sides, boulders give cover in its
  middle and stalactites hang over it. A lane from its entry and a way to its steps are kept clear.
- **The keep's citadel** (`keep-citadel`, a keep's): a curtain wall 60 m square, round towers at its corners and a
  gatehouse with an arch and a raised portcullis, reached up a ramp. Its lower bailey stands 1.2 m over its foot and
  its upper ward 3.6 m, up a broad flight between them. The donjon, windowed on three storeys, stands on the ward.
  Flights inside the east and west walls climb to the wall-walk behind its parapet. A pad levels the ground inside
  its walls under the bailey, so land up to its height lies hidden.
- **The cliff stairs** (`cliff-stair-4` to `cliff-stair-24`, a ledge's): a stairway cut into the rock, one for each
  2 m of rise. Steps of 0.25 m by 0.42 m climb to a landing at the top, with a landing and a brazier every 6 m of rise
  between, and rough rock cheeks either side stand a metre over the steps. An arched gateway set into the cheeks
  stands at the foot.
- **The stone bridges** (`stone-bridge-16` to `stone-bridge-40`, a river crossing's): a deck 6.2 m wide paved
  between parapets, 5.5 m over the bridge's foot, on one, two or three round arches cut out of its stone body, its
  piers' cutwaters pointing into the water and its abutments solid at either end. Its stone body rises to the deck's
  underside, so no gap shows under the deck, and each cutwater stands 0.6 m past where its arch springs off the pier,
  or past the foot where a flat arch springs under it. Its parts are the deck, the parapets, the piers, the
  cutwaters and the abutments, each as wide as the stone drawn round it, so the water and a swimmer pass under the
  arches and meet the stone where it is seen.

## Baking and publishing

bpy is Blender as a Python module: `pip install bpy==5.3.0` on Python 3.13, as for the [[Flora]].

| Command | What it does |
|---|---|
| `python -I tools/modules/bake.py <folder>` | Builds every module, writes each surface group's mesh to the folder under its hash and the manifest to `content/modules/modules.json`; a few seconds a module |
| `python -I tools/modules/publish.py <folder>` | Uploads the meshes the manifest names to R2, unless R2 already serves them, and checks each answers |
| `python -I tools/modules/render.py <module> <picture.png> [--parts]` | A picture of a module as Blender built it, its parts drawn as wire boxes when asked |

A mesh file is a vertex count and a triangle count, then each vertex's position (3 floats) and normal (3 signed
bytes), then each triangle's three vertex numbers. A module has at most 32,000 triangles. The bake makes the same
bytes from the same scripts. The `modules` workflow bakes on every change to the module tools, fails if the bake
does not make the committed manifest, and publishes with the repository's Cloudflare token.

## In the game

- **The rules** read the manifest (city crate's `modules`): a module stands as one solid per surface group, all at
  its place and turn (`Shape::Module`). A solid taller or shorter than its module stands stretched up to its height,
  its parts, pads and surfaces alike, so a cliff stair fits its climb to the centimetre; its normals are stretched
  with its surfaces, so a bevel lights as it faces. The first group's solid
  carries its parts, so movement, collision, the
  [[Navmesh]] and the bake meet it box by box as they meet natural rock's parts. Its pads are laid with the layout's
  own.
- **Where a module stands** ([[Layouts]]): only where the brief asks for heights, in place of the RMB blocks, set
  piece and dressing its area would otherwise take. A shrine stands the Old Stones and a keep its citadel, at the
  area's middle on the lowest ground under the module's foot, lifted with the land by the least the carving raises it
  under that foot, turned a whole quarter at a time so its parts stay
  square to the world, its first socket toward the zone's middle. Every cavern stands the chamber under its roof,
  its entry turned to the tunnel. The area's basin takes no platform of its own, since the module brings its
  platforms, and its ways arrive 2 m past its first socket: the citadel's ramp, the Old Stones' north flight.
  Every ledge ([[Layouts]], "Ledges") stands the cliff stair of the lowest baked rise at or over its climb, pressed
  down to it, so no riser stands over the 0.25 m it was built with: a body reaches two treads ahead, and a stair
  stretched taller lifts the second over its step.
  Every river crossing, a way's or a gate's gorge's, stands the shortest stone bridge as long as its deck would run
  (timber where none is), its deck where the timber's would be, turned along the way, and moving with the land as
  a bridge does. A turned part's boxes are cut in slices no longer than the part is thick, so a parapet's keep off
  the way they line.
- **The browser** fetches every module's meshes from R2 once, with the forged models' tables, before it builds a city
  (`loadModules`), and draws each triangle in its material's picture, laid from the axis it faces most, as natural
  rock is.

The Gullwing Vale stands the Old Stones, the citadel at Valeguard and the chamber in the Hollow Coven's cavern, each
walked by `crates/room/tests/modules_walked.rs`, a walk stopping where the body would climb: up the Old Stones'
flights to the upper tier; up the citadel's ramp, through its gate and up to its ward and its wall-walk; from the
coven in under the tunnel's mouth to the chamber, and up its steps onto its shelf; up every ledge's stair from the low
floor onto the high one; over every stone bridge both ways, on its deck at its middle. The Old Stones and the citadel
stand on the ground at every edge, and no cliff stair stands taller than it was baked.

## Limits

- A module's surfaces carry no ambient occlusion of their own, and their pictures are laid flat by axis, not
  unwrapped.
- A module stands square to the world, so a way may arrive at a side with no socket: the citadel's ways arrive at
  its gate, which faces the zone's middle, not the way's own bearing.
- Walking into a module's wall starts a climb ([[Movement]]), so the citadel's walls are climbed as any wall is.
