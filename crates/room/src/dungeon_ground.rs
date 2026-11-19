//! A dungeon's ground for its bodies: the Forge's one floor at 0 m, its rock a wall, and its doorways' jambs and its
//! pillars solid. They are the ground's own walls rather than blocks, since movement climbs a block too tall to step
//! onto and a dungeon has ceilings over it. A body's middle keeps movement's half-width from every one of them, as a
//! block keeps a body off its sides, so no body stands in a wall's face.

use movement::{Heights, TUNING, Terrain};

/// How tall a jamb or a pillar stands to a body and a shot: over every ceiling, as the rock does.
const SOLID_TOP_M: f64 = 10.0;

/// A dungeon's ground: its cells' heights (0 m open, none for rock), its jambs and pillars (min x, min y, max x,
/// max y, each as the dungeon's `boxes` give them, top last), and for each cell the solids within a body's half-width
/// of it.
#[derive(Clone, Debug, PartialEq)]
pub struct DungeonGround {
    heights: Heights,
    cell: f64,
    columns: usize,
    rows: usize,
    open: Vec<bool>,
    solids: Vec<[f64; 5]>,
    near: Vec<Vec<usize>>,
}

/// The square of the distance from a point to a rectangle, 0 inside it.
fn apart_squared(x: f64, y: f64, min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> f64 {
    let dx = if x < min_x {
        min_x - x
    } else if x > max_x {
        x - max_x
    } else {
        0.0
    };
    let dy = if y < min_y {
        min_y - y
    } else if y > max_y {
        y - max_y
    } else {
        0.0
    };
    dx * dx + dy * dy
}

impl DungeonGround {
    /// The ground of a dungeon as the Forge lays it.
    #[must_use]
    pub fn of(dungeon: &dungeon::Dungeon) -> Option<Self> {
        let cell = dungeon::CELL_M;
        let heights = Heights::new(0.0, 0.0, cell, dungeon.columns, dungeon.rows, dungeon.heights())?;
        let open = dungeon.cells.iter().map(|&kind| kind != dungeon::Cell::Rock).collect();
        let solids = dungeon.boxes();
        let reach = TUNING.radius;
        let mut near = vec![Vec::new(); dungeon.columns * dungeon.rows];
        for (number, solid) in solids.iter().enumerate() {
            let first = |low: f64| ((low - reach) / cell).floor().max(0.0) as usize;
            let last = |high: f64, count: usize| (((high + reach) / cell).floor().max(0.0) as usize).min(count - 1);
            for row in first(solid[1])..=last(solid[3], dungeon.rows) {
                for column in first(solid[0])..=last(solid[2], dungeon.columns) {
                    near[row * dungeon.columns + column].push(number);
                }
            }
        }
        Some(Self { heights, cell, columns: dungeon.columns, rows: dungeon.rows, open, solids, near })
    }

    /// The jambs and pillars, each (min x, min y, max x, max y, top).
    #[must_use]
    pub fn solids(&self) -> &[[f64; 5]] {
        &self.solids
    }

    /// The cells' heights alone, without the jambs and pillars: what a navmesh bakes on, with those as its colliders.
    #[must_use]
    pub const fn grid(&self) -> &Heights {
        &self.heights
    }

    /// The cell a point stands in, if it is in the grid.
    fn cell_at(&self, x: f64, y: f64) -> Option<(usize, usize)> {
        let (column, row) = ((x / self.cell).floor(), (y / self.cell).floor());
        let inside = column >= 0.0 && row >= 0.0 && column < self.columns as f64 && row < self.rows as f64;
        inside.then_some((column as usize, row as usize))
    }

    /// The square of how far a point stands from the nearest rock, jamb or pillar: 0 inside one, and no more than a
    /// body's half-width is ever asked, so only the cells round it are looked at.
    fn clearance_squared(&self, x: f64, y: f64) -> f64 {
        let Some((column, row)) = self.cell_at(x, y) else { return 0.0 };
        let reach = TUNING.radius;
        let mut nearest = reach * reach;
        for (step_column, step_row) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
            // Past the grid on any side is rock, as a cell holding none is.
            let (next_column, next_row) = (column as isize + step_column, row as isize + step_row);
            let inside = next_column >= 0
                && next_row >= 0
                && (next_column as usize) < self.columns
                && (next_row as usize) < self.rows;
            if !inside || !self.open[next_row as usize * self.columns + next_column as usize] {
                let (west, north) = (next_column as f64 * self.cell, next_row as f64 * self.cell);
                nearest = nearest.min(apart_squared(x, y, west, north, west + self.cell, north + self.cell));
            }
        }
        for &number in &self.near[row * self.columns + column] {
            let [min_x, min_y, max_x, max_y, _] = self.solids[number];
            nearest = nearest.min(apart_squared(x, y, min_x, min_y, max_x, max_y));
        }
        nearest
    }

    /// Whether the straight line between two points passes `keep` metres or more from every jamb and pillar: each box
    /// grown by `keep` is tested against the line by the slabs between its sides.
    #[must_use]
    pub fn clear_between(&self, from: [f64; 2], to: [f64; 2], keep: f64) -> bool {
        let along = [to[0] - from[0], to[1] - from[1]];
        self.solids.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
            let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
            for (start, step, low, high) in
                [(from[0], along[0], min_x - keep, max_x + keep), (from[1], along[1], min_y - keep, max_y + keep)]
            {
                if step == 0.0 {
                    if start < low || start > high {
                        return true;
                    }
                } else {
                    let (first, second) = ((low - start) / step, (high - start) / step);
                    enter = enter.max(first.min(second));
                    leave = leave.min(first.max(second));
                }
            }
            enter > leave
        })
    }

    /// Whether a point stands inside a jamb or a pillar.
    fn in_solid(&self, x: f64, y: f64) -> bool {
        let Some((column, row)) = self.cell_at(x, y) else { return false };
        self.near[row * self.columns + column].iter().any(|&number| {
            let [min_x, min_y, max_x, max_y, _] = self.solids[number];
            x >= min_x && x <= max_x && y >= min_y && y <= max_y
        })
    }
}

impl Terrain for DungeonGround {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        if self.in_solid(x, y) { SOLID_TOP_M } else { self.heights.height_at(x, y) }
    }

    /// A move is walled when it crosses rock, or ends nearer than a body's half-width to rock, a jamb or a pillar and
    /// nearer than it began: a body slides along a wall and steps away from one, but never into its face.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        if self.heights.walled(from, to) {
            return true;
        }
        let reach = TUNING.radius;
        let ends = self.clearance_squared(to.0, to.1);
        ends < reach * reach && ends < self.clearance_squared(from.0, from.1)
    }
}

#[cfg(test)]
#[path = "dungeon_ground_tests.rs"]
mod dungeon_ground_tests;
