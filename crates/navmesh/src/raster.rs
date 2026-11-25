//! The solid heightfield: the ground and the colliders voxelised into columns, each a sorted list of solid spans.

use crate::collider::Collider;
use crate::{Agent, Bounds};
use movement::{Heights, Terrain};

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

/// The grid's columns across and down: every cell of `bounds`, one at the least.
fn cells(bounds: Bounds, cell: f64) -> (usize, usize) {
    let across = ((bounds.max_x - bounds.min_x) / cell).ceil().max(1.0) as usize;
    let down = ((bounds.max_y - bounds.min_y) / cell).ceil().max(1.0) as usize;
    (across, down)
}

/// How many rows of cells `bounds` holds at the agent's cell.
pub(crate) fn rows(bounds: Bounds, agent: &Agent) -> usize {
    cells(bounds, agent.cell_size).1
}

/// The ground's height at the middle of each cell of rows `rows` of `bounds` (those it holds), west to east, added to
/// `heights`: the ground sampled a band of rows at a time.
pub(crate) fn sample_rows(
    ground: &dyn Terrain,
    bounds: Bounds,
    agent: &Agent,
    rows: core::ops::Range<usize>,
    heights: &mut Vec<Option<f64>>,
) {
    let (cell, (cells_x, cells_y)) = (agent.cell_size, cells(bounds, agent.cell_size));
    for iy in rows.start.min(cells_y)..rows.end.min(cells_y) {
        for ix in 0..cells_x {
            let (x, y) = (bounds.min_x + (ix as f64 + 0.5) * cell, bounds.min_y + (iy as f64 + 0.5) * cell);
            heights.push(Some(ground.height_at(x, y)));
        }
    }
}

/// The ground sampled over every row of `bounds`, kept as a grid a path and a body read between the centres: none
/// when the ground answered a height that is not a number.
pub(crate) fn sampled(bounds: Bounds, agent: &Agent, heights: Vec<Option<f64>>) -> Option<Heights> {
    let (cell, (cells_x, cells_y)) = (agent.cell_size, cells(bounds, agent.cell_size));
    Heights::new(bounds.min_x, bounds.min_y, cell, cells_x, cells_y, heights)
}

/// Whether the ground is gentle enough to walk at a column: its slope, from the heights of the columns either side
/// each way (or the column itself at the grid's edge), within the agent's.
fn gentle(heights: &[f64], grid: &Grid, ix: usize, iy: usize, max_slope: f64) -> bool {
    let at = |ix: usize, iy: usize| heights[ix + iy * grid.cells_x];
    let (west, east) = (ix.saturating_sub(1), (ix + 1).min(grid.cells_x - 1));
    let (north, south) = (iy.saturating_sub(1), (iy + 1).min(grid.cells_y - 1));
    let rise =
        |low: f64, high: f64, cells: usize| if cells == 0 { 0.0 } else { (high - low) / (cells as f64 * grid.cell) };
    let along_x = rise(at(west, iy), at(east, iy), east - west);
    let along_y = rise(at(ix, north), at(ix, south), south - north);
    along_x * along_x + along_y * along_y <= max_slope * max_slope
}

/// Voxelises the ground under every cell of `bounds` and the colliders standing on it. Each column's ground is solid
/// from one voxel under the lowest ground up to the ground's height at its centre, and is floor where it is gentle and
/// `ground_walks` (never on the open sea).
pub(crate) fn voxelise(
    colliders: &[Collider],
    ground: &dyn Terrain,
    bounds: Bounds,
    agent: &Agent,
    ground_walks: bool,
) -> Heightfield {
    let (cell, voxel) = (agent.cell_size, agent.cell_height);
    let (cells_x, cells_y) = cells(bounds, cell);
    let mut grid =
        Grid { cell, voxel, min_x: bounds.min_x, min_y: bounds.min_y, min_z: 0.0, cells_x, cells_y, voxels: 0 };
    let heights: Vec<f64> = (0..cells_y)
        .flat_map(|iy| (0..cells_x).map(move |ix| (ix, iy)))
        .map(|(ix, iy)| {
            let (x, y) = grid.centre(ix, iy);
            ground.height_at(x, y)
        })
        .collect();
    let lowest = heights.iter().copied().fold(f64::INFINITY, f64::min);
    let highest = heights.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let top = colliders.iter().fold(highest, |tallest, collider| tallest.max(collider.highest()));
    let min_z = lowest - voxel;
    let max_z = top + voxel;
    grid.min_z = min_z;
    grid.voxels = ((max_z - min_z) / voxel).ceil().max(1.0) as i64;
    let mut field = Heightfield { grid, columns: vec![Vec::new(); cells_x * cells_y] };
    for column in 0..cells_x * cells_y {
        let walkable = ground_walks && gentle(&heights, &grid, column % cells_x, column / cells_x, agent.max_slope);
        field.add_span(column, min_z, heights[column], walkable);
    }
    for collider in colliders {
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
                let column = ix + iy * cells_x;
                // A block or ramp is solid from its underside, or the ground where that is lower, so the space under
                // a roof or a deck stays open; a top below the ground is buried in it. An underside over the ground
                // rounds up to its voxel, so a body walks under one at its own height, as it moves under it, unless
                // that leaves a thin slab no voxel; mid-voxel, so the floor taken again lands on the same one.
                let (top, underside) = (collider.surface(sample_x, sample_y), collider.underside());
                let (rounded, top_voxel) = (((underside - min_z) / voxel).ceil(), ((top - min_z) / voxel).ceil());
                let base = if top < heights[column] {
                    min_z
                } else if underside <= heights[column] {
                    heights[column]
                } else if rounded < top_voxel {
                    min_z + (rounded + 0.5) * voxel
                } else {
                    underside
                };
                field.add_span(column, base, top, walkable);
            }
        }
    }
    field
}
