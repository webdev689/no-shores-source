---
type: system
status: live
code:
  - client/src/overworld/overworldCamera.ts#stepCamera
  - client/src/overworld/overworldInput.ts#pressMove
  - client/src/overworld/overworldPick.ts#pickAt
  - client/src/overworld/overworldMarks.ts#placeMarks
  - client/src/game/seaMarks.ts#landingChoice
  - client/src/game/seaMarks.ts#playlistPort
  - client/src/game/seaMarks.ts#landfallMarks
  - client/src/overworld/seaRoute.ts#planSeaRoute
  - client/src/overworld/voyage.ts#shipAt
  - client/src/overworld/islandView.ts#frameSide
  - client/src/overworld/ground.ts#landHeightAt
---
# Overworld

DFO's raised, tilted travel camera over the real world ([[Pick - Overworld]]), for two things
([[Every Island Is Seen Whole and Reached by Nodes]]): sailing the sea, the player's ship seen from above, faster than
real speed ([[The World Map]]); and the bird's-eye view of the side of an island, its nodes marked by kind, where the
player picks one to land at. Its core is pure, in the `overworld` layer, with no page or drawing; the [[Game]] wires
and draws it. The sea's waters with owners, its ships sighted on the horizon and sailing at the helm are the
[[Game]]'s ("At sea"; [[The Sea Is a Patrol Zone, and the Ship Is Gear]], [[The Waters Come From the Islands]],
[[The Sea as Claude Shapes It]]).

## The frame

Metres, x east, y south, z up, as the [[World Map]] has it. A yaw is a compass bearing: 0 looks north (up the map, -y)
and a quarter turn looks east. Positions reach about 4.9 million metres, so every number is a 64-bit float and the
renderer draws relative to the eye.

DFO's frame is y up, with +z north and +x east. Its points come over as (x, -z, y), its ground `heightAt(x, z)` as
`heightAt(x, y)`, and its yaws unchanged, since DFO's yaw is the same compass bearing. A look of yaw and pitch is
(sin yaw cos pitch, -cos yaw cos pitch, sin pitch); the screen's right is (cos yaw, sin yaw, 0).

## The camera

`overworldCamera.ts` is DFO's travel camera. It stands 150 to 450 m over the ship (260 to start), looks 15 to 75
degrees down (52 to start), stays 60 m under a cloud deck's base (never under 40 m), and keeps 25 m over the ground,
the sea, and the far half of its line of sight to the ship. Where ground behind the eye out-climbs every lift, it
looks more steeply instead. The focus eases onto the ship and trails it by at most 60 m; a ship that moves more than
2 km in one frame has jumped and is taken whole. The height eases toward the player's zoom, which a low deck holds
down without losing.

The wheel scales the height by 1.18 a notch, a drag orbits and tilts, and the look keys orbit and tilt at fixed rates.
A press that moves under 6 px is a click (`overworldInput.ts`).

Each frame gives a pose: the eye, its forward, right and up, and a 65-degree vertical field of view. From the air the
lens reaches past 28 km from the ship, or three times the eye's distance when that is farther, and its near plane grows
with that distance (`horizonOf`).

## The pick

A click is a ray from the frame's eye through the pixel. A mark drawn under it wins. Otherwise the ray marches from
where it comes under the land's top (10 km) to the sea's surface, in strides that grow with distance, then bisects
the bracket it first went under in. Ground above 0 is land; the sea is at 0 over the seabed and wherever no land is
known. The result is a mark, a point on land, a point on the sea, or nothing (the sky, or past the reach).

## Sea routes

`seaRoute.ts` plans a voyage on a coarse mask: land wherever a cell holds any land, so a route through water cells
never crosses it. Over a landmass's window the cells are 2 km, from its land grid; over the whole frame they are
8,192 m, 600 by 375 cells, from the coast outlines, where a coast crossing a cell makes it land so a small isle still
counts. A* finds the cheapest chain of water cells. A step within 4 km of land costs up to five times as much, so a
route keeps off the coast where it has room and hugs it where it must. The chain is then pulled straight wherever a
line keeps as far from land as the chain did, never across a land cell's corner.

A goal on land within 10 km of reachable water ends at the water nearest it; farther in, it is refused. A start on
land is handled the same way. A route is also refused off the mask, or when no water joins the two ends.

## Voyages

`voyage.ts` sails a ship along its route. DFO's pace dial, 5, 10, 20, 30, 40, 60 and 100, multiplies a base speed of
12 m/s; a voyage starts at 60 (720 m/s), and the whole dial is open at sea. A ship's place, heading and arrival
follow from how far it has sailed. Its heading is the route's direction over 300 m about it, so it swings through a
corner.

## Marks

`overworldMarks.ts` lays the nodes on the picture: social spaces, patrol areas, missions, dungeons, world bosses,
ports and the Playlist. A mark is 24 m tall with the eye 260 m over it and grows with the eye's height from there, so it reads at one
size from the sea camera and from the bird's-eye view. On the screen it is held between 20 and 96 px. A mark that asks
to be held stays at the picture's edge when off it, with an arrow pointing to it. Marks are laid farthest first, so a
pointer picks the nearest.

Each port city's harbour has a Playlist mark beside its port's (`<city>-playlist`, a list in amber, '☰' drawn in the
game's face), at sea within the port's sight and over the island's side when docking there, open whether or not the
city's social space is. Over the side the view is framed on the nodes alone (`landfallMarks`), so going ashore far from
the harbour never stretches the view to show it. At sea it is laid beside
the port's mark, as far apart as the two are drawn, to its right or, at the picture's right edge, its left, never
thinned away by it, and shown while its port's mark is. Choosing it opens the Playlist screen ([[Interface]], "The Playlist") rather than sailing there
or landing.

A locked node's mark ([[World Map]], "Seen whole, reached by nodes") is grey, with a lock for its glyph and "Locked"
for its distance. A click on it chooses nothing and the view's line says "<name> is locked" (`landingChoice`), so no
landing is ever made there.

## The island's side

`islandView.ts` gives the bird's-eye view. It is due when the ship is within 30 km of a coast. Its nodes are those
within 120 km of the ship on the ship's half of the island, seen from the island's middle, or the three nearest when
none is. The camera looks inland from the ship at their middle, at the sea camera's 52 degrees, from the lowest height
that holds every node within 80% of the picture: 1.5 to 600 km. Mountains under it lift it, or steepen it and it is
framed again from higher up. The view flies in from the sea camera over 2.5 s, its height changing by even ratios so
the climb reads as one steady zoom.

## What a page wires

- **Each frame**: the ship's place, the frame's seconds, the cloud deck's base and the ground (`landHeightAt` over
  the loaded land) into `stepCamera`; `flyRig` for the island's fly-in; `horizonOf` for the lens's planes. The shot
  goes to the renderer; its pose from `poseOf` goes to `pickAt` and to `placeMarks`, which lays the marks' layer.
- **Input**: presses through `pressAt` and `pressMove` (a drag orbits by `dragCamera`), the wheel through
  `wheelNotches` into `zoomCamera`, the look keys into `keyTurn`.
- **A click at sea**: `pickAt`. On the sea, the land or a mark, the ship sails there: `planSeaRoute`, then `voyageOf`;
  each frame `shipAt`. Near a coast, `nearestIsland`, `sideNodes` and `frameSide` frame the island's side, where a
  node's mark is chosen and then clicked again, or Enter pressed, to land there.

## Limits

- A voyage runs in the client. The server does not check it until sailing comes into the rules ([[Agree to the Bit]]).
- The bird's-eye view stands far above any cloud deck; only the sea camera keeps under it.
- The mask is coarse: where a route hugs the coast it can run within a cell of real land.
- The tuning numbers are Claude's choices, set by playing ([[The World as Claude Shapes It]]).
