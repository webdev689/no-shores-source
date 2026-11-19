---
type: system
status: planned
code:
  - crates/dungeon/src/lib.rs#of_patrol
  - crates/dungeon/src/lib.rs#name
  - crates/dungeon/src/lib.rs#STYLES
  - crates/dungeon/src/dungeon.rs#Dungeon
  - crates/dungeon/src/block.rs#BlockLayout
  - crates/dungeon/src/lane.rs#Lane
  - crates/dungeon/src/props.rs#PropModel
  - crates/dungeon/src/props.rs#furnish
  - crates/room-wasm/src/dungeon_door.rs#dungeon_json
  - crates/room/src/dungeon_ground.rs#DungeonGround
  - crates/room-wasm/src/fighter_door.rs#set_dungeon
  - client/src/rules/dungeonRules.test.ts
  - crates/room/src/dungeon_room.rs#dungeon
  - crates/room/src/dungeon_room.rs#band_rooms
  - crates/room/src/dungeon_room.rs#keep_cache
  - crates/room/src/floor.rs#Floor
  - crates/room/src/entrances.rs#laid
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
  three take three different styles, shuffled by the patrol's id. `name` names one for its style and its patrol: The
  Crypt of the Saltgrass Downs.
- **The styles**, the Forge's own, each with its two dungeon picture sets ([[Procedural Textures]]):

| Style | Rooms a block | A room's side (cells) | Ceilings (m) | Ls | Pictures | Its name |
|---|---|---|---|---|---|---|
| Crypt | 3 or 4 | 2 to 4 | 3.2 to 4.4 | no | 123, 124 | Crypt |
| Hall | 2 to 4 | 3 to 7 | 4.0 to 5.6 | yes | 122, 124 | Halls |
| Cells | 3 or 4 | 2 to 3 | 3.2 to 3.6 | no | 122, 123 | Cells |
| Temple | 2 to 4 | 3 to 6 | 4.4 to 5.6 | yes | 124, 122 | Sanctum |

- **A run, not a maze** ([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]]). A dungeon has a beginning, the
  way in's block and its first room; a middle, the blocks between; and an end, the last room of the last block, where
  the Reeve and the return portal stand. Its way runs from one to the next, room after room.
- **The blocks.** A dungeon is three or four blocks of 51.2 m in a chain: the way in's first, each next one beside the
  one before, drawn from the free squares round it. A block and the next share one doorway, a cell along their edge
  from the third to the fourteenth; two blocks side by side that are not next in the chain share none.
- **A block** is 16 by 16 cells of 3.2 m, rock to begin with. The square inside its rim is split, the largest part
  first, into parts no smaller than five cells, and a room is carved in each, a cell of rock kept round it. A style
  asks for as many rooms as the Forge's does (a crypt 3 to 5, the cells 4 to 6), but no part is cut below five cells,
  so the square is cut at most once each way and a block holds four rooms at most. A room's sides and its ceiling (a
  whole number of 0.4 m) are drawn from its style's ranges, and in a hall or a temple, two times in five, it is an L,
  a corner quarter of its rectangle left rock. Its rooms are joined one after another: from its way in
  (the doorway from the block before, or in the way in's block its first room), each room in turn, ordered by how
  far it lies from the way in less how far from the way on, to the doorway onto the next block. Each way is the
  cheapest: rock costs 3, a room 2, a corridor 1, so ways reuse ways. A way never crosses the rim but at a doorway.
  Where two ways cross they make a loop; over 2,000 dungeons there is about one loop in a dungeon, against five and up
  to 28 under the Forge's own spanning tree and loops. A block that is not one walk, or a way in's with no room against rock for its exit door, tries again on
  the next of sixteen seeds, and past them takes its simplest form, one room of 3 by 3.
- **The way in** is in the first room of the way in's block that has a cell with rock beside it, at the cell nearest
  its middle, its quiet cells first: the exit door stands on that rock, 1.4 m wide and 2.4 m high, and a body arrives
  0.4 m past that cell's middle, about 2 m in from the door, facing into the room, as the Forge stands one.
- **The return portal** stands on the end room's wall like the exit door, as wide and as high: on the room's cell
  farthest from the way in by walk that has rock beside it, its quiet cells first, never on the exit door's wall. It
  takes a player back out to the dungeon's entrance once the Reeve has fallen ("In the Game").
- **Torches**, 2.1 m up a wall and 0.35 m off it, each lighting 8 m: on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; and
  on every fourth corridor cell of a block, row by row. None stands over the exit door or the portal, and two stand on
  the portal's wall, 1.15 m either side of its middle, so the end of the way is lit and marked before it opens.
- **Doorways.** Where a room's cell meets a corridor, two jambs 0.3 m deep stand in the corridor and narrow the edge
  to 1.8 m, up to the lower of the two ceilings, under a lintel at 2.8 m. A room at least 4 cells each way stands a
  pillar 0.7 m square at every second inner corner whose four cells are its own.
- **Props.** Each room is furnished as the Forge furnished it with scenery, with the forged props of its style
  ([[Forged Models]]): one for each ten of its cells and at least one, each on a quiet cell against a rock wall, its
  back 0.1 m off it, its front to the room, turned a quarter more where it is deeper than wide so its long side runs
  along the wall, its foot on the floor and its top 0.3 m under the ceiling at most. One to a cell, drawn on the room's
  own lane, and never on the way in's cell, the portal's, a torch's wall, the four cells nearest a room's middle where
  its foes stand, or the Reeve's cell and those round it. A room lays as many as it has such cells free, so a small
  room whose quiet cells its foes take lays none: over a quarter of rooms. Each is a solid like a pillar.

| Style | Its props |
|---|---|
| Crypt | low coffins (43304, 43306), tomb markers (43055, 43057), a pedestal (41020), broken columns (41731, 41733), crates (41816, 41818) |
| Halls | crates (41816, 41817, 41822, 41827, 41831), a cabinet (41022), a cupboard (41032), shelves (41035), a table (41108), a bench (41105), a chair (41100), a rack (41125) |
| Cells | beds (41000, 41001), a bench (41105), a stool (41103), a table (41111), crates (41816, 41818), a trough (41209) |
| Sanctum | statues (62327, 62329), a pedestal (41020), a lectern (41021), columns (41723, 41731), an obelisk (43303), a throne (41122) |

- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell; every room of the way in's block
  lies nearer than the end.
- **What a body stands on** (`heights`, `boxes`): one floor at 0 m, each open cell's height and none for rock, in
  cells of 3.2 m, and the jambs, then the pillars, then the props as boxes (min x, min y, max x, max y, top).
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a patrol's dungeon as JSON, from its patrol's id and
  name and its number: its cells (-2 rock, -1 corridor, or a room's number), ceilings, rooms, end, way in, arrival,
  exit door, portal, torches, frames, pillars, props (each its model, its origin and its yaw) and boxes; null for a
  number past the patrol's three. The room door's `dungeon` asks it. Three dungeons' answers are pinned by
  their hash, natively and through WebAssembly, so a dungeon is the same bytes on every machine.

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
  enters rock, the grid's edge or a solid below its top (`wall_entry`), however far it flies in a tick, and passes
  over a solid lower than itself.
- **Its navmesh** is baked over the whole dungeon in cells of 0.4 m, on the cells' heights alone with the jambs and
  pillars as its colliders, and kept to the floor joined to the arrival ([[Navmesh]]), so the rock's flat tops are left
  out.
- **Its garrison** ([[Enemies]]): the Reeve, a Miniboss, alone on the end room's cell nearest its middle; a band of
  two to four in each other room past the way in's, one foe for each ten of its cells, on its cells nearest its
  middle, its quiet cells first. When the bands and the Reeve would pass the room's 24 foes, the most rooms that
  fit stand one, spread evenly along the walk from the way in to the end.
- **The cache** stands 1.6 m from the Reeve's post, the first of the eight ways round it, north first, that is open
  floor clear of every jamb and pillar, facing the post. Shut while the Reeve stands; when he falls it opens and every
  player then in the room finds a Vestige 0.8 m before it ([[Gear]]); it shuts when he stands again. Each snapshot
  carries it.
- **The entrances**: a patrol's room lays its three dungeons' entrances as it starts ([[Server]], "A patrol"), from
  the node's id, drawn apart from its resource spots. Each is the mound with a door its dungeon's seed draws, 43601
  or 43602, which read as a way under the ground in every biome; the four Daggerfall's dungeon blocks stand keep
  their numbers on the wire (0 to 3), raised as those blocks raise them:

| Model | Stood by | Raised (m) |
|---|---|---|
| 42000 | DUNGAA00 | 2.5 |
| 42001 | DUNGAA01 | 4.8 |
| 43601 | the other dungeon blocks | 0.775 |
| 43602 | the other dungeon blocks | 0.475 |

  Its yaw turns the model's +z as an RMB block's does, so its door (the forged props' `doors` quad) faces the ring's
  middle. Every player of the patrol's room is sent them in their gear. A player joins the patrol's room 1.5 m before
  an entrance's door, facing away from it, by `?entrance=<number>` on its address, or in a page playing alone by the
  room's `room_join_at`.

## In the Game

The page reads a dungeon from the room module's own `room_dungeon` (`askDungeon`) and plays it as [[Game]] says ("A
dungeon").

- **Its look** (`dungeonMesh`) is a port of DFO's Forge mesh for one floor, in the dungeon's own frame: floors,
  ceilings, walls with trim at foot and head, walls up from a lower ceiling, doorways' frames whose jambs are the
  layout's `boxes`, trimmed pillars, torches' brackets and flames, the exit door and the return portal. Pictures by role from the
  style's two sets, turned to the island's climate (`smallBook`) and painted by the city's painter.
- **Its light** (`dungeonLight.ts`): each torch warm to `torchReach`, flickering, and a dim cold light everywhere,
  enough that a room past every torch's reach still shows its walls; the shader and the figures sum the same
  light (`lightAt`).
- **The cache** (`chestMesh`): a chest of wood and iron at the room's `Snapshot.cache`, its lid shut or thrown back.
- **The props** (`layout.props`): each forged prop laid by `layModel` as the city lays one, lit by the torches; the
  `boxes` past the jambs and pillars are their solids, which the camera keeps short of and nothing draws.
- **Its pictures**, every one painted by the procedural textures: the style's sets (122, 123, 124, records 0 to 4,
  each turned to 22, 122, 322 or 422 and so on by the island's climate), the textures' ironwork (93, record 0), the
  entrance's door picture (56 or 331, record 2), the climate's timber and the props' own.
- **The entrances** (`entrances.ts`, `EntranceView`): the model each entrance names of the forged 42000, 42001, 43601
  and 43602 (the rooms lay only the two mounds), lifted 2.5 m, 4.8 m, 0.775 m and 0.475 m as Daggerfall's blocks stand
  them, turned by the room's yaw; E reaches a door within
  2.5 m of its quad's middle.
- **The ground inside**: the fight's door predicts on the dungeon's own ground (`fighter_dungeon`), as the room
  judges bodies; the jambs are drawn from the same `boxes`.
- **The return portal** (`layout.portal`): an arch of the end room's trim round a face, dark while the cache is shut
  and glowing, lighting the room, while it is open; E "Leave" within 2.5 m while it is open.

## Limits

- One floor: [[Movement]] and the [[Navmesh]] stand one floor at a point, so the Forge's storeys and stairs stay
  behind.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
- Movement has no ceilings: a dungeon's are never reached because nothing in it can be climbed, and a jump rises
  about half a metre.
- A body stops short of a wall by up to one tick's run (13 cm) past its half-width, since a move that would end
  nearer is refused whole before each axis is tried alone.
- The third-person camera keeps short of the rock and under the ceiling, so in a narrow room, a corridor or a low room
  it sits close behind the player.
- A player who joins a company member in a dungeon came by no entrance, so leaving by its door or portal stands them
  at the patrol's first spawn.
