---
type: system
status: planned
code:
  - crates/movement/src/fence.rs#Fence
  - crates/movement/src/fence.rs#keep
---
# Boss Rings

A boss fought in the world fights inside a ring of pylons, a glowing curtain between them, that rises as its fight
starts and that no one crosses while it stands
([[Bosses in the World Fight Inside a Ring Like DFO's Ghostfence]], [[Pick - Boss Rings]]). The choices made in
building it are [[Boss Rings as Claude Builds Them]].

## How it works

- **The wall** (`movement::Fence`): a circle on the map, its centre and radius. A body is kept on the side of it its
  feet stood before its step: one inside stops its radius (0.35 m) short of the wall, one outside its radius past it,
  and its speed toward the wall is taken off. The wall has no top, so nothing climbs, mantles or leaps over it. A
  point on the line counts as inside, so a body straddling the line as the wall rises is put inside.

## Limits

- Only the wall's rule is built: the room does not yet raise a ring, and nothing draws one.
