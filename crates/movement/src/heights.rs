//! Ground known only by its heights at the centres of a grid of square cells, as a ship's deck is: between centres a
//! blend of the nearest that hold one, and a wall wherever a cell holds no height or the grid ends, standing at that
//! cell's edge, so a body walks every cell to its edge and is stopped there as ground rising past a step stops it. A
//! terrain wall is never climbed, as a block's is.

use crate::blocks::Block;
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

    /// The column and row (x, y) lies in.
    fn index_of(&self, x: f64, y: f64) -> (i64, i64) {
        (((x - self.west) / self.cell).floor() as i64, ((y - self.north) / self.cell).floor() as i64)
    }

    /// The height of the cell (x, y) lies in, or none.
    fn cell_at(&self, x: f64, y: f64) -> Option<f64> {
        let (column, row) = self.index_of(x, y);
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

    /// The ground round a course of blocks laid over the open sea, as a ship's deck is held: open, at 0 m under the
    /// blocks that stand bodies on their tops, in every cell of `cell` metres whose middle a block covers, and a wall in
    /// every other. So a body walks, falls, vaults and climbs anywhere over the blocks, and is held at their edge: the
    /// sea is never reached. The grid starts at the blocks' west and north edges, so blocks laid in squares of `cell`
    /// from there are held to the square.
    #[must_use]
    pub fn rim(blocks: &[Block], cell: f64) -> Self {
        let west = blocks.iter().map(|block| block.min_x).fold(f64::INFINITY, f64::min);
        let north = blocks.iter().map(|block| block.min_y).fold(f64::INFINITY, f64::min);
        let east = blocks.iter().map(|block| block.max_x).fold(f64::NEG_INFINITY, f64::max);
        let south = blocks.iter().map(|block| block.max_y).fold(f64::NEG_INFINITY, f64::max);
        let count = |span: f64| if span > 0.0 && span.is_finite() { (span / cell).ceil() as usize } else { 0 };
        let (columns, rows) = (count(east - west), count(south - north));
        let mut heights = vec![None; columns * rows];
        // The cells whose middles lie from `low` to `high` along an edge starting at `start`.
        let span = |low: f64, high: f64, start: f64, most: usize| {
            let first = ((low - start) / cell - 0.5).ceil().max(0.0) as usize;
            let last = ((high - start) / cell - 0.5).floor().min(most as f64 - 1.0);
            (last >= first as f64).then(|| first..=last as usize)
        };
        for block in blocks {
            let (Some(across), Some(down)) =
                (span(block.min_x, block.max_x, west, columns), span(block.min_y, block.max_y, north, rows))
            else {
                continue;
            };
            for row in down {
                for column in across.clone() {
                    heights[row * columns + column] = Some(0.0);
                }
            }
        }
        let (west, north) = if columns * rows > 0 { (west, north) } else { (0.0, 0.0) };
        Self::new(west, north, cell, columns, rows, heights).unwrap_or_else(|| unreachable!("a grid made to its shape"))
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

    /// Whether a cell that holds no height lies on the move, each cell it passes through taken in turn; through a
    /// corner, both cells beside it count, so two walls meeting at a corner leave no gap.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        let (mut column, mut row) = self.index_of(from.0, from.1);
        let end = self.index_of(to.0, to.1);
        let (along_x, along_y) = (to.0 - from.0, to.1 - from.1);
        let (step_x, step_y) = (sign(along_x), sign(along_y));
        // The share of the move at which it first crosses into the next column and the next row, and each one after.
        let first = |at: f64, edge: f64, index: i64, step: i64, along: f64| {
            if step == 0 {
                f64::INFINITY
            } else {
                (edge + (index + i64::from(step > 0)) as f64 * self.cell - at) / along
            }
        };
        let mut cross_x = first(from.0, self.west, column, step_x, along_x);
        let mut cross_y = first(from.1, self.north, row, step_y, along_y);
        let each_x = if step_x == 0 { f64::INFINITY } else { self.cell / along_x.abs() };
        let each_y = if step_y == 0 { f64::INFINITY } else { self.cell / along_y.abs() };
        let mut left = (end.0 - column).abs() + (end.1 - row).abs();
        while (column, row) != end && left > 0 {
            left -= 1;
            if cross_x < cross_y {
                column += step_x;
                cross_x += each_x;
            } else if cross_y < cross_x {
                row += step_y;
                cross_y += each_y;
            } else {
                if self.at(column + step_x, row).is_none() || self.at(column, row + step_y).is_none() {
                    return true;
                }
                (column, row) = (column + step_x, row + step_y);
                (cross_x, cross_y) = (cross_x + each_x, cross_y + each_y);
            }
            if self.at(column, row).is_none() {
                return true;
            }
        }
        false
    }
}

/// -1, 0 or 1 by the sign of a number.
fn sign(number: f64) -> i64 {
    if number > 0.0 {
        1
    } else if number < 0.0 {
        -1
    } else {
        0
    }
}
