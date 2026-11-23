---
type: system
status: live
code:
  - crates/navmesh/src/lib.rs#NavMesh
  - crates/navmesh/src/lib.rs#AGENT
  - crates/navmesh/src/lib.rs#Bounds
  - crates/navmesh/src/collider.rs#Collider
  - crates/navmesh/src/raster.rs#voxelise
  - crates/navmesh/src/compact.rs#build
  - crates/navmesh/src/regions.rs#partition
  - crates/navmesh/src/lib.rs#bake_anchored
  - crates/room/src/dungeon_room.rs#baked
  - crates/navmesh/src/contours.rs#build
  - crates/navmesh/src/poly.rs#build
  - crates/navmesh/src/locate.rs#Mesh
  - crates/navmesh/src/path.rs#funnel
  - crates/navmesh/src/lib.rs#Way
  - crates/navmesh/src/obstacles.rs#Obstacles
  - crates/navmesh/src/reach.rs#Reachable
  - crates/navmesh/src/raster.rs#sample
  - crates/navmesh/src/spots.rs#Spot
  - crates/navmesh/src/spots.rs#bake
  - crates/navmesh/src/links.rs#Link
  - crates/navmesh/src/links.rs#bake
  - crates/navmesh/src/lib.rs#crossing
  - crates/navmesh/src/lib.rs#path_length
  - crates/room/src/foes.rs#MeshSpots
  - crates/room/src/foes.rs#MeshRoutes
  - crates/room/src/routes.rs#think_foes
  - crates/room/src/routes.rs#mesh_index
  - crates/room/src/garrison.rs#square
---
# Navmesh

Where a foe can walk, and the way there. A room bakes its course into a navmesh once, when it starts; foes then ask
it for paths, many times a second. It is DFO's own navmesh, Recast and Detour in spirit, in Rust, with the same
steps and numbers, which were project-final's ([[Pick - project-final AI]]). A course's room bakes one over its
course and 30 m of ground about it (a course laid over open sea, its blocks' tops alone); a node's room over a 70 m
square of its own land by its first spawn, where its garrison stands ([[Enemies]]), and one more 70 m square round each
place a house's road stands a group at ([[Quests]]), each among the boxes of its layout inside it, which its node file
holds; a dungeon's room over the whole dungeon ([[Dungeons]]). Each foe finds its way on the mesh that holds its post,
or with none the one whose square holds where it stands, and on the node's own otherwise. Its [[Foes]] find their way
and their firing spots by it, and climb and drop where its links say.

## How it works

**The bake** turns a course into convex polys, in six steps:

1. **Voxels.** The ground across the room's bounds, and every block (or ramp) standing on it, is cut into columns of
   0.25 m cells. The ground is the room's own terrain, read at each cell's centre (open ground stands at 0 m); the
   voxels start one below its lowest point, which may be a seabed under 0, and reach over its highest. Each column
   holds its solid spans, in voxels of 0.25 m up, the ground's reaching up to its height there. A block is solid
   from its underside to its top, on open ground as on a terrain, or from the ground where its underside is lower; a
   ramp stands solid from the ground beneath it; a top below the ground is buried. An underside over the ground rounds
   up to its voxel, so a body fits under one at its own height (1.8 m), as it moves under it ([[Movement]]). So the
   space under a roof, a deck, a lintel or a bridge stays open. Each marks every cell its footprint touches, so a thin
   wall never leaks.
2. **Walkable floor.** The top of each solid span is floor where a body has 1.8 m of headroom and the slope (on the
   ground, measured from the cells either side) is 0.7 or less: the ground under a roof and a deck's top over it
   alike, so floors stand over each other, joined by stairs and ramps. Floor links to the floor beside it within a step
   (0.5 m, two voxels). The floor is then eroded by the body's radius (0.35 m), so a path's centre keeps clear of
   every wall and drop.
3. **Regions.** A watershed over each cell's distance from the floor's edge splits the floor into rooms and runs
   of corridor. Slivers under 2 m² join their largest neighbour. Only the largest part a walk or a link joins is
   kept: a block's top that neither a step nor a link reaches is dropped. Over open sea (`bake_over_sea`) the water is
   no floor, so no ground joins the blocks' tops: every part of 4 m² or more is kept, as a ship's decks are. An
   anchored bake keeps instead the part joined to the floor nearest a point it is given, the way in of a dungeon, whose
   rock stands as walls 10 m tall ([[Movement]]'s grid of heights) with flat tops larger than its floor. A dungeon
   bakes in cells of 0.4 m, an eighth of its own, so every wall of it lies on a cell's edge and the bake holds a third
   of the columns 0.25 m would; its jambs, pillars and solids are the bake's colliders, and an Elite Dungeon's Ascents'
   pads with them, so no foe paths onto a pad.
4. **Outlines.** Each region's edge is traced around its cells and simplified to within half a cell, keeping every
   corner where the region across changes. A region round a pillar has an inner outline, a hole.
5. **Polys.** Each outline, its holes bridged in, is cut into triangles, sliced on one lattice across the room so
   no poly is larger than 12 m², and merged, the longest shared edge first, into convex polys of up to six corners.
   Polys that share an edge are neighbours, across regions too.
6. **Heights.** Each corner is set on the surface nearest its own level: a block's top, or the ground where no block
   stands on it, blended between cell centres.

**Links** join two floors that no step joins, where the [[Movement]] rules carry a body between them. Along every side
of every block, a metre apart and no nearer its ends than 0.5 m, the bake stands a body by the side and steps it by the
rules themselves, with the controls a foe crosses with: walked square into the side with jump pressed (a vault, a
mantle, or a jump that catches the lip and mantles) and with none (a climb up a wall too high to grab), and walked off
the top's edge (a drop). A link is laid where the rules set the body down steady on a floor of the mesh, from where a
walker starting across stands nearest the side and from a run's tick (about 0.13 m) farther off, within two seconds
and the time a climb takes up the whole rise. It goes up or down any height the rules allow: they have no fall damage.
It costs the metres a walk covers in the time crossing took: a mantle onto the Test Ground's crate 2.4 m, a catch and
mantle onto its ledge 3.6 m, the climb of its tall wall 12.9 m, a drop off that wall 2.9 m. The regions keep the floors
it joins (step 3). Ramps are not blocks the rules know: no link is tried over one.

**A path** finds the poly under each end (by its height, where floors stand over each other, or the nearest within
0.5 m), runs A* across the polys' neighbours and the links leaving them, each link at its cost, and pulls the line taut
through the shared edges (the funnel), on either side of each link. A walker standing on a shared edge is already
through it: the funnel opens past it, never back to the edge's far end. Its waypoints run from the start to the goal,
both included, each on the surface walked there, on the poly nearest the level of the waypoint before it, so a path
that runs under a bridge and climbs onto it ends on its deck; a link's start and end stand in it, one after the other. There is no
path when an end is off the mesh or nothing joins them. The bake numbers the islands of polys a walk or a link joins, so
a goal on another island has no path without a search. A path's length, as a foe weighs a walk, counts each link at its
cost rather than its leg across. The search keeps its buffers from one path to the next, so a path costs the polys it
visits, not the whole mesh.

**Obstacles** are circles that can be laid over the mesh, such as a big foe's body; no room lays any yet, so they are
held by the crate's own tests alone. Each blocks every poly it touches. A path goes round them where it can, and through
them where it must: they steer a path, they never sever it. A foe asking for a path walks through its own obstacle, and
a foe standing in one walks out. Each change bumps the mesh's epoch, so a foe knows its path may be stale.

**What a walk reaches** floods the polys joined to a start once, across shared edges and along links, then answers for
any point: on one of them, and within 1 m of its surface. No room asks it, so it too is held by the crate's own tests
alone.

**The nearest point** answers where a path to a body off the mesh should end: the point itself on the mesh, else the
nearest point of a poly on its level within 1.5 m, else within 4 m. It reads only the polys filed near the point.

**A foe's way** is the room's ([[Foes]]). A foe walks for the first corner of its path farther off than a tick's run
(about 0.13 m), so a corner underfoot never holds it against a block's corner, heading for a goal behind the block.
Each foe keeps its way, the corridor of polys its last path ran through, and walks it again while its goal stays
within 1 m of the one it was found for and no obstacle changes, as long as the foe stands on the corridor and the goal
on its last poly or one beside it. A goal off the mesh is placed on it once a tick, however many foes walk for it: at
its nearest point, or, for a goal high on a block's top with no floor near its level, at the point nearest the ground
beneath it, so a foe goes round to the block's foot rather than walk into its side. A foe that stands as near a goal
off the mesh as the mesh reaches walks on to it straight, so a player past the mesh's edge is followed there. A foe
within a run's tick of the start of a link its way crosses is pointed a metre on along the link's bearing, square to
the block's side and exactly along its axis, and told whether to press jump ([[Foes]]): walked slantwise into a side, a
body slides along it rather than climb. A foe's own step that would walk it off an edge more than a step high is
refused.

**Firing spots** are baked with the mesh, for shooters to fight from ([[Foes]]). On a lattice of 1.6 m over the
walkable surface, each point is probed along 16 bearings (each a sixteenth of a turn, clockwise from north) at an eye
1.6 m over the surface: covered from a bearing where something taller than the eye, its underside below it, stands
within 2.4 m, an open lane
down it where it is clear for 14 m inside the bounds (their edge shuts a lane and gives no cover). What stands in the
way is a block, a ramp, or the ground's own rise, read every 0.125 m along the line. A spot with neither is dropped.
The room answers the spots within a radius of a point, in the bake's order: rows from the north, each from the west,
lower floors first. The course is filed on a 2 m grid for the probes, so each reads only what its line crosses; the
spots add a few milliseconds to a bake.

## Agreement

Every number is a 64-bit float, sums run in a fixed order, and lengths come from `libm`, so the server and every
browser bake the same mesh and find the same paths ([[Agree to the Bit]]). A test pins one path
over the [[Test Ground]]'s course by its fingerprint. A run on that course, a player up its ledge and a swordsman
climbing after them, is fingerprinted natively (`crates/room-wasm/src/climb_door_tests.rs`) and through WebAssembly
(`server/climb.test.ts`), and both hold the same value.

## Limits

- A node's room bakes a 70 m square of its [[Land]] (its first spawn 15 m inside the edge toward the middle of its
  section), and a 70 m square round each place a kill goal stands a group at, each with only the boxes that reach into
  it. Elsewhere a node has no mesh, so a foe leashed there gives up a fight with one more than 14 m from it ([[A Foe Gives Up Only When the Player Is Far Away]]). Each place's square (a kill group's, a defence's, a puzzle's, an unseen step's watch, an escort's ambush) is baked the first time it is needed and kept, one in a tick at most (130 to 245 ms that tick natively), a step waiting a tick for its own; where the node's own square holds all the step stands things in, it is used instead. WebAssembly's cost is unmeasured. A larger square would hold more of a node, at a bake's cost.
  A zone that holds public events also bakes a rectangle round each of its grounds and joins it to the node's square as
  a part of one mesh: a path runs within one part, never from one to another, and a point is placed on whichever part
  has it nearest ([[Public Events]], with what it adds to the room's open).
- An underside between 1.75 and 1.8 m over a floor rounds up to 2 m, so the mesh may run a path under it that a body
  stoops for; within a voxel.
- A path's corners can sit a little off the shortest way where the lattice cuts a poly thin.
- The nearest point does not check a line of sight, so behind a thin wall it may answer the far side.
- The grid's cells stay 0.25 m however large the room, so a bake's time and memory grow with its area. Tested
  offline, natively and in Node's WebAssembly: the [[Test Ground]]'s course, its 115 links among it, bakes in about
  90 and 100 ms, its links some 6 ms of that natively; a node's 70 m square in 85 to 95 ms natively, and 115 ms in
  WebAssembly; an open field 200 m across in about 0.9 and 1.2 s, needing some 170 MB while it bakes.
- A node's room bakes none of its city's blocks, so its foes neither climb nor drop there; its layout's boxes inside
  its square it does, links and all. Its links' tries step bodies through the movement rules' grid of blocks. On the
  Saltgrass Downs, its square moved to where its boxes stand thickest (406 of them), the room opens natively in about
  130 ms bare and 205 ms among its boxes (`cargo test --release -p room --test near_blocks -- --ignored --nocapture`,
  tested offline on an idle machine).
- A link is tried only from the highest floor beside a block's side, and off a block's top only where nothing stands
  over its edge. So a floor under a deck or a roof gets no link onto a block beside it, and its foes go round.
- A link crosses one side. A wall too thin to stand on is crossed only where it is vaulted (1.2 m high and 0.8 m
  deep at most); a taller thin wall is gone round. A ledge too narrow for the erosion to leave floor is not climbed.
- The regions keep the floors a link joins either way, so a floor reached only by a drop is kept though no walk
  leaves it.
- A foe's dodge, or a charge or a leap, is the fight's own move, not a step: it may carry the foe off an edge.
