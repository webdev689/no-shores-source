//! A layout's section: the land its areas and paths make walkable, taken as one piece, its holes filled, and its edge
//! traced into a ring that follows the land (the shore, the foot of a slope, the reach of the last house) rather than
//! a circle or a square.

use crate::field::{CELL_M, Field, Water, chamfer, distance};
use land::exact::fbm;
use land::heap::CellHeap;
use crate::paths::simplified;

/// How far past an area's reach or a path the section runs on open, level ground, metres: room to roam and fight.
/// Slopes cost more to cross, so the section narrows where the land climbs and its edge falls along the hills.
pub const ROOM_M: f64 = 92.0;
/// How far the section keeps from the sea, metres, so its smoothed edge never reaches into the water.
const SHORE_KEEP_M: f64 = 6.0;

/// The cells inside a section: within a slope-weighted reach of an area or a path, on land, in the claim, as one
/// piece with no holes. The reach swells and shrinks with a slow noise, so the edge wanders as land does.
#[must_use]
pub fn section_cells(
    field: &Field,
    areas: &[([f64; 2], f64)],
    paths: &[Vec<[f64; 2]>],
    anchor: [f64; 2],
    seed: u32,
) -> Vec<bool> {
    let (columns, rows) = (field.columns, field.rows);
    let count = columns * rows;
    let mut cost = vec![f64::INFINITY; count];
    let mut heap = CellHeap::with_capacity(4096);
    let start = |at: usize, cost: &mut Vec<f64>, heap: &mut CellHeap| {
        if cost[at] > 0.0 {
            cost[at] = 0.0;
            heap.push(at as u32, 0.0);
        }
    };
    for path in paths {
        for pair in path.windows(2) {
            let steps = (distance(pair[0], pair[1]) / (CELL_M * 0.5)).ceil().max(1.0) as usize;
            for step in 0..=steps {
                let along = step as f64 / steps as f64;
                let x = pair[0][0] + (pair[1][0] - pair[0][0]) * along;
                let y = pair[0][1] + (pair[1][1] - pair[0][1]) * along;
                start(field.nearest(x, y), &mut cost, &mut heap);
            }
        }
    }
    for at in 0..count {
        let centre = field.centre(at % columns, at / columns);
        if areas.iter().any(|&(middle, radius)| distance(middle, centre) <= radius) {
            start(at, &mut cost, &mut heap);
        }
    }
    let land = |at: usize| !matches!(field.water[at], Water::Sea | Water::Lake) && field.to_sea[at] >= SHORE_KEEP_M;
    let room = |at: usize| {
        let [x, y] = field.centre(at % columns, at / columns);
        ROOM_M * (0.75 + 0.6 * fbm(seed, x / 300.0, y / 300.0, 3))
    };
    while let Some(cell) = heap.pop() {
        let cell = cell as usize;
        let (column, row) = (cell % columns, cell / columns);
        for (step_x, step_y, length) in NEIGHBOURS {
            let (next_column, next_row) = (column as isize + step_x, row as isize + step_y);
            if next_column < 0 || next_row < 0 || next_column >= columns as isize || next_row >= rows as isize {
                continue;
            }
            let next = next_row as usize * columns + next_column as usize;
            if !land(next) || !field.claimed[next] {
                continue;
            }
            let climb = 1.0 + 3.0 * field.slope[next] + if field.water[next] == Water::River { 1.5 } else { 0.0 };
            let total = cost[cell] + length * CELL_M * climb;
            if total < cost[next] && total <= room(next) {
                cost[next] = total;
                heap.push(next as u32, total);
            }
        }
    }
    let mut kept: Vec<bool> = (0..count).map(|at| cost[at].is_finite() && land(at) && field.claimed[at]).collect();
    kept = closed(&kept, columns, rows, 26);
    for (at, keep) in kept.iter_mut().enumerate() {
        *keep = *keep && land(at) && field.claimed[at];
    }
    kept = one_piece(&kept, columns, rows, field.nearest(anchor[0], anchor[1]));
    kept = filled(&kept, columns, rows);
    unpinched(&mut kept, columns, rows);
    kept
}

/// The eight steps to a cell's neighbours and their lengths in cells.
const NEIGHBOURS: [(isize, isize, f64); 8] = [
    (1, 0, 1.0),
    (-1, 0, 1.0),
    (0, 1, 1.0),
    (0, -1, 1.0),
    (1, 1, std::f64::consts::SQRT_2),
    (1, -1, std::f64::consts::SQRT_2),
    (-1, 1, std::f64::consts::SQRT_2),
    (-1, -1, std::f64::consts::SQRT_2),
];

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
/// with the cells on its right, its straight runs merged, then simplified and its corners cut so it reads as land.
#[must_use]
pub fn traced(field: &Field, cells: &[bool]) -> Vec<[f64; 2]> {
    let (columns, rows) = (field.columns, field.rows);
    let kept = |column: isize, row: isize| {
        column >= 0 && row >= 0 && (column as usize) < columns && (row as usize) < rows && cells[row as usize * columns + column as usize]
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
    let world: Vec<[f64; 2]> =
        corners.iter().map(|&(column, row)| [field.west + column as f64 * CELL_M, field.north + row as f64 * CELL_M]).collect();
    let mut open = world.clone();
    open.push(world[0]);
    let mut ring = simplified(&open, CELL_M * 1.6);
    ring.pop();
    for _ in 0..3 {
        ring = cut_corners(&ring);
    }
    ring.iter().map(|&[x, y]| [(x * 2.0).round() / 2.0, (y * 2.0).round() / 2.0]).collect()
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

/// A ring's area, square metres.
#[must_use]
pub fn area_of(ring: &[[f64; 2]]) -> f64 {
    let twice: f64 = (0..ring.len())
        .map(|at| {
            let (from, to) = (ring[at], ring[(at + 1) % ring.len()]);
            from[0] * to[1] - to[0] * from[1]
        })
        .sum();
    twice.abs() / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let ring = traced(&field, &cells);
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
