//! Firing spots: places on the walkable surface a shooter may fire from, found once with the mesh. A lattice is laid
//! over the surface, and from each point of it on the floor, at a standing body's eye, sixteen bearings are probed
//! against the course and the ground. A bearing is covered where something stands in the eye's way close by, and an
//! open lane where the way is clear far out. A point with neither is no place to fight from, and is left out.

use crate::collider::{Collider, surface_near};
use crate::compact::CompactField;
use crate::{Bounds, NavMesh};
use movement::{Heights, Terrain};

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
/// The side of a cell of the grid the course is filed on for the probes, metres.
const FILE: f64 = 2.0;
/// How far apart a probe reads the ground along its line, metres: half a cell of the bake.
const GROUND_STEP: f64 = 0.125;

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
/// stands higher than the eye where the line crosses it, its underside below the eye. A ramp's top is a plane, so
/// its highest over the crossing is at one end of it.
fn over_eye(collider: &Collider, x: f64, y: f64, (east, south): (f64, f64), reach: f64, eye: f64) -> bool {
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
    enter < leave && height(enter).max(height(leave)) > eye && collider.underside() < eye
}

/// The course as the probes read it, filed on a coarse grid over the bounds and a cover's reach past them: the
/// colliders whose footprints touch each cell, and the most the ground stands anywhere in each.
struct Course<'course> {
    colliders: &'course [Collider],
    ground: Option<&'course Heights>,
    bounds: Bounds,
    min_x: f64,
    min_y: f64,
    columns: usize,
    rows: usize,
    filed: Vec<Vec<usize>>,
    highest: Vec<f64>,
}

impl<'course> Course<'course> {
    fn new(
        colliders: &'course [Collider],
        ground: Option<&'course Heights>,
        field: &CompactField,
        bounds: Bounds,
    ) -> Self {
        let (min_x, min_y) = (bounds.min_x - COVER_REACH - FILE, bounds.min_y - COVER_REACH - FILE);
        let count = |low: f64, high: f64| ((high + COVER_REACH + FILE - low) / FILE).ceil().max(1.0) as usize;
        let (columns, rows) = (count(min_x, bounds.max_x), count(min_y, bounds.max_y));
        let mut course = Self {
            colliders,
            ground,
            bounds,
            min_x,
            min_y,
            columns,
            rows,
            filed: vec![Vec::new(); columns * rows],
            highest: vec![f64::NEG_INFINITY; columns * rows],
        };
        for (index, collider) in colliders.iter().enumerate() {
            for cell in course.cells(collider.footprint()) {
                course.filed[cell].push(index);
            }
        }
        if let Some(ground) = ground {
            let grid = field.grid;
            for (ix, iy) in (0..grid.cells_y).flat_map(|iy| (0..grid.cells_x).map(move |ix| (ix, iy))) {
                // A height read anywhere blends the ground's heights at the cell centres within a cell of it.
                let (x, y) = grid.centre(ix, iy);
                let height = ground.height_at(x, y);
                for cell in course.cells([x - grid.cell, y - grid.cell, x + grid.cell, y + grid.cell]) {
                    course.highest[cell] = course.highest[cell].max(height);
                }
            }
        }
        course
    }

    fn column(&self, x: f64) -> usize {
        (((x - self.min_x) / FILE).floor().max(0.0) as usize).min(self.columns - 1)
    }

    fn row(&self, y: f64) -> usize {
        (((y - self.min_y) / FILE).floor().max(0.0) as usize).min(self.rows - 1)
    }

    /// The cells a box (min x, min y, max x, max y) touches, edges included.
    fn cells(&self, [low_x, low_y, high_x, high_y]: [f64; 4]) -> impl Iterator<Item = usize> + use<> {
        let (first_x, last_x) = (self.column(low_x), self.column(high_x));
        let (first_y, last_y, columns) = (self.row(low_y), self.row(high_y), self.columns);
        (first_y..=last_y).flat_map(move |row| (first_x..=last_x).map(move |column| row * columns + column))
    }

    /// Whether a level line at height `eye`, from (x, y) the way `(east, south)` for `reach` metres, meets a collider
    /// or the ground standing higher than the eye. It walks the cells the line crosses, reading the colliders filed in
    /// each, and the ground every `GROUND_STEP` along the line inside the bounds where a cell's ground stands that
    /// high. Every read a full march would make that could stand over the eye is made.
    fn blocked(&self, x: f64, y: f64, way: (f64, f64), reach: f64, eye: f64) -> bool {
        let (east, south) = way;
        let edge = to_edge(self.bounds, x, y, way) - 1e-6;
        let boundary = |at: f64, origin: f64, cell: usize, way: f64| {
            if way > 0.0 {
                (origin + (cell + 1) as f64 * FILE - at) / way
            } else if way < 0.0 {
                (origin + cell as f64 * FILE - at) / way
            } else {
                f64::INFINITY
            }
        };
        let (mut column, mut row) = (self.column(x), self.row(y));
        let (mut next_x, mut next_y) = (boundary(x, self.min_x, column, east), boundary(y, self.min_y, row, south));
        let (step_x, step_y) = (FILE / east.abs(), FILE / south.abs());
        let mut enter = 0.0;
        loop {
            let leave = next_x.min(next_y).min(reach);
            let cell = row * self.columns + column;
            if self.filed[cell].iter().any(|&index| over_eye(&self.colliders[index], x, y, way, reach, eye)) {
                return true;
            }
            if let Some(ground) = self.ground
                && self.highest[cell] + 1e-6 > eye
            {
                let first = ((enter / GROUND_STEP).floor() as usize).max(2) - 1;
                let last = (leave / GROUND_STEP).ceil() as usize + 1;
                let rises = (first..=last).map(|step| step as f64 * GROUND_STEP).take_while(|&along| along <= reach);
                if rises
                    .take_while(|&along| along < edge)
                    .any(|along| ground.height_at(x + east * along, y + south * along) > eye)
                {
                    return true;
                }
            }
            if leave >= reach {
                return false;
            }
            let crossing_x = next_x < next_y;
            let moved = if crossing_x {
                column.checked_add_signed(east.signum() as isize)
            } else {
                row.checked_add_signed(south.signum() as isize)
            };
            match moved {
                Some(moved) if crossing_x && moved < self.columns => {
                    (column, enter, next_x) = (moved, next_x, next_x + step_x)
                }
                Some(moved) if !crossing_x && moved < self.rows => {
                    (row, enter, next_y) = (moved, next_y, next_y + step_y)
                }
                _ => return false,
            }
        }
    }
}

/// The firing spots over the walkable surface the regions kept, row by row from the north, west to east, lower floors
/// first. The bounds' edge occludes: a bearing that leaves them within a lane's reach is no lane.
pub(crate) fn bake(
    field: &CompactField,
    colliders: &[Collider],
    ground: Option<&Heights>,
    floor: &dyn Terrain,
    bounds: Bounds,
) -> Vec<Spot> {
    let ways: [(f64, f64); BEARINGS] = core::array::from_fn(|bearing| {
        let angle = bearing as f64 * core::f64::consts::TAU / BEARINGS as f64;
        (libm::sin(angle), -libm::cos(angle))
    });
    let course = Course::new(colliders, ground, field, bounds);
    let grid = field.grid;
    let mut spots = Vec::new();
    for y in lattice(bounds.min_y, bounds.max_y) {
        for x in lattice(bounds.min_x, bounds.max_x) {
            let (ix, iy) = (((x - grid.min_x) / grid.cell) as usize, ((y - grid.min_y) / grid.cell) as usize);
            if ix >= grid.cells_x || iy >= grid.cells_y {
                continue;
            }
            for span in field.columns[ix + iy * grid.cells_x].iter().filter(|span| span.walkable && span.region != 0) {
                let z = surface_near(colliders, floor, x, y, Some(grid.height(span.floor)));
                let eye = z + EYE;
                let (mut cover, mut lanes) = (0_u16, 0_u16);
                for (bearing, &way) in ways.iter().enumerate() {
                    if course.blocked(x, y, way, COVER_REACH, eye) {
                        cover |= 1 << bearing;
                    } else if to_edge(bounds, x, y, way) >= LANE_REACH && !course.blocked(x, y, way, LANE_REACH, eye) {
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
