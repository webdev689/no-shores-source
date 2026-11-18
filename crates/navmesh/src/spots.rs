//! Firing spots: places on the walkable surface a shooter may fire from, found once with the mesh. A lattice is laid
//! over the surface, and from each point of it on the floor, at a standing body's eye, sixteen bearings are probed
//! against the course. A bearing is covered where something stands in the eye's way close by, and an open lane where
//! the way is clear far out. A point with neither is no place to fight from, and is left out.

use crate::collider::{Collider, surface_near};
use crate::compact::CompactField;
use crate::{Bounds, NavMesh};
use movement::Terrain;

/// The lattice's spacing, metres.
const STRIDE: f64 = 1.6;
/// The bearings probed, evenly round from north, clockwise: one bit each in a spot's masks.
const BEARINGS: usize = 16;
/// A standing body's eye over its feet, metres.
const EYE: f64 = 1.6;
/// Something in the eye's way within this covers a spot from that bearing, metres.
const COVER_REACH: f64 = 2.4;
/// A bearing clear this far is an open lane to shoot down, metres.
const LANE_REACH: f64 = 14.0;

/// A place to fire from: its point on the walkable surface, and the bearings it is covered from and commands an open
/// lane down. Bit `n` of each mask is the bearing `n` sixteenths of a turn clockwise from north.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spot {
    pub point: [f64; 3],
    pub cover: u16,
    pub lanes: u16,
}

/// The lattice's points along one axis, from half a stride past `low` up to `high`.
fn lattice(low: f64, high: f64) -> impl Iterator<Item = f64> {
    (0_u32..).map(move |step| low + (f64::from(step) + 0.5) * STRIDE).take_while(move |&at| at <= high)
}

/// How far from (x, y) the way `(east, south)` leaves the bounds, metres.
fn to_edge(bounds: Bounds, x: f64, y: f64, (east, south): (f64, f64)) -> f64 {
    let along = |at: f64, way: f64, low: f64, high: f64| {
        if way > 1e-12 {
            (high - at) / way
        } else if way < -1e-12 {
            (low - at) / way
        } else {
            f64::INFINITY
        }
    };
    along(x, east, bounds.min_x, bounds.max_x).min(along(y, south, bounds.min_y, bounds.max_y))
}

/// Whether a level line at height `eye`, from (x, y) the way `(east, south)` for `reach` metres, meets a collider that
/// stands higher than the eye where the line crosses it. A ramp's top is a plane, so its highest over the crossing is
/// at one end of it.
// shortcut: the ground itself never blocks the eye, so a hill hides nothing; march the line over the ground's heights
// when rooms stand on land with foes.
fn blocked(colliders: &[Collider], x: f64, y: f64, (east, south): (f64, f64), reach: f64, eye: f64) -> bool {
    colliders.iter().any(|collider| {
        let [min_x, min_y, max_x, max_y] = collider.footprint();
        let (mut enter, mut leave) = (0.0_f64, reach);
        for (at, way, low, high) in [(x, east, min_x, max_x), (y, south, min_y, max_y)] {
            if way.abs() < 1e-12 {
                if at < low || at > high {
                    return false;
                }
                continue;
            }
            let (first, second) = ((low - at) / way, (high - at) / way);
            enter = enter.max(first.min(second));
            leave = leave.min(first.max(second));
        }
        let height = |along: f64| collider.surface(x + east * along, y + south * along);
        enter < leave && height(enter).max(height(leave)) > eye
    })
}

/// The firing spots over the walkable surface the regions kept, row by row from the north, west to east, lower floors
/// first. The bounds' edge occludes: a bearing that leaves them within a lane's reach is no lane.
pub(crate) fn bake(field: &CompactField, colliders: &[Collider], ground: &dyn Terrain, bounds: Bounds) -> Vec<Spot> {
    let ways: [(f64, f64); BEARINGS] = core::array::from_fn(|bearing| {
        let angle = bearing as f64 * core::f64::consts::TAU / BEARINGS as f64;
        (libm::sin(angle), -libm::cos(angle))
    });
    let grid = field.grid;
    let mut spots = Vec::new();
    for y in lattice(bounds.min_y, bounds.max_y) {
        for x in lattice(bounds.min_x, bounds.max_x) {
            let (ix, iy) = (((x - grid.min_x) / grid.cell) as usize, ((y - grid.min_y) / grid.cell) as usize);
            if ix >= grid.cells_x || iy >= grid.cells_y {
                continue;
            }
            for span in field.columns[ix + iy * grid.cells_x].iter().filter(|span| span.walkable && span.region != 0) {
                let z = surface_near(colliders, ground, x, y, Some(grid.height(span.floor)));
                let eye = z + EYE;
                let (mut cover, mut lanes) = (0_u16, 0_u16);
                for (bearing, &way) in ways.iter().enumerate() {
                    if blocked(colliders, x, y, way, COVER_REACH, eye) {
                        cover |= 1 << bearing;
                    } else if to_edge(bounds, x, y, way) >= LANE_REACH
                        && !blocked(colliders, x, y, way, LANE_REACH, eye)
                    {
                        lanes |= 1 << bearing;
                    }
                }
                if cover != 0 || lanes != 0 {
                    spots.push(Spot { point: [x, y, z], cover, lanes });
                }
            }
        }
    }
    spots
}

impl NavMesh {
    /// The firing spots within `radius` of a point, across, in the order they were baked: row by row from the north,
    /// west to east, lower floors first.
    pub fn spots_near(&self, point: [f64; 3], radius: f64) -> impl Iterator<Item = &Spot> {
        self.spots.iter().filter(move |spot| {
            let (east, south) = (spot.point[0] - point[0], spot.point[1] - point[1]);
            east * east + south * south <= radius * radius
        })
    }
}
