//! Whether a zone can be played: a body, kept clear of every wall and solid as the room's navmesh keeps its foes,
//! walks from the arrival to within use of each thing the zone asks a player to reach. The check is the passages'
//! own, so the server and every browser lay the same zone again where it fails.

use dungeon::{CELL_M, Cell, Dungeon};
use movement::{Block, Terrain};

/// The grid the walk is found on, metres a square.
const STEP_M: f64 = 0.25;
/// How near a thing a body must come: a mouth, the lamp or a spot, where the deal's things stand, within every reach
/// the room asks of them (4 m, 3 m); a post, where a band stands, within a blow (its 1.1 m and a body's half-width).
pub(crate) const USE_M: f64 = 2.5;
pub(crate) const BLOW_M: f64 = 1.45;
/// How far a walk keeps from walls and solids: the body's half-width (0.35 m) rounded up to the room's navmesh cell
/// under ground (0.5 m), so its foes path where a body walks.
const KEEP_M: f64 = 0.5;
/// The steepest ground walked, rise over run, as the navmesh's.
const SLOPE: f64 = 0.7;
/// How far round its post a band stands (`room::garrison::SPREAD`), metres.
pub const BAND_SPREAD_M: f64 = 2.5;

/// A grid of squares over the ground from its north-west corner: which a body may stand in.
struct Grid {
    low: [f64; 2],
    columns: usize,
    rows: usize,
    free: Vec<bool>,
}

impl Grid {
    fn over(low: [f64; 2], high: [f64; 2]) -> Self {
        let columns = ((high[0] - low[0]) / STEP_M).ceil().max(1.0) as usize;
        let rows = ((high[1] - low[1]) / STEP_M).ceil().max(1.0) as usize;
        Grid { low, columns, rows, free: vec![true; columns * rows] }
    }

    fn centre(&self, square: usize) -> [f64; 2] {
        [
            self.low[0] + ((square % self.columns) as f64 + 0.5) * STEP_M,
            self.low[1] + ((square / self.columns) as f64 + 0.5) * STEP_M,
        ]
    }

    /// The squares a box covers, grown by KEEP_M, no longer stood in.
    fn block(&mut self, [min_x, min_y, max_x, max_y]: [f64; 4]) {
        let span = |low: f64, high: f64, start: f64, count: usize| {
            let first = ((low - KEEP_M - start) / STEP_M - 0.5).ceil().max(0.0) as usize;
            let last = (((high + KEEP_M - start) / STEP_M - 0.5).floor() + 1.0).clamp(0.0, count as f64) as usize;
            first..last
        };
        for row in span(min_y, max_y, self.low[1], self.rows) {
            for column in span(min_x, max_x, self.low[0], self.columns) {
                self.free[row * self.columns + column] = false;
            }
        }
    }

    /// How many of `wanted` lie past their reach of every square walked to from `from` (all when no square is free), a
    /// step from one square to the next taken where `joined` allows it.
    fn walked_to(
        &self,
        from: [f64; 2],
        wanted: &[([f64; 2], f64)],
        joined: impl Fn([f64; 2], [f64; 2]) -> bool,
    ) -> usize {
        let apart = |one: [f64; 2], two: [f64; 2]| libm::hypot(one[0] - two[0], one[1] - two[1]);
        let near_from = (0..self.free.len()).filter(|&square| self.free[square]);
        let start =
            near_from.min_by(|&one, &two| apart(self.centre(one), from).total_cmp(&apart(self.centre(two), from)));
        let Some(start) = start else { return wanted.len() };
        let mut reached = vec![false; self.free.len()];
        reached[start] = true;
        let mut stack = vec![start];
        while let Some(square) = stack.pop() {
            let (column, row) = (square % self.columns, square / self.columns);
            let beside = [
                (column > 0).then(|| square - 1),
                (column + 1 < self.columns).then(|| square + 1),
                (row > 0).then(|| square - self.columns),
                (row + 1 < self.rows).then(|| square + self.columns),
            ];
            for next in beside.into_iter().flatten() {
                if self.free[next] && !reached[next] && joined(self.centre(square), self.centre(next)) {
                    reached[next] = true;
                    stack.push(next);
                }
            }
        }
        // Each wanted thing looks only at the squares round it.
        let near = |(at, reach): ([f64; 2], f64)| {
            let span = |middle: f64, start: f64, count: usize| {
                let first = ((middle - reach - start) / STEP_M).floor().max(0.0) as usize;
                first..(((middle + reach - start) / STEP_M).ceil().max(0.0) as usize).min(count)
            };
            span(at[1], self.low[1], self.rows).any(|row| {
                span(at[0], self.low[0], self.columns).any(|column| {
                    let square = row * self.columns + column;
                    reached[square] && apart(self.centre(square), at) <= reach
                })
            })
        };
        wanted.iter().filter(|&&wanted| !near(wanted)).count()
    }
}

/// What is not reached, under ground: round the dungeon's rock, its own solids and `extra` (each min x, min y, max x, max y, top), on its
/// one floor.
pub(crate) fn under(dungeon: &Dungeon, extra: &[[f64; 5]], from: [f64; 2], wanted: &[([f64; 2], f64)]) -> usize {
    let high = [dungeon.columns as f64 * CELL_M, dungeon.rows as f64 * CELL_M];
    let mut grid = Grid::over([0.0, 0.0], high);
    for (cell, kind) in dungeon.cells.iter().enumerate() {
        if *kind == Cell::Rock {
            let (x, y) = ((cell % dungeon.columns) as f64 * CELL_M, (cell / dungeon.columns) as f64 * CELL_M);
            grid.block([x, y, x + CELL_M, y + CELL_M]);
        }
    }
    for solid in dungeon.boxes().iter().chain(extra) {
        grid.block([solid[0], solid[1], solid[2], solid[3]]);
    }
    grid.walked_to(from, wanted, |_, _| true)
}

/// What is not reached, above ground: over the hollow's heights no steeper than SLOPE, round the blocks that stand higher than a step,
/// within the bounds of `ring`.
pub(crate) fn open(
    ground: &impl Terrain,
    blocks: &[Block],
    ring: &[[f64; 2]],
    (from, wanted): ([f64; 2], &[([f64; 2], f64)]),
) -> usize {
    let tall = |block: &&Block| {
        let floor = ground.height_at((block.min_x + block.max_x) / 2.0, (block.min_y + block.max_y) / 2.0);
        block.top - floor > movement::TUNING.step && block.bottom <= floor + movement::TUNING.step
    };
    let low = ring.iter().fold([f64::MAX; 2], |low, at| [low[0].min(at[0]), low[1].min(at[1])]);
    let high = ring.iter().fold([f64::MIN; 2], |high, at| [high[0].max(at[0]), high[1].max(at[1])]);
    let mut grid = Grid::over(low, high);
    for block in blocks.iter().filter(tall) {
        grid.block([block.min_x, block.min_y, block.max_x, block.max_y]);
    }
    let rise = |at: [f64; 2]| ground.height_at(at[0], at[1]);
    grid.walked_to(from, wanted, |here, there| (rise(there) - rise(here)).abs() <= SLOPE * STEP_M)
}
