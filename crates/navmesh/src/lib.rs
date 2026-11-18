//! Where a foe can walk, and the way there. A navmesh is baked once from a course's blocks over open ground: the
//! course is voxelised, the floor a body fits on is kept, eroded by the body's radius, split into regions, outlined
//! and cut into convex polys. A path is an A* over those polys, pulled taut into a few corners. Obstacles laid over
//! the mesh at run time block the polys they touch. Coordinates are the game's: x east, y south, z up, in metres.
//! Every number is a 64-bit float and every sum is taken in a fixed order, so every machine bakes and paths alike.

mod collider;
mod compact;
mod contours;
mod geometry;
mod locate;
mod obstacles;
mod path;
mod poly;
mod raster;
mod reach;
mod regions;

pub use collider::{Collider, Ramp, Rise};
pub use obstacles::ObstacleId;
pub use reach::{REACH_LEVEL, Reachable};

use locate::Mesh;
use movement::{Block, TUNING};
use obstacles::Obstacles;
use path::Waive;

/// The body a navmesh is baked for, and the voxels it is baked at, in metres.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Agent {
    /// The body's radius: the walkable surface keeps this far from walls.
    pub radius: f64,
    /// The headroom a body needs to stand.
    pub height: f64,
    /// The highest step a body walks up.
    pub climb: f64,
    /// The steepest slope walked, rise over run.
    pub max_slope: f64,
    /// The grid's cell, across.
    pub cell_size: f64,
    /// The grid's voxel, up.
    pub cell_height: f64,
}

/// Overlook's body: its radius and step from the movement rules, standing about 1.8 m. Cells are DFO's 0.25 m. A
/// voxel is half the step, so a step is two voxels as in DFO, and the welding of corners within two voxels still
/// joins the floors on either side of every step a body climbs.
pub const AGENT: Agent = Agent {
    radius: TUNING.radius,
    height: 1.8,
    climb: TUNING.step,
    max_slope: 0.7,
    cell_size: 0.25,
    cell_height: TUNING.step / 2.0,
};

/// The open ground a navmesh covers, in metres: x east, y south.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bounds {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

/// A baked navmesh, with the obstacles laid over it.
#[derive(Clone, Debug, PartialEq)]
pub struct NavMesh {
    min_x: f64,
    min_y: f64,
    cell: f64,
    colliders: Vec<Collider>,
    mesh: Mesh,
    obstacles: Obstacles,
}

impl NavMesh {
    /// Bakes the walkable surface of a course: its blocks standing on open ground at 0 across `bounds`. The parts
    /// of it that no walk joins to the largest are left out.
    #[must_use]
    pub fn bake(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        let colliders: Vec<Collider> = blocks.iter().copied().map(Collider::from).collect();
        Self::bake_colliders(&colliders, bounds, agent)
    }

    /// Bakes from blocks and ramps.
    #[must_use]
    pub fn bake_colliders(colliders: &[Collider], bounds: Bounds, agent: &Agent) -> Self {
        let solid = raster::voxelise(colliders, bounds, agent);
        let mut field = compact::build(&solid, agent);
        regions::partition(&mut field);
        let outlines = contours::build(&field);
        let grid = field.grid;
        let (mut corners, polys) = poly::build(&outlines, grid.cell, grid.voxel);
        // Each corner is lifted onto the true surface nearest its own level, rather than its voxel's rounded top.
        for corner in &mut corners {
            let (x, y) = (grid.min_x + corner.x * grid.cell, grid.min_y + corner.y * grid.cell);
            corner.z = collider::surface_near(colliders, x, y, Some(corner.z));
        }
        let mesh = Mesh::new(corners, polys);
        let obstacles = Obstacles::new(mesh.polys.len());
        Self { min_x: grid.min_x, min_y: grid.min_y, cell: grid.cell, colliders: colliders.to_vec(), mesh, obstacles }
    }

    /// A path from `from` to `to`: the waypoints from the start to the goal, both included, each on the surface
    /// walked there. None when either end is off the mesh or nothing joins them.
    #[must_use]
    pub fn find_path(&self, from: [f64; 3], to: [f64; 3]) -> Option<Vec<[f64; 3]>> {
        self.solve(from, to, None)
    }

    /// A path that walks through one obstacle, a foe's own body.
    #[must_use]
    pub fn find_path_ignoring(&self, from: [f64; 3], to: [f64; 3], ignore: ObstacleId) -> Option<Vec<[f64; 3]>> {
        self.solve(from, to, Some(ignore))
    }

    /// Lays a circle at (x, y) over the mesh that blocks every poly it touches, or moves the one with this id.
    pub fn add_obstacle(&mut self, id: ObstacleId, x: f64, y: f64, radius: f64) {
        let (grid_x, grid_y) = self.to_grid(x, y);
        self.obstacles.add(&self.mesh, id, grid_x, grid_y, radius / self.cell);
    }

    pub fn remove_obstacle(&mut self, id: ObstacleId) {
        self.obstacles.remove(&self.mesh, id);
    }

    /// Goes up by one each time an obstacle is added, moved or removed: a path found at another epoch may run
    /// through one.
    #[must_use]
    pub fn epoch(&self) -> u64 {
        self.obstacles.epoch
    }

    fn to_grid(&self, x: f64, y: f64) -> (f64, f64) {
        ((x - self.min_x) / self.cell, (y - self.min_y) / self.cell)
    }

    fn to_world(&self, grid: (f64, f64)) -> (f64, f64) {
        (self.min_x + grid.0 * self.cell, self.min_y + grid.1 * self.cell)
    }

    /// The poly a world point stands on, its height choosing among floors over each other.
    fn locate(&self, point: [f64; 3]) -> Option<usize> {
        let (x, y) = self.to_grid(point[0], point[1]);
        self.mesh.locate(x, y, Some(point[2]))
    }

    /// The height of the surface at (x, y) on a poly's level; the tallest top there with no poly.
    fn height_on(&self, poly: Option<usize>, x: f64, y: f64) -> f64 {
        collider::surface_near(&self.colliders, x, y, poly.map(|poly| self.mesh.levels[poly]))
    }

    /// Locate, A* and funnel. A start inside an obstacle walks out through it. A goal reachable only through
    /// obstacles is still reached through them: obstacles steer a path, they never sever it.
    fn solve(&self, from: [f64; 3], to: [f64; 3], ignore: Option<ObstacleId>) -> Option<Vec<[f64; 3]>> {
        if self.mesh.polys.is_empty() {
            return None;
        }
        let start = self.locate(from)?;
        let goal = self.locate(to)?;
        let has_obstacles = !self.obstacles.is_empty();
        let waive = match ignore {
            Some(id) => Waive::One(id),
            None if has_obstacles => self.obstacles.blocked[start].map_or(Waive::None, Waive::One),
            None => Waive::None,
        };
        let mut corridor = path::corridor(&self.mesh, &self.obstacles, start, goal, waive);
        if corridor.is_none() && has_obstacles && ignore.is_none() {
            corridor = path::corridor(&self.mesh, &self.obstacles, start, goal, Waive::All);
        }
        let corridor = corridor?;
        let portals = path::portals(&self.mesh, &corridor, self.to_grid(from[0], from[1]), self.to_grid(to[0], to[1]))?;
        let points = path::funnel(&portals)
            .into_iter()
            .map(|grid| {
                let poly = self.mesh.scan(grid.0, grid.1, corridor.iter().copied(), None);
                let (x, y) = self.to_world(grid);
                [x, y, self.height_on(poly, x, y)]
            })
            .collect();
        Some(points)
    }
}
