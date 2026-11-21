//! Where a foe can walk, and the way there. A navmesh is baked once from a course's blocks over its ground (open
//! ground at 0, or any terrain): the course is voxelised, the floor a body fits on is kept, eroded by the body's
//! radius, split into regions, outlined and cut into convex polys; the places a shooter may fire from are found on it,
//! and links laid where the movement rules climb a block's side or drop off its edge. A path is an A* over those polys
//! and links, pulled taut into a few corners. Obstacles laid over the mesh at run time block the
//! polys they touch. Coordinates are the game's: x east, y south, z up, in metres. Every number is a 64-bit float and
//! every sum is taken in a fixed order, so every machine bakes and paths alike.

mod collider;
mod compact;
mod contours;
mod geometry;
mod links;
mod locate;
mod obstacles;
mod path;
mod poly;
mod raster;
mod reach;
mod regions;
mod spots;

pub use collider::{Collider, Ramp, Rise};
pub use links::{LINK_REACH, Link};
pub use obstacles::ObstacleId;
pub use reach::{REACH_LEVEL, Reachable};
pub use spots::Spot;

use locate::{Laid, Mesh};
use movement::{Block, Flat, Heights, TUNING, Terrain};
use obstacles::Obstacles;
use path::{Scratch, Waive};

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

/// Overlook's body: its radius, step and standing height from the movement rules. Cells are DFO's 0.25 m. A
/// voxel is half the step, so a step is two voxels as in DFO, and the welding of corners within two voxels still
/// joins the floors on either side of every step a body climbs.
pub const AGENT: Agent = Agent {
    radius: TUNING.radius,
    height: TUNING.height,
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

/// How far a goal may move before a walker's way is searched afresh, in metres.
const KEEP_WAY: f64 = 1.0;

/// A walker's way over the mesh: the corridor of polys and links its last path ran through, the goal it was found
/// for, the mesh's epoch then, and which of a joined mesh's parts it runs over. A walker keeps one for
/// `find_path_kept`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Way {
    corridor: Vec<usize>,
    goal: [f64; 3],
    epoch: u64,
    part: usize,
}

/// A baked navmesh, with its ground (none for open ground at 0), its firing spots, the obstacles laid over it, and the
/// meshes joined to it: baked apart, with no way between them, each answering for the ground it covers.
#[derive(Clone, Debug, PartialEq)]
pub struct NavMesh {
    min_x: f64,
    min_y: f64,
    cell: f64,
    colliders: Vec<Collider>,
    ground: Option<Heights>,
    mesh: Mesh,
    spots: Vec<Spot>,
    obstacles: Obstacles,
    search: Scratch,
    joined: Vec<NavMesh>,
}

impl NavMesh {
    /// Bakes the walkable surface of a course: its blocks on open ground at 0 across `bounds`. Each block is solid
    /// from its underside to its top, so floors stand over each other: the ground under a deck a body's height or more
    /// up is walked, and so is the deck. The parts of it that no walk joins to the largest are left out.
    #[must_use]
    pub fn bake(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        let colliders: Vec<Collider> = blocks.iter().copied().map(Collider::from).collect();
        Self::bake_colliders(&colliders, bounds, agent)
    }

    /// Bakes the walkable surface of blocks laid over open sea at 0 across `bounds`, as ships' decks are: the sea is
    /// no floor, so the mesh is the blocks' tops alone, and every part of them a body could stand in is kept, since no
    /// ground joins them into one.
    #[must_use]
    pub fn bake_over_sea(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        let colliders: Vec<Collider> = blocks.iter().copied().map(Collider::from).collect();
        Self::baked(&colliders, None, bounds, agent, true)
    }

    /// Bakes a course's blocks standing on a terrain, which may dip below 0, as a seabed does: its height is read at
    /// every cell's centre, and the ground is floor where its slope is within the agent's. A terrain that answers a
    /// height that is not a number is baked as open ground at 0.
    #[must_use]
    pub fn bake_on(blocks: &[Block], ground: &dyn Terrain, bounds: Bounds, agent: &Agent) -> Self {
        let colliders: Vec<Collider> = blocks.iter().copied().map(Collider::from).collect();
        Self::baked(&colliders, raster::sample(ground, bounds, agent), bounds, agent, false)
    }

    /// Bakes from blocks and ramps on open ground at 0.
    #[must_use]
    pub fn bake_colliders(colliders: &[Collider], bounds: Bounds, agent: &Agent) -> Self {
        Self::baked(colliders, None, bounds, agent, false)
    }

    fn baked(colliders: &[Collider], ground: Option<Heights>, bounds: Bounds, agent: &Agent, over_sea: bool) -> Self {
        let floor: &dyn Terrain = match &ground {
            Some(heights) => heights,
            None => &Flat,
        };
        let solid = raster::voxelise(colliders, floor, bounds, agent, !over_sea);
        let mut field = compact::build(&solid, agent);
        let links = links::bake(colliders, floor);
        let joins = links::joins(&field, &links);
        regions::partition(&mut field, &joins, over_sea);
        let spots = spots::bake(&field, colliders, ground.as_ref(), floor, bounds);
        let outlines = contours::build(&field);
        let grid = field.grid;
        let (mut corners, polys) = poly::build(&outlines, grid.cell, grid.voxel);
        // Each corner is lifted onto the true surface nearest its own level, rather than its voxel's rounded top.
        for corner in &mut corners {
            let (x, y) = (grid.min_x + corner.x * grid.cell, grid.min_y + corner.y * grid.cell);
            corner.z = collider::surface_near(colliders, floor, x, y, Some(corner.z));
        }
        let mesh = Mesh::new(corners, polys);
        let obstacles = Obstacles::new(mesh.polys.len());
        let (min_x, min_y, cell) = (grid.min_x, grid.min_y, grid.cell);
        let search = Scratch::default();
        let mut navmesh = Self {
            min_x,
            min_y,
            cell,
            colliders: colliders.to_vec(),
            ground,
            mesh,
            spots,
            obstacles,
            search,
            joined: Vec::new(),
        };
        navmesh.lay(links);
        navmesh
    }

    /// Joins others to this mesh, each baked apart over ground of its own: a path runs within one of them, never from
    /// one to another, and a point is placed on whichever has it nearest.
    pub fn join(&mut self, others: Vec<NavMesh>) {
        for mut other in others {
            let theirs = core::mem::take(&mut other.joined);
            self.joined.push(other);
            self.joined.extend(theirs);
        }
    }

    /// The mesh itself, then each joined to it.
    fn parts(&self) -> impl Iterator<Item = &NavMesh> {
        core::iter::once(self).chain(&self.joined)
    }

    /// The first part both ends stand on, with its place among the parts: the mesh itself when none is joined.
    fn holding(&self, from: [f64; 3], to: [f64; 3]) -> Option<(usize, &NavMesh)> {
        if self.joined.is_empty() {
            return Some((0, self));
        }
        self.parts().enumerate().find(|(_, part)| part.locate(from).is_some() && part.locate(to).is_some())
    }

    /// Lays each link whose ends stand on two polys, each within `REACH_LEVEL` of its floor.
    fn lay(&mut self, links: Vec<Link>) {
        let on_floor = |point: [f64; 3]| {
            let poly = self.locate(point)?;
            let height = self.height_on(Some(poly), point[0], point[1]);
            ((height - point[2]).abs() <= REACH_LEVEL).then_some(poly)
        };
        let laid: Vec<Laid> = links
            .into_iter()
            .filter_map(|link| {
                let (start, end) = (on_floor(link.from)?, on_floor(link.to)?);
                let (from, to) = (self.to_grid(link.from[0], link.from[1]), self.to_grid(link.to[0], link.to[1]));
                (start != end).then_some(Laid { link, start, end, from, to, cost: link.cost / self.cell })
            })
            .collect();
        self.mesh.lay(laid);
    }

    /// The links laid on the mesh, in the bake's order.
    pub fn links(&self) -> impl Iterator<Item = &Link> {
        self.mesh.links.iter().map(|laid| &laid.link)
    }

    /// The link a walker's way crosses from where it stands: one on its corridor whose start is within `LINK_REACH`
    /// of `from` across, and a step of its height.
    #[must_use]
    pub fn crossing(&self, way: &Way, from: [f64; 3]) -> Option<Link> {
        let part = self.parts().nth(way.part)?;
        if !core::ptr::eq(part, self) {
            return part.crossing(&Way { part: 0, ..way.clone() }, from);
        }
        let near = |link: &Link| {
            let (east, south) = (link.from[0] - from[0], link.from[1] - from[1]);
            east * east + south * south <= LINK_REACH * LINK_REACH && (link.from[2] - from[2]).abs() <= TUNING.step
        };
        way.corridor.iter().filter_map(|&node| self.mesh.link_of(node)).map(|laid| laid.link).find(near)
    }

    /// The ground the mesh was baked on.
    fn floor(&self) -> &dyn Terrain {
        match &self.ground {
            Some(heights) => heights,
            None => &Flat,
        }
    }

    /// A path from `from` to `to`: the waypoints from the start to the goal, both included, each on the surface
    /// walked there. None when either end is off the mesh or nothing joins them.
    #[must_use]
    pub fn find_path(&self, from: [f64; 3], to: [f64; 3]) -> Option<Vec<[f64; 3]>> {
        self.holding(from, to)?.1.solve(from, to, None)
    }

    /// A path that walks through one obstacle, a foe's own body.
    #[must_use]
    pub fn find_path_ignoring(&self, from: [f64; 3], to: [f64; 3], ignore: ObstacleId) -> Option<Vec<[f64; 3]>> {
        self.holding(from, to)?.1.solve(from, to, Some(ignore))
    }

    /// How far a path from `from` to `to` walks across the ground, each link counted at its cost rather than its leg
    /// across; none where `find_path` finds no path.
    #[must_use]
    pub fn path_length(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let (_, part) = self.holding(from, to)?;
        if !core::ptr::eq(part, self) {
            return part.path_length(from, to);
        }
        if self.mesh.polys.is_empty() {
            return None;
        }
        let corridor = self.search(self.locate(from)?, self.locate(to)?, None)?;
        let points = self.walk(&corridor, from, to)?;
        let across = |one: [f64; 3], other: [f64; 3]| {
            let (east, south) = (other[0] - one[0], other[1] - one[1]);
            libm::sqrt(east * east + south * south)
        };
        let legs: f64 = points.windows(2).map(|pair| across(pair[0], pair[1])).sum();
        let links = corridor.iter().filter_map(|&node| self.mesh.link_of(node));
        Some(links.fold(legs, |length, laid| length + laid.link.cost - across(laid.link.from, laid.link.to)))
    }

    /// Lays a circle at (x, y) over the mesh that blocks every poly it touches, or moves the one with this id.
    pub fn add_obstacle(&mut self, id: ObstacleId, x: f64, y: f64, radius: f64) {
        let (grid_x, grid_y) = self.to_grid(x, y);
        self.obstacles.add(&self.mesh, id, grid_x, grid_y, radius / self.cell);
        for part in &mut self.joined {
            part.add_obstacle(id, x, y, radius);
        }
    }

    pub fn remove_obstacle(&mut self, id: ObstacleId) {
        self.obstacles.remove(&self.mesh, id);
        for part in &mut self.joined {
            part.remove_obstacle(id);
        }
    }

    /// Goes up by one each time an obstacle is added, moved or removed: a path found at another epoch may run
    /// through one.
    #[must_use]
    pub fn epoch(&self) -> u64 {
        self.parts().map(|part| part.obstacles.epoch).sum()
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
        collider::surface_near(&self.colliders, self.floor(), x, y, poly.map(|poly| self.mesh.levels[poly]))
    }

    /// Locate, A* and funnel.
    fn solve(&self, from: [f64; 3], to: [f64; 3], ignore: Option<ObstacleId>) -> Option<Vec<[f64; 3]>> {
        if self.mesh.polys.is_empty() {
            return None;
        }
        let corridor = self.search(self.locate(from)?, self.locate(to)?, ignore)?;
        self.walk(&corridor, from, to)
    }

    /// The A* corridor between two polys. A start inside an obstacle walks out through it. A goal reachable only
    /// through obstacles is still reached through them: obstacles steer a path, they never sever it.
    fn search(&self, start: usize, goal: usize, ignore: Option<ObstacleId>) -> Option<Vec<usize>> {
        let has_obstacles = !self.obstacles.is_empty();
        let waive = match ignore {
            Some(id) => Waive::One(id),
            None if has_obstacles => self.obstacles.blocked[start].map_or(Waive::None, Waive::One),
            None => Waive::None,
        };
        let mut search = self.search.borrow();
        let corridor = path::corridor(&self.mesh, &self.obstacles, &mut search, (start, goal), waive);
        if corridor.is_none() && has_obstacles && ignore.is_none() {
            return path::corridor(&self.mesh, &self.obstacles, &mut search, (start, goal), Waive::All);
        }
        corridor
    }

    /// The line from one point to another pulled taut through a corridor, each corner on the surface walked there: a
    /// link's start and end stand in it, and the line is pulled taut on either side of each.
    fn walk(&self, corridor: &[usize], from: [f64; 3], to: [f64; 3]) -> Option<Vec<[f64; 3]>> {
        let mut points = Vec::new();
        let (mut start, mut first) = (from, 0);
        for (at, &node) in corridor.iter().enumerate() {
            if let Some(laid) = self.mesh.link_of(node) {
                points.extend(self.taut(&corridor[first..at], start, laid.link.from)?);
                (start, first) = (laid.link.to, at + 1);
            }
        }
        points.extend(self.taut(&corridor[first..], start, to)?);
        Some(points)
    }

    /// The line pulled taut through a run of polys a walk joins, each corner on the poly under it nearest the last
    /// corner's level, as a run may pass under a deck it later climbs onto.
    fn taut(&self, polys: &[usize], from: [f64; 3], to: [f64; 3]) -> Option<Vec<[f64; 3]>> {
        let portals = path::portals(&self.mesh, polys, self.to_grid(from[0], from[1]), self.to_grid(to[0], to[1]))?;
        let mut level = from[2];
        let points = path::funnel(&portals)
            .into_iter()
            .map(|grid| {
                let poly = self.mesh.scan(grid.0, grid.1, polys, Some(level));
                let (x, y) = self.to_world(grid);
                level = self.height_on(poly, x, y);
                [x, y, level]
            })
            .collect();
        Some(points)
    }

    /// A path as `find_path` finds it, kept in a walker's way: while the goal stays within a metre of the one the
    /// way was found for and no obstacle has changed, the corridor is walked again from the poly the start stands
    /// on, as far as the goal's, or one step on to it. Anything else searches afresh.
    #[must_use]
    pub fn find_path_kept(&self, way: &mut Way, from: [f64; 3], to: [f64; 3]) -> Option<Vec<[f64; 3]>> {
        let (place, part) = self.holding(from, to)?;
        if place != 0 {
            let mut kept = if way.part == place { Way { part: 0, ..core::mem::take(way) } } else { Way::default() };
            let points = part.find_path_kept(&mut kept, from, to);
            *way = Way { part: place, ..kept };
            return points;
        }
        if way.part != 0 {
            *way = Way::default();
        }
        if self.mesh.polys.is_empty() {
            return None;
        }
        let (start, goal) = (self.locate(from)?, self.locate(to)?);
        if let Some(corridor) = self.kept(way, start, goal, to) {
            return self.walk(corridor, from, to);
        }
        let corridor = self.search(start, goal, None)?;
        let points = self.walk(&corridor, from, to);
        *way = Way { corridor, goal: to, epoch: self.epoch(), part: 0 };
        points
    }

    /// The part of a way's corridor from the start's poly to the goal's, if the way still serves.
    fn kept<'way>(&self, way: &'way mut Way, start: usize, goal: usize, to: [f64; 3]) -> Option<&'way [usize]> {
        let moved = (0..3).map(|axis| (to[axis] - way.goal[axis]) * (to[axis] - way.goal[axis])).sum::<f64>();
        if way.epoch != self.epoch() || moved > KEEP_WAY * KEEP_WAY {
            return None;
        }
        let first = way.corridor.iter().position(|&poly| poly == start)?;
        let last = *way.corridor.last()?;
        if !way.corridor.contains(&goal) && self.mesh.polys[last].neighbours.contains(&Some(goal)) {
            way.corridor.push(goal);
        }
        let end = first + way.corridor[first..].iter().position(|&poly| poly == goal)?;
        Some(&way.corridor[first..=end])
    }
}
