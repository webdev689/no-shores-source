---
type: system
status: planned
code:
  - crates/dungeon/src/lib.rs#of_patrol
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
  - crates/dungeon/src/props.rs#nearest_middle
  - crates/dungeon/src/torches.rs#Torch
  - crates/room-wasm/src/dungeon_door.rs#dungeon_json
  - crates/room/src/dungeon_ground.rs#DungeonGround
  - crates/room-wasm/src/fighter_door.rs#set_dungeon
  - client/src/rules/dungeonRules.test.ts
  - crates/room/src/dungeon_room.rs#dungeon
  - crates/room/src/dungeon_room.rs#band_rooms
  - crates/room/src/dungeon_room.rs#keep_cache
  - crates/room/src/floor.rs#Floor
  - crates/room/src/entrances.rs#laid
  - crates/room/src/entrances.rs#model_of
  - crates/room/src/entrances.rs#MODELS
  - crates/room/src/entrances.rs#join_at
  - crates/navmesh/src/lib.rs#bake_anchored
  - crates/room-wasm/src/dungeon_door.rs#open_dungeon
  - crates/room-wasm/src/dungeon_door.rs#room_join_at
  - server/roomNames.ts#nodeRoom
  - client/src/game/dungeonLayout.ts#askDungeon
  - client/src/game/dungeonMesh.ts#dungeonMesh
  - client/src/game/dungeonView.ts#DungeonView
  - client/src/game/dungeonLight.ts#lightAt
  - client/src/game/dungeonLight.ts#LIGHT_KINDS
  - client/src/game/dungeonLight.ts#MOODS
  - client/src/game/dungeonCeilings.ts#ceilingHeights
  - client/src/game/dungeonFixtures.ts#fixtureMesh
  - client/src/game/footTrips.ts#roomNameAt
  - client/src/game/dungeonChest.ts#chestMesh
  - client/src/game/dungeonScene.ts#DungeonScene
  - client/src/game/entrances.ts#doorOf
  - client/src/game/entranceView.ts#EntranceView
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
  (`size:<seed>`). The blocks stand in a chain: the way in's first, each next one beside the one before, drawn from
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
- **The return portal** stands on the end room's wall like the exit door, as wide and as high: on the room's cell
  farthest from the way in by walk that has rock beside it that is no stone, its quiet cells first, never on the exit
  door's wall. It takes a player back out to the dungeon's entrance once the Reeve has fallen ("In the Game").
- **Ceilings** (`ceiling`): a room's form, only a look; it stands at its own height whatever its form. Under an
  arched roof a square room or an octagon takes a dome, and a hall of alcoves or a rectangle whose longer side is at
  least half again its shorter a vault along it; a cave and every cavern takes rough rock; any other room is flat.
- **Torches**, 2.1 m up a wall and 0.35 m off it, each lighting 8 m: on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; and
  on every fourth corridor cell of a block, row by row. None stands over the exit door or the portal, and two stand on
  the portal's wall, 1.15 m either side of its middle, so the end of the way is lit and marked before it opens.
- **Doorways.** Where a room's cell meets a corridor, two jambs 0.3 m deep stand in the corridor and narrow the edge
  to 1.8 m, up to the lower of the two ceilings, under a lintel at 2.8 m. A hewn room (no cave) at least 4 cells each
  way stands a pillar 0.7 m square at every second inner corner whose four cells are its own.
- **Purposes** (`name_rooms`). Every room has a purpose from its block's style's bank
  ([[Dungeons as Claude Builds Them]], "The varied dungeons"): the way in's room and the end room their style's own,
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
- **Where foes stand** (`nearest_middle`): a room's free cells nearest its middle, its quiet cells first and then the
  rest, so a smaller band's cells are always the first of a larger's.
- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell; every room of the way in's block
  lies nearer than the end.
- **What a body stands on** (`heights`, `boxes`): one floor at 0 m, each open cell's height and none for rock, in
  cells of 3.2 m, and as boxes (min x, min y, max x, max y, top) the jambs, then the pillars, then the props' solids,
  then the fixtures'.
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a patrol's dungeon as JSON, from its patrol's id and
  name and its number, as the page's `DungeonLayout` reads it: its name, first style and pictures; its looks (each a
  style and its pictures) and each cell's look (-1 for rock); its cells (-2 rock, -1 corridor, or a room's number),
  ceilings, rooms (each its rectangle, height, walk, role, name, ceiling form and look), end, way in, arrival, exit
  door, portal, torches, fixtures (each where its light burns and its kind: 0 brazier, 1 candles, 2 crystals, 3
  lantern, 4 hearth), frames, pillars, props (each its model, its origin and its yaw) and boxes; null for a number
  past the patrol's three. The room door's `dungeon` asks it. Three dungeons' answers are pinned by their hash,
  natively and through WebAssembly, so a dungeon is the same bytes on every machine.

## In the rooms

- **A room for each at each sea.** A patrol's dungeon is the room `node-<patrol id>--dungeon-<number>`, and
  `node-<patrol id>--rough--dungeon-<number>` or `--storm--dungeon-<number>` at the harder seas ([[Server]]). It opens
  from its patrol's node file, refused for a node that is no patrol, and its garrison stands at the patrol's island
  band, raised by its seas.
- **Its world is the dungeon's frame**: x east and y south from the north-west corner, the floor at 0 m. Every point
  its snapshots, its cache and its spawn name is in it. Its section is the dungeon's rectangle, its one spawn the
  arrival, where a body joins and the dead stand again, facing into the room.
- **What a body stands on** (`DungeonGround`): the dungeon's own ground, not [[Movement]]'s blocks. Its height is the
  cells' (0 m open, a wall 10 m over the floor for rock), and over a jamb, a pillar or a prop that solid's own top. A move is walled where it crosses rock,
  or where it ends nearer than a body's half-width (0.35 m) to rock, a jamb, a pillar or a prop and nearer than it
  began: a body slides along a wall, steps away from one, and never stands in its face. Inside a solid, as a shove
  might leave it, its nearness is less than nothing by its depth, so it walks out and never deeper. Movement climbs
  blocks, never a ground's walls, so no solid is climbed and no body reaches a ceiling. Each cell keeps the solids
  within a half-width of it, so a move looks at a few. The browser predicts on the same ground (`fighter_dungeon`).
- **What a line meets** (`line_walled`): rock at any height, and a jamb, a pillar or a prop where the line passes
  below its top, as a block meets a line; a line looks only at the solids by the cells it crosses. A foe's eyes, a
  soft lock, a blow, a telegraphed shape, a charge's lane and a shooter's cover are stopped by them and see over a
  low coffin or table. A noise through them carries half as loud and half as far. A kill's drop thrown across a wall
  or a tall solid rests where its foe fell; one thrown onto a low solid rests on its top. A shot stops where it first
  enters rock, the grid's edge or a solid below its top (`wall_entry`), however far it flies in a tick, passes over a
  solid lower than itself, and falls onto the floor alone (`floor_at`).
- **Its navmesh** is baked over the whole dungeon in cells of 0.4 m, on the cells' heights alone with every solid as
  its colliders, and kept to the floor joined to the arrival ([[Navmesh]]), so the rock's flat tops are left out. It
  lays no links: a body climbs nothing in a dungeon, so no foe paths up a solid's side or off its top.
- **Its garrison** ([[Enemies]]): the Reeve, a Miniboss, alone on the end room's cell nearest its middle; a band of
  two to four in each other room past the way in's, one foe for each ten of its cells (`posts_for`), on its free cells
  nearest its middle, its quiet cells first, round its props. When the bands and the Reeve would pass the room's 24 foes, the most rooms that
  fit stand one, spread evenly along the walk from the way in to the end.
- **The cache** stands 1.6 m from the Reeve's post, the first of the eight ways round it, north first, that is open
  floor clear of every jamb, pillar, prop and fixture, facing the post. Shut while the Reeve stands; when he falls it opens and every
  player then in the room finds a Vestige 0.8 m before it ([[Gear]]); it shuts when he stands again. Each snapshot
  carries it.
- **The entrances**: a patrol's room lays its three dungeons' entrances as it starts ([[Server]], "A patrol"), from
  the node's id, drawn apart from its resource spots. Each is one of its style's entrances that its dungeon's seed
  draws (`model_of`): a mound with a door, 43601 or 43602, for a built dungeon, and a cave mouth, 43603 or 43604, for
  the Caverns and the Mines. The six Daggerfall's blocks stand keep their numbers on the wire (0 to 5), raised as
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

## In the Game

The page reads a dungeon from the room module's own `room_dungeon` (`askDungeon`) and plays it as [[Game]] says ("A
dungeon").

- **Its look** (`dungeonMesh`) is a port of DFO's Forge mesh for one floor, in the dungeon's own frame: floors,
  ceilings, walls with trim at foot and head, walls up from a lower ceiling, doorways' frames whose jambs are the
  layout's `boxes`, trimmed pillars, torches' brackets and flames, the exit door and the return portal. Each cell
  wears its look (`cellLooks`): the style of its floor of the dungeon, with that style's two sets of pictures by role.
- **Its ceilings** (`dungeonCeilings.ts`): a room's ceiling is flat, a barrel vault across its narrower side, a dome
  over its middle, or rough rock over a cave. A vault rises up to 1.6 m and a dome up to 2.2 m, each at most 0.6 of
  its half span. A cave's ceiling stands 0.25 m to 1.1 m over its walls, and its rock walls bulge up to 0.22 m.
  Where two cells' ceilings differ along an edge, the higher one's side is closed up to it.
- **Its light** (`dungeonLight.ts`): each torch and fixture burns in its own colour, reach and flicker (`LIGHT_KINDS`):
  a torch to `torchReach`, a brazier, candles, crystals, a lantern, a hearth and fungus. Each look has its own faint light,
  its mood (`MOODS`), enough that a room past every light's reach still shows its walls. The shader takes the 32
  lights nearest the eye, and the shader and the figures sum the same light (`lightAt`).
- **Its fixtures** (`dungeonFixtures.ts`): a brazier on three legs with embers and flames, a cluster of three to five
  candles, five to eight glowing crystals, a lantern on its chain, a hearth's fire, and six to ten fungi, each a pale
  stalk under a glowing cap. Each is shaped by where it
  stands, so no two are alike.
- **Its rooms' names**: the room the player stands in names the place on the screen, before the patrol's own
  (`roomNameAt`, `placeWords`).
- **The cache** (`chestMesh`): a chest of wood and iron at the room's `Snapshot.cache`, its lid shut or thrown back.
- **The props** (`layout.props`): each forged prop laid by `layModel` as the city lays one, lit by the torches; the
  `boxes` past the jambs and pillars are their solids, which the camera keeps short of and nothing draws.
- **Its pictures**, every one painted by the procedural textures: each look's sets (records 0 to 4, each turned by
  the island's climate), the textures' ironwork (93, record 0), the
  entrance's door picture (56 or 331, record 2), the climate's timber and the props' own.
- **The entrances** (`entrances.ts`, `EntranceView`): the model each entrance names of the six above, lifted as the
  table says, turned by the room's yaw; E reaches a door within 2.5 m of its quad's middle.
- **The ground inside**: the fight's door predicts on the dungeon's own ground (`fighter_dungeon`), as the room
  judges bodies; the jambs are drawn from the same `boxes`.
- **The return portal** (`layout.portal`): an arch of the end room's trim round a face, dark while the cache is shut
  and glowing, lighting the room, while it is open; E "Leave" within 2.5 m while it is open.

## Limits

- One floor: [[Movement]] and the [[Navmesh]] stand one floor at a point, so the Forge's storeys and stairs stay
  behind.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
- A room can lay no props where nothing of its purpose fits: over 2,000 dungeons, 31 end rooms and 28 of 20,037 other
  rooms lay none; over the 27 patrols' 81 dungeons, 1 end room and 1 other room.
- No fountain or cart is laid: each is wider than a cell.
- Movement has no ceilings: a dungeon's are never reached because nothing in it can be climbed, and a jump rises
  about half a metre.
- A body stops short of a wall by up to one tick's run (13 cm) past its half-width, since a move that would end
  nearer is refused whole before each axis is tried alone.
- The third-person camera keeps short of the rock and under the ceiling, so in a narrow room, a corridor or a low room
  it sits close behind the player.
- A player who joins a company member in a dungeon came by no entrance, so leaving by its door or portal stands them
  at the patrol's first spawn.
