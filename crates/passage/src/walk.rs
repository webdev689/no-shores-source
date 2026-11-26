//! Whether a zone can be played: a body, kept clear of every wall and solid as the room's navmesh keeps its foes,
//! walks from the arrival to within use of each thing the zone asks a player to reach. The check is the passages'
//! own, so the server and every browser lay the same zone again where it fails; the way it finds is a body's way.

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
/// No square walked from.
const NONE: usize = usize::MAX;

/// A zone's ground as a body walks it: a grid of squares from its north-west corner, which may be stood in, and
/// above ground each square's height, a step between two taken where it is no steeper than SLOPE.
#[derive(Debug)]
pub struct Walk {
    low: [f64; 2],
    columns: usize,
    rows: usize,
    free: Vec<bool>,
    heights: Option<Vec<f64>>,
}

impl Walk {
    fn over(low: [f64; 2], high: [f64; 2]) -> Self {
        let columns = ((high[0] - low[0]) / STEP_M).ceil().max(1.0) as usize;
        let rows = ((high[1] - low[1]) / STEP_M).ceil().max(1.0) as usize;
        Walk { low, columns, rows, free: vec![true; columns * rows], heights: None }
    }

    /// Under ground: round the dungeon's rock, its own solids and `extra` (each min x, min y, max x, max y, top), on
    /// its one floor.
    #[must_use]
    pub fn under(dungeon: &Dungeon, extra: &[[f64; 5]]) -> Self {
        let mut walk = Walk::over([0.0, 0.0], [dungeon.columns as f64 * CELL_M, dungeon.rows as f64 * CELL_M]);
        for (cell, kind) in dungeon.cells.iter().enumerate() {
            if *kind == Cell::Rock {
                let (x, y) = ((cell % dungeon.columns) as f64 * CELL_M, (cell / dungeon.columns) as f64 * CELL_M);
                walk.block([x, y, x + CELL_M, y + CELL_M]);
            }
        }
        let boxes = dungeon.boxes().into_iter().map(|solid| [solid[0], solid[1], solid[2], solid[3]]);
        for footprint in boxes.chain(extra.iter().map(|solid| [solid[0], solid[1], solid[2], solid[3]])) {
            walk.block(footprint);
        }
        walk
    }

    /// Above ground: over the hollow's heights, round the blocks that stand higher than a step, within the bounds of
    /// `ring`.
    pub(crate) fn open(ground: &impl Terrain, blocks: &[Block], ring: &[[f64; 2]]) -> Self {
        let low = ring.iter().fold([f64::MAX; 2], |low, at| [low[0].min(at[0]), low[1].min(at[1])]);
        let high = ring.iter().fold([f64::MIN; 2], |high, at| [high[0].max(at[0]), high[1].max(at[1])]);
        let mut walk = Walk::over(low, high);
        for block in blocks {
            let floor = ground.height_at((block.min_x + block.max_x) / 2.0, (block.min_y + block.max_y) / 2.0);
            if block.top - floor > movement::TUNING.step && block.bottom <= floor + movement::TUNING.step {
                walk.block([block.min_x, block.min_y, block.max_x, block.max_y]);
            }
        }
        let heights = (0..walk.free.len()).map(|square| walk.centre(square)).map(|at| ground.height_at(at[0], at[1]));
        walk.heights = Some(heights.collect());
        walk
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

    /// For each square, the square it was first walked to from out of the free square nearest `from` (that one its
    /// own, NONE for a square not reached), nearest first.
    fn flood(&self, from: [f64; 2]) -> Vec<usize> {
        let apart = |square: usize| libm::hypot(self.centre(square)[0] - from[0], self.centre(square)[1] - from[1]);
        let mut parents = vec![NONE; self.free.len()];
        let free = (0..self.free.len()).filter(|&square| self.free[square]);
        let Some(start) = free.min_by(|&one, &two| apart(one).total_cmp(&apart(two))) else { return parents };
        parents[start] = start;
        let mut queue = std::collections::VecDeque::from([start]);
        while let Some(square) = queue.pop_front() {
            let (column, row) = (square % self.columns, square / self.columns);
            let beside = [
                (column > 0).then(|| square - 1),
                (column + 1 < self.columns).then(|| square + 1),
                (row > 0).then(|| square - self.columns),
                (row + 1 < self.rows).then(|| square + self.columns),
            ];
            for next in beside.into_iter().flatten() {
                let joined = self
                    .heights
                    .as_ref()
                    .is_none_or(|heights| (heights[next] - heights[square]).abs() <= SLOPE * STEP_M);
                if self.free[next] && parents[next] == NONE && joined {
                    parents[next] = square;
                    queue.push_back(next);
                }
            }
        }
        parents
    }

    /// The squares round `at` within `reach`.
    fn around(&self, at: [f64; 2], reach: f64) -> impl Iterator<Item = usize> + '_ {
        let span = |middle: f64, start: f64, count: usize| {
            let first = ((middle - reach - start) / STEP_M).floor().max(0.0) as usize;
            first..(((middle + reach - start) / STEP_M).ceil().max(0.0) as usize).min(count)
        };
        let columns = span(at[0], self.low[0], self.columns);
        span(at[1], self.low[1], self.rows)
            .flat_map(move |row| columns.clone().map(move |column| row * self.columns + column))
    }

    /// How many of `wanted` lie past their reach of every square walked to from `from`.
    pub(crate) fn missed(&self, from: [f64; 2], wanted: &[([f64; 2], f64)]) -> usize {
        let parents = self.flood(from);
        let near = |&(at, reach): &([f64; 2], f64)| {
            self.around(at, reach).any(|square| {
                parents[square] != NONE
                    && libm::hypot(self.centre(square)[0] - at[0], self.centre(square)[1] - at[1]) <= reach
            })
        };
        wanted.iter().filter(|wanted| !near(wanted)).count()
    }

    /// A body's way from `from` to the square walked to nearest each of `to`, square by square from the first, each
    /// square's middle; none at all when no square is free.
    #[must_use]
    pub fn ways(&self, from: [f64; 2], to: &[[f64; 2]]) -> Vec<Vec<[f64; 2]>> {
        let parents = self.flood(from);
        let reached: Vec<usize> = (0..parents.len()).filter(|&square| parents[square] != NONE).collect();
        let way = |to: [f64; 2]| {
            let apart = |square: usize| libm::hypot(self.centre(square)[0] - to[0], self.centre(square)[1] - to[1]);
            let Some(mut square) = reached.iter().copied().min_by(|&one, &two| apart(one).total_cmp(&apart(two)))
            else {
                return Vec::new();
            };
            let mut way = vec![self.centre(square)];
            while parents[square] != square {
                square = parents[square];
                way.push(self.centre(square));
            }
            way.reverse();
            way
        };
        to.iter().map(|&to| way(to)).collect()
    }
}
