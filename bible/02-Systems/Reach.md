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
  - crates/room/src/lib.rs#tick
  - crates/room/src/garrison.rs#SPAWN_CLEAR
---
# Reach

Where a body may go on an island. A node (a social space, a patrol area, a mission, a dungeon or a world boss) holds
one section of an island's land; the rest of the island is seen and never reached
([[Every Island Is Seen Whole and Reached by Nodes]]). Past the section's edge the player is warned to go back, then
dies and is asked to respawn. The times and distances are Claude's choices ([[The World as Claude Shapes It]]). A drawn
node's section is its layout's, traced round the floor its carving leaves, so its edge is the foot of its cliffs and
walls ([[Layouts]]).

## How it works

- **One crate for every machine.** The `reach` crate holds the rules and uses no other crate. Its maths is + - * /,
  square root and comparisons, which every machine rounds alike ([[Agree to the Bit]]), so any machine that judges a
  body judges it as the [[Server]] does.
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
| Where falls kill (a social space), in the air 6 m or more below where its feet last stood | Dead at once, by a fall, inside the ring or out |
| Where falls kill, inside and leaving the ring in the air | Still inside until its feet are down, so a fall shows no warning; a count already running keeps running |
| Dead | Dead a tick longer, wherever the body is: only a respawn ends it |

- **Respawning.** A respawn is offered once the body has been dead 4 s (240 ticks). It comes back at the section's
  spawn nearest where it died; of two as near, the first listed.
- **How far past.** The distance past the edge is to the ring's nearest edge, on the map.

## Who judges

In play with others, the node's room alone ([[Server]]). After each of its ticks it judges every player's body where
its inputs left it, once a tick, whether or not that player sent any; a fall is measured from the height the feet
last stood at, on the ground, a wall or a lip, never a jump's rise. A dead body is stepped with no controls of its
own, so one that died in the air falls on and lies where it lands. An input asking to respawn is granted only once
the standing offers it, and stands the body on the ground at the nearest spawn, its fall measured from there. Each snapshot carries every player's standing, with the ticks left of a warning or the ticks dead, and
the browser shows what the room says; it does not judge. Playing alone, the [[Game]] runs the node's room in the
page, so the same room judges.

## Foes in a section

A node's room stands its garrison inside its section, at least 25 m from every spawn and 10 m inside its edge, on the
navmesh it bakes by its first spawn; a cleared group stands again only once no player is within 40 m of its post
([[Enemies]]). Foes are never judged against the section: one that chases a player past the edge follows them.

## Limits

- The distance past the edge is measured on the map, not along the ground.
- A section is one ring, with no holes; a ring is not checked for crossing itself.
