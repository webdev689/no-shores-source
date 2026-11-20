//! The land under a claim, read once on a grid of cells: each cell's height, water and slope, and how far it lies
//! from the sea, from fresh water and from the claim's edge. Every later stage of a layout reads the land through
//! here, so it costs one reading of the ground per cell.

use land::ground::{Ground, WaterAt};

/// A cell's side, metres: fine enough for a path's bends and a building's seat, coarse enough to read a patrol area's
/// land in a few hundred thousand samples.
pub const CELL_M: f64 = 8.0;
/// A distance no cell is from anything, for a field with none of what is measured.
pub const FAR_M: f64 = 1.0e6;

/// What water stands on a cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Water {
    Dry,
    Sea,
    Lake,
    River,
}

/// The land on a grid of cells over a claim and a margin round it.
#[derive(Debug, Clone)]
pub struct Field {
    /// The grid's north-west corner, world metres.
    pub west: f64,
    pub north: f64,
    pub columns: usize,
    pub rows: usize,
    pub height: Vec<f64>,
    pub water: Vec<Water>,
    /// Rise a metre across, steepest way.
    pub slope: Vec<f64>,
    /// Whether the cell's centre lies inside the claim.
    pub claimed: Vec<bool>,
    pub to_sea: Vec<f64>,
    pub to_fresh: Vec<f64>,
    /// How far inside the claim, metres; 0 outside it.
    pub inside: Vec<f64>,
    /// The way to the nearest coast from the claim's middle, as a unit vector; zero where the coast gives no way.
    pub seaward: [f64; 2],
}

/// Whether a point lies inside a ring, by the even-odd rule.
#[must_use]
pub fn ring_holds(ring: &[[f64; 2]], x: f64, y: f64) -> bool {
    let mut inside = false;
    for (at, &[x1, y1]) in ring.iter().enumerate() {
        let [x2, y2] = ring[(at + 1) % ring.len()];
        if (y1 > y) != (y2 > y) && x < x1 + (y - y1) / (y2 - y1) * (x2 - x1) {
            inside = !inside;
        }
    }
    inside
}

/// The way down the coast's distance from a point, as a unit vector: toward the sea.
fn seaward_of(ground: &Ground, at: [f64; 2]) -> [f64; 2] {
    let reach = 600.0;
    let across = ground.coast.at(at[0] + reach, at[1]) - ground.coast.at(at[0] - reach, at[1]);
    let down = ground.coast.at(at[0], at[1] + reach) - ground.coast.at(at[0], at[1] - reach);
    let length = (across * across + down * down).sqrt();
    if length > 1e-6 { [-across / length, -down / length] } else { [0.0, 0.0] }
}

/// The distance between two points, metres.
#[must_use]
pub fn distance(from: [f64; 2], to: [f64; 2]) -> f64 {
    ((to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1])).sqrt()
}

/// A ring's bounds: west, north, east, south.
#[must_use]
pub fn bounds_of(ring: &[[f64; 2]]) -> [f64; 4] {
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    ring.iter()
        .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)])
}

impl Field {
    /// Reads the ground over a claim's bounds and `margin` metres past them.
    #[must_use]
    pub fn read(ground: &Ground, claim: &[[f64; 2]], margin: f64) -> Self {
        Self::read_over(ground, claim, margin, None)
    }

    /// Reads the ground over the same claim `margin` metres past it, a wider field than this one: where a cell's
    /// centre is one of this field's, its land is taken from here rather than read again.
    #[must_use]
    pub fn widened(&self, ground: &Ground, claim: &[[f64; 2]], margin: f64) -> Self {
        Self::read_over(ground, claim, margin, Some(self))
    }

    fn read_over(ground: &Ground, claim: &[[f64; 2]], margin: f64, inner: Option<&Self>) -> Self {
        let [west, north, east, south] = bounds_of(claim);
        let (west, north) = (west - margin, north - margin);
        let columns = ((east + margin - west) / CELL_M).ceil() as usize;
        let rows = ((south + margin - north) / CELL_M).ceil() as usize;
        let count = columns * rows;
        let mut field = Self {
            west,
            north,
            columns,
            rows,
            height: Vec::with_capacity(count),
            water: Vec::with_capacity(count),
            slope: vec![0.0; count],
            claimed: Vec::with_capacity(count),
            to_sea: Vec::new(),
            to_fresh: Vec::new(),
            inside: Vec::new(),
            seaward: seaward_of(ground, [(west + east + margin) / 2.0, (north + south + margin) / 2.0]),
        };
        for row in 0..rows {
            for column in 0..columns {
                let [x, y] = field.centre(column, row);
                let known = inner.and_then(|inner| {
                    let (inner_column, inner_row) = inner.cell_of(x, y)?;
                    (inner.centre(inner_column, inner_row) == [x, y]).then(|| inner.index(inner_column, inner_row))
                });
                if let Some((inner, at)) = inner.zip(known) {
                    field.height.push(inner.height[at]);
                    field.water.push(inner.water[at]);
                    field.claimed.push(inner.claimed[at]);
                    continue;
                }
                field.height.push(ground.height_at(x, y));
                field.water.push(match ground.water_at(x, y) {
                    WaterAt::Dry => Water::Dry,
                    WaterAt::Sea => Water::Sea,
                    WaterAt::Lake { .. } => Water::Lake,
                    WaterAt::River { .. } => Water::River,
                });
                field.claimed.push(ring_holds(claim, x, y));
            }
        }
        field.slope = slopes(&field.height, columns, rows);
        field.to_sea = chamfer(columns, rows, |at| field.water[at] == Water::Sea);
        field.to_fresh = chamfer(columns, rows, |at| matches!(field.water[at], Water::Lake | Water::River));
        field.inside = chamfer(columns, rows, |at| !field.claimed[at]);
        field
    }

    /// Takes the cells within a capsule (`[x1, y1, x2, y2, half]`, a sculpt's wing) into the claim, and measures again
    /// how far inside it each cell lies.
    pub fn claim_more(&mut self, [x1, y1, x2, y2, half]: [f64; 5]) {
        for at in 0..self.claimed.len() {
            let centre = self.centre(at % self.columns, at / self.columns);
            if crate::paths::off_line(centre, [x1, y1], [x2, y2]) <= half {
                self.claimed[at] = true;
            }
        }
        self.inside = chamfer(self.columns, self.rows, |at| !self.claimed[at]);
    }

    /// A cell's index.
    #[must_use]
    pub const fn index(&self, column: usize, row: usize) -> usize {
        row * self.columns + column
    }

    /// A cell's centre, world metres.
    #[must_use]
    pub fn centre(&self, column: usize, row: usize) -> [f64; 2] {
        [self.west + (column as f64 + 0.5) * CELL_M, self.north + (row as f64 + 0.5) * CELL_M]
    }

    /// The cell holding a world point, if the grid reaches it.
    #[must_use]
    pub fn cell_of(&self, x: f64, y: f64) -> Option<(usize, usize)> {
        let (column, row) = ((x - self.west) / CELL_M, (y - self.north) / CELL_M);
        (column >= 0.0 && row >= 0.0 && column < self.columns as f64 && row < self.rows as f64)
            .then_some((column as usize, row as usize))
    }

    /// The cell index nearest a world point, clamped onto the grid.
    #[must_use]
    pub fn nearest(&self, x: f64, y: f64) -> usize {
        let clamp = |value: f64, cells: usize| (value / CELL_M).floor().clamp(0.0, (cells - 1) as f64) as usize;
        self.index(clamp(x - self.west, self.columns), clamp(y - self.north, self.rows))
    }

    /// The height at a world point, read from the nearest cell.
    #[must_use]
    pub fn height_near(&self, x: f64, y: f64) -> f64 {
        self.height[self.nearest(x, y)]
    }

    /// Whether a body could stand on the cell: dry land no steeper than a walked slope.
    #[must_use]
    pub fn walkable(&self, at: usize) -> bool {
        self.water[at] == Water::Dry && self.slope[at] <= WALKED_SLOPE
    }
}

/// Each cell's distance, metres, to the nearest cell `from` holds, by a two-pass chamfer (3 across, 4 corner).
#[must_use]
pub fn chamfer(columns: usize, rows: usize, from: impl Fn(usize) -> bool) -> Vec<f64> {
    let mut steps: Vec<f64> = (0..columns * rows).map(|at| if from(at) { 0.0 } else { FAR_M }).collect();
    let (straight, corner) = (3.0, 4.0);
    let mut relax = |at: usize, other: usize, cost: f64| {
        if steps[other] + cost < steps[at] {
            steps[at] = steps[other] + cost;
        }
    };
    for row in 0..rows {
        for column in 0..columns {
            let at = row * columns + column;
            if column > 0 {
                relax(at, at - 1, straight);
            }
            if row > 0 {
                relax(at, at - columns, straight);
                if column > 0 {
                    relax(at, at - columns - 1, corner);
                }
                if column + 1 < columns {
                    relax(at, at - columns + 1, corner);
                }
            }
        }
    }
    for row in (0..rows).rev() {
        for column in (0..columns).rev() {
            let at = row * columns + column;
            if column + 1 < columns {
                relax(at, at + 1, straight);
            }
            if row + 1 < rows {
                relax(at, at + columns, straight);
                if column + 1 < columns {
                    relax(at, at + columns + 1, corner);
                }
                if column > 0 {
                    relax(at, at + columns - 1, corner);
                }
            }
        }
    }
    steps.into_iter().map(|step| if step >= FAR_M { FAR_M } else { step / straight * CELL_M }).collect()
}

/// Each cell's slope, its rise a metre, from the heights of a grid of cells `columns` wide, row by row: the
/// gradient east and south between its neighbours either side, or itself and its one neighbour at an edge.
fn slopes(height: &[f64], columns: usize, rows: usize) -> Vec<f64> {
    let across =
        |from: usize, to: usize, step: usize| (height[to] - height[from]) / (CELL_M * ((to - from) / step) as f64);
    let rise = |low: usize, high: usize, at: usize, step: usize| {
        let (back, ahead) = (at.saturating_sub(step).max(low), (at + step).min(high));
        if ahead > back { across(back, ahead, step) } else { 0.0 }
    };
    (0..rows * columns)
        .map(|at| {
            let (row, column) = (at / columns, at % columns);
            let east = rise(row * columns, row * columns + columns - 1, at, 1);
            let south = rise(column, column + (rows - 1) * columns, at, columns);
            (east * east + south * south).sqrt()
        })
        .collect()
}

/// A river through a claim, as its zone's brief asks: the wings that carry the claim along the river's course where it
/// runs between the claim's north and south bounds, a capsule a stretch, and each stretch's banks as floor (water
/// meadows), so the section takes the river in.
#[derive(Debug, Clone, PartialEq)]
pub struct RiverWing {
    pub wings: Vec<[f64; 5]>,
    pub floors: Vec<[f64; 5]>,
}

/// The water meadows' half-width either side of the river's middle, and the wing's, metres: the meadows wander out a
/// third at most and the section reaches 4 m past them, all inside the wing. Each widens as far as the river strays
/// from its course.
const MEADOW_HALF_M: f64 = 12.0;
const RIVER_WING_M: f64 = 24.0;
/// How long a stretch of the river's rows its course takes the middle of, and how long a wing's stretch is at most,
/// metres.
const COURSE_STEP_M: f64 = 40.0;
const STRETCH_M: f64 = 160.0;
/// How many cells apart two of a river's cells may lie and be one river.
const GAP_CELLS: usize = 3;
/// How far a river's wing keeps from the sea, metres: past the strand.
const RIVER_SEA_CLEAR_M: f64 = 50.0;

/// The river a claim holds most of, between its north and south bounds, carried into the claim by a wing a stretch
/// (`RiverWing`); a stretch whose wing would reach another node's claim (`avoid`) or near the sea is left out. None
/// where no river runs in the claim.
#[must_use]
pub fn river_wing(field: &Field, claim: &[[f64; 2]], avoid: &[Vec<[f64; 2]>]) -> Option<RiverWing> {
    let [_, north, _, south] = bounds_of(claim);
    let columns = field.columns;
    let centre = |at: usize| field.centre(at % columns, at / columns);
    let river = |at: usize| field.water[at] == Water::River && (north..=south).contains(&centre(at)[1]);
    // The river cells within a few cells of one another, as a river narrower than a cell leaves gaps along a slant;
    // the group with the most cells in the claim is its river.
    let mut group = vec![usize::MAX; field.water.len()];
    let mut groups: Vec<(usize, Vec<usize>)> = Vec::new();
    for start in (0..field.water.len()).filter(|&at| river(at)) {
        if group[start] != usize::MAX {
            continue;
        }
        let (mut cells, mut stack) = (Vec::new(), vec![start]);
        group[start] = groups.len();
        while let Some(at) = stack.pop() {
            cells.push(at);
            let (column, row) = (at % columns, at / columns);
            for next_row in row.saturating_sub(GAP_CELLS)..=(row + GAP_CELLS).min(field.rows - 1) {
                for next_column in column.saturating_sub(GAP_CELLS)..=(column + GAP_CELLS).min(columns - 1) {
                    let next = field.index(next_column, next_row);
                    if river(next) && group[next] == usize::MAX {
                        group[next] = groups.len();
                        stack.push(next);
                    }
                }
            }
        }
        groups.push((cells.iter().filter(|&&at| field.claimed[at]).count(), cells));
    }
    let (claimed, cells) = groups.into_iter().max_by_key(|(claimed, cells)| (*claimed, cells.len()))?;
    if claimed == 0 {
        return None;
    }
    // shortcut: the course is the middle of each stretch of rows, which suits a river running north and south, as the
    // Vale's does; a brief naming a river that runs east and west wants its course taken along its own length.
    let rows_a_stretch = (COURSE_STEP_M / CELL_M) as usize;
    let mut stretches: std::collections::BTreeMap<usize, [f64; 3]> = std::collections::BTreeMap::new();
    for &at in &cells {
        let [x, y] = centre(at);
        let sum = stretches.entry(at / columns / rows_a_stretch).or_insert([0.0; 3]);
        *sum = [sum[0] + x, sum[1] + y, sum[2] + 1.0];
    }
    let mut middles: Vec<[f64; 2]> = stretches.values().map(|&[x, y, count]| [x / count, y / count]).collect();
    // The course runs on to the river's first and last rows in the span, not only to their stretches' middles.
    let rows = cells.iter().map(|&at| centre(at)[1]);
    let [first, last] = rows.fold([f64::INFINITY, f64::NEG_INFINITY], |[low, high], y| [low.min(y), high.max(y)]);
    if let Some(end) = middles.first_mut() {
        end[1] = first;
    }
    if let Some(end) = middles.last_mut() {
        end[1] = last;
    }
    let course = crate::paths::simplified(&middles, CELL_M / 2.0);
    // Stretches no longer than a few of the river's rows, so one near another claim leaves out only itself.
    let segments: Vec<[[f64; 2]; 2]> = course
        .windows(2)
        .flat_map(|pair| {
            let pieces = (distance(pair[0], pair[1]) / STRETCH_M).ceil().max(1.0) as u32;
            let at = move |piece: u32| {
                let share = f64::from(piece) / f64::from(pieces);
                [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]
            };
            (0..pieces).map(move |piece| [at(piece), at(piece + 1)])
        })
        .collect();
    // How far the river strays from each stretch of its course.
    let mut strays = vec![0.0_f64; segments.len()];
    for &at in &cells {
        let offs = segments.iter().map(|&[from, to]| crate::paths::off_line(centre(at), from, to));
        if let Some((nearest, off)) = offs.enumerate().min_by(|first, second| first.1.total_cmp(&second.1)) {
            strays[nearest] = strays[nearest].max(off);
        }
    }
    let mut wing = RiverWing { wings: Vec::new(), floors: Vec::new() };
    for (&[from, to], &stray) in segments.iter().zip(&strays) {
        let half = RIVER_WING_M + stray;
        let off_claims = avoid.iter().all(|ring| {
            !ring_holds(ring, from[0], from[1])
                && (0..ring.len()).all(|edge| {
                    crate::paths::segments_apart([from, to], [ring[edge], ring[(edge + 1) % ring.len()]]) > half
                })
        });
        let steps = (distance(from, to) / CELL_M).ceil().max(1.0) as u32;
        let off_sea = (0..=steps).all(|step| {
            let share = f64::from(step) / f64::from(steps);
            let at = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
            field.to_sea[field.nearest(at[0], at[1])] >= RIVER_SEA_CLEAR_M + half
        });
        if off_claims && off_sea {
            wing.wings.push([from[0], from[1], to[0], to[1], half]);
            wing.floors.push([from[0], from[1], to[0], to[1], MEADOW_HALF_M + stray]);
        }
    }
    (!wing.wings.is_empty()).then_some(wing)
}

/// The steepest ground a layout treats as walked: a little under the body's 50 degrees, so a path never hugs a slope
/// a body slides on.
pub const WALKED_SLOPE: f64 = 1.0;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_point_is_inside_a_square_ring_and_outside_past_its_edge() {
        let ring = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]];
        assert!(ring_holds(&ring, 5.0, 5.0));
        assert!(!ring_holds(&ring, 15.0, 5.0));
        assert_eq!(bounds_of(&ring), [0.0, 0.0, 10.0, 10.0]);
    }

    #[test]
    fn a_planes_slope_is_its_gradient_both_ways() {
        let (columns, rows) = (7, 5);
        // Rising 0.3 a metre east and 0.4 south: a slope of 0.5 everywhere, at the edges too.
        let height: Vec<f64> = (0..rows * columns)
            .map(|at| 0.3 * CELL_M * (at % columns) as f64 + 0.4 * CELL_M * (at / columns) as f64)
            .collect();
        for slope in slopes(&height, columns, rows) {
            assert!((slope - 0.5).abs() < 1e-12, "{slope}");
        }
    }

    /// Dry land over a square claim 600 m across and 80 m round it, a river a cell wide running north and south 256 m
    /// east of its middle, and the cells claimed.
    fn a_river() -> Field {
        let claim = [[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
        let (west, north, columns) = (-380.0, -380.0, 95);
        let count = columns * columns;
        let centre =
            |at: usize| [west + ((at % columns) as f64 + 0.5) * CELL_M, north + ((at / columns) as f64 + 0.5) * CELL_M];
        let claimed: Vec<bool> = (0..count).map(|at| ring_holds(&claim, centre(at)[0], centre(at)[1])).collect();
        Field {
            west,
            north,
            columns,
            rows: columns,
            height: vec![5.0; count],
            water: (0..count)
                .map(|at| if (centre(at)[0] - 256.0).abs() < 4.0 { Water::River } else { Water::Dry })
                .collect(),
            slope: vec![0.0; count],
            inside: chamfer(columns, columns, |at| !claimed[at]),
            claimed,
            to_sea: vec![FAR_M; count],
            to_fresh: vec![FAR_M; count],
            seaward: [0.0, -1.0],
        }
    }

    #[test]
    fn a_rivers_wing_carries_the_claim_along_it_and_keeps_off_another_claim() {
        let field = a_river();
        let claim = [[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
        // Another node's claim along the river's northern half, `apart` metres east of its middle.
        let other = |apart: f64| vec![[256.0 + apart, -400.0], [500.0, -400.0], [500.0, 0.0], [256.0 + apart, 0.0]];
        let span = |river: &RiverWing| {
            let ends = river.wings.iter().flat_map(|wing| [wing[1], wing[3]]);
            ends.fold([f64::INFINITY, f64::NEG_INFINITY], |[low, high], y| [low.min(y), high.max(y)])
        };
        // 30 m off, the wing passes it: the whole course between the claim's bounds is carried.
        let Some(beside) = river_wing(&field, &claim, &[other(30.0)]) else { panic!("a river is found") };
        let [north, south] = span(&beside);
        assert!(north < -280.0 && south > 280.0, "from bound to bound: {north} to {south}");
        // 14 m off, the stretches along it are left out.
        let Some(river) = river_wing(&field, &claim, &[other(14.0)]) else { panic!("a river is found") };
        let near = other(14.0);
        assert_eq!(river.wings.len(), river.floors.len());
        for (wing, floor) in river.wings.iter().zip(&river.floors) {
            assert!(wing[4] >= 24.0 && floor[4] >= 12.0 && wing[4] >= floor[4] + 12.0, "{wing:?} {floor:?}");
            let line = [[wing[0], wing[1]], [wing[2], wing[3]]];
            let apart = (0..4).map(|edge| crate::paths::segments_apart(line, [near[edge], near[(edge + 1) % 4]]));
            assert!(apart.fold(f64::INFINITY, f64::min) > wing[4], "no wing reaches the other claim: {wing:?}");
            assert!((wing[0] - 256.0).abs() < 4.0 && (wing[2] - 256.0).abs() < 4.0, "along the river: {wing:?}");
        }
        assert!(span(&river)[1] > 280.0, "the rest still runs to the south bound");
        let all_east = vec![[0.0, -400.0], [400.0, -400.0], [400.0, 400.0], [0.0, 400.0]];
        assert_eq!(river_wing(&field, &claim, &[all_east]), None, "no stretch is left");
    }
}
