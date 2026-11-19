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
---
# Dungeons

The patrol areas' dungeons: three in each patrol, each laid by DFO's Forge from a seed
([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]], [[Pick - Dungeons 2.0]]). The choices are Claude's
([[Dungeons as Claude Builds Them]]).

## How it works

- **One crate for every machine.** The `dungeon` crate lays a dungeon from its seed and style, and uses no other
  crate. Its maths is + - * / and comparisons, and every draw is made on a lane of its own: Mulberry32 over a seed
  that is the FNV-1a hash of the lane's name, as DFO's lanes draw ([[Agree to the Bit]]).
- **A patrol's three.** `of_patrol` gives each its seed, from the patrol's id and its number, and its style; the
  three take three different styles, shuffled by the patrol's id. `name` names one for its style and its patrol: The
  Crypt of the Saltgrass Downs.
- **The styles**, the Forge's own, each with its two dungeon picture sets ([[Procedural Textures]]):

| Style | Rooms a block | A room's side (cells) | Ceilings (m) | Ls | Pictures | Its name |
|---|---|---|---|---|---|---|
| Crypt | 3 to 5 | 2 to 4 | 3.2 to 4.4 | no | 123, 124 | Crypt |
| Hall | 2 to 4 | 3 to 7 | 4.0 to 5.6 | yes | 122, 124 | Halls |
| Cells | 4 to 6 | 2 to 3 | 3.2 to 3.6 | no | 122, 123 | Cells |
| Temple | 2 to 4 | 3 to 6 | 4.4 to 5.6 | yes | 124, 122 | Sanctum |

- **A run, not a maze** ([[DFO's Dungeons 2.0 Comes Over, Within the Patrol Areas]]). A dungeon has a beginning, the
  way in's block and its first room; a middle, the blocks between; and an end, the last room of the last block, where
  the Reeve and the return portal stand. Its way runs from one to the next, room after room.
- **The blocks.** A dungeon is three or four blocks of 51.2 m in a chain: the way in's first, each next one beside the
  one before, drawn from the free squares round it. A block and the next share one doorway, a cell along their edge
  from the third to the fourteenth; two blocks side by side that are not next in the chain share none.
- **A block** is 16 by 16 cells of 3.2 m, rock to begin with. The square inside its rim is split, the largest part
  first, into parts no smaller than five cells, and a room is carved in each, a cell of rock kept round it: its sides
  and its ceiling (a whole number of 0.4 m) drawn from its style's ranges, and in a hall or a temple, two times in
  five, an L, a corner quarter of its rectangle left rock. Its rooms are joined one after another: from its way in
  (the doorway from the block before, or in the way in's block its first room), each room in turn, ordered by how
  far it lies from the way in less how far from the way on, to the doorway onto the next block. Each way is the
  cheapest: rock costs 3, a room 2, a corridor 1, so ways reuse ways. A way never crosses the rim but at a doorway.
  Where two ways cross they make a loop; over 2,000 dungeons there is about one loop in a dungeon, against five and up
  to 28 under the Forge's own spanning tree and loops. A block that is not one walk, or a way in's with no room against rock for its exit door, tries again on
  the next of sixteen seeds, and past them takes its simplest form, one room of 3 by 3.
- **The way in** is in the first room of the way in's block that has a cell with rock beside it, at the cell nearest
  its middle, its quiet cells first: the exit door stands on that rock, 1.4 m wide and 2.4 m high, and a body arrives
  0.4 m in from it, facing into the room.
- **The return portal** stands on the end room's wall like the exit door, as wide and as high: on the room's cell
  farthest from the way in by walk that has rock beside it, its quiet cells first, never on the exit door's wall. It
  takes a player back out to the dungeon's entrance once the Reeve has fallen ("In the Game").
- **Torches**, 2.1 m up a wall and 0.35 m off it, each lighting 8 m: on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; and
  on every fourth corridor cell of a block, row by row. None stands over the exit door or the portal.
- **Doorways.** Where a room's cell meets a corridor, two jambs 0.3 m deep stand in the corridor and narrow the edge
  to 1.8 m, up to the lower of the two ceilings, under a lintel at 2.8 m. A room at least 4 cells each way stands a
  pillar 0.7 m square at every second inner corner whose four cells are its own.
- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell; every room of the way in's block
  lies nearer than the end.
- **What a body stands on** (`heights`, `boxes`): one floor at 0 m, each open cell's height and none for rock, in
  cells of 3.2 m, and the jambs and pillars as boxes (min x, min y, max x, max y, top).
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a patrol's dungeon as JSON, from its patrol's id and
  name and its number: its cells (-2 rock, -1 corridor, or a room's number), ceilings, rooms, end, way in, arrival,
  exit door, portal, torches, frames, pillars and boxes; null for a number past the patrol's three. The room door's `dungeon` asks it. Three dungeons' answers are pinned by
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
  cells' (0 m open, a wall 10 m over the floor for rock) and 10 m inside a jamb or a pillar, so a shot or a look meets
  them as it meets the rock. A move is walled where it crosses rock, or where it ends nearer than a body's half-width
  (0.35 m) to rock, a jamb or a pillar and nearer than it began: a body slides along a wall, steps away from one, and
  never stands in its face. Movement climbs blocks, never a ground's walls, so no jamb or pillar is climbed and no body
  reaches a ceiling. Each cell keeps the jambs and pillars within a half-width of it, so a move looks at a few. The
  browser predicts on the same ground (`fighter_dungeon`).
- **Its navmesh** is baked over the whole dungeon in cells of 0.4 m, on the cells' heights alone with the jambs and
  pillars as its colliders, and kept to the floor joined to the arrival ([[Navmesh]]), so the rock's flat tops are left
  out.
- **Its garrison** ([[Enemies]]): the Reeve, a Miniboss, alone on the end room's cell nearest its middle; a band of
  two to four in each other room past the way in's, one foe for each ten of its cells, on its quiet cells nearest its
  middle; when the bands and the Reeve would pass the room's 24 foes, the most rooms that fit, spread evenly along
  the walk from the way in to the end.
- **The cache** stands 1.6 m from the Reeve's post, the first of the eight ways round it, north first, that is open
  floor clear of every jamb and pillar, facing the post. Shut while the Reeve stands; when he falls it opens and every
  player then in the room finds a Vestige 0.8 m before it ([[Gear]]); it shuts when he stands again. Each snapshot
  carries it.
- **The entrances**: a patrol's room lays its three dungeons' entrances as it starts ([[Server]], "A patrol"), from
  the node's id, drawn apart from its resource spots. Each is the model its dungeon's seed draws of the four
  Daggerfall's dungeon blocks stand, raised as those blocks raise it:

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

## Limits

- One floor: [[Movement]] and the [[Navmesh]] stand one floor at a point, so the Forge's storeys and stairs stay
  behind.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
- Movement has no ceilings: a dungeon's are never reached because nothing in it can be climbed, and a jump rises
  about half a metre.
- A body stops short of a wall by up to one tick's run (13 cm) past its half-width, since a move that would end
  nearer is refused whole before each axis is tried alone.
