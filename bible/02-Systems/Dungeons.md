---
type: system
status: live
code:
  - crates/dungeon/src/lib.rs#of_patrol
  - crates/room/src/playlist_run.rs#playlist_run
  - crates/dungeon/src/lib.rs#style_of
  - crates/dungeon/src/lib.rs#name
  - crates/dungeon/src/styles.rs#STYLES
  - crates/dungeon/src/dungeon.rs#Dungeon
  - crates/dungeon/src/block.rs#BlockLayout
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
---
# Dungeons

The patrol areas' dungeons: three in each patrol, each laid by DFO's Forge from a seed
([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]], [[Pick - Dungeons 2.0]]). The choices are Claude's
([[Dungeons as Claude Builds Them]]).

## How it works

- **One crate for every machine.** The `dungeon` crate lays a dungeon from its seed and style, and uses no other
  crate. Its maths is + - * /, comparisons and rounding down to a whole number, each exact in IEEE-754, and every
  draw is made on a lane of its own: Mulberry32 over a seed
  that is the FNV-1a hash of the lane's name, as DFO's lanes draw ([[Agree to the Bit]]).
- **A patrol's three.** `of_patrol` gives each its seed, from the patrol's id and its number, and its style; the
  three take three different styles of the six, shuffled by the patrol's id. `name` names one for its first style
  and its patrol: The Crypt of the Saltgrass Downs, The Caverns of the Sunken Fen.
- **Laid where no patrol is.** A place that is no patrol, as a sea island, lays its dungeon by its own seed and a
  style by its key (`style_of`): `Room::dungeon_run` stands its room as a run of its own (`RunOf::Sea`), the room
  module answers its layout to an ask by seed and style, and the page reads it with `askLayout`. A patrol's dungeon is
  the same laid by `of_patrol`'s.
- **The styles**, each with its two dungeon picture sets ([[Procedural Textures]]). The first four are the Forge's
  crypt, hall, cells and temple; the Caverns and the Mines are its cave and mine. Each style also names the style
  below it, which its last block may break into, and its entrances, the forged mounds or cave mouths with a door:

| Style (key) | Rooms a block | Its rooms' forms (sides in cells) | Ceilings (m) | Roof | Pictures | Below | Entrances |
|---|---|---|---|---|---|---|---|
| Crypt (`crypt`) | 3 to 5 | rectangles 2 to 4; octagons 4 to 5; alcoves 3 to 5 by 3 to 4 | 3.2 to 4.4 | arched | 123, 124 | Caverns | 43601, 43602 |
| Halls (`halls`) | 2 to 4 | rectangles 3 to 7; Ls 4 to 7; crosses 6 to 7 by 4 to 7 | 4.0 to 5.6 | arched | 122, 124 | Crypt | 43601, 43602 |
| Cells (`cells`) | 4 to 6 | rectangles 2 to 3; alcoves 3 to 5 by 3 | 3.2 to 3.6 | flat | 122, 123 | Mines | 43601, 43602 |
| Sanctum (`sanctum`) | 2 to 4 | rectangles 3 to 6; Ls, octagons 4 to 6; crosses 6 by 4 to 6 | 4.4 to 5.6 | arched | 124, 122 | Crypt | 43601, 43602 |
| Caverns (`caverns`) | 2 to 4 | caves 3 to 6, and a few rectangles 3 to 6 | 4.4 to 5.6 | rough | 120, 119 | Crypt | 43603, 43604 |
| Mines (`mines`) | 2 to 4 | galleries 5 to 8 by 2; stopes (caves) 3 to 5; a few rectangles 2 to 5 | 3.2 to 4.4 | flat | 119, 120 | Caverns | 43603, 43604 |

- **A run, not a maze** ([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]]). A dungeon has a beginning, the
  way in's block and its first room; a middle, the blocks between; and an end, the last room of the last block, where
  the Reeve and the return portal stand. Its way runs from one to the next, room after room.
- **Its size.** A dungeon is two to five blocks of 51.2 m, each count as likely, drawn on its own lane
  (`size:<seed>`). An Elite Dungeon is four or five (`ELITE_BLOCKS`), each as likely, drawn on the same lane
  (`Dungeon::forge_within`), so a seed's other draws are as a patrol's dungeon's would be. The blocks stand in a chain: the way in's first, each next one beside the one before, drawn from
  the free squares round it. A block and the next share one doorway, a cell along their edge from the third to the
  fourteenth; two blocks side by side that are not next in the chain share none.
- **The way down.** On a lane of its own (`deeper:<seed>`), one dungeon in two lays its last block in the style below
  its first: the halls and the sanctum break into a crypt, the cells into mines, the crypt and the mines into
  caverns, the caverns into a crypt. The dungeon keeps its first style's name. Each part wears a look, its block's
  style: the first block's is the first look, and a deeper last block's the second. Its rooms, their purposes,
  props and lights, and its pictures are its block's style's.
- **A block** is 16 by 16 cells of 3.2 m, rock to begin with. The square inside its rim is split, the largest part
  first, into parts no smaller than five cells, and a room is carved in each, a cell of rock kept round it. A style
  asks for as many rooms as the Forge's does (a crypt 3 to 5, the cells 4 to 6), but no part is cut below five cells,
  so the square is cut at most once each way and a block holds four rooms at most. Each room draws a form of its
  style, by the forms' weights, among those whose least sides fit its part; then its sides within the form's and the
  part's, which way it lies, and its ceiling (a whole number of 0.4 m).
- **A room's shape** (`outline`) lies inside its rectangle, and is always one walk. A rectangle takes all of it; an L
  leaves a corner quarter rock; a cross leaves each corner block rock, a third of each side; an octagon leaves each
  corner cell rock. Alcoves line one or both long walls of a hall with single cells cut one deep into the rock, every
  second cell from the second, never at a wall's end: a crypt's burial niches and the cells' cells. A cave is bitten
  from its rectangle as the Forge bites one: each cell kept where it lies inside the rectangle's ellipse, its edge
  pushed in or out by a draw, and only the cells one walk from its middle kept. A great cave, 5 cells or more each
  way, stands one stone (two from 24 cells) where all eight cells round it are the cave's.
- **The ways.** A block's rooms are joined one after another: from its way in (the doorway from the block before, or
  in the way in's block its first room), each room in turn, ordered by how far it lies from the way in less how far
  from the way on, to the doorway onto the next block. Each way is the cheapest: rock costs 3, a room 2, a corridor 1,
  so ways reuse ways. A way never crosses the rim but at a doorway, and never cuts a stone. Where two ways cross they
  make a loop; about one in a dungeon. A block that is not one walk, or a way in's with no room against rock for its
  exit door, tries again on the next of sixteen seeds, and past them takes its simplest form, one room of 3 by 3.
- **The way in** is in the first room of the way in's block that has a cell with rock beside it, at the cell nearest
  its middle, its quiet cells first: the exit door stands on that rock (never a stone), 1.4 m wide and 2.4 m high, and
  a body arrives 0.4 m past that cell's middle, about 2 m in from the door, facing into the room.
- **The return portal** stands on the end room's wall like the exit door, as wide and as high, on rock that is no
  stone, never on the exit door's wall. Of the room's cells, its quiet cells first, it takes the one farthest from
  the way in by walk that has the best wall for its torches: one that runs on past the cell both ways (four portals
  in five), else one that runs on or ends in the room's corner each way, else any. It takes a player back out to the
  dungeon's entrance once the Reeve has fallen ("In the Game").
- **Ceilings** (`ceiling`): a room's form, only a look; it stands at its own height whatever its form. Under an
  arched roof a square room or an octagon takes a dome, and a hall of alcoves or a rectangle whose longer side is at
  least half again its shorter a vault along it; a cave and every cavern takes rough rock; any other room is flat.
- **Torches**, 2.1 m up a wall and 0.35 m off it, each lighting 8 m. Two flank the portal first, so the end of the
  way is lit and marked before it opens: on its wall 1.55 m either side of its middle, past its arch (1.3 m) and a
  sconce's reach (0.2 m), or, where its cell is the room's corner that way, in the middle of that side wall. Then on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; and
  on every fourth corridor cell of a block, row by row. Each of these stands in the middle of its cell's wall, none
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
  takes a word before it, "the Old Ossuary", then "the Lower Ossuary", so every name in a dungeon is its own.
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
- **Lights.** Beside its torches a purpose lights its room: braziers (a solid 0.6 m square and 1 m high) either side
  of the end's door or the way on, or nearest the middle; candles on its tables', lecterns', altars' and coffins'
  tops; crystals against the caverns' walls (a solid 0.6 m by 0.4 m, 0.9 m high), and glowing fungus in a Fungus
  Grove or a Dripping Gallery (the same, 0.5 m high); lanterns 2 m up on the mines' walls and posts; and a fire in
  each hearth. A fixture with a solid stands as a piece does. Every room has a light.
- **Landmarks** (`place_landmarks`): set pieces a dungeon is remembered by, three a style, each with its solids and
  glows (`content/dungeon/landmarks.json`, which the crate's `build.rs` reads as it builds). A dungeon of
  two or three blocks stands one, of four or five two, none twice, each in a room of its look's style but never the
  way in's or the end. Rooms are tried from the middle of the walk outward, each style's landmarks in an order drawn
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
- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell; every room of the way in's block
  lies nearer than the end.
- **What a body stands on** (`heights`, `boxes`): one floor at 0 m, each open cell's height and none for rock, in
  cells of 3.2 m, and as boxes (min x, min y, max x, max y, top) the jambs, then the pillars, then the props' solids,
  then the fixtures', then the landmarks'.
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a dungeon as JSON, from its patrol's id and name and
  its number, from an Elite Dungeon's place (laid by `elite_laid` in four or five blocks, and named as the ask names
  it), or from a seed and a style's key, as the page's `DungeonLayout` reads it: its name, first style and pictures; its
  looks (each a style and its pictures) and each cell's look (-1 for rock); its cells (-2 rock, -1 corridor, or a room's
  number), ceilings, rooms (each its rectangle, height, walk, role, name, ceiling form and look), end, way in, arrival,
  exit door, portal, torches, fixtures (each where its light burns and its kind: 0 brazier, 1 candles, 2 crystals, 3
  lantern, 4 hearth), frames, pillars, props (each its model, its origin and its yaw), boxes, landmarks (each its
  module, its turned footprint's north-west corner and its quarter turns clockwise) and glows (each x, y, z and its
  kind: the fixtures' kinds, then 6 spirit, 7 daylight, 8 water, 9 rune); null for a number past the patrol's three or a
  place that is no Elite Dungeon. An Elite Dungeon's answers its encounters too (above, "Encounters"): each seal's
  kind, room, pieces, pads (min x, min y, max x, max y, top), drowned cells and doorways' middles; the anchors; and
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
- **Its world is the dungeon's frame**: x east and y south from the north-west corner, the floor at 0 m. Every point
  its snapshots, its cache and its spawn name is in it. Its section is the dungeon's rectangle, its one spawn the
  arrival, where a body joins, facing into the room.
- **Checkpoints** ([[Revives]]): each room whose band stands lays one, and an Elite Dungeon one at each seal's room and
  one at the Court, each at the doorway cell the walk from the way in enters its room by, facing in. One is won as its
  band falls, its seal breaks or the Court's Boss wakes (with no seal, once a living player has stood in the Court with
  it); a player who respawns stands at the one won farthest along,
  before any at the arrival, and every player is told "Checkpoint reached" as it moves on. In a run a band whose fall
  won its room's checkpoint does not stand again while anyone is in the room; in a shared dungeon it stands again as
  any group does, and the checkpoint falls back to the one won before it.
- **What a body stands on** (`DungeonGround`): the dungeon's own ground, not [[Movement]]'s blocks. Its height is the
  cells' (0 m open, a wall 10 m over the floor for rock), and over a jamb, a pillar or a prop that solid's own top. A move is walled where it crosses rock,
  or where it ends nearer than a body's half-width (0.35 m) to rock, a jamb, a pillar or a prop and nearer than it
  began: a body slides along a wall, steps away from one, and never stands in its face. Inside a solid, as a shove
  might leave it, its nearness is less than nothing by its depth, so it walks out and never deeper. Movement climbs
  blocks, never a ground's walls, so no solid is climbed; an Elite Dungeon's Ascents' pads are its room's blocks, and
  are climbed, their tops kept under the ceiling. Each cell keeps the solids
  within a half-width of it, so a move looks at a few. The browser predicts on the same ground (`fighter_dungeon`).
- **What a line meets** (`line_walled`): rock at any height, and a jamb, a pillar or a prop where the line passes
  below its top, as a block meets a line; a line looks only at the solids by the cells it crosses. A foe's eyes, a
  soft lock, a blow, a telegraphed shape, a charge's lane and a shooter's cover are stopped by them and see over a
  low coffin or table. A noise through them carries half as loud and half as far. A kill's drop thrown across a wall
  or a tall solid rests where its foe fell; one thrown onto a low solid rests on its top, unless it would lie so deep
  in it (a lake, a dais, a pool) that no body standing off it reaches it, when it too rests where its foe fell. A
  shot stops where it first
  enters rock, the grid's edge or a solid below its top (`wall_entry`), however far it flies in a tick, passes over a
  solid lower than itself, and falls onto the floor alone (`floor_at`).
- **Its navmesh** is baked over the whole dungeon in cells of 0.4 m, on the cells' heights alone with every solid as
  its colliders, each a body's height at least, since the ground walls a solid however low, and an Ascent's pads with
  them, and kept to the floor joined to the arrival ([[Navmesh]]), so the rock's flat tops are left out. It lays no
  links: no foe paths up a solid's or a pad's side or off its top.
- **Its garrison** ([[Enemies]]): the end foe (the Reeve, a Miniboss, or an Elite Dungeon's Boss, held back until its
  seals are broken: "Encounters") alone on the end room's cell nearest its middle; a band of
  two to four in each other room past the way in's, one foe for each ten of its cells (`posts_for`), on its free cells
  nearest its middle, its quiet cells first, round its props. When the bands and the Reeve would pass the room's 24 foes, the most rooms that
  fit stand one, spread evenly along the walk from the way in to the end.
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
  prop, a fixture or a landmark, or under a torch (`against_walls`). It stands a chest for each block
  (`dungeon_chests`), each in a room of its own drawn on the room's loot seed, and where rooms run short a room holds a
  second, two cells from every other; a vault's chest in each room its generator names a vault (`stand_vault`), at a
  place against its wall, and no plain chest there. A dungeon's chest pays more than a patrol's, a vault's the most
  ([[Gear]], "A find"). Each player's gear counts the chests they have opened of all it stands, and the screen names
  them under the place's name ("Chests 2 of 5"); and one of its props of the holding families in four searchable, 16 at most, none in a seal's room nor one
  that rock and solids leave no body room to stand beside. All are drawn again as the
  cache shuts, when the end foe stands again, never at an Abyss wipe. Each player opens each once, as a patrol's
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
  its maths + - * / and comparisons. A dungeon of four blocks holds two seals and one of five three, each in its own
  room, never two of a kind. The rooms past the way in's, but the end and every landmark's, are taken in walk order
  and split into as many stretches as there are seals. For each, while no Ascent is laid, an Ascent is tried first in
  every room of its stretch (never the first room of the walk where there are four or more), nearest the stretch's
  middle first; else each kind not yet laid, in an order drawn once, in the room nearest the middle, then outward, and
  the first that fits is laid there. A room too small, too low or too cluttered for a kind is passed over. Every one
  of the 18 lays its full count; nine lay an Ascent, and a test holds it to nine or more.
- **Where pieces stand.** A piece stands on a spot of its room: a cell's middle or one of its four quarters' (0.8 m
  each way toward a corner), never on the way in's or the portal's cell, nor a doorway's (but an anchor), each 0.9 m from
  every solid and 1.4 m from every prop's and fixture's middle, so no brazier or candle stands on a piece. Runes stand 2 m apart at the least, plates 6.4 m (two cells).
- **Counted by the living in the room.** Every seal counts the living players standing in its room's cells: one down
  or away is not counted, for plates, waves or the stone.
- **The Litany** (a puzzle): four to six runes, drawn, on its floor. While it runs they show in turn, each a second,
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
  solid within a body's width and a hand of that line, as the dungeon's solids are walls to a body however high it
  leaps), and every two pads stand 4.4 m apart edge to edge at the least: a run off the edge falls short and only a
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
- **The Holdfast** (a defence): a relic over the spot nearest its room's middle whose ring, 3 m round, lies on the
  room's floor all four ways. It is held each tick a living player stands in the ring, and broken once held 45 s in
  all. A wave comes at its doorways 2 s after it starts, then every 12 s. Each living foe in the ring drains a twentieth
  of the relic a second, and while none stands in it the relic regains a fortieth a second, to whole; a drained relic
  halves what was held and stands whole again (`RelicDrained`).
- **Seals' rules** (`seals.rs`): a seal waits until a living player stands in its room and no living foe of the
  garrison does (a wave's foes do not hold it), then runs until broken (`SealBroken`, told to every player with how
  many are broken). A wave is one of the dungeon's own Major or Elite foes for each living player in its room, two to
  four, drawn from its garrison's table at its foes' levels, standing at the room's doorways and hunting the nearest
  living player; a seal's waves stand no more while eight of them live, nor past the room's most foes.
- **Spoilless.** Every foe an encounter stands (its waves, a wrong rune's, a ward's) drops nothing when killed, as a
  defence tried again stands foes that drop nothing (`quests.spoilless`): kills there pay their experience, and the
  seal's breaking and the cache stay the reward. An unfinished seal's waves keep coming, so they could otherwise be
  farmed.
- **The Court** (`court.rs`). The Boss is held back off its post, its post never counted cleared, until every seal is
  broken; then it stands (`BossWoke`), and its health is made a match for the living players then, half again for each
  beyond the first, as a public event's great foes are (`toughen`). At two thirds of its health, and again at one
  third, a blow that would take it to that share or past is held there and the Boss is warded (`WardRaised`): a wave of the dungeon's
  foes for each living player, two to four, stands at its anchors, and another 15 s on while the ward still stands.
  While warded the Boss runs back to its post and stands there (`hold_ward`), striking where it stands, and every 8 s
  from the ward rising it slams: a ring 4 m round it shown 2 s, then 30% of their health from every living player
  inside it (`BossSlammed`). Its three anchors stand in the end room 2.4 m or more from its post, each the spot
  farthest from the post and those taken before. A living player within 1 m of an anchor fills it; each filled for
  3 s, the ward breaks (`WardBroken`). With three or more living players, an anchor left empties 6 s after its last
  player leaves unless all three are filled; with one or two it keeps what it holds. A fallen Boss never stands again
  in its run, though the other posts do, so its Court is fought once a run (`stands_again`).
- **The Reckoning.** From the first ward broken, while the Boss stands, every 40 s: a ring of light 2.5 m wide at one
  anchor, in turn, shown 10 s, then 70% of their health from every living player it reaches outside it, a blow from
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
  layout's `boxes`, trimmed pillars, torches' brackets and flames, the exit door and the return portal. Each cell
  wears its look (`cellLooks`): the style of its floor of the dungeon, with that style's two sets of pictures by role.
  Where a pillar's, a torch's or the portal's kit pieces are laid (`kitsOf`), the mesh leaves out its own pillar,
  bracket or arch, and draws its own wherever they are not; the jambs, the flames, the portal's face and the exit
  door stay the mesh's.
- **Its packs** (`dungeonModules.ts`, [[Dungeon Modules]]): the packs of every style its looks wear are fetched behind the veil before it
  is first drawn (`stylePacks`). A style whose pack is not published, or fails to come within 15 s, is drawn as
  above, with one warning; a pack that failed is asked for again when the next dungeon is entered.
- **Its kits** (`dungeonKits.ts`) are placed from the layout alone, as `content/dungeon/kits.json` says: a door in
  every doorway, one taller than its frame (the lower of its two ceilings) squeezed above 2.4 m so its top meets the
  frame, what stands under 2.4 m as built and none stretched up; a pillar's base, its shaft stretched to its capital,
  whose top is where the ceiling of the cells round the pillar's corner comes lowest over it, so under a dome or a
  vault it holds the curve up; wall sets every `wallEvery` cells along a straight wall where `wallIn` says, the cap's
  top where the ceiling comes lowest over it, and in the mines a timber set on both walls of a way with a beam
  across; up to `features` a room on its quiet cells' walls; and a sconce at every torch, round the code-built flame,
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
  its half span. A cave's ceiling stands 0.25 m to 1.1 m over its walls, and its rock walls bulge up to 0.22 m
  (`dungeonCaveWall.ts`). Behind what stands against a rock wall the rock is drawn flat, from the floor up to its
  top and along its span and 0.15 m past either end, easing back to its bulge over a further 0.3 m: each kit piece,
  and the portal's and the exit door's arches (±1.3 m of the wall's middle, 3.1 m high, the most an arch spans and
  rises). The wall is cut at those edges, each piece within one of its lattice's triangles, so everywhere else the
  rock bulges exactly as its lattice lays it.
  Where two cells' ceilings differ along an edge, the higher one's side is closed up to it.
- **Its light** (`dungeonLight.ts`): each torch, fixture and landmark's glow burns in its own colour, reach and
  flicker (`LIGHT_KINDS`): a torch to `torchReach`, a brazier, candles, crystals, a lantern, a hearth and fungus, and a
  glow's spirit, daylight, water and rune. Each look has its own faint light,
  its mood (`MOODS`), enough that a room past every light's reach still shows its walls. The shader takes the 32
  lights that reach farthest past the eye (`NearestLights`), and the figures are lit by the same 32, so the walls and
  the figures sum the same light (`lightAt`). Each channel of the sum
  stays as it is up to 0.8 and past that eases toward 1.4 (`shoulder`), so a room lit by many lights at once keeps
  its walls' colour and pictures rather than clipping to flat.
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
- **Its fixtures** (`dungeonFixtures.ts`): a brazier on three legs with embers and flames, a cluster of three to five
  candles, five to eight glowing crystals, a lantern on its chain, a hearth's fire, and six to ten fungi, each a pale
  stalk under a glowing cap. Each is shaped by where it
  stands, so no two are alike.
- **Glows and water** (`dungeonShaders.ts`): a crystal's and a lantern's glass glow by each triangle's own facing,
  from 0.55 of their glow edge on to all of it square to the eye, lifted a little toward it by the lights round them,
  so a crystal's faces differ. Their glows peak at 1, so no facet clips. Still water lies over its bed, its cell's
  floor picture (`WATER_FLAG`): through it the bed, darker and bluer, lit as a floor is; in it the room, brighter
  toward its lights, and each light's flame but the water's own glow, which lies on it, all by Fresnel (2% square
  on, all of it edge on). A flame mirrored is as bright however far it burns and as small as it looks from there
  (`flame_image`), so a dark lake still shows the far torches, unless rock stands between: the line to each is
  walked cell by cell (`rock_between`). A slow ripple moves it all.
- **Its rooms' names**: the room the player stands in names the place on the screen, before the patrol's own
  (`roomNameAt`, `placeWords`), and its chests counted end the line ("Chests 2 of 5", `chestsCounted`).
- **The cache** (`chestMesh`): the owner's chest from DFO ([[Pick - Chest]]) in wood and iron at the room's
  `Snapshot.cache`, fitted to 0.9 by 0.5 m, its lid shut or open.
- **The chests to find** (`chestsMesh`, `finds.ts`): the cache's chest at each the room stands for the player, centred
  where it stands, built in one mesh, lit by the torches, a vault's with its hinge and latch in the heroic chest's
  gold (`COLOUR.gold`, lit as a surface) where a plain one's are iron; one the player opens swings its lid over 0.6 s to the
  model's 77 degrees, short of upright, coming no nearer the wall behind it than 0.36 m, clear of the kits there,
  none more than 0.3 m proud (`foundChest`), and stands open 4 seconds before it goes.
- **The props** (`layout.props`): each forged prop laid by `layModel` as the city lays one, lit by the torches; the
  `boxes` past the jambs and pillars are their solids, which the camera keeps short of and nothing draws.
- **Its pictures**, every one painted by the procedural textures: each look's sets (records 0 to 4, each turned by
  the island's climate), the textures' ironwork (93, record 0), the
  entrance's door picture (56 or 331, record 2), the climate's timber, the dressing set the pieces wear (1021, turned
  by the climate) and the props' own.
- **The entrances** (`entrances.ts`, `EntranceView`): the model each entrance names of the six above, lifted as the
  table says, turned by the room's yaw; E reaches a door within 2.5 m of its quad's middle.
- **The ground inside**: the fight's door predicts on the dungeon's own ground (`fighter_dungeon`), as the room
  judges bodies; the jambs are drawn from the same `boxes`.
- **The encounters** (`encounterMesh.ts`, `encounterLaw.ts`, `encounterCues.ts`), from the layout's plan and each
  snapshot's word: each Ascent's pads in its room's stone, its wall picture under a band of trim and its floor on top,
  the last with the seal stone glowing; the drowned floor as foul water over its cells while the seal holds, a sickly
  green over its bed whose glow breathes slowly (`FOUL_FLAG`), apart from the dungeon's plain still water, gone as it
  breaks, seething with bubbles of a brighter bile that swell and burst so it reads as the floor that harms; a stepped
  slab of the end room's trim under each anchor, 8 cm high, and a crystal over each relic. On the floor, rings: runes
  dim, lit gold under a beam while showing, green once stepped and red under a beam for a second when stepped wrong,
  each with a glyph of its own (one, two or three strokes round a dot, then round a small ring, so no two of six read
  alike however turned); plates in play under a beam, dim at rest and gold and filled while held; the seal stone's ring,
  lighting as its players stand on it; the relic's ring coloured by its strength, held or not, and its strength as an
  arc inside it; while an Ascent holds, each pad's top edge banded in the seal's blue with a glow fading down its faces,
  brightening pad by pad from the first to the last in a slow wave, the last pad's in the stone's gold; each anchor
  ringed dim under a short beam while the Boss stands (before it wakes too, so the company learns where they are) and,
  while a ward stands, brighter under a beam and filling as it is stood on, a ring round the Boss and a dome of light
  over it; the slam's ring 4 m round the Boss, filling as it comes; a red ring round the Boss through Fury; a
  Reckoning's ring of light under a
  tall beam while it is shown, and a flash from the light as it lands. Each beam fades as the camera's eye comes near
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

- One floor: [[Movement]] and the [[Navmesh]] stand one floor at a point, so the Forge's storeys and stairs stay
  behind.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
- The clusters take the eye's matrix to be a centred perspective, as `fromEyeMatrix` makes it; a lens shifted off
  centre would leave their bounds short on one side.
- A room can lay no props where nothing of its purpose fits: over 2,000 dungeons, 31 end rooms and 28 of 20,037 other
  rooms lay none; over the 27 patrols' 81 dungeons, 1 end room and 1 other room.
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
