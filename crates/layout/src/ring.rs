//! A layout's section: the land its areas and paths make walkable, taken as one piece, its holes filled, and its edge
//! traced into a ring that follows the land (the shore, the foot of a slope, the reach of the last house) rather than
//! a circle or a square.

use crate::field::{CELL_M, Field, Water, chamfer};
use crate::paths::simplified;

/// How far onto its cliffs' feet a section reaches past its floor's edge, metres: a body walks no further.
const CLIFF_FOOT_M: f64 = 4.0;
/// How far a cell of the section keeps from the sea, metres: past a cell's width (the field measures the sea's
/// distance in whole cells, 8 m the nearest), so no cell touching the sea is taken and its edge stands back from it.
const SHORE_KEEP_M: f64 = CELL_M + 0.5;
/// How far round a walked point (a run's line, a beat, a climb, a lookout, a stair, a tunnel, a way) the section's cells
/// reach at the least, metres: past the ring's cut corners, so a body walking or fighting there stands inside it.
const WALKED_M: f64 = 4.0;
/// How far round a walked point outside the ring its corners are kept as they are, metres: past where the ring's
/// simplification (12.8 m) reaches from a kept corner.
const PINNED_M: f64 = 3.0 * CELL_M;

/// The cells inside a section: on the land its sculpt leaves as floor (`floor_distance`, a few metres onto its cliffs'
/// feet), on land or on a bridge (`bridges`, a capsule each) over the water, in the claim, as one piece with no holes,
/// so the section's edge is the foot of its bounds. The floor of a run on the rock's top (`top_distance`) is taken
/// without the rock beside it, and every cell within `WALKED_M` of a walked point on land in the claim is taken too.
#[must_use]
pub fn section_cells(
    field: &Field,
    floor_distance: &dyn Fn(f64, f64) -> f64,
    top_distance: &dyn Fn(f64, f64) -> f64,
    anchor: [f64; 2],
    bridges: &[[f64; 5]],
    walked: &[[f64; 2]],
) -> Vec<bool> {
    let (columns, rows) = (field.columns, field.rows);
    let count = columns * rows;
    // A bridge narrower than a cell is taken a cell wider either side, so its cells join across the water.
    let bridged = |at: usize| {
        let centre = field.centre(at % columns, at / columns);
        bridges
            .iter()
            .any(|&[x1, y1, x2, y2, half]| crate::paths::off_line(centre, [x1, y1], [x2, y2]) <= half + CELL_M)
    };
    let land = |at: usize| {
        (!matches!(field.water[at], Water::Sea | Water::Lake) && field.to_sea[at] >= SHORE_KEEP_M) || bridged(at)
    };
    let near = |at: usize, distance: &dyn Fn(f64, f64) -> f64| {
        let [x, y] = field.centre(at % columns, at / columns);
        distance(x, y) <= CLIFF_FOOT_M
    };
    let mut kept: Vec<bool> = (0..count)
        .map(|at| land(at) && field.claimed[at] && near(at, floor_distance) && !near(at, top_distance))
        .collect();
    kept = closed(&kept, columns, rows, 2);
    // A run on the rock's top is taken as far as its floor reaches and no further: the rock beside it is never closed
    // into the section, so a body that climbs off it is out of bounds.
    for (at, keep) in kept.iter_mut().enumerate() {
        *keep = (*keep || near(at, top_distance)) && land(at) && field.claimed[at];
    }
    // Every cell within `WALKED_M` of a walked point, on land in the claim.
    for &[x, y] in walked {
        for [east, south] in [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]] {
            if let Some((column, row)) = field.cell_of(x + east * WALKED_M, y + south * WALKED_M) {
                let at = field.index(column, row);
                kept[at] = kept[at] || (land(at) && field.claimed[at]);
            }
        }
    }
    kept = one_piece(&kept, columns, rows, field.nearest(anchor[0], anchor[1]));
    kept = filled(&kept, columns, rows);
    unpinched(&mut kept, columns, rows);
    kept
}

/// The cells grown by `steps` cells and shrunk back, which closes narrow gaps and bays in the edge.
fn closed(cells: &[bool], columns: usize, rows: usize, steps: usize) -> Vec<bool> {
    let reach = (steps as f64) * CELL_M + 0.1;
    let out = chamfer(columns, rows, |at| cells[at]);
    let grown: Vec<bool> = out.iter().map(|&far| far <= reach).collect();
    let back = chamfer(columns, rows, |at| !grown[at]);
    back.iter().zip(cells).map(|(&far, &was)| was || far > reach).collect()
}

/// Only the cells joined (across edges) to the anchor's, or the largest piece if the anchor's cell is not kept.
fn one_piece(cells: &[bool], columns: usize, rows: usize, anchor: usize) -> Vec<bool> {
    let mut piece = vec![usize::MAX; cells.len()];
    let mut sizes = Vec::new();
    for start in 0..cells.len() {
        if !cells[start] || piece[start] != usize::MAX {
            continue;
        }
        let number = sizes.len();
        let mut stack = vec![start];
        piece[start] = number;
        let mut size = 0;
        while let Some(at) = stack.pop() {
            size += 1;
            for next in neighbours(at, columns, rows) {
                if cells[next] && piece[next] == usize::MAX {
                    piece[next] = number;
                    stack.push(next);
                }
            }
        }
        sizes.push(size);
    }
    let largest = (0..sizes.len()).max_by_key(|&number| (sizes[number], usize::MAX - number));
    let chosen = if cells[anchor] { Some(piece[anchor]) } else { largest };
    piece.iter().map(|&number| Some(number) == chosen && number != usize::MAX).collect()
}

/// The cells with every hole filled: whatever the outside cannot reach across unkept cells is kept.
fn filled(cells: &[bool], columns: usize, rows: usize) -> Vec<bool> {
    let mut outside = vec![false; cells.len()];
    let mut stack: Vec<usize> = (0..cells.len())
        .filter(|&at| {
            let (column, row) = (at % columns, at / columns);
            !cells[at] && (column == 0 || row == 0 || column + 1 == columns || row + 1 == rows)
        })
        .collect();
    for &at in &stack {
        outside[at] = true;
    }
    while let Some(at) = stack.pop() {
        for next in neighbours(at, columns, rows) {
            if !cells[next] && !outside[next] {
                outside[next] = true;
                stack.push(next);
            }
        }
    }
    outside.iter().map(|&out| !out).collect()
}

/// Two kept cells meeting only at a corner would pinch the edge into a figure eight: the cells between them are
/// kept, so the edge passes each corner once.
fn unpinched(cells: &mut [bool], columns: usize, rows: usize) {
    let mut changed = true;
    while changed {
        changed = false;
        for row in 0..rows.saturating_sub(1) {
            for column in 0..columns.saturating_sub(1) {
                let at = row * columns + column;
                let (north_west, north_east) = (cells[at], cells[at + 1]);
                let (south_west, south_east) = (cells[at + columns], cells[at + columns + 1]);
                let crossed = (north_west && south_east && !north_east && !south_west)
                    || (north_east && south_west && !north_west && !south_east);
                if crossed {
                    cells[at] = true;
                    cells[at + 1] = true;
                    cells[at + columns] = true;
                    cells[at + columns + 1] = true;
                    changed = true;
                }
            }
        }
    }
}

/// A cell's neighbours across its edges.
fn neighbours(at: usize, columns: usize, rows: usize) -> impl Iterator<Item = usize> {
    let (column, row) = (at % columns, at / columns);
    [
        (column > 0).then(|| at - 1),
        (column + 1 < columns).then(|| at + 1),
        (row > 0).then(|| at - columns),
        (row + 1 < rows).then(|| at + columns),
    ]
    .into_iter()
    .flatten()
}

/// The edge of one piece of cells with no holes and no pinches, as a ring of cell corners (world metres) running
/// with the cells on its right, its straight runs merged, then simplified and its corners cut so it reads as land; each
/// `walked` point on its cells held inside it.
#[must_use]
pub fn traced(field: &Field, cells: &[bool], walked: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let (columns, rows) = (field.columns, field.rows);
    let kept = |column: isize, row: isize| {
        column >= 0
            && row >= 0
            && (column as usize) < columns
            && (row as usize) < rows
            && cells[row as usize * columns + column as usize]
    };
    // Each edge between a kept cell and an unkept one, from corner to corner, keyed by its start.
    let mut next_of = std::collections::BTreeMap::new();
    for row in 0..rows as isize {
        for column in 0..columns as isize {
            if !kept(column, row) {
                continue;
            }
            if !kept(column, row - 1) {
                next_of.insert((column, row), (column + 1, row));
            }
            if !kept(column + 1, row) {
                next_of.insert((column + 1, row), (column + 1, row + 1));
            }
            if !kept(column, row + 1) {
                next_of.insert((column + 1, row + 1), (column, row + 1));
            }
            if !kept(column - 1, row) {
                next_of.insert((column, row + 1), (column, row));
            }
        }
    }
    let Some((&start, _)) = next_of.iter().next() else { return Vec::new() };
    let mut corners = vec![start];
    let mut at = start;
    while let Some(&next) = next_of.get(&at) {
        if next == start {
            break;
        }
        corners.push(next);
        at = next;
        if corners.len() > next_of.len() {
            break;
        }
    }
    let world: Vec<[f64; 2]> = corners
        .iter()
        .map(|&(column, row)| [field.west + column as f64 * CELL_M, field.north + row as f64 * CELL_M])
        .collect();
    // The walked points on kept cells near the edge, which the ring must hold: where one falls outside, the corners
    // round it are kept as they are, and the ring traced again.
    let edge = chamfer(columns, rows, |at| !cells[at]);
    let near_edge: Vec<[f64; 2]> = walked
        .iter()
        .copied()
        .filter(|&[x, y]| {
            field.cell_of(x, y).is_some_and(|(column, row)| {
                let at = field.index(column, row);
                cells[at] && edge[at] <= PINNED_M + CELL_M
            })
        })
        .collect();
    let mut pinned = vec![false; world.len()];
    loop {
        let ring = smoothed(&world, &pinned);
        let out: Vec<[f64; 2]> =
            near_edge.iter().copied().filter(|&[x, y]| !crate::field::ring_holds(&ring, x, y)).collect();
        let mut more = false;
        for (corner, pin) in world.iter().zip(pinned.iter_mut()) {
            if !*pin && out.iter().any(|&at| crate::field::distance(at, *corner) <= PINNED_M) {
                *pin = true;
                more = true;
            }
        }
        if !more {
            return ring;
        }
    }
}

/// A ring of cell corners simplified (each pinned corner where the ring turns kept) and its corners cut, so it reads
/// as land, to the half metre.
fn smoothed(world: &[[f64; 2]], pinned: &[bool]) -> Vec<[f64; 2]> {
    let count = world.len();
    let turns = |at: usize| {
        let (before, here, after) = (world[(at + count - 1) % count], world[at], world[(at + 1) % count]);
        (here[0] - before[0]) * (after[1] - here[1]) != (here[1] - before[1]) * (after[0] - here[0])
    };
    let kept: Vec<bool> = (0..count).map(|at| pinned[at] && turns(at)).collect();
    let start = kept.iter().position(|&pin| pin).unwrap_or(0);
    let mut open: Vec<[f64; 2]> = world[start..].iter().chain(&world[..start]).copied().collect();
    open.push(world[start]);
    let mut pins: Vec<bool> = kept[start..].iter().chain(&kept[..start]).copied().collect();
    pins.push(true);
    // Simplified between each two pinned corners, which it keeps.
    let mut ring = vec![open[0]];
    let mut from = 0;
    for at in 1..open.len() {
        if pins[at] {
            ring.extend_from_slice(&simplified(&open[from..=at], CELL_M * 1.6)[1..]);
            from = at;
        }
    }
    ring.pop();
    for _ in 0..3 {
        ring = cut_corners(&ring);
    }
    ring.iter().map(|&[x, y]| [(x * 2.0).round() / 2.0, (y * 2.0).round() / 2.0]).collect()
}

/// Points every 2 m along each line, and a metre to either side of it.
#[must_use]
pub fn walked(lines: &[Vec<[f64; 2]>]) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    for pair in lines.iter().flat_map(|line| line.windows(2)) {
        let length = crate::field::distance(pair[0], pair[1]);
        if length < 1e-9 {
            continue;
        }
        let across = [-(pair[1][1] - pair[0][1]) / length, (pair[1][0] - pair[0][0]) / length];
        let steps = (length / 2.0).ceil() as usize;
        for step in 0..=steps {
            let share = step as f64 / steps as f64;
            let at = [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
            points.extend([-1.0, 0.0, 1.0].map(|side| [at[0] + across[0] * side, at[1] + across[1] * side]));
        }
    }
    points
}

/// A closed line round a point at a reach, metres.
#[must_use]
pub fn round(at: [f64; 2], reach: f64) -> Vec<[f64; 2]> {
    (0..=32)
        .map(|step| {
            let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(step) / 32.0);
            [at[0] + cosine * reach, at[1] + sine * reach]
        })
        .collect()
}

/// One pass of Chaikin's corner cutting round a closed ring.
fn cut_corners(ring: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut out = Vec::with_capacity(ring.len() * 2);
    for at in 0..ring.len() {
        let (from, to) = (ring[at], ring[(at + 1) % ring.len()]);
        out.push([from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25]);
        out.push([from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A ring's area, square metres.
    fn area_of(ring: &[[f64; 2]]) -> f64 {
        let twice: f64 = (0..ring.len())
            .map(|at| {
                let (from, to) = (ring[at], ring[(at + 1) % ring.len()]);
                from[0] * to[1] - to[0] * from[1]
            })
            .sum();
        twice.abs() / 2.0
    }

    fn field(columns: usize, rows: usize) -> Field {
        let count = columns * rows;
        Field {
            seaward: [0.0, 0.0],
            west: 0.0,
            north: 0.0,
            columns,
            rows,
            height: vec![10.0; count],
            water: vec![Water::Dry; count],
            slope: vec![0.0; count],
            claimed: vec![true; count],
            to_sea: vec![1.0e6; count],
            to_fresh: vec![1.0e6; count],
            inside: vec![1.0e6; count],
        }
    }

    #[test]
    fn a_block_of_cells_traces_a_closed_ring_round_it() {
        let field = field(10, 10);
        let cells: Vec<bool> = (0..100).map(|at| (2..8).contains(&(at % 10)) && (2..8).contains(&(at / 10))).collect();
        let ring = traced(&field, &cells, &[]);
        assert!(ring.len() >= 4);
        let area = area_of(&ring);
        assert!(area > 0.75 * 48.0 * 48.0 && area <= 48.0 * 48.0, "about the block's 48 m square, corners cut: {area}");
    }

    #[test]
    fn holes_are_filled_and_only_the_anchor_piece_is_kept() {
        let (columns, rows) = (12, 12);
        let mut cells = vec![false; columns * rows];
        for row in 1..6 {
            for column in 1..6 {
                cells[row * columns + column] = !(row == 3 && column == 3);
            }
        }
        cells[10 * columns + 10] = true;
        let piece = filled(&one_piece(&cells, columns, rows, columns + 1), columns, rows);
        assert!(piece[3 * columns + 3], "the hole is filled");
        assert!(!piece[10 * columns + 10], "the far cell is another piece");
    }
}
