---
type: system
status: live
code:
  - client/src/models/model.ts#ForgedModel
  - client/src/models/tables.ts#BuildingTable
  - client/src/models/buildings.ts#buildingModel
  - client/src/models/buildings.ts#withoutDoors
  - client/src/models/buildingPlan.ts#buildingMasses
  - client/src/models/buildingPlan.ts#buildingBox
  - client/src/models/props.ts#propModel
  - client/src/models/propRoles.ts#PROP_ROLES
  - client/src/models/roomKit.ts#kitModel
  - client/src/models/doors.ts#withDoors
  - client/src/models/parts.ts#partBuilder
  - content/forged/buildings.json
  - content/forged/props.json
  - content/forged/roomkit.json
---
# Forged Models

The town buildings, props and room kit that Overlook's towns are built from, each made in code from a measured table
under its classic model id. They are DFO's Building Forge, Prop Forge and Room Kit ([[Pick - Forged Models]]), brought
over whole with the Daggerfall measures and texture archives their plans are built on
([[Every Island Is Seen Whole and Reached by Nodes]], an exception to [[Own Work]]). Each builds DFO's shape to the bit,
but one: the well house (props 43202 and 43204), whose posts run up to carry its ridge where DFO's stop at the eaves
([[The Well House's Roof Is Fixed]]).

## The tables

`content/forged/` holds three tables, keyed by classic model id:

| Table | Pieces | What it measures |
|---|---|---|
| `buildings.json` | 387 | The box, a plan of wings on a 0.4 m grid (each wing's eaves, ridge and rectangles, its covered ways, steps and platforms), the pictures the walls, roofs and glass wear, and the doors |
| `props.json` | 434 | The box, the three pictures the piece wears most, its doors, a board's top cover, a canopy bed's bedding and a tall rock's relief |
| `roomkit.json` | 751 | The box, the pictures, each face square to an axis as a rectangle on its plane, each sloped face as its triangles, and the doors |

A page fetches and parses the table it needs and hands it to the layer, which reads no file itself.

## The model

Every forge answers a `ForgedModel`: positions, normals, UVs and indices, its parts and its doors.

- **Frame**: metres in the classic model's own frame, y up, the floor near y 0.
- **Winding**: each triangle's (b - a) x (c - a) points along its normal, out of the solid.
- **Pictures**: a part is one Daggerfall texture, by archive and record, drawn as `count` indices from `start`.
  UVs count pictures: u across a face, v down it from the picture's top row. Most faces are laid at 40 texels a
  metre, so their UVs run past 0 to 1 and tile: sample with repeat wrapping. A door's or a window's picture is laid
  once over it.
- **Doors**: the classic's, as measured: three corners, the normal, the type and the index saves match on.

## Buildings

`buildingModel` reads the plan as masses, one for each wing's rectangle, from the ground (or a covered way's
underside) to its eaves. It walls each side that stands in the open; a taller wing's wall rises over a lower wing's
roof. A pitched wing gets a roof, gabled or hipped by the building's own seed, its eaves out 0.3 m over open ground
with a soffit under them, and up to two chimneys. A flat wing gets a parapet; a wing a door opens onto is a terrace.
Windows are the glass picture laid once a storey apart along each wall, clear of every door. `withoutDoors` builds a
model again with its faces whole and no door, for a town wall or gate that opens into nothing.

`buildingMasses` answers the same plan as solid boxes with the roof the forge puts on each (gable, hip or flat), its
ridge height and its ridge's run. A far view draws them and a collider can stand on them. `buildingBox` is the
building's box. Both use only + - * /, min, max and integer maths, so any engine reads the same numbers.

## Props

Each prop is one of 65 families (`PROP_ROLES`): a bed, a wardrobe, a shelf, a cart, a headstone, a rock, a temple.
A family builds from the piece's box, its pictures and its doors alone, from boxes, prisms, gables, pyramids, wedges,
logs, wheels and rocks. A piece with a door is turned to face it; shelves and the ladder that stand against a wall by
their +z side are mirrored. A rock's, a ruin's, a column's and a headstone's shape comes of the piece's own id.

## The room kit

Each face is laid on its plan in its picture, anchored at the face's own top left. A wall that meets a floor takes a
skirting, and one under a ceiling a cornice, where the box leaves room.

## Doors

A piece's faces are cut clear of each door's passage: the space up to 4 m before it, a hand past its edges, from just
over its sill. A face 2 m or more out that looks back at the door, and a floor near the sill, are kept. The door's
picture is laid once over its face, and a frame of jambs, a lintel and a sill runs back into the piece and forward
through the cut, left out where it would leave the box. The room kit's doors stand in its faces already: they are
framed only. A building walked into has no door pictures: its doorways are cut through the wall they stand in, from
half a metre before each door's face to half a metre past it (a measured door can be set back in its wall, and its
normal points in or out), so a doorway is open from outside as well as from inside.

## Limits

- Normals and door frames use the platform's hypotenuse, and prisms, rocks and round pieces its sine, cosine and
  arctangent, as DFO's did. Another engine may round their last bit otherwise. The fidelity test pins Node's bits.
- Building every building takes about 0.6 s in Node, the props 0.05 s and the room kit 0.1 s. Build a model when a
  town needs it and keep it. Buildings run from 10 to 5,344 triangles, 206 in the middle.
- The pictures are Daggerfall's archives and records. Swapping them by climate is not part of this layer.
