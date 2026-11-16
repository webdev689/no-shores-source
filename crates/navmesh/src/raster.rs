//! The solid heightfield: the ground and the colliders voxelised into columns, each a sorted list of solid spans.

use crate::collider::Collider;
use crate::{Agent, Bounds};

/// Solid voxels in one column, from `bottom` up to `top` (voxels over the grid's floor), and whether the surface on
/// top is gentle enough to be floor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SolidSpan {
    pub bottom: i64,
    pub top: i64,
    pub walkable: bool,
}

/// Where the grid lies: its cell (across) and voxel (up) sizes, its corner, and its size in cells and voxels.
/// Column `ix + iy * cells_x` covers the cell `ix` east and `iy` south of the corner.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Grid {
    pub cell: f64,
    pub voxel: f64,
    pub min_x: f64,
    pub min_y: f64,
    pub min_z: f64,
    pub cells_x: usize,
    pub cells_y: usize,
    pub voxels: i64,
}

impl Grid {
    /// The world (x, y) of a cell's centre.
    pub fn centre(&self, ix: usize, iy: usize) -> (f64, f64) {
        (self.min_x + (ix as f64 + 0.5) * self.cell, self.min_y + (iy as f64 + 0.5) * self.cell)
    }

    /// The world height of a voxel boundary.
    pub fn height(&self, voxel: i64) -> f64 {
        self.min_z + voxel as f64 * self.voxel
    }
}

#[derive(Debug)]
pub(crate) struct Heightfield {
    pub grid: Grid,
    pub columns: Vec<Vec<SolidSpan>>,
}

impl Heightfield {
    /// Adds solid from `low` to `high` (world heights) to a column, joining every span it touches. The joined span's
    /// top surface is the higher one's: a body stands on the highest surface.
    fn add_span(&mut self, column: usize, low: f64, high: f64, walkable: bool) {
        let grid = self.grid;
        let bottom = (((low - grid.min_z) / grid.voxel).floor() as i64).max(0);
        let top = (((high - grid.min_z) / grid.voxel).ceil() as i64).min(grid.voxels);
        if top <= bottom {
            return;
        }
        let list = &mut self.columns[column];
        let mut joined = SolidSpan { bottom, top, walkable };
        let mut index = 0;
        while index < list.len() {
            let span = list[index];
            if span.top < joined.bottom {
                index += 1;
                continue;
            }
            if span.bottom > joined.top {
                break;
            }
            if span.top > joined.top {
                joined.top = span.top;
                joined.walkable = span.walkable;
            }
            joined.bottom = joined.bottom.min(span.bottom);
            list.remove(index);
        }
        list.insert(index, joined);
    }
}

/// The cells a footprint edge range touches along one axis, held to the grid: every cell the footprint touches, so a
/// thin wall never leaks.
fn cell_range(low: f64, high: f64, origin: f64, cell: f64, cells: usize) -> Option<(usize, usize)> {
    let first = (((low - origin) / cell).floor() as i64).max(0);
    let last = ((((high - origin) / cell).ceil() as i64) - 1).min(cells as i64 - 1);
    (first <= last).then_some((first as usize, last as usize))
}

/// Voxelises the ground under every cell of `bounds`, at 0, and the colliders over it.
pub(crate) fn voxelise(colliders: &[Collider], bounds: Bounds, agent: &Agent) -> Heightfield {
    let (cell, voxel) = (agent.cell_size, agent.cell_height);
    let top = colliders.iter().fold(0.0_f64, |tallest, collider| tallest.max(collider.highest()));
    let min_z = -voxel;
    let max_z = top + voxel;
    let cells_x = ((bounds.max_x - bounds.min_x) / cell).ceil().max(1.0) as usize;
    let cells_y = ((bounds.max_y - bounds.min_y) / cell).ceil().max(1.0) as usize;
    let voxels = ((max_z - min_z) / voxel).ceil().max(1.0) as i64;
    let grid = Grid { cell, voxel, min_x: bounds.min_x, min_y: bounds.min_y, min_z, cells_x, cells_y, voxels };
    let mut field = Heightfield { grid, columns: vec![Vec::new(); cells_x * cells_y] };
    for column in 0..cells_x * cells_y {
        field.add_span(column, min_z, 0.0, true);
    }
    for collider in colliders {
        let base = collider.base(min_z);
        let walkable = collider.walkable_top(agent.max_slope);
        let [min_x, min_y, max_x, max_y] = collider.footprint();
        let Some((x_first, x_last)) = cell_range(min_x, max_x, grid.min_x, cell, cells_x) else { continue };
        let Some((y_first, y_last)) = cell_range(min_y, max_y, grid.min_y, cell, cells_y) else { continue };
        for iy in y_first..=y_last {
            for ix in x_first..=x_last {
                let (centre_x, centre_y) = grid.centre(ix, iy);
                // An edge cell's centre lies off the footprint: sample the top at its nearest point on it.
                let sample_x = centre_x.clamp(min_x, max_x);
                let sample_y = centre_y.clamp(min_y, max_y);
                field.add_span(ix + iy * cells_x, base, collider.surface(sample_x, sample_y), walkable);
            }
        }
    }
    field
}
