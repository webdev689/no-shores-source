---
type: reference
code:
  - content/world/rmb/index.json
---
# RMB Blocks

`content/world/rmb/` holds Daggerfall's RMB town blocks as data: all 920 blocks of the freeware `BLOCKS.BSA`, each a
102.4 m square of buildings, props, ground tiles and counts of its flats. A town plan fills its 102.4 m blocks with
them, and the forged models stand on the placements: `content/forged/buildings.json` and `props.json` are keyed by the
same Daggerfall model ids.

The table comes from the freeware data, read once with DFO's readers outside the repository, under the owner's
exception to [[Own Work]] ([[Every Island Is Seen Whole and Reached by Nodes]]). Overlook holds no reader of
Daggerfall's files and no exporter ([[Readers of Our Own Formats Only]]): the table is the blocks.

## Files

- `index.json` says what every field means and holds the totals, the building types, the flat kinds, the model ids
  the blocks use and how many the forged tables hold, the blocks grouped by name prefix with what each prefix is and
  which kinds of Daggerfall location stand it, and a row per block: its name, file, buildings, props, flats by kind,
  and how many of Daggerfall's locations stand it.
- One file per kind of block, one block per line: `walls`, `shops`, `taverns`, `temples`, `guilds`, `palaces`,
  `homes`, `graveyards`, `places` (the unique places, dungeon entrances, ruins, fillers, covens and the ship) and
  `unused` (the blocks no location of the game stands). Each line is `{"name", "buildings", "props", "ground"}`.

## Frame and fields

| Field | Meaning |
|---|---|
| x, y, z | Metres east of the block's west edge, south of its north edge, and up from its ground |
| yaw | Degrees clockwise from north. It turns a model's +z, its forward in the forged frame (x right, y up, z forward), towards east. A model's origin stands at (x, y, z); the forged tables keep Daggerfall's origins |
| `buildings` | `[modelId, x, y, z, yaw, buildingType, record]`, a row per model. The models of one building share its record, the block's building record that keys its interior and its name. `index.json` names the building types |
| `props` | `[modelId, x, y, z, yaw, scale]`. z holds the 0.1 m that Daggerfall Unity sinks a prop by. Scale is 1 in every block |
| `ground` | Base64 of 256 bytes: the 16 × 16 tiles of 6.4 m, row by row from the north-west tile. A byte is the tile's record, plus 64 when it is rotated and 128 when it is flipped. Records 0 to 3 are water, dirt, grass and stone, 4 to 55 the edges and corners between them, and 56 to 63 random-ground markers drawn as grass |

Flats (trees, plants, people, animals, lights, markers and other decoration) are sprites and do not come over as
models; `index.json` counts them by kind for each block.

## For a town plan

- **Streets** are dirt. Doors face every way about equally, and nine in ten ground-floor doors open onto dirt or its
  edge tiles. About half of a block's edge is grass, so a street does not always carry on into the next block.
- **Walls**: the `WALL` blocks ring a walled city's grid. 00 to 03 are its corners, 04 to 07 its sides and 08 to 11
  the sides with the gate (model 446), in the order north, east, south, west. The wall runs 11.2 m in from the edge
  that meets the city, with the bulletin boards on the city side; the rest of the block is open ground.
- **Water**: no prefix is a dock. Sentinel's city blocks (`CUSTGA`) hold its harbour, the castles (`CAST`) their moats,
  and `SHIPAA00` and `SHIPAA01` are ships on open water.
- **Grids**: Daggerfall stands a location's first row of blocks at its south edge.
- **Models**: every model id the blocks place is forged. Seven that buildings place (41200, 41202, 41409, 41901,
  41902, 42000, 42001) are in `props.json`, not `buildings.json`.
