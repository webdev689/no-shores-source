//! Contours: each region's boundary walked into a closed loop of cell corners, then simplified with Douglas-Peucker
//! within half a cell, keeping every corner where the region across changes, since those are the portals the poly
//! mesh stitches. A region that wraps an obstacle traces an extra inner loop, a hole.

use crate::compact::{CompactField, OpenSpan, STEP_X, STEP_Y};

/// A contour corner: its grid corner (x, y), its height, and the region across the edge that starts at it (0 for a
/// wall or the void).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ContourVertex {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub across: usize,
}

/// A region's simplified outline, counter-clockwise; a hole's runs clockwise.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Contour {
    pub region: usize,
    pub verts: Vec<ContourVertex>,
    pub hole: bool,
}

/// How far, in cells, a simplified outline may stray from the true one. Within half a cell it never crosses a cell
/// centre, so the poly mesh covers exactly the walkable cells.
const MAX_ERROR: f64 = 0.5;

/// The region across a span's edge: the linked span's, if it is still walkable; else 0.
fn across(field: &CompactField, ix: usize, iy: usize, span: &OpenSpan, direction: usize) -> usize {
    span.links[direction].map_or(0, |link| {
        let (_, _, next) = field.linked(ix, iy, direction, link);
        if next.walkable { next.region } else { 0 }
    })
}

/// Traces every region's outlines.
pub(crate) fn build(field: &CompactField) -> Vec<Contour> {
    let cells_x = field.grid.cells_x;
    let mut edges: Vec<Vec<u8>> = field
        .columns
        .iter()
        .enumerate()
        .map(|(column, spans)| {
            let (ix, iy) = (column % cells_x, column / cells_x);
            spans
                .iter()
                .map(|span| {
                    if !span.walkable || span.region == 0 {
                        return 0;
                    }
                    (0..4)
                        .filter(|&direction| across(field, ix, iy, span, direction) != span.region)
                        .fold(0, |flags, direction| flags | (1 << direction))
                })
                .collect()
        })
        .collect();
    let mut contours = Vec::new();
    for iy in 0..field.grid.cells_y {
        for ix in 0..cells_x {
            let column = ix + iy * cells_x;
            for index in 0..field.columns[column].len() {
                let span = field.columns[column][index];
                if !span.walkable || span.region == 0 || edges[column][index] == 0 {
                    continue;
                }
                let raw = walk(field, &mut edges, (ix, iy, index));
                if raw.len() < 3 {
                    continue;
                }
                let verts = simplify(&raw);
                if verts.len() >= 3 {
                    let hole = area2(&verts) < 0.0;
                    contours.push(Contour { region: span.region, verts, hole });
                }
            }
        }
    }
    contours
}

/// Walks one boundary loop from a span on its first unvisited edge, clearing edges as it goes: on a boundary edge
/// it adds the corner and turns clockwise, on an open edge it steps into the neighbour and turns back.
fn walk(field: &CompactField, edges: &mut [Vec<u8>], start: (usize, usize, usize)) -> Vec<ContourVertex> {
    let cells_x = field.grid.cells_x;
    let (start_x, start_y, start_index) = start;
    let start_column = start_x + start_y * cells_x;
    let mut direction = (0..4).find(|&direction| edges[start_column][start_index] & (1 << direction) != 0).unwrap_or(0);
    let start_direction = direction;
    let (mut ix, mut iy, mut index) = start;
    let mut raw = Vec::new();
    loop {
        let column = ix + iy * cells_x;
        let span = field.columns[column][index];
        if edges[column][index] & (1 << direction) != 0 {
            let (corner_x, corner_y) = match direction {
                0 => (ix + 1, iy),
                1 => (ix + 1, iy + 1),
                2 => (ix, iy + 1),
                _ => (ix, iy),
            };
            raw.push(ContourVertex {
                x: corner_x as f64,
                y: corner_y as f64,
                z: field.grid.height(span.floor),
                across: across(field, ix, iy, &span, direction),
            });
            edges[column][index] &= !(1 << direction);
            direction = (direction + 1) & 3;
        } else {
            let Some(link) = span.links[direction] else { break };
            ix = (ix as i64 + STEP_X[direction]) as usize;
            iy = (iy as i64 + STEP_Y[direction]) as usize;
            index = link;
            direction = (direction + 3) & 3;
        }
        if (ix, iy, index) == (start_x, start_y, start_index) && direction == start_direction {
            break;
        }
    }
    raw
}

/// Squared distance from `point` to the segment `from`-`to`, in cells.
fn dist_sq(point: &ContourVertex, from: &ContourVertex, to: &ContourVertex) -> f64 {
    let (dx, dy) = (to.x - from.x, to.y - from.y);
    let length_sq = dx * dx + dy * dy;
    let t = if length_sq > 0.0 {
        (((point.x - from.x) * dx + (point.y - from.y) * dy) / length_sq).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let (ex, ey) = (from.x + t * dx - point.x, from.y + t * dy - point.y);
    ex * ex + ey * ey
}

/// Whether `point` comes before `other` in (x, y) order.
fn before(point: &ContourVertex, other: &ContourVertex) -> bool {
    point.x < other.x || (point.x == other.x && point.y < other.y)
}

/// Keeps the corners where the region across changes, then Douglas-Peuckers the runs between them. A loop with no
/// such corner is seeded with its two (x, y) extremes.
fn simplify(raw: &[ContourVertex]) -> Vec<ContourVertex> {
    let n = raw.len();
    let mut anchors: Vec<usize> = (0..n).filter(|&at| raw[at].across != raw[(at + n - 1) % n].across).collect();
    if anchors.len() < 2 {
        let (mut low, mut high) = (0, 0);
        for at in 0..n {
            if before(&raw[at], &raw[low]) {
                low = at;
            }
            if before(&raw[high], &raw[at]) {
                high = at;
            }
        }
        anchors = if low < high { vec![low, high] } else { vec![high, low] };
    }
    let mut keep = vec![false; n];
    for &anchor in &anchors {
        keep[anchor] = true;
    }
    let limit = MAX_ERROR * MAX_ERROR;
    for (at, &anchor) in anchors.iter().enumerate() {
        let end = anchors[(at + 1) % anchors.len()];
        let mut run = vec![anchor];
        let mut index = anchor;
        while index != end {
            index = (index + 1) % n;
            run.push(index);
        }
        let mut pending = vec![(0, run.len() - 1)];
        while let Some((low, high)) = pending.pop() {
            if high <= low + 1 {
                continue;
            }
            let mut farthest: Option<usize> = None;
            let mut farthest_sq = limit;
            for inner in low + 1..high {
                let point = &raw[run[inner]];
                let off = dist_sq(point, &raw[run[low]], &raw[run[high]]);
                // Ties go to the lower (x, y), so the two regions walking a shared edge the opposite ways keep the
                // same corner and their portal is not split.
                let tie = farthest.is_some_and(|best| off == farthest_sq && before(point, &raw[run[best]]));
                if off > farthest_sq || tie {
                    farthest_sq = off;
                    farthest = Some(inner);
                }
            }
            if let Some(split) = farthest {
                keep[run[split]] = true;
                pending.push((low, split));
                pending.push((split, high));
            }
        }
    }
    (0..n).filter(|&at| keep[at]).map(|at| raw[at]).collect()
}

/// Twice the signed area of an outline: positive counter-clockwise.
fn area2(verts: &[ContourVertex]) -> f64 {
    let mut area = 0.0;
    let mut previous = verts.len() - 1;
    for (at, vertex) in verts.iter().enumerate() {
        area += verts[previous].x * vertex.y - vertex.x * verts[previous].y;
        previous = at;
    }
    area
}
