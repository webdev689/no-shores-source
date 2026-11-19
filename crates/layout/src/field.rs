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
}
