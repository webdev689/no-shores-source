//! A grid of values over a window of the world: `width` by `height` cells of `cell_m` metres, its corner at
//! (`left_m`, `top_m`) metres east and south of the frame's north-west corner. Cell (i, j) covers
//! [left + i·cell, left + (i + 1)·cell) across and the same down.

/// The eight neighbours' offsets, east then clockwise, and their distances in cells.
pub const D8_X: [isize; 8] = [1, 1, 0, -1, -1, -1, 0, 1];
pub const D8_Y: [isize; 8] = [0, 1, 1, 1, 0, -1, -1, -1];
pub const D8_LENGTH: [f64; 8] = [
    1.0,
    std::f64::consts::SQRT_2,
    1.0,
    std::f64::consts::SQRT_2,
    1.0,
    std::f64::consts::SQRT_2,
    1.0,
    std::f64::consts::SQRT_2,
];

#[derive(Debug, Clone, PartialEq)]
pub struct Grid {
    pub width: usize,
    pub height: usize,
    pub left_m: f64,
    pub top_m: f64,
    pub cell_m: f64,
    pub data: Vec<f64>,
}

impl Grid {
    #[must_use]
    pub fn new(width: usize, height: usize, left_m: f64, top_m: f64, cell_m: f64) -> Self {
        Self { width, height, left_m, top_m, cell_m, data: vec![0.0; width * height] }
    }

    /// A grid of the same window, every cell `value`.
    #[must_use]
    pub fn like(&self, value: f64) -> Self {
        Self { data: vec![value; self.data.len()], ..self.clone() }
    }

    /// A cell's value, its indices clamped to the grid.
    #[must_use]
    pub fn get(&self, i: isize, j: isize) -> f64 {
        let column = i.clamp(0, self.width as isize - 1) as usize;
        let row = j.clamp(0, self.height as isize - 1) as usize;
        self.data[row * self.width + column]
    }

    /// The centre of cell (i, j) in world metres.
    #[must_use]
    pub fn centre(&self, i: usize, j: usize) -> (f64, f64) {
        (self.left_m + (i as f64 + 0.5) * self.cell_m, self.top_m + (j as f64 + 0.5) * self.cell_m)
    }

    /// Bilinear between cell centres at a world point.
    #[must_use]
    pub fn at(&self, x: f64, y: f64) -> f64 {
        let (grid_x, grid_y) = ((x - self.left_m) / self.cell_m - 0.5, (y - self.top_m) / self.cell_m - 0.5);
        let (i, j) = (grid_x.floor(), grid_y.floor());
        let (fraction_x, fraction_y) = (grid_x - i, grid_y - j);
        let (i, j) = (i as isize, j as isize);
        let top = self.get(i, j) + (self.get(i + 1, j) - self.get(i, j)) * fraction_x;
        let bottom = self.get(i, j + 1) + (self.get(i + 1, j + 1) - self.get(i, j + 1)) * fraction_x;
        top + (bottom - top) * fraction_y
    }

    /// Catmull-Rom between cell centres at a world point: slopes run smoothly across cells, for ground to stand on.
    #[must_use]
    pub fn cubic_at(&self, x: f64, y: f64) -> f64 {
        let (grid_x, grid_y) = ((x - self.left_m) / self.cell_m - 0.5, (y - self.top_m) / self.cell_m - 0.5);
        let (i, j) = (grid_x.floor(), grid_y.floor());
        let (fraction_x, fraction_y) = (grid_x - i, grid_y - j);
        let (i, j) = (i as isize, j as isize);
        let row = |row: isize| {
            catmull(self.get(i - 1, row), self.get(i, row), self.get(i + 1, row), self.get(i + 2, row), fraction_x)
        };
        catmull(row(j - 1), row(j), row(j + 1), row(j + 2), fraction_y)
    }
}

/// Catmull-Rom through `start`..`end` at `fraction`, `previous` and `next` the points either side.
#[must_use]
pub fn catmull(previous: f64, start: f64, end: f64, next: f64, fraction: f64) -> f64 {
    start
        + 0.5
            * fraction
            * (end - previous
                + fraction
                    * (2.0 * previous - 5.0 * start + 4.0 * end - next
                        + fraction * (3.0 * (start - end) + next - previous)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolation_meets_the_cells_at_their_centres() {
        let mut grid = Grid::new(4, 4, 1000.0, 2000.0, 100.0);
        for (index, value) in grid.data.iter_mut().enumerate() {
            *value = index as f64;
        }
        let (x, y) = grid.centre(2, 1);
        assert!((grid.at(x, y) - 6.0).abs() < 1e-9);
        assert!((grid.cubic_at(x, y) - 6.0).abs() < 1e-9);
        assert!((grid.at(x + 50.0, y) - 6.5).abs() < 1e-9);
    }
}
