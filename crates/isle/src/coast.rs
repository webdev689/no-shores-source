//! How far in from the coast each point lies, metres, negative out at sea: an exact Euclidean distance transform
//! (Felzenszwalb and Huttenlocher's, a column pass then a row pass) over a grid of the island's land and sea, so its
//! beach, its rise and its seabed follow the real coast, however its bay and headlands bend it. Near the coast the
//! radial measure is exact and finer than the grid, and is taken there.

use movement::{Heights, Terrain};

/// Far enough to stand for no feature at all.
const FAR: f64 = 1e12;

/// The squared distance from each cell to the nearest feature along one line of cells (the lower envelope of the
/// parabolas rooted at each).
fn line(found: &[f64], cell: f64) -> Vec<f64> {
    let count = found.len();
    let (mut roots, mut bounds) = (vec![0_usize; count], vec![0.0_f64; count + 1]);
    let mut held = 0;
    bounds[0] = f64::NEG_INFINITY;
    bounds[1] = f64::INFINITY;
    let at = |index: usize| index as f64 * cell;
    for index in 1..count {
        loop {
            let root = roots[held];
            let meet = ((found[index] + at(index) * at(index)) - (found[root] + at(root) * at(root)))
                / (2.0 * at(index) - 2.0 * at(root));
            if meet <= bounds[held] && held > 0 {
                held -= 1;
                continue;
            }
            if meet <= bounds[held] {
                roots[0] = index;
                bounds[1] = f64::INFINITY;
                break;
            }
            held += 1;
            roots[held] = index;
            bounds[held] = meet;
            bounds[held + 1] = f64::INFINITY;
            break;
        }
    }
    let mut squared = vec![0.0; count];
    held = 0;
    for (index, distance) in squared.iter_mut().enumerate() {
        while bounds[held + 1] < at(index) {
            held += 1;
        }
        let root = roots[held];
        *distance = (at(index) - at(root)) * (at(index) - at(root)) + found[root];
    }
    squared
}

/// The distance from each cell of a grid to the nearest cell `feature` marks, metres.
fn distances(feature: &[bool], columns: usize, rows: usize, cell: f64) -> Vec<f64> {
    let mut squared: Vec<f64> = feature.iter().map(|&is| if is { 0.0 } else { FAR }).collect();
    for column in 0..columns {
        let found: Vec<f64> = (0..rows).map(|row| squared[row * columns + column]).collect();
        for (row, distance) in line(&found, cell).into_iter().enumerate() {
            squared[row * columns + column] = distance;
        }
    }
    for row in 0..rows {
        let found = &squared[row * columns..(row + 1) * columns];
        let done = line(found, cell);
        squared[row * columns..(row + 1) * columns].copy_from_slice(&done);
    }
    squared.into_iter().map(f64::sqrt).collect()
}

/// The coast's distance over a square grid of cells on the island's middle.
#[derive(Clone, Debug)]
pub struct Coast {
    inland: Heights,
}

impl Coast {
    /// The distance over `half` metres each way of the middle, in cells of `cell`, for a coast `edge` metres out on
    /// each bearing.
    #[must_use]
    pub fn new(half: f64, cell: f64, edge: &dyn Fn([f64; 2]) -> f64) -> Self {
        let cells = (2.0 * half / cell).round() as usize;
        let middle = |index: usize| -half + (index as f64 + 0.5) * cell;
        let land: Vec<bool> =
            (0..cells * cells).map(|index| edge([middle(index % cells), middle(index / cells)]) > 0.0).collect();
        let sea: Vec<bool> = land.iter().map(|&is| !is).collect();
        let to_sea = distances(&sea, cells, cells, cell);
        let to_land = distances(&land, cells, cells, cell);
        // A cell's middle is half a cell from the boundary between it and its neighbour across the coast.
        let inland = land
            .iter()
            .zip(to_sea.iter().zip(&to_land))
            .map(|(&is, (&sea, &land))| Some(if is { sea - cell / 2.0 } else { cell / 2.0 - land }))
            .collect();
        let inland = Heights::new(-half, -half, cell, cells, cells, inland)
            .unwrap_or_else(|| unreachable!("a grid of its own cells"));
        Coast { inland }
    }

    /// How far in from the coast a point lies, metres; `radial` is the coast's radius on its bearing less its own
    /// distance from the middle, exact near the coast.
    #[must_use]
    pub fn inland(&self, [x, y]: [f64; 2], radial: f64) -> f64 {
        // Off its grid, out at sea, the radial measure is all there is.
        if !self.inland.stands_at(x, y) {
            return radial;
        }
        let far = self.inland.height_at(x, y);
        let toward = ((far.abs() - 3.0) / 5.0).clamp(0.0, 1.0);
        radial + (far - radial) * toward
    }
}
