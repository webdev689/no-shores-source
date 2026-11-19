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
  - client/src/rules/dungeonRules.test.ts
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

- **The blocks.** A dungeon is three or four blocks of 51.2 m, the way in's first and each next one beside one
  already laid, drawn from the free squares round them. Every two side by side share one or two doorways, each a cell
  along their edge from the third to the fourteenth.
- **A block** is 16 by 16 cells of 3.2 m, rock to begin with. The square inside its rim is split, the largest part
  first, into parts no smaller than five cells, and a room is carved in each, a cell of rock kept round it: its sides
  and its ceiling (a whole number of 0.4 m) drawn from its style's ranges, and in a hall or a temple, two times in
  five, an L, a corner quarter of its rectangle left rock. Its rooms and its doorways are joined by a spanning tree,
  nearest first, and a share of the other pairs as loops (0.3, or 2 over their count where that is less), each by the
  cheapest way: rock costs 3, a room 2, a corridor 1, so ways reuse ways. A way never crosses the rim but at a
  doorway. A block that is not one walk, or a way in's with no room against rock for its exit door, tries again on
  the next of sixteen seeds, and past them takes its simplest form, one room of 3 by 3.
- **The way in** is the room's cell nearest its middle with rock beside it, its quiet cells first: the exit door
  stands on that rock, 1.4 m wide and 2.4 m high, and a body arrives 0.4 m in from it, facing into the room.
- **Torches**, 2.1 m up a wall and 0.35 m off it, each lighting 8 m: on each room's quiet cells on every third
  diagonal, one for every sixteen cells of its rectangle, and on any of its cells where none of those has a wall; and
  on every fourth corridor cell of a block, row by row. None stands over the exit door.
- **Doorways.** Where a room's cell meets a corridor, two jambs 0.3 m deep stand in the corridor and narrow the edge
  to 1.8 m, up to the lower of the two ceilings, under a lintel at 2.8 m. A room at least 4 cells each way stands a
  pillar 0.7 m square at every second inner corner whose four cells are its own.
- **The walk.** Each room's walk is the fewest cells crossed from the way in's cell; the end is the room farthest.
- **What a body stands on** (`heights`, `boxes`): one floor at 0 m, each open cell's height and none for rock, in
  cells of 3.2 m, as [[Movement]]'s grid of heights takes them; and the jambs and pillars as its blocks.
- **For a browser,** the `room-wasm` door's `room_dungeon` answers a patrol's dungeon as JSON, from its patrol's id and
  name and its number: its cells (-2 rock, -1 corridor, or a room's number), ceilings, rooms, way in, arrival, exit
  door, torches, frames, pillars and boxes. The room door's `dungeon` asks it. Three dungeons' answers are pinned by
  their hash, natively and through WebAssembly, so a dungeon is the same bytes on every machine.

## In the Game

The page reads a dungeon from the room module's own `room_dungeon` (`askDungeon`) and plays it as [[Game]] says ("A
dungeon").

- **Its look** (`dungeonMesh`) is a port of DFO's Forge mesh for one floor, in the dungeon's own frame: floors,
  ceilings, walls with trim at foot and head, walls up from a lower ceiling, doorways' frames whose jambs are the
  layout's `boxes`, trimmed pillars, torches' brackets and flames, and the exit door. Pictures by role from the
  style's two sets, turned to the island's climate (`smallBook`) and painted by the city's painter.
- **Its light** (`dungeonLight.ts`): each torch warm to `torchReach`, flickering, a faint cold light everywhere; the shader
  and the figures sum the same light (`lightAt`).
- **The cache** (`chestMesh`): a chest of wood and iron at the room's `Snapshot.cache`, its lid shut or thrown back.
- **The entrances** (`entrances.ts`, `EntranceView`): the forged models 42000, 42001, 43601 and 43602, lifted 2.5 m,
  4.8 m, 0.775 m and 0.475 m as Daggerfall's blocks stand them, turned by the room's yaw; E reaches a door within
  2.5 m of its quad's middle.
- **The ground inside** (`floorGrid`, `courseOf`): the grid of heights and the boxes, as the room stands bodies.

## Limits

- One floor: [[Movement]] and the [[Navmesh]] stand one floor at a point, so the Forge's storeys and stairs stay
  behind.
- A room ringed by corridors would have no wall for a torch and stand unlit; no dungeon the tests lay has one.
