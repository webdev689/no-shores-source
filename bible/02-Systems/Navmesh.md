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
  - crates/navmesh/src/contours.rs#build
  - crates/navmesh/src/poly.rs#build
  - crates/navmesh/src/locate.rs#Mesh
  - crates/navmesh/src/path.rs#funnel
  - crates/navmesh/src/obstacles.rs#Obstacles
  - crates/navmesh/src/reach.rs#Reachable
  - crates/navmesh/src/raster.rs#sample
  - crates/navmesh/src/spots.rs#Spot
  - crates/navmesh/src/spots.rs#bake
  - crates/room/src/foes.rs#MeshSpots
---
# Navmesh

Where a foe can walk, and the way there. A room bakes its course into a navmesh once, when it starts; foes then ask
it for paths, many times a second. It is DFO's own navmesh, Recast and Detour in spirit, in Rust, with the same
steps and numbers, which were project-final's ([[Pick - project-final AI]]). Each room bakes one over its course and
30 m of ground about it, on its own land where it has some, and its [[Foes]] find their way and their firing spots
by it.

## How it works

**The bake** turns a course into convex polys, in six steps:

1. **Voxels.** The ground across the room's bounds, and every block (or ramp) standing on it, is cut into columns of
   0.25 m cells. The ground is the room's own terrain, read at each cell's centre (open ground stands at 0 m); the
   voxels start one below its lowest point, which may be a seabed under 0, and reach over its highest. Each column
   holds its solid spans, in voxels of 0.25 m up, the ground's reaching up to its height there. A block stands solid
   from the ground beneath it; a top below the ground is buried. A block marks every cell its footprint touches, so a
   thin wall never leaks.
2. **Walkable floor.** The top of each solid span is floor where a body has 1.8 m of headroom and the slope (on the
   ground, measured from the cells either side) is 0.7 or less. Floor links to the floor beside it within a step
   (0.5 m, two voxels). The floor is then eroded by the body's radius (0.35 m), so a path's centre keeps clear of
   every wall and drop.
3. **Regions.** A watershed over each cell's distance from the floor's edge splits the floor into rooms and runs
   of corridor. Slivers under 2 m² join their largest neighbour. Only the largest part a walk joins is kept: a
   block's top that no step reaches is dropped.
4. **Outlines.** Each region's edge is traced around its cells and simplified to within half a cell, keeping every
   corner where the region across changes. A region round a pillar has an inner outline, a hole.
5. **Polys.** Each outline, its holes bridged in, is cut into triangles, sliced on one lattice across the room so
   no poly is larger than 12 m², and merged into convex polys of up to six corners. Polys that share an edge are
   neighbours, across regions too.
6. **Heights.** Each corner is set on the surface nearest its own level: a block's top, or the ground, blended
   between cell centres.

**A path** finds the poly under each end (by its height, where floors stand over each other, or the nearest within
0.5 m), runs A* across the polys' neighbours, and pulls the line taut through the shared edges (the funnel). Its
waypoints run from the start to the goal, both included, each on the surface walked there. There is no path when an
end is off the mesh or nothing joins them.

**Obstacles** are circles laid over the mesh while a room runs, such as a big foe's body. Each blocks every poly it
touches. A path goes round them where it can, and through them where it must: they steer a path, they never sever
it. A foe asking for a path walks through its own obstacle, and a foe standing in one walks out. Each change bumps
the mesh's epoch, so a foe knows its path may be stale.

**What a walk reaches** floods the polys joined to a start once, then answers for any point: on one of them, and
within 1 m of its surface. **The nearest point** answers where a path to a body off the mesh should end: the point
itself on the mesh, else the nearest point of a poly on its level within 1.5 m, else within 4 m.

**Firing spots** are baked with the mesh, for shooters to fight from ([[Foes]]). On a lattice of 1.6 m over the
walkable surface, each point is probed along 16 bearings (each a sixteenth of a turn, clockwise from north) at an eye
1.6 m over the surface: covered from a bearing where something taller than the eye stands within 2.4 m, an open lane
down it where it is clear for 14 m inside the bounds (their edge shuts a lane and gives no cover). A spot with
neither is dropped. The room answers the spots within a radius of a point, in the bake's order: rows from the north,
each from the west, lower floors first. They add about 15 ms to a bake.

## Agreement

Every number is a 64-bit float, sums run in a fixed order, and lengths come from `libm`, so the server and every
browser bake the same mesh and find the same paths ([[Agree to the Bit]]). A test pins one path
over the [[Test Ground]]'s course by its fingerprint.

## Limits

- A node's room bakes the 60 m square about its first spawn on its [[Land]], without the city's blocks.
- Ramps stand from their lower end, not on the ground beneath them; a firing spot's probes see blocks and ramps
  only, never the ground's own rises.
- A path's corners can sit a little off the shortest way where the lattice cuts a poly thin.
- The nearest point does not check a line of sight, so behind a thin wall it may answer the far side.
- The grid's cells stay 0.25 m however large the room: a large open field bakes slowly. The [[Test Ground]]'s
  course bakes in about 0.26 to 0.7 s (tested offline, in Node's WebAssembly), once as its room opens.
