//! The open surface over the solid: one span on each solid top with the headroom above it, walkable where a body
//! fits and the slope allows, linked to its neighbours within a step, and eroded by the body's radius so a path's
//! centre keeps clear of walls.

use crate::Agent;
use crate::raster::{Grid, Heightfield};

/// The four directions a span links across: +x, +y, -x, -y.
pub(crate) const STEP_X: [i64; 4] = [1, 0, -1, 0];
pub(crate) const STEP_Y: [i64; 4] = [0, 1, 0, -1];

/// The open space on one solid top: its floor and headroom in voxels, whether it is walkable, its distance from the
/// walkable area's edge (2 a cell across, 3 a cell diagonally), its region (0 for none), and the span it links to in
/// each direction's neighbouring column.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct OpenSpan {
    pub floor: i64,
    pub clear: i64,
    pub walkable: bool,
    pub dist: i32,
    pub region: usize,
    pub links: [Option<usize>; 4],
}

#[derive(Debug)]
pub(crate) struct CompactField {
    pub grid: Grid,
    pub columns: Vec<Vec<OpenSpan>>,
}

impl CompactField {
    /// The column beside (ix, iy) in a direction, if it is on the grid.
    pub fn beside(&self, ix: usize, iy: usize, direction: usize) -> Option<(usize, usize)> {
        let next_x = ix as i64 + STEP_X[direction];
        let next_y = iy as i64 + STEP_Y[direction];
        let on_grid =
            next_x >= 0 && next_y >= 0 && next_x < self.grid.cells_x as i64 && next_y < self.grid.cells_y as i64;
        on_grid.then_some((next_x as usize, next_y as usize))
    }

    /// The span a link leads to, from the span in column (ix, iy).
    pub fn linked(&self, ix: usize, iy: usize, direction: usize, link: usize) -> (usize, usize, OpenSpan) {
        let next_x = (ix as i64 + STEP_X[direction]) as usize;
        let next_y = (iy as i64 + STEP_Y[direction]) as usize;
        (next_x, next_y, self.columns[next_x + next_y * self.grid.cells_x][link])
    }
}

/// Builds the open surface from the solid one and erodes it by the agent's radius.
pub(crate) fn build(solid: &Heightfield, agent: &Agent) -> CompactField {
    let grid = solid.grid;
    let climb = (agent.climb / grid.voxel).floor() as i64;
    let headroom = (agent.height / grid.voxel).ceil() as i64;
    // The topmost solid is open to the sky, so a high flat top is not ceilinged by the grid's own top.
    let columns = solid
        .columns
        .iter()
        .map(|column| {
            (0..column.len())
                .map(|index| {
                    let floor = column[index].top;
                    let ceiling = column.get(index + 1).map_or(grid.voxels + headroom, |above| above.bottom);
                    let clear = ceiling - floor;
                    let walkable = clear >= headroom && column[index].walkable;
                    OpenSpan { floor, clear, walkable, dist: 0, region: 0, links: [None; 4] }
                })
                .collect()
        })
        .collect();
    let mut field = CompactField { grid, columns };
    link(&mut field, climb, headroom);
    measure(&mut field);
    let erode_below = (agent.radius / grid.cell) * 2.0;
    for span in field.columns.iter_mut().flatten() {
        if span.walkable && f64::from(span.dist) < erode_below {
            span.walkable = false;
        }
    }
    link(&mut field, climb, headroom);
    measure(&mut field);
    field
}

/// Links each walkable span to the first walkable span beside it within a climbable step whose shared headroom still
/// fits the body.
fn link(field: &mut CompactField, climb: i64, headroom: i64) {
    for iy in 0..field.grid.cells_y {
        for ix in 0..field.grid.cells_x {
            let column = ix + iy * field.grid.cells_x;
            for index in 0..field.columns[column].len() {
                let span = field.columns[column][index];
                let mut links = [None; 4];
                if span.walkable {
                    for (direction, link) in links.iter_mut().enumerate() {
                        let Some((next_x, next_y)) = field.beside(ix, iy, direction) else { continue };
                        let next = &field.columns[next_x + next_y * field.grid.cells_x];
                        *link = next.iter().position(|other| {
                            let shared =
                                (span.floor + span.clear).min(other.floor + other.clear) - span.floor.max(other.floor);
                            other.walkable && (other.floor - span.floor).abs() <= climb && shared >= headroom
                        });
                    }
                }
                field.columns[column][index].links = links;
            }
        }
    }
}

/// The chamfer distance from the walkable area's edge: a span missing any link is on the edge (0), and the inside
/// grows over a sweep forward and one back.
fn measure(field: &mut CompactField) {
    for span in field.columns.iter_mut().flatten().filter(|span| span.walkable) {
        span.dist = if span.links.iter().all(Option::is_some) { 0xffff } else { 0 };
    }
    for iy in 0..field.grid.cells_y {
        for ix in 0..field.grid.cells_x {
            sweep(field, ix, iy, [(2, 3), (3, 0)]);
        }
    }
    for iy in (0..field.grid.cells_y).rev() {
        for ix in (0..field.grid.cells_x).rev() {
            sweep(field, ix, iy, [(0, 1), (1, 2)]);
        }
    }
}

/// Lowers each walkable span's distance in a column through its neighbours along two directions and their diagonals.
fn sweep(field: &mut CompactField, ix: usize, iy: usize, pairs: [(usize, usize); 2]) {
    let column = ix + iy * field.grid.cells_x;
    for index in 0..field.columns[column].len() {
        let span = field.columns[column][index];
        if !span.walkable {
            continue;
        }
        let mut dist = span.dist;
        for (direction, turn) in pairs {
            let Some(link) = span.links[direction] else { continue };
            let (next_x, next_y, next) = field.linked(ix, iy, direction, link);
            if next.dist + 2 < dist {
                dist = next.dist + 2;
            }
            let Some(diagonal_link) = next.links[turn] else { continue };
            let (_, _, diagonal) = field.linked(next_x, next_y, turn, diagonal_link);
            if diagonal.dist + 3 < dist {
                dist = diagonal.dist + 3;
            }
        }
        field.columns[column][index].dist = dist;
    }
}
