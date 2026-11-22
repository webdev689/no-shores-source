//! A dungeon's ground for its bodies: the Forge's one floor at 0 m, its rock a wall, and its doorways' jambs and its
//! pillars solid. They are the ground's own walls rather than blocks, since movement climbs a block too tall to step
//! onto and a dungeon has ceilings over it. A body's middle keeps movement's half-width from every one of them, as a
//! block keeps a body off its sides, so no body stands in a wall's face.

use movement::{Heights, TUNING, Terrain};

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

/// How far a point stands from a rectangle: outside, the distance to it; inside, less than nothing by the distance to
/// its nearest side, so a body inside one can only move out.
fn apart_from(x: f64, y: f64, min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> f64 {
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
    if dx == 0.0 && dy == 0.0 {
        -(x - min_x).min(max_x - x).min(y - min_y).min(max_y - y)
    } else {
        (dx * dx + dy * dy).sqrt()
    }
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

    /// How far a point stands from the nearest rock, jamb, pillar or prop, less than nothing inside one; no more than
    /// a body's half-width is ever asked, so only the cells round it are looked at.
    fn clearance(&self, x: f64, y: f64) -> f64 {
        let Some((column, row)) = self.cell_at(x, y) else { return 0.0 };
        let mut nearest = TUNING.radius;
        for (step_column, step_row) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
            // Past the grid on any side is rock, as a cell holding none is.
            let (next_column, next_row) = (column as isize + step_column, row as isize + step_row);
            let inside = next_column >= 0
                && next_row >= 0
                && (next_column as usize) < self.columns
                && (next_row as usize) < self.rows;
            if !inside || !self.open[next_row as usize * self.columns + next_column as usize] {
                let (west, north) = (next_column as f64 * self.cell, next_row as f64 * self.cell);
                nearest = nearest.min(apart_from(x, y, west, north, west + self.cell, north + self.cell));
            }
        }
        for &number in &self.near[row * self.columns + column] {
            let [min_x, min_y, max_x, max_y, _] = self.solids[number];
            nearest = nearest.min(apart_from(x, y, min_x, min_y, max_x, max_y));
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

    /// The highest top of the solids standing over a point, if one stands there.
    fn solid_top(&self, x: f64, y: f64) -> Option<f64> {
        let (column, row) = self.cell_at(x, y)?;
        self.near[row * self.columns + column]
            .iter()
            .map(|&number| self.solids[number])
            .filter(|&[min_x, min_y, max_x, max_y, _]| x >= min_x && x <= max_x && y >= min_y && y <= max_y)
            .fold(None, |highest: Option<f64>, solid| Some(highest.map_or(solid[4], |top| top.max(solid[4]))))
    }

    /// The cells a straight line crosses, from its first end's to its last's or to the grid's edge, by each grid line it
    /// passes; empty when its first end lies off the grid.
    fn cells_along(&self, from: [f64; 2], to: [f64; 2]) -> Vec<usize> {
        let Some(start) = self.cell_at(from[0], from[1]) else { return Vec::new() };
        let end = self.cell_at(to[0], to[1]).unwrap_or((usize::MAX, usize::MAX));
        // How far along the line (0 to 1) the next grid line lies on an axis, how far apart they lie, and the step.
        let crossing = |at: f64, index: usize, delta: f64| -> (f64, f64, isize) {
            if delta > 0.0 {
                (((index + 1) as f64 * self.cell - at) / delta, self.cell / delta, 1)
            } else if delta < 0.0 {
                ((index as f64 * self.cell - at) / delta, -self.cell / delta, -1)
            } else {
                (f64::INFINITY, f64::INFINITY, 0)
            }
        };
        let (mut next_column, gap_column, step_column) = crossing(from[0], start.0, to[0] - from[0]);
        let (mut next_row, gap_row, step_row) = crossing(from[1], start.1, to[1] - from[1]);
        let (mut column, mut row) = (start.0 as isize, start.1 as isize);
        let mut cells = Vec::new();
        while column >= 0 && row >= 0 && (column as usize) < self.columns && (row as usize) < self.rows {
            cells.push(row as usize * self.columns + column as usize);
            if (column as usize, row as usize) == end || cells.len() > self.columns + self.rows {
                break;
            }
            if next_column < next_row {
                column += step_column;
                next_column += gap_column;
            } else {
                row += step_row;
                next_row += gap_row;
            }
        }
        cells
    }

    /// Whether the line passes through a jamb, a pillar or a prop below its top: only the solids near the cells it
    /// crosses are looked at, each against the line by the slabs between its sides.
    fn solid_across(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        let cells = self.cells_along([from[0], from[1]], [to[0], to[1]]);
        let below = |number: &usize| crosses_below(&self.solids[*number], from, to);
        if cells.is_empty() {
            return (0..self.solids.len()).any(|number| below(&number));
        }
        cells.iter().any(|&cell| self.near[cell].iter().any(below))
    }
}

/// How far along a segment (0 to 1) it enters a box from `low` to `high` (x, y, z), by the slabs between its faces.
fn entry(low: [f64; 3], high: [f64; 3], from: [f64; 3], to: [f64; 3]) -> Option<f64> {
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for axis in 0..3 {
        let step = to[axis] - from[axis];
        if step == 0.0 {
            if from[axis] < low[axis] || from[axis] > high[axis] {
                return None;
            }
        } else {
            let (first, second) = ((low[axis] - from[axis]) / step, (high[axis] - from[axis]) / step);
            enter = enter.max(first.min(second));
            leave = leave.min(first.max(second));
        }
    }
    (enter <= leave).then_some(enter)
}

/// Whether a line (x, y, z) passes through a box below its top: where it is inside the box's sides, by the slabs
/// between them, its lowest point there is under the top.
fn crosses_below(solid: &[f64; 5], from: [f64; 3], to: [f64; 3]) -> bool {
    let [min_x, min_y, max_x, max_y, top] = *solid;
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for (start, end, low, high) in [(from[0], to[0], min_x, max_x), (from[1], to[1], min_y, max_y)] {
        let step = end - start;
        if step == 0.0 {
            if start < low || start > high {
                return false;
            }
        } else {
            let (first, second) = ((low - start) / step, (high - start) / step);
            enter = enter.max(first.min(second));
            leave = leave.min(first.max(second));
        }
    }
    let height = |share: f64| from[2] + (to[2] - from[2]) * share;
    enter <= leave && height(enter).min(height(leave)) < top
}

impl Terrain for DungeonGround {
    /// The floor, or a solid's top over it, where a thrown drop comes to rest: a body is kept out of a solid by
    /// `walled` all the same.
    fn height_at(&self, x: f64, y: f64) -> f64 {
        self.solid_top(x, y).unwrap_or_else(|| self.heights.height_at(x, y))
    }

    /// The one floor, under the rock and the solids as well: `wall_entry` meets a shot at their faces.
    fn floor_at(&self, _x: f64, _y: f64) -> f64 {
        dungeon::FLOOR_M
    }

    /// A move is walled when it crosses rock, or ends nearer than a body's half-width to rock, a jamb, a pillar or a
    /// prop and nearer than it began: a body slides along a wall and steps away from one, but never into its face,
    /// and one shoved inside a solid can only move out of it.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        if self.heights.walled(from, to) {
            return true;
        }
        let ends = self.clearance(to.0, to.1);
        ends < TUNING.radius && ends < self.clearance(from.0, from.1)
    }

    /// A line is walled where it crosses rock, as a move is, or passes through a jamb, a pillar or a prop below its
    /// top: a look, a blow or a throw passes over a low coffin, never through a shelf.
    fn line_walled(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        self.heights.walled((from[0], from[1]), (to[0], to[1])) || self.solid_across(from, to)
    }

    /// A shot enters the first rock cell it crosses at that cell's side, the grid's edge as rock, or a jamb, a pillar
    /// or a prop where it passes into the box below its top, whichever it meets first.
    fn wall_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let cells = self.cells_along([from[0], from[1]], [to[0], to[1]]);
        let (deep, high) = (-1.0e9, 1.0e9);
        let square = |cell: usize| {
            let (west, north) = ((cell % self.columns) as f64 * self.cell, (cell / self.columns) as f64 * self.cell);
            entry([west, north, deep], [west + self.cell, north + self.cell, high], from, to)
        };
        let rock = cells.iter().find(|&&cell| !self.open[cell]).and_then(|&cell| square(cell));
        // Past the grid is rock: a segment that leaves it enters rock where it does.
        let (east, south) = (self.columns as f64 * self.cell, self.rows as f64 * self.cell);
        let outside = (to[0] < 0.0 || to[1] < 0.0 || to[0] > east || to[1] > south)
            .then(|| {
                let along = [to[0] - from[0], to[1] - from[1]];
                let leave = |start: f64, step: f64, edge: f64| {
                    if step == 0.0 { 1.0 } else { ((if step > 0.0 { edge } else { 0.0 }) - start) / step }
                };
                leave(from[0], along[0], east).min(leave(from[1], along[1], south))
            })
            .filter(|share| *share <= 1.0)
            .map(|share| share.max(0.0));
        let solid = cells
            .iter()
            .flat_map(|&cell| &self.near[cell])
            .filter_map(|&number| {
                let [min_x, min_y, max_x, max_y, top] = self.solids[number];
                entry([min_x, min_y, deep], [max_x, max_y, top], from, to)
            })
            .reduce(f64::min);
        [rock, outside, solid].into_iter().flatten().reduce(f64::min)
    }
}

#[cfg(test)]
#[path = "dungeon_ground_tests.rs"]
mod dungeon_ground_tests;
