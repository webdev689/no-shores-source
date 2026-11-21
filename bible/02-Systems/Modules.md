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
  - tools/modules/latticekit.py#taken
  - tools/modules/fissure.py#fissure
  - tools/modules/tithe.py#stores_a
  - tools/modules/chest.py#lid
  - client/src/city/crystal.ts#CRYSTAL_WGSL
  - client/src/city/eventProps.ts#eventProps
  - client/src/game/eventPropsDraw.ts#EventPropsDraw
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
- **Carpentry and cloth** (`timbers.py`): weathered boards and posts, iron plates, crates battened and braced, barrels
  of bellied staves bound with hoops, sacks of creased canvas tied at the neck, and cloth: a tarp laid over a stack's
  tops, falling off their edges and pegged out by cords, or a banner hung from a bar.
- **The Lattice's own props** (`latticekit.py`): its shards, clusters, crusts and boulders built by its own code
  (`tools/lattice/props.py`, `growth.py`), each of its Blender materials read as one of the kit's, its crystal glowing
  as its strain's light says: bright toward a shard's point, dark at its root, alight at its heart.

Each surface wears one of the game's materials: stone, trim, rubble, chalk, turf, timber, canvas, iron, gold, crystal
and paving. An object may wear one a face (a torn slab's turf top over its soil and its chalk). Crystal, the
Lattice's, is drawn by code, not a picture: red where the sun reaches it, graded to purple in its shadows, a glint off
each flat facet the sun catches, and its core glowing as much as each vertex says, more seen straight on and more at
night.

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

- **The public events' props**, drawn by the page where an event stands, never placed by a layout:
  - The Fissure (`lattice-fissure`, 12 m long): a crack nearly 3 m deep and 4 across at its widest, its walls the
    Lattice's crystal from the lip down, brightening to its alight heart, so from eye height the far wall reads as a
    glowing slit; slabs of turf over a band of dark soil over chalk lying low and few along both lips, turf and roots
    hanging off their edges, a row tipped up further back; chalk broken out across the turf; crystal teeth leaning in
    low over it, clusters grown out of its walls under the lip, four spires standing a metre or two over the ground out
    of its heart, its floor wide and lit by seven lights so the crack is seen into from a height, veins of light crept
    out through the grass and crusts of crystal at its ends. Its mouth, the outline of the crack at the ground, is in the
    manifest (`mouth`), so the page opens the land there.
  - Its scar (`lattice-fissure-sealed`): a low ridge of dark soil heaved up along where the crack was, grey-white
    chalk broken and heaped on it, dull stubs of dark crystal standing out of it, their glow dying with the crack; the
    slabs settled back nearly flat, the teeth broken off and lying in the grass, and the crusts at its ends dulled.
  - The growth (`lattice-growth`, 5 m): a spire of crystal out of a heave of chalk, five lesser spires leaning out from
    its root, shards crowding its foot, the turf it broke through tipped up round it and crusted.
  - The shard (`lattice-shard`, half a metre): a hand's length of crystal, two lesser points off its root, alight.
  - The Grey Tithe's three stores (`tithe-stores-a`, `-b`, `-c`): crates of weathered boards bound with iron at their
    corners, barrels, sacks of grey canvas (on store c's pallet laid flat, their tied necks out) and a pallet, each
    stack under a grey tarp pegged close at its corners; the plundered store (`tithe-stores-plundered`): a crate broken
    open, one tipped on its side, boards strewn, sacks slit with their grain spilt in heaps, a barrel stove in and
    rolled away with its staves and a hoop by it, the tarp dragged off. Each stack is compact and square-edged, its
    part the box round it: store a 2.6 by 1.85 m, b 2.2 by 2.2, c 2.6 by 1.3, the plundered store 2.5 by 2.0.
  - The Tithe's banner (`tithe-banner`): a heavy grey cloth, unmarked, 3.4 m long, lashed along its sleeve to a
    crossbar on a 5.4 m pole, a weighted rod in its hem so it hangs straight and bellies only between; three guy ropes
    pegged out behind it and to either side, an iron spike and collar at its head, stones packed round its foot.
  - The chests (`event-chest`, iron-bound; `event-chest-heroic`, gilded and set with crystal at its corners) and their
    lids (`event-chest-lid`, `event-chest-heroic-lid`, the heroic one crowned with crystal): each lid a module of its
    own, its hinge at its origin, and the chest's `hinge` socket where that hinge sits on it.

## Baking and publishing

bpy is Blender as a Python module, on Python 3.13:
`pip install --require-hashes --only-binary=:all: -r tools/modules/requirements.txt` installs bpy 5.3.0 and what it
needs, each wheel by its hash. The bake takes in the Lattice's own builders (`tools/lattice/props.py` and
`growth.py`) and through them the [[Sprite Forge]]'s bodies, rig and materials (`tools/forge/tools/sprite-forge/`),
which need nothing more.

| Command | What it does |
|---|---|
| `python -I tools/modules/bake.py <folder>` | Builds every module, writes each surface group's mesh to the folder under its hash and the manifest to `content/modules/modules.json`; a few seconds a module |
| `python -I tools/modules/publish.py <folder>` | Uploads the meshes the manifest names to R2, unless R2 already serves them, and checks each answers |
| `python -I tools/modules/render.py <module> <picture.png> [--parts] [--eye x,y,z]` | A picture of a module as Blender built it, its parts drawn as wire boxes when asked, from a given eye when asked |

A mesh file is a vertex count and a triangle count, then each vertex's position (3 floats), normal (3 signed bytes)
and glow (a byte to 127, only crystal's more than none), then each triangle's three vertex numbers. A module has at
most 32,000 triangles. The bake makes the same bytes from the same scripts, on any machine: the event props write a
coordinate that rounds to nothing as a plain zero, since a float residue's sign differs between machines (the older
modules keep the bytes they were published with). The `modules` workflow bakes on every change to the module tools,
to the Lattice's builders and the forge files they take in, or to `tools/r2.py`; it fails if the bake does not make
the committed manifest or if a second bake does not make the same bytes, and a second job, which installs nothing,
publishes the first bake's meshes with the repository's Cloudflare token.

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
- **The public events' props** are drawn by the page's event-props drawer (`EventPropsDraw`, among the scene's drawers
  after the layouts and before the nature) from a list it is handed (`eventProps` makes it from the room's event
  marks and the player's chests): each prop at its place, turn and scale, risen out of the ground as far as it has
  come (the growth rising and sinking, a banner driven in; what is under the ground is not drawn), the fissure opening
  from a line as it widens and deepens, a lid swung about its hinge, its crystal glowing as strongly as it is asked.
  Each material is its own colour worked by code over the module's own frame; the crystal is lit as above, its
  brightest cores light the light layer, and its glow lights lamps round it at night (`EVENT_LAMPS`). A module that
  opens first sets the scene's depth far over its mouth, so its chasm under the ground is seen.
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

- The city draws a module's crystal half alight everywhere: its glow by vertex reaches only the event props' drawer,
  and only that drawer gives crystal's light into the light layer.
- The fissure's mouth opens the depth of whatever is drawn before it there, a rise of the land or a layout's piece
  standing in front of it as well as the land under it; the events stand on clear ground. Grass drawn after it can
  stand over the chasm.
- Every city's load fetches the event props' meshes with the rest.
- A module's surfaces carry no ambient occlusion of their own, and their pictures are laid flat by axis, not
  unwrapped.
- A module stands square to the world, so a way may arrive at a side with no socket: the citadel's ways arrive at
  its gate, which faces the zone's middle, not the way's own bearing.
- Walking into a module's wall starts a climb ([[Movement]]), so the citadel's walls are climbed as any wall is.
