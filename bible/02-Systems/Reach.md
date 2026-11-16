---
type: system
status: live
code:
  - crates/reach/src/lib.rs#Section
  - crates/reach/src/lib.rs#Standing
  - crates/reach/src/lib.rs#inside
  - crates/reach/src/lib.rs#distance_outside
  - crates/reach/src/lib.rs#respawn_point
  - crates/reach/src/lib.rs#WARNING_TICKS
---
# Reach

Where a body may go on an island. A node (a social space, a patrol area, a mission, a dungeon or a world boss) holds
one section of an island's land; the rest of the island is seen and never reached
([[Every Island Is Seen Whole and Reached by Nodes]]). Past the section's edge the player is warned to go back, then
dies and is asked to respawn. The times and distances are Claude's choices ([[The World as Claude Shapes It]]).

## How it works

- **One crate for every machine.** The `reach` crate holds the rules and uses no other crate. Its maths is + - * /,
  square root and comparisons, which every machine rounds alike ([[Agree to the Bit]]), so the [[Server]] and a
  browser predicting it judge a body the same.
- **A section** is a ring of points on the land in metres, x east and y south, its last point not repeating its
  first, and its spawns. A body stands inside it by the even-odd rule; a point on the ring is inside. A ring of
  fewer than three points holds nothing.
- **One tick at a time**, 60 a second, the tick [[Movement]] steps bodies by. A body's standing moves on with where
  it stands:

| Standing | The next tick |
|---|---|
| Inside | Inside while inside or on the ring; outside, warned with a count of 10 s (600 ticks) |
| Warned | Back inside, the count ends. Outside, it runs down a tick; at 0 the body dies |
| Inside or warned, 60 m or more past the edge | Dead at once |
| Dead | Dead a tick longer, wherever the body is: only a respawn ends it |

- **Respawning.** A respawn is offered once the body has been dead 4 s (240 ticks). It comes back at the section's
  spawn nearest where it died; of two as near, the first listed.
- **How far past.** The distance past the edge is to the ring's nearest edge, on the map.

## Limits

- No room judges its bodies by a section yet, and the browser shows no warning or count.
- The distance past the edge is measured on the map, not along the ground.
- A section is one ring, with no holes; a ring is not checked for crossing itself.
