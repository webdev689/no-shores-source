//! Straight lines through a dungeon's ground: the cells a look, a blow or a shot crosses, and where it meets rock, a
//! slab between storeys or a solid.

use crate::dungeon_ground::DungeonGround;

/// Whether the straight line between two points passes `keep` metres or more from a rectangle (min x, min y, max x,
/// max y): the rectangle grown by `keep` is tested against the line by the slabs between its sides.
pub(crate) fn clear_of(rectangle: [f64; 4], from: [f64; 2], to: [f64; 2], keep: f64) -> bool {
    let [min_x, min_y, max_x, max_y] = rectangle;
    let (mut enter, mut leave) = (0.0_f64, 1.0_f64);
    for (start, end, low, high) in
        [(from[0], to[0], min_x - keep, max_x + keep), (from[1], to[1], min_y - keep, max_y + keep)]
    {
        let step = end - start;
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
}

/// How far along a segment (0 to 1) it is inside a box from `low` to `high` (x, y, z), entering and leaving, by the
/// slabs between its faces.
fn inside(low: [f64; 3], high: [f64; 3], from: [f64; 3], to: [f64; 3]) -> Option<(f64, f64)> {
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
    (enter <= leave).then_some((enter, leave))
}

/// Whether a line (x, y, z) passes through a box from `bottom` to `top` over a rectangle: where it is inside the
/// rectangle, by the slabs between its sides, its lowest point there is under the top and its highest at or over the
/// bottom.
fn crosses(rectangle: [f64; 4], bottom: f64, top: f64, from: [f64; 3], to: [f64; 3]) -> bool {
    let [min_x, min_y, max_x, max_y] = rectangle;
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
    let (one, other) = (height(enter), height(leave));
    enter <= leave && one.min(other) < top && one.max(other) >= bottom
}

const DEEP: f64 = -1.0e9;
const HIGH: f64 = 1.0e9;

impl DungeonGround {
    /// A solid's bottom for a line: none on the deepest storey, as nothing lay under a dungeon's one floor.
    fn solid_bottom(&self, number: usize) -> f64 {
        if self.on_storey(number, self.storeys - 1) { DEEP } else { self.solids[number][4] }
    }

    /// The cells (plane indices) a straight line crosses, from its first end's to its last's or to the grid's edge, by
    /// each grid line it passes; none when its first end lies off the grid. Walked as asked, since a look or a shot
    /// asks every tick.
    pub(crate) fn cells_along(&self, from: [f64; 2], to: [f64; 2]) -> impl Iterator<Item = usize> + '_ {
        let start = self.column_at(from[0], from[1]).map(|at| (at % self.columns, at / self.columns));
        let end =
            self.column_at(to[0], to[1]).map_or((usize::MAX, usize::MAX), |at| (at % self.columns, at / self.columns));
        let (first_column, first_row) = start.unwrap_or((0, 0));
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
        let (mut next_column, gap_column, step_column) = crossing(from[0], first_column, to[0] - from[0]);
        let (mut next_row, gap_row, step_row) = crossing(from[1], first_row, to[1] - from[1]);
        let (mut column, mut row) = (first_column as isize, first_row as isize);
        let (mut walked, mut done) = (0, start.is_none());
        core::iter::from_fn(move || {
            let inside = column >= 0 && row >= 0 && (column as usize) < self.columns && (row as usize) < self.rows;
            if done || !inside {
                return None;
            }
            let cell = row as usize * self.columns + column as usize;
            walked += 1;
            done = (column as usize, row as usize) == end || walked > self.columns + self.rows;
            if next_column < next_row {
                column += step_column;
                next_column += gap_column;
            } else {
                row += step_row;
                next_row += gap_row;
            }
            Some(cell)
        })
    }

    /// A column's square as a box from DEEP to HIGH.
    fn square(&self, cell: usize) -> ([f64; 3], [f64; 3]) {
        let (west, north) = ((cell % self.columns) as f64 * self.cell, (cell / self.columns) as f64 * self.cell);
        ([west, north, DEEP], [west + self.cell, north + self.cell, HIGH])
    }

    /// Where a line in a column of spans leaves them, if it does: entering where no span holds it, or passing through
    /// the floor or the ceiling of the span it entered in.
    fn slab_entry(&self, cell: usize, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let (low, high) = self.square(cell);
        let (enter, leave) = inside(low, high, from, to)?;
        let height = from[2] + (to[2] - from[2]) * enter;
        let Some((floor, ceiling)) = self
            .spans_of(cell)
            .iter()
            .map(|span| self.span_reach(span))
            .find(|&(floor, ceiling)| floor <= height && height <= ceiling)
        else {
            return Some(enter);
        };
        let rise = to[2] - from[2];
        let bound = if rise < 0.0 { floor } else { ceiling };
        let through = if rise == 0.0 || bound.is_infinite() { f64::INFINITY } else { (bound - from[2]) / rise };
        (through < leave).then_some(through.max(enter))
    }

    /// Whether a line passes through rock or a slab between storeys anywhere along it: one storey has no slab, and
    /// its rock is the plane's.
    pub(crate) fn slab_across(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        self.storeys > 1
            && self
                .cells_along([from[0], from[1]], [to[0], to[1]])
                .any(|cell| self.slab_entry(cell, from, to).is_some())
    }

    /// Whether the line passes through a solid between its bottom and its top: only the solids near the cells it
    /// crosses are looked at, each against the line by the slabs between its sides.
    pub(crate) fn solid_across(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        let mut cells = self.cells_along([from[0], from[1]], [to[0], to[1]]).peekable();
        let below = |number: &usize| {
            let [min_x, min_y, max_x, max_y, _, top] = self.solids[*number];
            crosses([min_x, min_y, max_x, max_y], self.solid_bottom(*number), top, from, to)
        };
        if cells.peek().is_none() {
            return (0..self.solids.len()).any(|number| below(&number));
        }
        cells.any(|cell| self.near[cell].iter().any(below))
    }

    /// How far along a segment (0 to 1) it first enters rock at a column's side, a slab between storeys, the grid's
    /// edge as rock, or a solid where it passes into the box, whichever it meets first.
    pub(crate) fn first_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let cells = || self.cells_along([from[0], from[1]], [to[0], to[1]]);
        let mut rock = None;
        for cell in cells() {
            if self.spans_of(cell).is_empty() {
                let (low, high) = self.square(cell);
                rock = inside(low, high, from, to).map(|(enter, _)| enter);
                break;
            }
            if self.storeys > 1
                && let Some(share) = self.slab_entry(cell, from, to)
            {
                rock = Some(share);
                break;
            }
        }
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
        let solid = cells()
            .flat_map(|cell| &self.near[cell])
            .filter_map(|&number| {
                let [min_x, min_y, max_x, max_y, _, top] = self.solids[number];
                inside([min_x, min_y, self.solid_bottom(number)], [max_x, max_y, top], from, to).map(|(enter, _)| enter)
            })
            .reduce(f64::min);
        [rock, outside, solid].into_iter().flatten().reduce(f64::min)
    }
}
