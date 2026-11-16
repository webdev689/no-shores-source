//! What a walk reaches: the floor joined to a start, flooded once and then asked of any number of points; and the
//! nearest point of the mesh to a body standing off it.

use crate::NavMesh;

/// How far a point may stand above or below the floor it is located onto and still be on it (m): a point whose own
/// floor never made the mesh is not taken for the one under or over it.
pub const REACH_LEVEL: f64 = 1.0;
/// How far from a poly, across, a body still stands on it (m): the margin the erosion trims by a wall.
const ISLAND_REACH: f64 = 1.5;
/// Off every poly, the farthest a body is from the mesh's edge and still walked to (m).
const GOAL_REACH: f64 = 4.0;
/// A poly is on a body's level when the body's feet are within this of its corners' heights (m).
const LEVEL_SPAN: f64 = 0.9;

/// The polys a walk reaches from a start: its own, and every one joined to it across a shared edge.
#[derive(Clone, Debug)]
pub struct Reachable<'mesh> {
    navmesh: &'mesh NavMesh,
    reached: Vec<bool>,
}

impl Reachable<'_> {
    /// Whether a point stands on the reached floor: located as a path's ends are, on a reached poly, and within
    /// `REACH_LEVEL` of the surface under it on that poly's level.
    #[must_use]
    pub fn contains(&self, point: [f64; 3]) -> bool {
        let Some(poly) = self.navmesh.locate(point) else { return false };
        if !self.reached[poly] {
            return false;
        }
        let height = self.navmesh.height_on(Some(poly), point[0], point[1]);
        height.is_finite() && (height - point[2]).abs() <= REACH_LEVEL
    }
}

/// The nearest point of a convex poly to (x, y), across: the point itself inside, else the nearest on its rim; and
/// how far that is.
fn nearest_in(rim: &[(f64, f64)], x: f64, y: f64) -> (f64, f64, f64) {
    let (mut left, mut right) = (0, 0);
    let mut best = (x, y);
    let mut best_dist = f64::INFINITY;
    for at in 0..rim.len() {
        let (a, b) = (rim[at], rim[(at + 1) % rim.len()]);
        let (ex, ey) = (b.0 - a.0, b.1 - a.1);
        let cross = ex * (y - a.1) - (x - a.0) * ey;
        if cross > 1e-9 {
            left += 1;
        } else if cross < -1e-9 {
            right += 1;
        }
        let length_sq = ex * ex + ey * ey;
        let t = if length_sq > 0.0 { ((x - a.0) * ex + (y - a.1) * ey) / length_sq } else { 0.0 };
        let t = t.clamp(0.0, 1.0);
        let (near_x, near_y) = (a.0 + t * ex, a.1 + t * ey);
        let dist = libm::hypot(x - near_x, y - near_y);
        if dist < best_dist {
            best_dist = dist;
            best = (near_x, near_y);
        }
    }
    if left == 0 || right == 0 { (x, y, 0.0) } else { (best.0, best.1, best_dist) }
}

impl NavMesh {
    /// The floor a walk reaches from `start`; none when `start` stands on no poly. Obstacles are not walls to it.
    #[must_use]
    pub fn reachable_from(&self, start: [f64; 3]) -> Option<Reachable<'_>> {
        let first = self.locate(start)?;
        let mut reached = vec![false; self.mesh.polys.len()];
        reached[first] = true;
        let mut stack = vec![first];
        while let Some(poly) = stack.pop() {
            for &next in self.mesh.polys[poly].neighbours.iter().flatten() {
                if !reached[next] {
                    reached[next] = true;
                    stack.push(next);
                }
            }
        }
        Some(Reachable { navmesh: self, reached })
    }

    /// The point of the mesh nearest a body's feet, on its level: the point itself when it stands on a poly, else
    /// the nearest within 1.5 m across, else within 4 m; none further off, or on no level the mesh has. A path to a
    /// goal the mesh cannot place ends here, and the last leg is walked straight.
    // shortcut: no line of sight is checked, so a point behind a wall thinner than the reach may answer the far
    // side; add a ray against the colliders when a course has such walls.
    #[must_use]
    pub fn nearest_point(&self, point: [f64; 3]) -> Option<[f64; 3]> {
        self.mesh_point_near(point, ISLAND_REACH).or_else(|| self.mesh_point_near(point, GOAL_REACH))
    }

    fn mesh_point_near(&self, feet: [f64; 3], reach: f64) -> Option<[f64; 3]> {
        let mut best: Option<(f64, [f64; 3])> = None;
        for poly in &self.mesh.polys {
            let heights = poly.corners.iter().map(|&corner| self.mesh.corners[corner].z);
            let low = heights.clone().fold(f64::INFINITY, f64::min);
            let high = heights.fold(f64::NEG_INFINITY, f64::max);
            let off_level = if feet[2] < low {
                low - feet[2]
            } else if feet[2] > high {
                feet[2] - high
            } else {
                0.0
            };
            if off_level > LEVEL_SPAN {
                continue;
            }
            let rim: Vec<(f64, f64)> = poly
                .corners
                .iter()
                .map(|&corner| self.to_world((self.mesh.corners[corner].x, self.mesh.corners[corner].y)))
                .collect();
            let (x, y, dist) = nearest_in(&rim, feet[0], feet[1]);
            if dist > reach {
                continue;
            }
            let score = dist + off_level;
            if best.is_none_or(|(kept, _)| score < kept) {
                best = Some((score, [x, y, feet[2].clamp(low, high)]));
            }
        }
        best.map(|(_, point)| point)
    }
}
