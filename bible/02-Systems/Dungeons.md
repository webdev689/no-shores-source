---
type: system
status: live
code:
  - crates/dungeon/src/lib.rs#of_patrol
  - crates/room/src/playlist_run.rs#playlist_run
  - crates/dungeon/src/lib.rs#style_of
  - crates/dungeon/src/names.rs#named
  - crates/dungeon/src/styles.rs#STYLES
  - crates/dungeon/src/dungeon.rs#Dungeon
  - crates/dungeon/src/block.rs#BlockLayout
  - crates/dungeon/src/descent.rs#plan_blocks
  - crates/dungeon/src/forge.rs#forge_storeys
  - crates/dungeon/src/ways.rs#join
  - crates/dungeon/src/furnish.rs#way_on
  - crates/dungeon/src/fixtures.rs#flank_outside
  - crates/dungeon/src/shapes.rs#outline
  - crates/dungeon/src/lane.rs#Lane
  - crates/dungeon/src/purposes.rs#name_rooms
  - crates/dungeon/src/banks.rs#CRYPT
  - crates/dungeon/src/models.rs#PropModel
  - crates/dungeon/src/furnish.rs#furnish
  - crates/dungeon/src/fixtures.rs#Fixture
  - crates/dungeon/src/landmarks.rs#place_landmarks
  - crates/dungeon/src/landmarks.rs#LANDMARKS
  - crates/dungeon/build.rs
  - crates/dungeon/src/props.rs#nearest_middle
  - crates/dungeon/src/torches.rs#Torch
  - crates/room-wasm/src/dungeon_door.rs#dungeon_json
  - crates/room/src/dungeon_ground.rs#DungeonGround
  - crates/dungeon/src/storeys.rs#spans
  - crates/dungeon/src/hand_made.rs#two_storeys
  - crates/room/src/dungeon_bake.rs#slabs
  - client/src/game/dungeonLayout.ts#spansAt
  - crates/room-wasm/src/fighter_door.rs#set_dungeon
  - client/src/rules/dungeonRules.test.ts
  - crates/room/src/dungeon_room.rs#dungeon
  - crates/room/src/run_room.rs#dungeon_run
  - crates/room/src/dungeon_room.rs#band_rooms
  - crates/room/src/dungeon_room.rs#keep_cache
  - crates/room/src/floor.rs#Floor
  - crates/room/src/entrances.rs#laid
  - crates/room/src/entrances.rs#model_of
  - crates/room/src/entrances.rs#MODELS
  - crates/room/src/entrances.rs#join_at
  - crates/room/src/entrances.rs#lay_elite_entrance
  - crates/navmesh/src/lib.rs#bake_anchored
  - crates/room-wasm/src/dungeon_door.rs#open_dungeon
  - crates/room-wasm/src/dungeon_door.rs#room_join_at
  - server/roomNames.ts#nodeRoom
  - client/src/game/dungeonLayout.ts#askDungeon
  - client/src/game/dungeonLayout.ts#askLayout
  - client/src/game/dungeonMesh.ts#dungeonMesh
  - client/src/game/dungeonView.ts#DungeonView
  - client/src/game/dungeonLight.ts#lightAt
  - client/src/game/dungeonLight.ts#LIGHT_KINDS
  - client/src/game/dungeonLight.ts#MOODS
  - client/src/game/dungeonLight.ts#NearestLights
  - client/src/game/dungeonClusters.ts#LightClusters
  - client/src/game/dungeonPipelines.ts#dungeonPipelines
  - client/src/game/dungeonCeilings.ts#ceilingHeights
  - client/src/game/dungeonCaveWall.ts#caveWall
  - client/src/game/dungeonFixtures.ts#fixtureMesh
  - client/src/game/footTrips.ts#roomNameAt
  - client/src/game/dungeonChest.ts#chestMesh
  - client/src/game/dungeonChest.ts#chestsMesh
  - crates/room/src/finds.rs#of_dungeon
  - crates/room/src/finds.rs#against_walls
  - client/src/game/dungeonScene.ts#DungeonScene
  - client/src/game/entrances.ts#doorOf
  - client/src/game/entranceView.ts#EntranceView
  - crates/room/src/encounter_plan.rs#plan_encounters
  - crates/room/src/encounters.rs#Encounters
  - crates/room/src/seals.rs#keep_seal
  - crates/room/src/court.rs#keep_court
  - crates/room/src/court.rs#warded
  - crates/room/src/court.rs#reckoning_reach
  - crates/room/src/court.rs#hold_ward
  - crates/protocol/src/encounter_wire.rs#encounter_offset
  - crates/room-wasm/src/dungeon_door.rs#encounters_json
  - client/src/network/encounterMessages.ts#encounterOf
  - client/src/game/encounterLaw.ts#encounterBanner
  - client/src/game/encounterLaw.ts#encounterMarks
  - client/src/game/encounterLaw.ts#encounterPlaces
  - client/src/game/encounterLaw.ts#encounterCall
  - client/src/game/encounterLaw.ts#inFoulWater
  - client/src/game/encounterLaw.ts#foulOf
  - client/src/combat/callout.ts#Callout
  - client/src/game/encounterCues.ts#EncounterCues
  - client/src/game/encounterMesh.ts#layEncounters
  - client/src/game/encounterMesh.ts#waterMesh
  - client/src/game/encounterMesh.ts#ANCHOR_SLAB
  - client/src/game/encounterMesh.ts#rite
  - client/src/game/dungeonDread.ts#layDread
  - client/src/game/dungeonDread.ts#coldRooms
  - client/src/game/entranceFacades.ts#layFacade
  - client/src/game/entranceView.ts#entrancesModel
  - crates/dungeon/src/warren.rs#carve_warren
  - crates/dungeon/src/descent.rs#roomy
  - crates/movement/src/heights.rs#edged_height_at
---
# Dungeons

The patrol areas' dungeons: three in each patrol, each laid by DFO's Forge from a seed
([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]], [[Pick - Dungeons 2.0]]), gone deeper and darker
([[Each Region Has Its Own Dungeons, and the Dungeons Go Deeper and Darker]]). The choices are Claude's
([[Dungeons as Claude Builds Them]], [[The Dungeon Overhaul as Claude Builds It]]).

## How it works

- **One crate for every machine.** The `dungeon` crate lays a dungeon from its seed and style, and uses no other
  crate. Its maths is + - * /, comparisons and rounding down to a whole number, each exact in IEEE-754, and every
  draw is made on a lane of its own: Mulberry32 over a seed
  that is the FNV-1a hash of the lane's name, as DFO's lanes draw ([[Agree to the Bit]]).
- **A patrol's three.** `of_patrol` gives each its seed, from the patrol's id and its number, and its style; the
  three take three different styles of the six, shuffled by the patrol's id. `named` names every dungeon but an Elite
  Dungeon by its seed and its first style, on a lane of its own: "The Weeping Ossuary", "Gallowmere Crypt", "The
  Catacombs of Ysolde" (`names.rs`). The page asks for the name alone with `nameOnly` (`dungeonName`).
- **Laid where no patrol is.** A place that is no patrol, as a sea island, lays its dungeon by its own seed and a
  style by its key (`style_of`): `Room::dungeon_run` stands its room as a run of its own (`RunOf::Sea`), the room
  module answers its layout to an ask by seed and style, and the page reads it with `askLayout`. A patrol's dungeon is
  the same laid by `of_patrol`'s.
- **The styles**, each with its two dungeon picture sets ([[Procedural Textures]]). The first four are the Forge's
  crypt, hall, cells and temple; the Caverns and the Mines are its cave and mine. Each style also names the style
  below it, which its last block may break into, and its entrances, the forged mounds or cave mouths with a door:

| Style (key) | Rooms a block | Its rooms' forms (sides in cells) | Ceilings (m) | Roof | Pictures | Below | Entrances |
|---|---|---|---|---|---|---|---|
| Crypt (`crypt`) | 3 to 5 | rectangles 2 to 6; octagons 4 to 5; alcoves 3 to 5 by 3 to 4; round rooms 5 to 6; rings 5 to 6 | 3.2 to 4.4 | arched | 123, 124 | Caverns | 43601, 43602 |
| Halls (`halls`) | 2 to 4 | rectangles 3 to 10; Ls 4 to 10; crosses 6 to 10 by 4 to 10; rings 6 to 10; Ts 6 to 10 by 5 to 10 | 4.0 to 5.6 | arched | 122, 124 | Crypt | 43601, 43602 |
| Cells (`cells`) | 4 to 6 | rectangles 2 to 3; alcoves 3 to 5 by 3; rings 5 to 7; Ts 5 to 6 by 4 to 6 | 3.2 to 3.6 | flat | 122, 123 | Mines | 43601, 43602 |
| Sanctum (`sanctum`) | 2 to 4 | rectangles 3 to 10; Ls, octagons 4 to 10; crosses 6 to 10 by 4 to 10; round rooms 5 to 10; diamonds and rings 6 to 10 | 4.4 to 5.6 | arched | 124, 122 | Crypt | 43601, 43602 |
| Caverns (`caverns`) | 2 to 4 | caves 3 to 8, and a few rectangles 3 to 6 and round rooms 4 to 8 | 4.4 to 5.6 | rough | 120, 119 | Crypt | 43603, 43604 |
| Mines (`mines`) | 2 to 4 | galleries 5 to 12 by 2; stopes (caves) 3 to 8; a few rectangles 2 to 5 and Ts 5 to 9 by 4 to 8 | 3.2 to 4.4 | flat | 119, 120 | Caverns | 43603, 43604 |
| Chalk (`chalk`, in `PASSAGE_STYLES`: no patrol's or the sea's draw) | 3 to 5 | galleries 4 to 7 by 2; rectangles 3 to 5 by 3 to 4; Ls 4 to 6 | 3.2 to 4.0 | flat | 123, 120 | Barrow | 43603, 43604 |
| Barrow (`barrow`, in `PASSAGE_STYLES`) | 3 to 5 | rectangles 2 to 4; alcoves 3 to 5 by 3 to 4; octagons 4 to 5 | 3.6 to 4.8 | arched | 124, 122 | Caverns | 43601, 43602 |

  A room's sides are its form's and its part's, whichever is less, so the largest stand where a storey is split least.

- **A beginning, a middle and an end, with more ways** ([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]],
  [[Dungeons Go Deeper, With Storeys, Stairs, More Ways and DFO's 3D Map]]). A dungeon has a beginning, the way in's
  room on the top storey of the first block; a middle, the blocks between; and an end, on the deepest storey of the
  last block a walk reaches, where the Reeve and the return portal stand. The main way (`main_way`) is the walk from the way in's
  cell to the end room's nearest, each step back to the lowest-numbered cell one step nearer the way in; side ways,
  loops, vaults and the storeys round it are found by looking round.
- **Its size.** A dungeon is two to five blocks of 51.2 m, each count as likely, drawn on its own lane
  (`size:<seed>`). An Elite Dungeon is four or five (`ELITE_BLOCKS`), each as likely, drawn on the same lane
  (`Dungeon::forge_within`), so a seed's other draws are as a patrol's dungeon's would be. The blocks stand in a
  chain: the way in's first, each next one beside the one before, drawn from the free squares round it.
- **How deep** (`descent.rs`, on the lane `storeys:<seed>`): the way in's block holds one or two storeys, any other one
  to five (`STOREYS_MOST`), each count as likely (`block_storeys`), and the last block as many as the deepest, so the
  way down ends at the bottom; the dungeon holds as many as its deepest block. A caller may ask
  for no more than a number of storeys (`Dungeon::forge_storeys(seed, style, blocks, most)`; `forge_within` is
  `forge_storeys` with `STOREYS_MOST`): at 1, every block is one storey, as a passage under the ground wants.
- **Doorways between blocks.** A block and the next in the chain share one doorway, the way on, on the deepest storey
  both hold, a cell along their edge from the third to the fourteenth drawn on the edge's lane; any other two blocks
  side by side share one a time in two, on a storey both hold, drawn on the lane `doorways:<seed>`.
- **Flights first** (`BlockPlan::planned`, on the lane `stairs:<seed>:<block>`): before any room, a block lays a flight
  for each two of its storeys one over the other, on the first of every head cell and way down, shuffled, where its
  four cells and the rock beside them are clear of every storey's flights, landings and doorways, its cells and its
  landings are inside the rim, and every storey's landings and the cells inside its doorways stay joined round it with
  room to spare: at least half the storey's open cells (`roomy`), so two flights' landings are never walled into a
  pocket no room reaches. A flight's cells are rock on every storey of its block, so nothing stands over or under one;
  the rock beside them only on its own two storeys, the rest free for rooms and ways. Its landings are ways on their
  storeys.
- **The way down.** On a lane of its own (`deeper:<seed>`), one dungeon in two lays its last block in the style below
  its first: the halls and the sanctum break into a crypt, the cells into mines, the crypt and the mines into
  caverns, the caverns into a crypt. The dungeon keeps its first style's name. Each part wears a look, its block's
  style: the first block's is the first look, and a deeper last block's the second. Its rooms, their purposes,
  props and lights, and its pictures are its block's style's.
- **A block storey** is 16 by 16 cells of 3.2 m, rock to begin with but its plan's doorways, landings and gallery.
  The square inside its rim is split, the largest part first, into parts no smaller than five cells, and a room is
  carved in each, a cell of rock kept round it. A style asks for as many rooms as the Forge's does (a crypt 3 to 5,
  the cells 4 to 6), but no part is cut below five cells, so the square is cut at most once each way and a storey
  holds four rooms at most. Each room draws a form of its style, by the forms' weights, among those whose least sides
  fit its part; then its sides within the form's and the part's, which way it lies, its outline, the first of eight
  drawn spots in its part whose cells are rock its plan keeps clear, and its ceiling (a whole number of 0.4 m).
- **Great rooms** (`plan_great`, on the lane `great:<seed>:<block>`): in every style but the cells, a block storey is
  one great room 20 times in 100 in the six styles, 12 in the passages' two: a rectangle (a cave in the caverns) of nine to twelve cells each way, drawn, inside
  the rim with rock round it, on the first spot from a drawn one clear of its storey's flights and landings and, where
  one is, of the landings of the storey over it; nine each way where its drawn sides find none. A hewn one stands its
  pillars as any great room does. Over 2000 dungeons about one block storey in twenty is one.
- **Warrens** (`warren.rs`, on the lane `warren:<seed>:<block>`): in the six styles but the cells 18 storeys in 100 but
  the way in's, a great room's and the last block's deepest (the end's) are warrens (the cells, all small rooms and no
  great one, lay none, so an Elite Dungeon in them keeps rooms its seals fit), a maze to lose one's way in: two or three
  small chambers (rectangles and round rooms of 2 to 3 cells, caves of 3 to 4 in the caverns), then a maze of
  one-cell ways through the rock round them, every second cell a crossing, grown by a drawn walk that turns back only
  where it can go no further, and 65 of each 100 of its dead ends broken through into the way beside, so it loops.
  Each chamber is reached from two sides, and its pieces of maze are joined to the storey's other nodes as any way is.
  A warren's ways take a torch every ninth cell. The dungeon keeps which storeys are warrens (`warrens`). Over 2000
  dungeons a warren holds about eight loops of its own.
- **Galleries** (`plan_gallery`, on the lane `gallery:<seed>`): in a dungeon that holds a great room under another
  storey (never under the way in's), the first (in the six styles, the first two) whose storey over it has no landing
  over it, and is neither a great room nor keeps a gallery already, rises through
  that storey: two to four of its sides one after another round it (drawn) keep a gallery a cell wide, a way of the
  storey over, and the rest of its rectangle there is open air (`Cell::Void`, 3.2 m high) over the room's floor (over
  a cave's bitten edge or a stone the rock stays). The rock round the open air on its other sides is kept, so no room
  or way of that storey opens onto it, and that storey's landings and doorways stay joined round it. A balustrade
  (`balustrades`) stands along every edge where the gallery meets the air, inside the gallery, 0.25 m deep (as the
  pieces drawn there are) and 1 m high: a block a body climbs and drops from, a way down and never up. No pillar
  stands under the open air. Over 2000 dungeons about half of those with a great room on a lower storey have one,
  where the gallery fits.
- **A room's shape** (`outline`) lies inside its rectangle, and is always one walk. A rectangle takes all of it; an L
  leaves a corner quarter rock; a cross leaves each corner block rock, a third of each side; an octagon leaves each
  corner cell rock; a round room keeps the cells inside its rectangle's ellipse, a diamond those inside its rhombus;
  a ring walks round a core of rock left standing as stones (the walk two cells wide where the room is seven or more
  that way); a T keeps a bar along one long side and a stem down the middle of the rest. Alcoves line one or both long walls of a hall with single cells cut one deep into the rock, every
  second cell from the second, never at a wall's end: a crypt's burial niches and the cells' cells. A cave is bitten
  from its rectangle as the Forge bites one: each cell kept where it lies inside the rectangle's ellipse, its edge
  pushed in or out by a draw, and only the cells one walk from its middle kept. A great cave, 5 cells or more each
  way, stands one stone (two from 24 cells) where all eight cells round it are the cave's.
- **The ways** (`ways.rs`), as the Forge joins a storey: its nodes (each room's middle cell, its landings, its
  doorways onto the blocks beside and its gallery's first cell) are joined by Prim's tree from the first, each step
  the nearest pair of a joined node and one not yet joined by cells apart (east-west plus north-south), the first
  such pair on a tie; then each pair the tree left unjoined is joined one time in min(0.3, 2 / its nodes). Each join
  is the cheapest way: rock costs 3, a room 2, a corridor 1, so ways reuse ways. A way never crosses the rim but at a
  doorway, never cuts a stone, and never takes a cell its plan keeps (a flight, the rock beside it, a gallery's open
  air and the rock round it). Over 2000 dungeons a dungeon holds 4.3 loops on average and 21 at most outside its
  warrens, counted over its rooms and open cells, a flight's cell one on both its storeys. A storey that is not one walk, has two dead ends (rooms of one doorway) or more, has no
  room and no gallery, or (the way in's) no room against rock for its exit door, tries again on the next of sixteen
  seeds, and past them takes its simplest form, one room of 3 by 3: about one storey in ten thousand. A deep block's
  storeys hold fewer rooms, its flights taking their cells: about 2.6 a storey in a block one storey deep, 1.9 in one
  five deep. A dungeon is one
  walk, since each storey is, each flight joins its two and the doorways join the blocks.
- **Every side way leads somewhere.** A storey has one dead end at most, and each dead end holds the way in, the end,
  a vault, a landmark, or its storey's chest (`chest_rooms`, the rooms its chests stand in first). A way that ends
  does so at a landing and its flight, or at a doorway onto the next block. About a quarter of the rooms are dead ends.
- **The vaults** (`vaults`): one in a dungeon of two or three blocks, two in one of four or five, each a room off the
  main way but the way in's and the end, on the deepest storey it can, a dead end first, then the farthest along the
  walk. Before a vault is furnished, its first open cell away from its doorways with a rock wall no torch hangs on is
  kept clear (`keep_chest_place`), so its gold chest always has a place.
- **The way in** is in the first room of the way in's block that has a cell with rock beside it, at the cell nearest
  its middle, its quiet cells first: the exit door stands on that rock (never a stone), 1.4 m wide and 2.4 m high, and
  a body arrives 0.4 m past that cell's middle, about 2 m in from the door, facing into the room.
- **The return portal** stands on the end room's wall like the exit door, as wide and as high, on rock that is no
  stone, never on the exit door's wall. Of the room's cells, its quiet cells first, it takes the one farthest from
  the way in by walk that has the best wall for its torches: one that runs on past the cell both ways (four portals
  in five), else one that runs on or ends in the room's corner each way, else any. It takes a player back out to the
  dungeon's entrance once the Reeve has fallen ("In the Game").
- **Ceilings** (`ceiling`): a room's form, only a look; it stands at its own height whatever its form. Under an
  arched roof a square room, an octagon or a round room takes a dome, and a hall of alcoves, a T or a rectangle whose
  longer side is at least half again its shorter a vault along it; a cave and every cavern takes rough rock; any other room is flat.
- **Torches**, 2.1 m up a wall over its own floor and 0.35 m off it, each lighting 8 m. Two flank the portal first, so the end of the
  way is lit and marked before it opens: on its wall 1.55 m either side of its middle, past its arch (1.3 m) and a
  sconce's reach (0.2 m), or, where its cell is the room's corner that way, in the middle of that side wall. Then on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; at
  each landing, so a flight is lit from both its ends, a landing two flights share once; and on every fourth corridor cell of a block storey (a warren's every ninth), row by
  row, but one already lit. Each of these stands in the middle of its cell's wall, none
  over the exit door or the portal, and none within 2.4 m of another of its room's, which would read as a pair.
- **Doorways.** Where a room's cell meets a corridor, two jambs 0.3 m deep stand in the corridor and narrow the edge
  to 1.6 m, up to the lower of the two ceilings, under a lintel at 2.8 m. A hewn room (no cave) at least 4 cells each
  way stands a pillar 0.7 m square at every second inner corner whose four cells are its own.
- **Purposes** (`name_rooms`). Every room has a purpose from its block's style's bank
  ([[The Dungeons Are Perfect and Insanely Varied]]; [[Dungeons as Claude Builds Them]], "The varied dungeons"): the
  way in's room and the end room their style's own,
  and every other room, along the walk from the way in, one drawn among those its shape suits that its look's other
  rooms have taken least, so none is taken twice while one is left. A mines' gallery is a rectangle and its stope a
  cave. Each purpose has a short key (`role`: `ossuary`, `war-room`) and a name, "the Ossuary"; a name taken again
  takes a word before it, "the Old Ossuary", then "the Lower Ossuary", and so on through ten words, then two ("the Old
  Lower Ossuary"), so every name in a dungeon is its own. Each of the six styles' banks holds two rooms of dread among
  its eight (open graves, a slaughter hall, a flaying room, a desecrated chapel, a nest, a sealed drift, ...), which
  the page dresses in blood and bones ("In the Game"); the mines' and the caverns' fall in as rock and timber, never
  masonry.
- **Props** (`furnish`). A purpose lays its props from the forged models' families ([[Forged Models]]): some 250
  pieces that fit a cell and belong under the ground, from coffins, tombs and headstones to beds, shelves, racks,
  crates, hearths, posts, rocks and hangings. Each of its lays stands its pieces by a pattern: against the walls, one
  for each so many cells; one in the middle, its front to the way in; in rows along the room's longer side, every
  second line from the second, the lines' ends left as aisles, pews facing away from the way in and shelves across;
  a pair either side of the end's door (the portal in the end room, the exit door in the way in's) or the way on; one
  in each alcove; scattered over the floor; or hung on the walls at 2 m. A piece's family is drawn first, then a
  piece of it that fits.
- **A piece's place.** Each stands inside its own cell, one to a cell and one to a wall, its foot on the floor and its
  top at least 0.3 m under the ceiling: against a wall its back 0.1 m off it, turned a quarter where it is deeper
  than wide; free-standing 0.4 m inside its cell's edges, clear of every pillar. Each is a solid, but a hanging, which
  hangs over head height and fills nothing. None stands on a doorway's cell (one beside a corridor, so no frame is
  blocked), the way in's cell, the portal's or the Reeve's post, against a torch's wall, or within 0.5 m of a torch's
  flame; and no prop or fixture with a solid stands within 3.2 m of the Reeve's post, so his cache and the fight round
  him find open floor (a doorway's jambs and a great room's pillars stand where the Forge lays them). A piece stands only where the room's free cells, those holding no solid, stay one
  walk and number as many as its band of foes (`posts_for`: one for each ten cells, two to four).
- **The way on** (`way_on`): the doorway the main way leaves a room by. Before its purpose furnishes a room on the
  main way (but the end), a pair of braziers flanks its way on: on the room's wall either side of it where both cells
  there are its quiet cells with rock on that wall, else in the corridor's cell past it (`flank_outside`), past the
  jambs either side of the opening, 0.05 m clear of them, where no room, flight or gallery's open air opens off
  that cell across the way and no torch burns within 0.5 m. A room off the main way has no way on, and its side ways take none. Over 2000 dungeons
  braziers flank 6 ways on in 10.
- **Lights.** Beside its torches a purpose lights its room: braziers (a solid 0.6 m square and 1 m high) either side
  of the end's door or the way on, or nearest the middle; candles on its tables', lecterns', altars' and coffins'
  tops; crystals against the caverns' walls (a solid 0.6 m by 0.4 m, 0.9 m high), and glowing fungus in a Fungus
  Grove or a Dripping Gallery (the same, 0.5 m high); lanterns 2 m up on the mines' walls and posts; and a fire in
  each hearth. A fixture with a solid stands as a piece does. Every room has a light.
- **Landmarks** (`place_landmarks`): set pieces a dungeon is remembered by, three a style, each with its solids and
  glows (`content/dungeon/landmarks.json`, which the crate's `build.rs` reads as it builds). A dungeon of
  two or three blocks stands one, of four or five two, none twice, each in a room of its look's style but never the
  way in's, the end or a vault. Rooms are tried from the middle of the walk outward, each style's landmarks in an order drawn
  on the lane `landmark:<seed>`.
- **A landmark's place.** It covers whole cells of its room. A free one stands nearest the room's middle at a drawn
  quarter turn, clear of the room's rim where any spot is, else with its edges on the rock. A wall one stands its
  back row on rock along its whole width, faces away from it with its other sides in the room, nearest that wall's
  middle. None covers a torch's cell, or covers or touches a doorway, the way in or the portal; the room's other
  cells stay one walk and as many as its band.
- **A landmark's room** takes its role and name, a name taken again taking a word before it. Its purpose furnishes it
  round the piece: no prop, fixture or foe stands on its cells, which wall the walk as a solid does, and no pillar
  whose box would meet it is stood.
- **Where foes stand** (`nearest_middle`): a room's free cells nearest its middle, its quiet cells first and then the
  rest, so a smaller band's cells are always the first of a larger's.
- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell, down and up the flights; open
  air is no floor, so the walk never crosses it (`walk_from`). The end is the farthest room by walk on the last
  block's deepest storey a walk reaches; every room of the way in's storey lies nearer.
- **Storeys** (`storeys`): a dungeon holds one to five (`STOREYS_MOST`), stacked downward `STOREY_M` (8 m) apart from
  the way in's: storey k's floor is -8k m. `cells` and `ceilings` hold a plane of `columns` by `rows` for each storey,
  storey by storey, so a one-storey dungeon's cells and their numbers are its whole grid's. A cell's number
  names its storey (`storey_of`, `floor_of`); `centre` stays (x, y), `standing_point` adds its floor. A ceiling is
  over the cell's own floor. Each room names its storey, and a pillar's top is absolute. Each room's props, fixtures,
  torches and landmark stand on its storey's floor, every point's z absolute. `hand_made::two_storeys` lays two
  storeys by hand for the other crates' tests.
- **Cells**: rock, a room's, a corridor; a flight's (`Stair(s)`), on both its storeys; and a Void, open air on an upper
  storey over a lower storey's room, where nothing stands and a body falls through.
- **Flights** (`Stair`): four cells in a straight line, head first, on storey `upper` and the one under it, from a
  top landing (the cell before the head, on `upper`) to a bottom landing (the cell after the foot, on the storey
  under). They are walked as their smooth slope (`slope_at`): the upper floor at the head's edge falling 8 m over
  12.8 m (0.625) to the lower floor at the foot's edge, taken as a share of the way between the edges so it meets
  each landing's floor exactly, level past either end. Their ceiling is 3.2 m over the slope. The walk crosses a
  flight from one storey to the other (`walk_from`), stepping onto and off it only at its landings: a cell beside its
  head on the lower storey, or beside its foot on the upper, lies a storey off the slope.
- **Spans** (`spans`): each column of cells holds open spans, lowest first: a storey's open cell from its floor to its
  ceiling; a flight's one span from its slope's lowest in the column to 3.2 m over its highest; a Void lifting the
  span under it to the Void's own ceiling (a Void over rock opens nothing). Rock holds none.
- **What a body stands on** (`heights`, `boxes`): each storey's plane of open cells (a flight's and a Void's open) and
  none for rock, in cells of 3.2 m; and as boxes (min x, min y, max x, max y, bottom, top) the jambs, then the
  pillars, then the props' solids, then the fixtures', then the landmarks'. A box stands on the highest floor at or
  under its top (`storey_under`), so a solid is laid on a lower storey by its top alone.
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a dungeon as JSON, from its patrol's id and name and
  its number, from an Elite Dungeon's place (laid by `elite_laid` in four or five blocks, and named as the ask names
  it), or from a seed and a style's key, as the page's `DungeonLayout` reads it: its name, first style and pictures; its
  looks (each a style and its pictures) and each cell's look (-1 for rock); its storeys, `storeyM` (8), `floors` (each
  storey's floor) and `stairs` (each `{ upper, cells, top, bottom }`); its cells (-2 rock, -1 corridor, -3 a flight's,
  -4 a Void, or a room's number), ceilings and cell looks, storey by storey; rooms (each its rectangle, height, walk,
  role, name, ceiling form, look and storey), end, way in, arrival, exit door and portal (each with its absolute z),
  torches, fixtures (each where its light burns and its kind: 0 brazier, 1 candles, 2 crystals, 3
  lantern, 4 hearth), frames, pillars, boxes, balustrades (each gallery rail's box, as a box is: the page's course
  takes them, so its aim, shots and marks stop on a rail as the rules' do), props (each its model, its origin and its
  yaw), landmarks (each its
  module, its turned footprint's north-west corner and its quarter turns clockwise) and glows (each x, y, z and its
  kind: the fixtures' kinds, then 6 spirit, 7 daylight, 8 water, 9 rune); null for a number past the patrol's three or a
  place that is no Elite Dungeon. An Elite Dungeon's answers its encounters too (above, "Encounters"): each seal's
  kind, room, pieces, pads (min x, min y, max x, max y, top, bottom), drowned cells and doorways' middles (x, y, z);
  the anchors; and
  how near a piece a player stands on it. The room door's `dungeon` and `layout` ask it. Five dungeons' answers are pinned by
  their hash, natively and through WebAssembly, so a dungeon is the same bytes on every machine: four patrols', one of
  five blocks whose last is a style deeper, and one laid by a seed and a style.

## In the rooms

- **One shared room at Normal, and runs above it.** A patrol's dungeon at Normal is one shared room,
  `node-<patrol id>--dungeon-<number>` ([[Server]]). It opens from its patrol's node file, refused for a node that is
  no patrol, and its garrison stands at the patrol's island band. Its first clear pays the day's while it is its
  island's dungeon of the day; set to a harder tier it would pay none, since it carries no day's modifier. At Elite
  or Abyss a patrol's dungeon is only a run, `node-<patrol id>--elite--dungeon-<number>--run-<instance>` or
  `--abyss--`, as every Elite Dungeon is; a sea island's dungeon is shared at Normal and a run above it. A run opens
  from its name alone (`runAsk`, `open_run`) and lets in one company; a patrol's dungeon's run reads its patrol's node
  file too. While its patrol is locked ([[World Map]], "Seen whole, reached by nodes"), neither its shared room nor
  any run of it takes a player, as the patrol's own room takes none, by an entrance or otherwise.
- **A run's room** (`Room::dungeon_run`) stands any dungeon for a run at a tier, opened at a minute. The run is fixed
  as it opens; at Abyss it carries five revives the company shares, and a wipe starts it over ([[Activities]]).

| Run of | Its world seeds from | Levels | End foe | First clear pays | Modifiers | Gated as |
|---|---|---|---|---|---|---|
| A patrol's dungeon (an island's patrol, numbers 0 to 2) | `<patrol>--dungeon-<n>` | its island's band | the Reeve, a Miniboss | the day's, that day, when it opened as the day's | the day's, at Elite or Abyss when it opened as the day's | a patrol's dungeon |
| An Elite Dungeon at Normal | `<place>--elite-dungeon` | its island's band | its Boss | nothing more | none | an Elite Dungeon |
| An Elite Dungeon at Elite or Abyss, only this week's of that tier | the same | every foe at 26 or 30 | its Boss | the week's | the week's | the week's dungeon |
| A playlist's run of any Elite Dungeon, at Elite or Abyss | the same | every foe at one of its bands' levels | its Boss | the playlist's daily, and a clear toward its weekly, once a run | the day's (and at Abyss one more) | the playlist's band |
| A sea island's (its style known, its continent of a band) | `sea-dungeon-<continent>-<style>-<seed 8 hex>` | its continent's band | the Reeve, a Miniboss | nothing more | none | by its tier alone |
| A guild dungeon, behind an outpost's Delve Gate | as a sea island's, its seed and style the guild's week's | its continent's band | the Reeve, a Miniboss | a guild package to each member, once a week | none | by its tier, up to the gate's |

- **An Elite Dungeon's room** lays its dungeon from its place (`elite_laid`: the seed `elite:<place>` and the style
  `gear::activities` names) in four or five blocks, its Boss alone on the end post. The week's two hold every foe
  at their own level whatever difficulty the host sets after (`at_seas`).
- **Its world is the dungeon's frame**: x east and y south from the north-west corner, the top storey's floor at 0 m.
  Every point its snapshots, its cache and its spawn name is in it, its z absolute: the end foe, the bands, the cache
  and its Vestige, the checkpoints, the chests, the seals' pieces, pads and doorways and the Court's anchors stand on
  their own room's storey. Its section is the dungeon's rectangle, its one spawn the
  arrival, where a body joins, facing into the room.
- **Checkpoints** ([[Revives]]): each room whose band stands lays one, and an Elite Dungeon one at each seal's room and
  one at the Court, each at the doorway cell the walk from the way in enters its room by, facing in. One is won as its
  band falls, its seal breaks or the Court's Boss wakes (with no seal, once a living player has stood in the Court with
  it); a player who respawns stands at the one won farthest along by its room's walk, the Court's always last
  (a seal's room may lie farther by walk than the end), before any at the arrival, and every player is told "Checkpoint reached" as it moves on. In a run a band whose fall
  won its room's checkpoint does not stand again while anyone is in the room; in a shared dungeon it stands again as
  any group does, and the checkpoint falls back to the one won before it.
- **What a body stands on** (`DungeonGround`): the dungeon's own ground, not [[Movement]]'s blocks. Under feet at z
  (`height_under`) it is the highest span floor or flight's slope at or below a step (0.5 m) over them, or a solid's
  top where the solid's bottom is; with none, a wall 10 m over the feet's storey. So a body walks down a flight and up
  again without a jump, and walks off a Void's edge and falls to the floor under it. The feet's storey is that of the
  room or corridor span holding them, so a body leaping high in a tall lower room keeps to it; on a flight, in the
  air or in rock, the storey whose floor lies nearest them (`storey_of_feet`). A move is walled where it crosses that
  storey's rock, where it ends in a column with no span holding the feet (its floor within a step of them and its
  ceiling over a crouched body's head, 1 m; under the
  deepest storey's floor and over the top storey's ceiling nothing bounds a span),
  or where it ends nearer than a body's half-width (0.35 m) to that storey's rock or a solid standing on it and nearer
  than it began: a body slides along a wall, steps away from one, and never stands in its face. A flight's cell is rock
  to a body but on its own flight or on the landing at its end on that storey, as the page draws it (`open_from`), so a
  body beside a flight, past its foot or before its head stands its half-width off its side. Inside a solid, as a shove
  might leave it, its nearness is less than nothing by its depth, so it walks out and never deeper; its feet, lifted to
  the solid's top, are held as on the floor under it, so a solid near a lower room's ceiling never holds it in. Movement climbs
  blocks, never a ground's walls, so no solid is climbed; an Elite Dungeon's Ascents' pads are its room's blocks, and
  are climbed, their tops kept under the ceiling. Each cell keeps the solids
  within a half-width of it, so a move looks at a few. The browser predicts on the same ground (`fighter_dungeon`).
- **What a line meets** (`line_walled`): rock at any height of its storey (each end's, as feet there are held, so a
  line high in a tall lower room meets that room's rock), rock or a slab between storeys wherever
  the line leaves the spans of a column it crosses, and a jamb, a pillar or a prop where the line passes between its
  bottom and its top, as a block meets a line; a line looks only at the solids by the cells it crosses. A foe's eyes, a
  soft lock, a blow, a telegraphed shape, a charge's lane and a shooter's cover are stopped by them and see over a
  low coffin or table. A noise through them carries half as loud and half as far. A kill's drop thrown across a wall
  or a tall solid rests where its foe fell; one thrown onto a low solid rests on its top, unless it would lie so deep
  in it (a lake, a dais, a pool) that no body standing off it reaches it, when it too rests where its foe fell. A
  shot stops where it first
  enters rock, a slab, the grid's edge or a solid (`wall_entry`), however far it flies in a tick, passes over a solid
  lower than itself, and falls onto the floor or slope under it alone (`floor_under`).
- **Its navmesh** is baked over the whole dungeon in cells of 0.4 m, on each column's lowest span (a flight's slope
  where it is one, rock a wall 10 m over the top storey) with the rock between each span and the one over it as a
  block with a bottom (`slabs`), and over a column's top span, unless it is the top storey's floor open as a line
  sees it, rock from its ceiling to 10 m over the top storey, as a rock column stands, so the firing spots of the top
  storey see no lane over a lower room; every solid on its own floor as its colliders, each a body's height at least over
  that floor, since the ground walls a solid however low, and an Ascent's pads with them, and kept to the floor joined to the arrival ([[Navmesh]]), so the rock's flat tops are left out. It lays no
  links: no foe paths up a solid's or a pad's side or off its top.
- **Its garrison** ([[Enemies]]): the end foe (the Reeve, a Miniboss, or an Elite Dungeon's Boss, held back until its
  seals are broken: "Encounters") alone on the end room's cell nearest its middle; a band of
  two to four in each other room past the way in's, one foe for each ten of its cells (`posts_for`), on its free cells
  nearest its middle, its quiet cells first, round its props. When the bands and the Reeve would pass the room's 24
  foes, the rooms of the main way stand theirs first, the most that fit spread evenly along it; then each vault while
  foes remain, so a vault is guarded; then the other rooms, the most that fit spread evenly along the walk.
- **The cache** stands 1.6 m from the end foe's post, facing it, the first of the eight ways round it, north first,
  that is open floor with nothing between where the whole chest the page draws keeps clear: 0.9 m wide and reaching
  0.82 m behind its front with its lid thrown open, it keeps off rock and every solid, and out of the portal's cell
  from its wall to its middle within 1.3 m of the arch's middle. Where no way fits, it stands at the post itself, so
  every dungeon has its cache, facing the first way with open floor 0.8 m off and nothing between. Shut while the
  end foe stands; when it falls the cache opens and pays every player then in the room a dungeon's clear ([[Gear]],
  "A clear"): its XP and Aurem, an item, and one time in three a Vestige thrown 0.8 m before it, or on the post where
  no way has such floor (`pay_cache`); and, where the run's first clear in its period pays, a Vestige kept at once in
  their carried ten, else their vault, else sent to their mail (`pay_clear`). It shuts when the end foe stands
  again. Each snapshot carries it.
- **Its chests and containers** ([[Patrols and Dungeons Hold Chests, and Their Containers May Be Searched]]; Claude's
  calls in [[Chests and Searchable Containers as Claude Builds Them]]): every dungeon's room, whatever runs it, lays
  the places a chest may stand (`of_dungeon`): against each rock wall of each cell of every room past the way in's but
  the end, and never an Elite Dungeon's seal's room, its back 0.5 m off the wall and facing into the room, its box
  (0.9 by 0.5 m) clear of rock and every solid; none on a doorway's cell, the way in's or the portal's, one holding a
  prop, a fixture or a landmark, or under a torch (`against_walls`). It stands a chest for each storey of each block
  (`dungeon_chests`), each in a room of its own, the dead ends its generator names first (`chest_rooms`) and then
  rooms drawn on the room's loot seed, and where rooms run short a room holds a second, two cells from every other;
  a vault's chest in each of its generator's vaults (no seal's room is a vault), against the wall its furnishing kept
  clear (`stand_vault`), and no plain chest there. Each draw rolls on a lane of its own,
  wider than the most chests a dungeon stands. A dungeon's chest pays more than a patrol's, a vault's the most
  ([[Gear]], "A find"). Each player's gear counts the chests they have opened of all it stands, and the screen names
  them under the place's name ("Chests 2 of 5"). It makes one of its props of the holding families in four
  searchable, 16 at most, none in a seal's room nor one that rock and solids leave no body room to stand beside. All
  are drawn again as the cache shuts, when the end foe stands again, never at an Abyss wipe. Each player opens each once, as a patrol's
  ([[Server]], "Chests and containers").
- **The entrances**: a patrol's room lays its three dungeons' entrances as it starts ([[Server]], "A patrol"), from
  the node's id, drawn apart from its resource spots. Each is one of its style's entrances that its dungeon's seed
  draws (`model_of`): a mound with a door, 43601 or 43602, for a built dungeon, and a cave mouth, 43603 or 43604, for
  the Caverns and the Mines. An Elite Dungeon's node keeps its open-air approach and lays one entrance, to the
  dungeon `elite_laid` lays, drawn from its id as a patrol's are (`lay_elite_entrance`). The six Daggerfall's blocks stand keep their numbers on the wire (0 to 5), raised as
  those blocks raise them:

| Model | Stood by | Raised (m) |
|---|---|---|
| 42000 | DUNGAA00 | 2.5 |
| 42001 | DUNGAA01 | 4.8 |
| 43601 | the other dungeon blocks | 0.775 |
| 43602 | the other dungeon blocks | 0.475 |
| 43603 | the ruin blocks | 1.2 |
| 43604 | the ruin blocks | 1.225 |

  Its yaw turns the model's +z as an RMB block's does, so its door (the forged props' `doors` quad) faces the ring's
  middle. Every player of the patrol's room is sent them in their gear. A player joins the patrol's room 1.5 m before
  an entrance's door, facing away from it, by `?entrance=<number>` on its address, or in a page playing alone by the
  room's `room_join_at`.

## Encounters

Every Elite Dungeon run, at Normal, as the week's two and from both playlists, is more than a run of fights: seals to
break before its Boss stands, and a Court round the Boss
([[Matchmade Dungeons Gain Encounters, Puzzles, Climbs and Raid Mechanics]]; Claude's calls in [[The Playlist and Its Dungeons as Claude Shapes Them]], "Encounters"). A room
lays them where its end foe is a Boss (`laid_dungeon`); no patrol's or sea island's dungeon has any.

- **The plan** (`plan_encounters`) is laid from the dungeon alone, so the room and the page lay the same: its draws on
  a lane of its own, named for the dungeon's cells, its way in and its portal (`encounters:<hash>:<way in>:<portal>`),
  its maths + - * / and comparisons. A dungeon of four blocks holds two seals at the most and one of five three, each in its own
  room, never two of a kind. The rooms past the way in's, but the end, every landmark's and every vault's (which stands its gold chest), are taken in walk order
  and split into as many stretches as there are seals. A Holdfast, which wants a great room, takes the stretch whose great
  room lies nearest its middle, and that room, so it stands wherever the dungeon has one; no other stretch lays one. In
  each other stretch, while no Ascent is laid, an Ascent is tried first in every room of the stretch (never the first
  room of the walk where there are four or more), nearest its middle first; else each kind left, in an order drawn once,
  in the stretch's room nearest its middle that fits it; then in any room of the walk but the first; then, but a climb,
  in the first. No kind is tried twice in a room. A room too small, too low or too cluttered for a kind is passed over.
  Sixteen of the 18 lay their full count; `smugglers-labyrinth` and `saltworm-warrens`, of five blocks, lay two, as no
  room of theirs is great enough for a Holdfast or tall enough for an Ascent, and a test holds that no kind left fits a
  room of a dungeon a seal short. Nine lay an Ascent, and a test holds it to nine or more; five a Holdfast.
- **Where pieces stand.** A piece stands on a spot of its room: a cell's middle or one of its four quarters' (0.8 m
  each way toward a corner), never on the way in's or the portal's cell, nor a doorway's (but an anchor), each 0.9 m from
  every solid and 1.4 m from every prop's and fixture's middle, so no brazier or candle stands on a piece. Only the
  solids, props and fixtures of its room's storey count, for a piece, a plate's line of sight and an Ascent's pads and
  leaps alike: another storey's stand over or under its floor. Runes stand 2 m apart at the least, plates 6.4 m (two cells).
- **Counted by the living in the room.** Every seal counts the living players standing in its room's cells: one down
  or away is not counted, for plates, waves or the stone.
- **The Litany** (a puzzle): four to six runes, drawn, on the floor of a room three cells or more each way
  (`LITANY_ROOM_CELLS`), so its foes are fought off the runes. While it runs they show in turn, each a second,
  then a two second pause, and again, the show going on past the runes already lit, which show lit. A step is a living
  player's body on the ground within 0.9 m of a rune (a dodge or a jump across one is none). The next rune in order
  lights; a lit one stepped again is ignored; any rune further on is wrong: it shows red for a second, every rune goes
  dark, the show starts again two seconds on, two of the dungeon's foes stand at its doorways (`RuneWrong`), and no step
  counts until the show starts again. After the first rune each next is stepped within 3 s, or every rune goes dark
  with no foes. It never harms anyone itself. Every rune lit breaks it.
- **The Weighing** (split up): three plates as far apart as the room allows among the spots in plain view from the
  doorway its room is entered by (the one nearest the way in on the walk: no solid on the line from that doorway's
  middle, a body's width and a hand wide) and ahead of a body coming in by it, within about 70 degrees either side of
  the way in from the open cell before it (`PLATES_AHEAD`, a cosine of 0.35), so the puzzle is seen on coming in; or the two farthest while fewer than
  three living players stand in its room. A plate stood on by a living player within 1 m stays held 3 s after the last steps
  off, and for a lone player the walk between its two plates besides (`plate_linger`), so a lone player walking, not
  only sprinting, can hold both. It is held each tick every plate in play is, and broken once held 20 s in all; a wave
  comes at its doorways 3 s after it starts, then every 12 s.
- **The Ascent** (a climb): four to six pads, each 1.6 m square. The first stands on a cell beside the doorway a
  company comes in by, reaching back to that doorway's cell, 1.6 m high, mantled from the dry doorway. Each next stands
  a leap from the one before, 4.4 m to 5.2 m edge to edge along the line between their middles, through open air (no
  solid, and no cell but the room's own, within a body's width and a hand of that line, as the dungeon's solids and
  rock are walls to a body however high it leaps: no leap crosses a cave's bitten corner), and every two pads stand 4.4 m apart edge to edge at the least: a run off the edge falls short and only a
  running jump crosses. Each rises 0.4 m over the one before, at most to the room's lowest ceiling less a body's height
  and 0.6 m (a jump's rise and a margin), the last 0.3 m; every pad after the first stands 1.9 m or more, over a
  mantle's reach (1.8 m) from the floor, so a room whose ceiling is under 4.3 m lays none (ceilings come in 0.4 m
  steps, so 4.4 m at the least). The pads' middles are searched on a
  0.8 m grid over the room's cells but its doorways', torches', the way in's and the portal's, clear of every solid,
  the longest run kept. Its pads are blocks a body stands on, jumps between and climbs ([[Movement]]), and walls on the
  navmesh. Its floor (its room's cells but its doorways') is foul water while the seal holds: while it runs, once a
  second it takes 12% of their health from every living player standing on it (`Drowned`, told to that player). Every
  living player in its room standing on the seal stone, on the top pad's middle, together for 2 s in all breaks it.
  Every Ascent of the 18 is proven: a body run by the movement crate from the doorway, taking its run at each leap from
  the far side of its pad and jumping at the edge, reaches the stone without touching the foul floor; and from each pad
  the next is reached by a running jump and never by a run with no jump without touching the floor.
- **The Holdfast** (a defence), only in a room five cells or more each way (16 m, `HOLDFAST_ROOM_CELLS`): a relic over
  the spot nearest its room's middle whose ring, 5 m round, lies whole on the room's floor (no cell it reaches is rock,
  a corridor or another room: `ring_whole`), every doorway's middle a metre or more past it, so its waves come in
  outside the ring and a company has floor to fight on round it. It is held each tick a living player stands in the
  ring, and broken once held 45 s in all. A wave comes at its doorways 2 s after it starts, then every 12 s. Each living
  foe in the ring drains a twentieth of the relic a second, and while none stands in it the relic regains a fortieth a
  second, to whole; a drained relic halves what was held and stands whole again (`RelicDrained`).
- **Seals' rules** (`seals.rs`): a seal waits until a living player stands in its room and no living foe of the
  garrison does (a wave's foes do not hold it), then runs until broken (`SealBroken`, told to every player with how
  many are broken). A wave is one of the dungeon's own Majors for each living player in its room, two to four, drawn
  from its garrison's table at its foes' levels, never its Elites, which stand in its garrison alone; standing at the
  room's doorways 4 m or more from every piece of its seal (`WAVE_OFF_PIECES_M`; where none is, the farthest) and
  hunting the nearest living player on its storey (one on another is never near, `seals::near`). A seal's waves, a
  wrong rune's foes among them, stand no more while two for each living player in its room live, four at the fewest
  and eight at the most (`wave_living_most`), nor past the room's most foes; a wave so refused is tried again a
  second on (`WAVE_RETRY_TICKS`), not given up till the next.
- **Spoilless.** Every foe an encounter stands (its waves, a wrong rune's, a ward's) drops nothing when killed, as a
  defence tried again stands foes that drop nothing (`quests.spoilless`): kills there pay their experience, and the
  seal's breaking and the cache stay the reward. An unfinished seal's waves keep coming, so they could otherwise be
  farmed.
- **The Court** (`court.rs`). The Boss is held back off its post, its post never counted cleared, until every seal is
  broken; then it stands (`BossWoke`), and its health is made a match for the living players then, half again for each
  beyond the first, as a public event's great foes are (`toughen`). At two thirds of its health, and again at one
  third, a blow that would take it to that share or past is held there and the Boss is warded (`WardRaised`): a wave of the dungeon's
  Majors for each living player, two to four, comes in at the end room's doorways 4 m or more from every anchor (the
  farthest where none is), and another 15 s on while the ward still stands, the Court's waves kept as a seal's are,
  two for each living player, four to eight, and one refused tried again a second on (`WaveOf::Court`).
  While warded the Boss runs back to its post, by the navmesh from off its floor (a flight or another storey), and stands there (`hold_ward`), striking where it stands, and every 8 s
  from the ward rising it slams: a ring 4 m round it shown 2 s, then 30% of their health from every living player
  inside it (`BossSlammed`). Its three anchors stand in the end room 2.4 m or more from its post, each the spot
  farthest from the post and those taken before. A living player within 1 m of an anchor fills it; each filled for
  3 s, the ward breaks (`WardBroken`). With three or more living players, an anchor left empties 6 s after its last
  player leaves unless all three are filled; with one or two it keeps what it holds. A fallen Boss never stands again
  in its run, though the other posts do, so its Court is fought once a run (`stands_again`).
- **The Reckoning.** From the first ward broken, while the Boss stands, every 40 s: a ring of light 2.5 m wide at one
  anchor, in turn, shown 10 s, then 70% of their health from every living player it reaches outside it (one on
  another storey, however close across, is outside), a blow from
  the Boss (`ReckoningLanded`). It reaches the end room and every corridor its doorways open onto and the rooms those
  reach, as far as the next room's doorway (`reckoning_reach`); a player farther off, as one standing again at the way
  in, is not reached.
- **Fury.** Its clock starts when a living player first stands in the end room after the Boss wakes, not as it wakes,
  so the walk from the last seal costs nothing. From 8 minutes on, every foe's blow on a player weighs a tenth more, one
  more tenth every 30 s, to three times (`modded_blow`). It ends with the Boss.
- **Harm** from the foul floor, the slam and the Reckoning is settled as a foe's blow is (`settle`), unguarded and
  undodged: shields, deaths, revives and the plates' displays treat it as any harm.
- **A wipe at Abyss** keeps every broken seal; the rest wait again, every wave is gone before the posts stand again
  (any dungeon's, as a wave never stands again), and the Court starts over, its Boss held back again unless every seal
  is broken. Leaving and coming back keeps everything: it is the room's.
- **The Court's darkness.** While the Boss stands the Court's cells are a darkness zone ([[Revives]]): no one fallen
  there respawns by their own ask, and only an ally stands them up; one fallen outside it may. A company all down
  while the Boss stands, below Abyss, falls back to the Court's checkpoint once the last of them has lain four
  seconds, every player whole at its door: its waves
  are gone, its ward, anchors and Fury begin again, and its Boss stands again whole and awake; every seal stays
  broken.
- **On the wire.** Each snapshot carries the encounters whole (`EncounterSeen`, about 240 bytes): each seal's kind,
  state, progress, its pieces' marks (a Litany's runes dark, showing, lit or wrong; a Weighing's plates in play and a
  Holdfast's ring stood on; an Ascent's players on its stone and the living in its room) and its relic's strength;
  whether the Boss woke and its number; the ward up and those broken; each anchor's progress; the ticks until a
  Reckoning lands and its anchor; Fury's step; the ticks until Fury begins in its last count; and the ticks until the
  slam lands. Where the pieces stand comes once with the layout (`room_dungeon`'s `encounters`, with the slam's
  reach). The 18 Elite Dungeons' layouts, their encounters with them, are written natively for the page's test, which
  lays them through WebAssembly and compares them field by field.

## In the Game

The page reads a dungeon from the room module's own `room_dungeon` by one ask (`askLayout`, a `DungeonAsk`: a
patrol's by its number, `askDungeon`; an Elite Dungeon by its place, named as it is; or a seed and a style) and
plays it as [[Game]] says ("A dungeon"). A module older than the landmarks answers no landmarks or glows, and is read
as standing none (`readDungeon`).

- **The ways in** (`dungeonTrips`): a patrol's dungeon from its entrance, its shared room at Normal and a run above it,
  the company's where a member is in one; an Elite Dungeon from its node's entrance, as the week's run where it is the
  week's at the node's tier (the week by the rooms' clock, `roomNow`), else its run at Normal; and a sea island's from
  its door in the sea's room, by its name, laid by its seed and style and named "The <Style> of the Sea", left back to
  the sea.

- **Its look** (`dungeonMesh`) is a port of DFO's Forge mesh for one floor, in the dungeon's own frame: floors,
  ceilings, walls with trim at foot and head, walls up from a lower ceiling, doorways' frames whose jambs are the
  layout's `boxes`, trimmed pillars, torches' brackets, the exit door and the return portal. Each cell
  wears its look (`cellLooks`): the style of its floor of the dungeon, with that style's two sets of pictures by role.
- **Its storeys** (`dungeonStoreyPlanes.ts`): each storey is cut out as a one-storey dungeon of its own, z from its
  floor: its plane of cells, and the torches, fixtures, glows, props, pillars, doorways and their jambs, solids,
  landmarks (by their first solid's bottom) and seals standing on it, each by the storey whose floor lies at or
  under its height (`storeyUnder`). The mesh, the kits, the props, the fixtures and the encounters' pieces draw each
  storey as they draw a one-storey dungeon, into the one mesh raised to its floor, so every storey stands at its own
  floor and the map inks them all from the same buffers. A wall stands where a cell meets rock on its own storey only,
  so nothing is drawn where two storeys' rock meets; a flight's cell is rock from every cell but its landing.
- **Its flights** (`dungeonFlights.ts`): 40 treads in the floor's picture, each 0.32 m deep, its top on the slope the
  rules walk at its middle (so a body's feet stand at most 0.1 m off a step), and their risers in the trim, half a
  riser at the head and the foot; the flight's side walls over each tread, a trim band 0.4 m high at their foot
  following the steps; its ceiling 3.2 m over the slope, sloped with it, a cell at a time; and at its head and its
  foot an arch on the landing's side, as a doorway is framed: posts 0.3 m wide at the walls and a lintel from 2.9 m to
  3.2 m, 0.18 m proud. Each style's `stair.head` stands for the arch and its `stair.side` (a course along each side
  wall of each of the flight's cells, sheared to the slope) for the trim band, where its pack has them
  (`dungeonStoreyKits.ts`).
- **Open air and galleries** (`dungeonJoins.ts`): a hall under open air keeps its floor but no ceiling; the open
  air's own ceiling stands over it at its storey. The hall's walls go on up past the storey over it to that ceiling
  where rock stands beside it on both storeys, up to the gallery's floor where a gallery stands over the rock, and
  from the next room's ceiling up to the gallery's floor (the floor's edge) or to the open air's ceiling where a room
  stands beside it below and rock above. A gallery's edge over the open air takes a balustrade on the gallery's floor,
  1 m high and 0.25 m deep (`BALUSTRADE`): a plinth, seven balusters and a rail in its trim, or its style's
  `balustrade` where the pack has it. Where the gallery's ceiling is lower than the open air's, a wall closes the step.
- **Kits on a storey.** A storey's kits are laid as a one-storey dungeon's, its props' plans its own; none stands in
  a flight, in open air, or on the walls or under the ceiling of a hall under open air, whose ceiling is far over it
  (its floor pieces stay); a storey without the exit door or the portal lays neither arch. Its kits read a flight's
  cells as rock but the one each landing opens onto (`kitPlane`), so a wall facing a flight from past its foot or
  before its head is dressed as a wall.
  Where a pillar's, a torch's or the portal's kit pieces are laid (`kitsOf`), the mesh leaves out its own pillar,
  bracket or arch, and draws its own wherever they are not; the jambs, the portal's face and the exit door stay the
  mesh's.
- **Its packs** (`dungeonModules.ts`, [[Dungeon Modules]]): the packs of every style its looks wear are fetched behind the veil before it
  is first drawn (`stylePacks`). A style whose pack is not published, or fails to come within 15 s, is drawn as
  above, with one warning; a pack that failed is asked for again when the next dungeon is entered.
- **Its kits** (`dungeonKits.ts`) are placed from the layout alone, as `content/dungeon/kits.json` says: a door in
  every doorway, one taller than its frame (the lower of its two ceilings) squeezed above 2.4 m so its top meets the
  frame, what stands under 2.4 m as built and none stretched up; a pillar's base, its shaft stretched to its capital,
  whose top is where the ceiling of the cells round the pillar's corner comes lowest over it, so under a dome or a
  vault it holds the curve up; wall sets every `wallEvery` cells along a straight wall where `wallIn` says, the cap's
  top where the ceiling comes lowest over it, and in the mines a timber set on both walls of a way with a beam
  across; up to `features` a room on its quiet cells' walls; and a sconce at every torch, round its flame,
  and arches round the portal and the exit door. Only the caverns stand sets on a cave's rock (`cave rooms`). A set
  or a feature on a cave's rock stands with its back on the wall's line, and the kits pass each piece's span along
  the wall and its top to the mesh (`flats`), which draws the rock flat behind it (`caveWall`). A set's cap rises to
  where the rock comes highest over it, so it meets the rock all over.
- **Overhead and underfoot**, by the style's `ceiling` and `floor`: a boss at a dome's top and every second cell of a
  vault's ridge; a beam across the way on every flat cell; stalactites from one cave cell in six, where its rock comes
  lowest, their roots in the rock; slabs on one quiet cell in four, a runner (`floor.a`, unbroken) or rails along the
  straight corridors, the runner's medallion (`floor.b`) a room, a drain a room or a circle in a room of 3 × 3 cells
  or more, each on the clear cell nearest the room's middle (which mostly holds a prop or a pillar), or scree on one
  cell in five. No ceiling piece hangs below 2.4 m.
- **Where kits never go.** A cell with a doorway, a torch, the exit or the portal holds only their own pieces, its
  floor's and a boss. No wall piece stands within 0.05 m of a prop as its forged model is drawn (`propPlans`), a
  picture hung on the wall among them. No floor piece lies under a solid,
  on the arrival's cell, in the end room, where the cache stands, or in an alcove. Nothing stands on a landmark.
  Variants are drawn by `kitHash`: FNV-1a over the dungeon's name, the cell and a salt, then murmur3's fmix32, so
  a cell's variant, turn and draw are each its own.
- **Its landmarks** (`dungeonDressing.ts`): each is laid from its style's pack, turned within its footprint, and lays
  its own floor, so the mesh lays none on its cells. Without a pack its floor stays and its solids stand as plain stone
  boxes. Its glows burn as lights beside the torches and the fixtures (`burningOf`).
- **Its ceilings** (`dungeonCeilings.ts`): a room's ceiling is flat, a barrel vault across its narrower side, a dome
  over its middle, or rough rock over a cave. A vault rises up to 1.6 m and a dome up to 2.2 m, each at most 0.6 of
  its half span; under a storey (a room on any storey but the top) at most to 0.4 m under that storey's floor, so a
  room 5.6 m high rises 2.0 m at most. A cave's ceiling stands 0.25 m to 1.1 m over its walls, and its rock walls bulge up to 0.22 m
  (`dungeonCaveWall.ts`). Behind what stands against a rock wall the rock is drawn flat, from the floor up to its
  top and along its span and 0.15 m past either end, easing back to its bulge over a further 0.3 m: each kit piece,
  and the portal's and the exit door's arches (±1.3 m of the wall's middle, 3.1 m high, the most an arch spans and
  rises). The wall is cut at those edges, each piece within one of its lattice's triangles, so everywhere else the
  rock bulges exactly as its lattice lays it.
  Where two cells' ceilings differ along an edge, the higher one's side is closed up to it.
- **Its light** (`dungeonLight.ts`): each torch, fixture and landmark's glow burns in its own colour and reach
  (`LIGHT_KINDS`): a torch to `torchReach`, a brazier, candles, crystals, a lantern, a hearth and fungus, and a
  glow's spirit, daylight, water and rune. A fire's kind flickers and the rest breathe, by the game's one flicker and
  one breath ([[Sky]], "Lights at night"), each seeded by its light's number (`burns`). The torch or lantern in the
  player's left hand is a light among them, at their hand, a torch's or a lantern's kind
  ([[Every Light Is Redesigned and Animated, and Each Casts Light]]). Each look has its own faint light,
  its mood (`MOODS`), enough that a room past every light's reach still shows its walls. The shader takes the 32
  lights that reach farthest past the eye (`NearestLights`), and the figures are lit by the same 32, so the walls and
  the figures sum the same light (`lightAt`). Each channel of the sum
  stays as it is up to 0.8 and past that eases toward 1.4 (`shoulder`), so a room lit by many lights at once keeps
  its walls' colour and pictures rather than clipping to flat.
- **Light by storey** (`dungeonSpaces.ts`): a light lights its own storey, and the storey beside it only inside
  what joins the two, never through a slab. A join is a flight (its cells on both storeys and its two landings) or a
  run of open air side by side (its cells and the hall's cells under them), each with a bit of its own (23 bits, reused
  past the 23rd). A space is a mask: its storey's bit and its joins' bits. A surface's space is its storey's (the one
  its height lies on, as `storeyUnder` gives it) and the joins its cell lies in (`space_at` in the shader, from each
  cell's word: its look, `CELL_ROCK`, and its joins' bits from `JOINS_SHIFT`); a figure's the same (`lightAt`). A
  light (`Light.space`, a u32 lane of its own, its bits as they are) reaches its storey and each join of its storey with a cell
  within its reach. The shader skips a light whose mask shares no bit with the surface's, still water's gleams too.
  The 32 lights are picked by distance among those that reach a space the eye may see (`seenFrom`): its storey's, and
  within 16 m of a join the join's and the storey beside it. The clusters pick no light by storey, so the
  storeys cost a mask test a listed light.
- **The camera on a flight** keeps under its sloped ceiling: the ceiling over a point of a flight is its slope there
  and 3.2 m (`ceilingAt`).
- **What its light costs.** Each frame the page cuts the view into clusters (`LightClusters`): 16 tiles across the
  screen by 9 up it by 24 slices of depth, each slice the same factor deeper than the last from 0.25 m to 256 m
  (nearer is the first slice, farther the last). Each cluster lists the lights whose reach, taken 1 cm wider, touches
  it, and a lit surface sums only its own cluster's list (`reaching`). A light adds nothing past its reach, so the
  light is the same as summing all 32. Over six dungeons of the six styles, a surface in view sums 2.9 lights on
  average and at most 9, where 1.3 reach it. A frame whose lists would hold more than 65,536 entries lights every
  surface by all 32. Still water mirrors every one of the 32 flames, whatever its reach.
- **Drawn depth first** (`dungeonPipelines`): the floor and the cache are drawn twice in the scene's pass, first
  their depth alone, then lit where a face's depth equals the depth laid or is nearer, writing none. Both draws share
  one vertex stage with its position invariant, so each lays a face's depth alike; each covered sample is lit once
  however many faces lie behind it.
- **Its fixtures** (`dungeonFixtures.ts`): a brazier on three legs with embers, a cluster of three to five candles,
  five to eight glowing crystals, a lantern on its chain, a hearth's embers, and six to ten fungi, each a pale stalk
  under a glowing cap. Each is shaped by where it stands, so no two are alike.
- **Its flames** are fires, the prologue's ([[Cinema]], "Flames"), not the mesh's: one out of each torch's cup, over a
  brazier's embers, on each candle's wick, and along a hearth (`torchFlame`, `fixtureFlames`), each seeded by its
  light's number, so a flame and the light it casts flicker together ([[Lights as Claude Builds Them]]). A caged
  lantern (the hanging fixture, the passages' lamp and dead lamps) burns no fire: its glass glows and flickers with
  its light ([[An Enclosed Light Hides Its Flame]]). The dungeon's scene draws the flames over the finished picture (`DUNGEON_FLAMES`), hidden by
  whatever stands nearer; past where its tongues read, a flame is its glow alone.
- **Glows and water** (`dungeonShaders.ts`): an ember, a lantern's glass, a kit piece's or a landmark's flame, a
  crystal, a fungus cap and the open portal move with the light nearest them its cluster lists, an ember and glass
  flickering with their light, the rest breathing (`nearest_seed`). A crystal's and a lantern's glass glow by each
  triangle's own facing,
  from 0.55 of their glow edge on to all of it square to the eye, lifted a little toward it by the lights round them,
  so a crystal's faces differ. Their glows peak at 1, so no facet clips. Still water lies over its bed, its cell's
  floor picture (`WATER_FLAG`): through it the bed, darker and bluer, lit as a floor is; in it the room, brighter
  toward its lights, and each light's flame but the water's own glow, which lies on it, all by Fresnel (2% square
  on, all of it edge on). A flame mirrored is as bright however far it burns and as small as it looks from there
  (`flame_image`), so a dark lake still shows the far torches, unless rock stands between: the line to each is
  walked cell by cell (`rock_between`). A slow ripple moves it all.
- **The dread** (`dungeonDread.ts`), drawn by the page alone where no body meets it: blood pooled on floors and smeared
  down corridors, more the deeper the storey; in the dread rooms bones scattered, marks on the walls (a handprint or
  four scratches), and from a high ceiling chains and shrouded dead, never lower than 2.3 m; and eyes low against a
  wall that catch the light far off and are gone within 3.5 m, blinking now and then. A room's torches stand cold one
  time in 25 at the top, one in three five storeys down, and seven times in ten in a dread room; never the way in's,
  the end's or a seal's room, which must be lit to be read. A cold torch lights nothing and burns no flame, keeping its
  number so every other light keeps its own (`coldRooms`).
- **Its rooms' names**: the room the player stands in names the place on the screen, before the patrol's own
  (`roomNameAt`, `placeWords`), and its chests counted end the line ("Chests 2 of 5", `chestsCounted`).
- **The cache** (`chestMesh`): the owner's chest from DFO ([[Pick - Chest]]) in wood and iron at the room's
  `Snapshot.cache`, fitted to 0.9 by 0.5 m, its lid shut or open.
- **The chests to find** (`chestsMesh`, `finds.ts`): the cache's chest at each the room stands for the player, centred
  where it stands, built in one mesh, lit by the torches, a vault's with its hinge and latch in the heroic chest's
  gold (`COLOUR.gold`, lit as a surface) where a plain one's are iron; one the player opens swings its lid over 0.6 s
  to the model's 77 degrees, short of upright, coming no nearer the wall behind it than 0.36 m, clear of the kits there,
  none more than 0.3 m proud (`foundChest`), and stands open 4 seconds before it goes.
- **The props** (`layout.props`): each forged prop laid by `layModel` as the city lays one, lit by the torches; the
  `boxes` past the jambs and pillars are their solids, which the camera keeps short of and nothing draws.
- **Its pictures**, every one painted by the procedural textures: each look's sets (records 0 to 4, each turned by
  the island's climate), the textures' ironwork (93, record 0), the
  entrance's door picture (56 or 331, record 2), the climate's timber, the dressing set the pieces wear (1021, turned
  by the climate) and the props' own.
- **The entrances** (`entrances.ts`, `EntranceView`): the model each entrance names of the six above, lifted as the
  table says, turned by the room's yaw; E reaches a door within 2.5 m of its quad's middle. Round each door stands its
  dungeon's facade (`entranceFacades.ts`), once the page has forged the dungeon for its name (`Entrances.lookOf`), in
  the dungeon's own stone and the climate's timber and iron: the crypt's mausoleum under a gable among graves, the
  halls' gatehouse between crenellated towers with its portcullis drawn up, the cells' squat gaol beside a gibbet and
  its cage, the sanctum's portico of columns on a stepped plinth, one fallen, the caverns' mouth heaped with leaning
  slabs, and the mines' timbered adit with its rails and headframe; the passages' chalk and barrow wear the cave
  mouth and the mausoleum. Drawn only: as the mound, a body passes through it, and its doorway stays clear.
- **The ground inside**: the fight's door predicts on the dungeon's own ground (`fighter_dungeon`), as the room
  judges bodies; the jambs are drawn from the same `boxes`.
- **The encounters** (`encounterMesh.ts`, `encounterLaw.ts`, `encounterCues.ts`), from the layout's plan and each
  snapshot's word: each Ascent's pads in its room's stone, its wall picture under a band of trim and its floor on top,
  the last with the seal stone glowing; the drowned floor as foul water over its cells while the seal holds, a sickly
  green over its bed whose glow breathes slowly (`FOUL_FLAG`), apart from the dungeon's plain still water, gone as it
  breaks, seething with bubbles of a brighter bile that swell and burst so it reads as the floor that harms; a stepped
  slab of the end room's trim under each anchor, 8 cm high, and a crystal over each relic. Each seal's room is laid as
  a rite (`rite`): a ring of gilt inlaid in the floor just outside each rune's, plate's and relic's mark, lit as a
  vault chest's gold is so it reads on dark stone, a Litany's and a Weighing's joined by gilt spokes to a hub amid them, iron rungs up the Ascent's pads, and the Holdfast's relic
  hung on two chains from the ceiling; all of it drawn only, flush with the floor, on a pad's side or over every head. On the floor, rings: runes
  dim, lit gold under a beam while showing, green once stepped and red under a beam for a second when stepped wrong,
  each with a glyph of its own (one, two or three strokes round a dot, then round a small ring, so no two of six read
  alike however turned); plates in play under a beam, dim at rest and gold and filled while held; the seal stone's ring,
  lighting as its players stand on it; the relic's ring coloured by its strength, held or not, and its strength as an
  arc inside it; while an Ascent holds, each pad's top edge banded in the seal's blue with a glow fading down its faces
  (0.6 m, or to its own floor where that is nearer),
  brightening pad by pad from the first to the last in a slow wave, the last pad's in the stone's gold; each anchor
  ringed dim under a short beam while the Boss stands (before it wakes too, so the company learns where they are) and,
  while a ward stands, brighter under a beam and filling as it is stood on, a ring round the Boss and a dome of light
  over it; the slam's ring 4 m round the Boss, filling as it comes; a red ring round the Boss through Fury; a
  Reckoning's ring of light under a
  tall beam (12 m, or up to its anchor's ceiling where that is lower) while it is shown, and a flash from the light as it lands. Each beam fades as the camera's eye comes near
  it along the ground, gone within 1.5 m and whole from 4 m, so one beside the camera never stands across the view;
  the rings on the floor stay (`encounterMarks`' `eye`). Under the compass the public event's banner
  shows the seals broken of how many and, away from every seal, the nearest unbroken one by its room's middle in the
  banner's one line to the next; in a seal's room, that seal with its task in a line
  ("Step on the runes in the order they light", "Hold all three plates together" or "Hold both plates together",
  "Climb to the seal stone together", "Hold the relic's ring") and its progress (an Ascent's "2 of 4" on the stone, a
  Holdfast's "Relic 40%", red under 30%; an Ascent's "Foul water harms" in red); once the Boss wakes, the Court
  ("Defeat the Boss", "Break the anchors" while warded, "Get
  clear of the Boss" while its slam is shown, "Stand in the light" with the Reckoning's seconds left in the banner's
  large clock, red and pulsing), "Fury in 1:00" in its last minute and "Fury ×1.4" once it begins, wherever the player
  stands; with every seal broken and the Boss not yet up, only the count; none once the Boss has fallen. Over the
  middle of the view, large and brief, the Court calls "Get clear!" as its slam is shown and "Into the light!" as the
  Reckoning's warning starts, the light first where both are ([[Interface]], "A raid's call"). While an Ascent's foul
  water harms the player (from its harm told to them, held while their feet stay on its floor, at most 5 cm up), the
  view's edge turns sick green, fading as they leave it. The compass marks each unbroken seal's room, then the end room once the Boss
  wakes, until it falls. It slides in afresh as the Boss wakes, a seal breaks or a ward rises or breaks; the music
  stings as a seal breaks or a ward is won and as the Boss wakes, its mood holds tense while a seal runs and at its peak
  in the Court, and the Boss's score plays its part by the wards broken (its last stand still by its health). A ward
  rising rings its own sound at the Boss; a Reckoning's last three seconds tick and it lands with thunder at its light;
  the slam thuds at the Boss; the foul floor's harm sounds on the player it harms. A wrong rune, a drained relic and a
  relic falling below three tenths (once each time, as the banner reddens) play the refused sound. The page's fighter predicts on the pads
  (`fighter_dungeon`).
- **The return portal** (`layout.portal`): an arch of the end room's trim round a face, dark while the cache is shut
  and glowing, lighting the room, while it is open; E "Leave" within 2.5 m while it is open. The room keeps, with the
  body a player leaves with, whether they left by a way out: within 3.5 m of the exit door or the open portal, and
  alive (`gear::left`'s `out`); the patrol's room stands them before the dungeon's door only then, else at a spawn
  ([[The Patrol Audit's Leftovers Are Fixed as the Owner Chose]]).

## Limits

- Light crosses storeys inside a join alone: a hall's torch lights the open air's column up to its ceiling, and the
  gallery's balustrade on its face over the air, but not the gallery's floor beyond, and a gallery's torch lights the
  hall's floor under the open air but not beyond it. Within a storey, as on one, a light reaches through walls up to
  its reach.
- A landmark's storey is its first solid's (the wire gives a landmark no height of its own).
- What a dungeon costs (natively, in release, `load_of_opening_the_deepest_dungeons`): over the 18 Elite Dungeons,
  the slowest forge 6 ms (three storeys, 4,608 cells) and the slowest opening, ground, navmesh bake, garrison and
  encounters, 172 ms (three storeys, 6,912 cells). Measured before dungeons went five storeys deep: unmeasured since.
- The navmesh reads its ground between the cells' centres, but never blended across an edge higher than a body's
  step (`edged_height_at`), so a path over a room standing on a room below keeps to its own floor.
- The dread is drawn by cell, not round the props: a mark or eyes may stand on a wall behind a prop, and a pool under
  one.
- A flight that finds no spot clear of a block's other flights, landings and doorways is left out, and its storeys
  would not be joined; over 2000 dungeons none is (a test holds every dungeon one walk).
- A dungeon's storeys over the deepest of a block are rock in that block: the grid holds as many storeys as the
  deepest block everywhere.
- Nothing may stand under a flight: the navmesh bakes a flight's column as its lowest floor, so a column under a
  flight is rock.
- A span holds a body whose crouched head (1 m) fits under its ceiling: a standing body's head may reach 0.8 m
  into a slab, since the ground knows the feet alone.
- Lines across storeys take no corner of rock between two cells, as one storey's do, only the cells they cross.
- A line across a flight's cell is held by that cell's lowest tread and its ceiling over the highest, so a sight line
  may pass up to 2 m under the slope within it; a shot stops at the slope itself.
- The page's camera keeps between the player's own storey's ground and ceiling, asked from the height its line passes
  (never under the feet). The crosshair, shots and blood ask the ground under the height they pass, under the feet
  too, so an aim up a flight meets its slope and a shot from a gallery falls on the hall's floor, the slabs between
  storeys stopping a line under a floor. A dungeon has no sea: its
  ground under 0 m is stone and floor, never water, for footsteps, splashes and shots. Its course stands a slab between
  two storeys' spans, and over a column whose top span is below the top storey, rock up to the floor of the next
  storey over its ceiling, where the rules stop a line too.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
- The clusters take the eye's matrix to be a centred perspective, as `fromEyeMatrix` makes it; a lens shifted off
  centre would leave their bounds short on one side.
- A room can lay no props where nothing of its purpose fits: over 2,000 dungeons, 10 end rooms and 28 of 19,866 other
  rooms lay none; over the 11 patrols' 33 dungeons, 2 end rooms and no other room.
- No fountain or cart is laid: each is wider than a cell.
- A caverns wall set spans most of its wall and its whole height, so wherever one stands, at most every third cell
  along a cave room's straight walls, that wall is drawn as flat rock.
- Movement has no ceilings: a dungeon's are never reached because only an Ascent's pads are climbed, each leapt from
  kept a body's height and 0.6 m under the ceiling (a jump rises about half a metre), the last 0.3 m.
- An Ascent's pads can still be climbed from the foul floor, as any block too high to mantle can: it costs a second or
  two in the water, 12% of their health a second.
- The page's movement rules find only the floor in a dungeon, so a mark or a drop over a pad lies on the floor under
  it; the seal stone's ring is laid at its pad's top by the plan.
- A Boss that walks home to its post and heals keeps the ward that stood and the wards it broke.
- A body stops short of a wall by up to one tick's run (13 cm) past its half-width, since a move that would end
  nearer is refused whole before each axis is tried alone.
- The third-person camera keeps short of the rock and under the ceiling, so in a narrow room, a corridor or a low room
  it sits close behind the player.
- A player who joins a company member in a dungeon came by no entrance, so leaving by its door or portal stands them
  at the patrol's spawns in turn, as any join does (its first, in a room just opened).
