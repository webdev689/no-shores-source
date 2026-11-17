//! Ground known only by its heights at the centres of a grid of square cells, as a ship's deck is: between centres a
//! blend of the nearest that hold one, and a wall wherever a cell holds no height or the grid ends, standing at that
//! cell's edge, so a body walks every cell to its edge and is stopped there as ground rising past a step stops it. A
//! terrain wall is never climbed, as a block's is.

use crate::body::{Body, standing};
use crate::terrain::Terrain;

/// How far a wall stands over the highest cell, metres: past any step or slope a body walks up.
pub const WALL_RISE_M: f64 = 10.0;
/// The numbers a grid's shape crosses as, before its heights: its west and north edges, its cell, columns and rows.
pub const SHAPE_FLOATS: usize = 5;

/// A grid of heights (x east, y south, metres): its west and north edges, its square cell, its columns and rows, and
/// each cell's height row by row from the north, west to east along a row, none where no body stands.
#[derive(Clone, Debug, PartialEq)]
pub struct Heights {
    west: f64,
    north: f64,
    cell: f64,
    columns: usize,
    rows: usize,
    heights: Vec<Option<f64>>,
    wall: f64,
}

impl Heights {
    /// The grid, if its shape holds its heights: a cell over 0 m, as many heights as cells, every number finite.
    #[must_use]
    pub fn new(
        west: f64,
        north: f64,
        cell: f64,
        columns: usize,
        rows: usize,
        heights: Vec<Option<f64>>,
    ) -> Option<Self> {
        let finite = [west, north, cell].iter().all(|number| number.is_finite())
            && heights.iter().flatten().all(|height| height.is_finite());
        if !finite || cell <= 0.0 || columns.checked_mul(rows) != Some(heights.len()) {
            return None;
        }
        let highest = heights.iter().flatten().copied().fold(f64::NEG_INFINITY, f64::max);
        let wall = if highest.is_finite() { highest + WALL_RISE_M } else { WALL_RISE_M };
        Some(Self { west, north, cell, columns, rows, heights, wall })
    }

    /// The grid from its numbers: its shape (`SHAPE_FLOATS`), then each cell's height, NaN for none.
    #[must_use]
    pub fn from_floats(floats: &[f64]) -> Option<Self> {
        let (shape, heights) = floats.split_at_checked(SHAPE_FLOATS)?;
        let whole = |number: f64| (number >= 0.0 && number.fract() == 0.0 && number < 1e6).then_some(number as usize);
        let heights = heights.iter().map(|height| (!height.is_nan()).then_some(*height)).collect();
        Self::new(shape[0], shape[1], shape[2], whole(shape[3])?, whole(shape[4])?, heights)
    }

    /// The grid as its numbers, as `from_floats` reads them.
    #[must_use]
    pub fn to_floats(&self) -> Vec<f64> {
        let shape = [self.west, self.north, self.cell, self.columns as f64, self.rows as f64];
        shape.into_iter().chain(self.heights.iter().map(|height| height.unwrap_or(f64::NAN))).collect()
    }

    /// A cell's height, or none where it holds none or lies off the grid.
    fn at(&self, column: i64, row: i64) -> Option<f64> {
        let on = (0..self.columns as i64).contains(&column) && (0..self.rows as i64).contains(&row);
        if on { self.heights[row as usize * self.columns + column as usize] } else { None }
    }

    /// The height of the cell (x, y) lies in, or none.
    fn cell_at(&self, x: f64, y: f64) -> Option<f64> {
        let column = ((x - self.west) / self.cell).floor() as i64;
        let row = ((y - self.north) / self.cell).floor() as i64;
        self.at(column, row)
    }

    /// Whether a body may stand at (x, y): its cell holds a height.
    #[must_use]
    pub fn stands_at(&self, x: f64, y: f64) -> bool {
        self.cell_at(x, y).is_some()
    }

    /// A body standing at (x, y) on the grid, facing north.
    #[must_use]
    pub fn standing(&self, x: f64, y: f64) -> Body {
        Body { z: self.height_at(x, y), facing: 0.0, ..standing(x, y) }
    }
}

impl Terrain for Heights {
    /// The wall in a cell that holds no height; in one that does, the four cell centres round the point blended by
    /// how near each is, those that hold no height left out. The point's own cell is one of the four, at a quarter of
    /// the weight or more, so a blend always has something to blend.
    fn height_at(&self, x: f64, y: f64) -> f64 {
        if self.cell_at(x, y).is_none() {
            return self.wall;
        }
        let across = (x - self.west) / self.cell - 0.5;
        let down = (y - self.north) / self.cell - 0.5;
        let (column, row) = (across.floor(), down.floor());
        let (east, south) = (across - column, down - row);
        let (column, row) = (column as i64, row as i64);
        let corners = [
            (self.at(column, row), (1.0 - east) * (1.0 - south)),
            (self.at(column + 1, row), east * (1.0 - south)),
            (self.at(column, row + 1), (1.0 - east) * south),
            (self.at(column + 1, row + 1), east * south),
        ];
        let (sum, weight) = corners
            .iter()
            .filter_map(|&(height, weight)| height.map(|height| (height * weight, weight)))
            .fold((0.0, 0.0), |(sum, total), (part, weight)| (sum + part, total + weight));
        if weight > 0.0 { sum / weight } else { self.wall }
    }
}
