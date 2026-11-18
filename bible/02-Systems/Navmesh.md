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
---
# Navmesh

Where a foe can walk, and the way there. A room bakes its course into a navmesh once, when it starts; foes then ask
it for paths, many times a second. It is DFO's own navmesh, Recast and Detour in spirit, in Rust, with the same
steps and numbers. Each room bakes one over its course and 30 m of open ground about it, and its [[Foes]] find
their way by it.

## How it works

**The bake** turns a course into convex polys, in six steps:

1. **Voxels.** The ground at 0 m across the room's bounds, and every block (or ramp) standing on it, is cut into
   columns of 0.25 m cells. Each column holds its solid spans, in voxels of 0.25 m up. A block marks every cell its
   footprint touches, so a thin wall never leaks. A block whose underside is a body's height (1.8 m) or more over
   the ground is overhead, a bridge or an upper floor a foe walks under, and is left out; any lower block is solid
   from the ground up ([[Movement]]).
2. **Walkable floor.** The top of each solid span is floor where a body has 1.8 m of headroom and the slope is
   0.7 or less. Floor links to the floor beside it within a step (0.5 m, two voxels). The floor is then eroded by
   the body's radius (0.35 m), so a path's centre keeps clear of every wall and drop.
3. **Regions.** A watershed over each cell's distance from the floor's edge splits the floor into rooms and runs
   of corridor. Slivers under 2 m² join their largest neighbour. Only the largest part a walk joins is kept: a
   block's top that no step reaches is dropped.
4. **Outlines.** Each region's edge is traced around its cells and simplified to within half a cell, keeping every
   corner where the region across changes. A region round a pillar has an inner outline, a hole.
5. **Polys.** Each outline, its holes bridged in, is cut into triangles, sliced on one lattice across the room so
   no poly is larger than 12 m², and merged into convex polys of up to six corners. Polys that share an edge are
   neighbours, across regions too.
6. **Heights.** Each corner is set on the surface nearest its own level.

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

## Agreement

Every number is a 64-bit float, sums run in a fixed order, and lengths come from `libm`, so the server and every
browser bake the same mesh and find the same paths ([[Agree to the Bit]]). A test pins one path
over the [[Test Ground]]'s course by its fingerprint.

## Limits

- Courses are blocks and ramps on open ground at 0 m; the [[Land]] is not baked yet.
- An overhead block is left out whole, so a foe walks under an upper floor but never paths onto it.
- A path's corners can sit a little off the shortest way where the lattice cuts a poly thin.
- The nearest point does not check a line of sight, so behind a thin wall it may answer the far side.
- The grid's cells stay 0.25 m however large the room: a large open field bakes slowly. The [[Test Ground]]'s
  course bakes in 0.3 to 0.7 s (tested offline, in Node's WebAssembly), once as its room opens.
