//! The city's cells: Daggerfall's RMB blocks, 102.4 m a side, on a grid square to the world and centred on the site,
//! so every block a city stands lies whole in one cell.

use serde::Serialize;

/// A cell's side, metres: one RMB block, 4096 Daggerfall units at 0.025 m.
pub const CELL_M: f64 = 102.4;
/// The city wall's distance from the landmark, metres: half DFO's Imperial City, whose wall stands 6.9 km out.
pub const RADIUS_M: f64 = 3456.0;
/// Cells each way from the middle one: the radius and a spare cell.
pub const REACH_CELLS: usize = 35;
/// Cells along each side of the grid.
pub const SIDE_CELLS: usize = 2 * REACH_CELLS + 1;

/// The grid: the world position of its north-west corner, cells counted east and south from it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Grid {
    pub west: f64,
    pub north: f64,
}

impl Grid {
    /// The grid round a site: its middle cell's centre stands on the site.
    #[must_use]
    pub fn round(centre: [f64; 2]) -> Self {
        let half = (REACH_CELLS as f64 + 0.5) * CELL_M;
        Self { west: centre[0] - half, north: centre[1] - half }
    }

    /// A cell's centre in world metres.
    #[must_use]
    pub fn centre(&self, column: usize, row: usize) -> [f64; 2] {
        [self.west + (column as f64 + 0.5) * CELL_M, self.north + (row as f64 + 0.5) * CELL_M]
    }

    /// A cell's west, north, east and south edges in world metres.
    #[must_use]
    pub fn bounds(&self, column: usize, row: usize) -> [f64; 4] {
        let (west, north) = (self.west + column as f64 * CELL_M, self.north + row as f64 * CELL_M);
        [west, north, west + CELL_M, north + CELL_M]
    }

    /// The cell holding a world point, if the grid reaches it.
    #[must_use]
    pub fn cell_of(&self, x: f64, y: f64) -> Option<(usize, usize)> {
        let (column, row) = ((x - self.west) / CELL_M, (y - self.north) / CELL_M);
        let reach = SIDE_CELLS as f64;
        (column >= 0.0 && row >= 0.0 && column < reach && row < reach)
            .then(|| (column.floor() as usize, row.floor() as usize))
    }
}

/// A cell's place in a list of every cell, row by row.
#[must_use]
pub const fn index(column: usize, row: usize) -> usize {
    row * SIDE_CELLS + column
}

/// The cells sharing an edge with a cell, inside the grid.
pub fn neighbours(column: usize, row: usize) -> impl Iterator<Item = (usize, usize)> {
    let steps: [(isize, isize); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];
    steps.into_iter().filter_map(move |(east, south)| {
        let (next_column, next_row) = (column.checked_add_signed(east)?, row.checked_add_signed(south)?);
        (next_column < SIDE_CELLS && next_row < SIDE_CELLS).then_some((next_column, next_row))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_middle_cell_stands_on_the_site() {
        let grid = Grid::round([1_000_000.0, 2_000_000.0]);
        assert_eq!(grid.centre(REACH_CELLS, REACH_CELLS), [1_000_000.0, 2_000_000.0]);
        assert_eq!(grid.cell_of(1_000_000.0, 2_000_000.0), Some((REACH_CELLS, REACH_CELLS)));
    }

    #[test]
    fn the_grid_reaches_past_the_wall_and_no_further() {
        let grid = Grid::round([0.0, 0.0]);
        assert!(grid.cell_of(RADIUS_M, 0.0).is_some());
        assert!(grid.cell_of(0.0, -RADIUS_M).is_some());
        assert!(grid.cell_of(RADIUS_M + 2.0 * CELL_M, 0.0).is_none());
    }

    #[test]
    fn a_corner_cell_has_two_neighbours() {
        assert_eq!(neighbours(0, 0).count(), 2);
        assert_eq!(neighbours(5, 5).count(), 4);
        assert_eq!(neighbours(SIDE_CELLS - 1, 3).count(), 3);
    }
}
