//! The hub's section: one ring round everything walked, the outline of the rectangles it is made of: the plaza, the
//! walks before the Beacon (to the west sealed gate, and on round the base's east side to the Stair Yard's), the
//! Hall through its door, and, once the city's ramps are laid, the harbour way's cells, its flight, the quay and the
//! pier (`harbour`).

use super::courts::{HALF_DEPTH_M, HALF_LENGTH_M, PLATFORM_FROM_M};
use super::hall::hall_span;
use super::walks::{BASE_FACE_M, PLATFORM_EDGE_M, SEALED_EAST_M, SEALED_M};
use crate::courtyard::Frame;
use crate::landmarks::BEACON_DOOR_M;

/// The platform's walked rectangles (west, north, east, south), from the hub's spans across and seaward.
#[must_use]
pub fn platform_rects(frame: &Frame) -> Vec<[f64; 4]> {
    let (near, far, half) = hall_span();
    let door = BEACON_DOOR_M[0] / 2.0;
    let [sealed, corner, _, _] = SEALED_M;
    let spans: [([f64; 2], [f64; 2]); 6] = [
        ([-HALF_LENGTH_M, HALF_LENGTH_M], [-HALF_DEPTH_M, HALF_DEPTH_M]),
        ([-PLATFORM_EDGE_M, -corner], [sealed, PLATFORM_FROM_M]),
        ([-corner, corner], [BASE_FACE_M, PLATFORM_FROM_M]),
        ([corner, PLATFORM_EDGE_M], [SEALED_EAST_M, PLATFORM_FROM_M]),
        ([-door, door], [near, BASE_FACE_M]),
        ([-half, half], [far, near]),
    ];
    spans
        .iter()
        .map(|&([west, east], [low, high])| {
            let [one, two] = [frame.at(low, west), frame.at(high, east)];
            [one[0].min(two[0]), one[1].min(two[1]), one[0].max(two[0]), one[1].max(two[1])]
        })
        .collect()
}

/// The outline of rectangles' union (west, north, east, south each), as a ring of points: its longest loop where the
/// union has holes. Corners where the outline runs straight on are left out.
#[must_use]
pub fn outline(rects: &[[f64; 4]]) -> Vec<[f64; 2]> {
    let mut xs: Vec<f64> = rects.iter().flat_map(|rect| [rect[0], rect[2]]).collect();
    let mut ys: Vec<f64> = rects.iter().flat_map(|rect| [rect[1], rect[3]]).collect();
    for edges in [&mut xs, &mut ys] {
        edges.sort_by(f64::total_cmp);
        edges.dedup_by(|one, two| (*one - *two).abs() < 1e-6);
    }
    let (columns, rows) = (xs.len().saturating_sub(1), ys.len().saturating_sub(1));
    let covered = |column: isize, row: isize| {
        if column < 0 || row < 0 || column as usize >= columns || row as usize >= rows {
            return false;
        }
        let (column, row) = (column as usize, row as usize);
        let middle = [(xs[column] + xs[column + 1]) / 2.0, (ys[row] + ys[row + 1]) / 2.0];
        rects
            .iter()
            .any(|rect| middle[0] > rect[0] && middle[0] < rect[2] && middle[1] > rect[1] && middle[1] < rect[3])
    };
    // Each covered cell's sides that border an uncovered one, walked with the cell on the right.
    let mut edges: Vec<((usize, usize), (usize, usize))> = Vec::new();
    for row in 0..rows as isize {
        for column in 0..columns as isize {
            if !covered(column, row) {
                continue;
            }
            let (left, top, right, bottom) = (column as usize, row as usize, column as usize + 1, row as usize + 1);
            if !covered(column, row - 1) {
                edges.push(((right, top), (left, top)));
            }
            if !covered(column + 1, row) {
                edges.push(((right, bottom), (right, top)));
            }
            if !covered(column, row + 1) {
                edges.push(((left, bottom), (right, bottom)));
            }
            if !covered(column - 1, row) {
                edges.push(((left, top), (left, bottom)));
            }
        }
    }
    let mut loops: Vec<Vec<(usize, usize)>> = Vec::new();
    let mut used = vec![false; edges.len()];
    while let Some(start) = used.iter().position(|taken| !taken) {
        let mut ring = vec![edges[start].0];
        let mut at = start;
        loop {
            used[at] = true;
            let end = edges[at].1;
            if end == ring[0] {
                break;
            }
            ring.push(end);
            let Some(next) = (0..edges.len()).find(|&other| !used[other] && edges[other].0 == end) else { break };
            at = next;
        }
        loops.push(ring);
    }
    let longest = loops.into_iter().max_by_key(Vec::len).unwrap_or_default();
    let points: Vec<[f64; 2]> = longest.iter().map(|&(column, row)| [xs[column], ys[row]]).collect();
    let count = points.len();
    (0..count)
        .filter(|&at| {
            let (before, here, after) = (points[(at + count - 1) % count], points[at], points[(at + 1) % count]);
            let cross = (here[0] - before[0]) * (after[1] - here[1]) - (here[1] - before[1]) * (after[0] - here[0]);
            cross.abs() > 1e-9
        })
        .map(|at| points[at])
        .collect()
}

/// The platform's ring alone: the hub's before the harbour way joins it.
#[must_use]
pub fn ring(frame: &Frame) -> Vec<[f64; 2]> {
    outline(&platform_rects(frame))
}

#[cfg(test)]
mod tests {
    use super::outline;

    #[test]
    fn two_rectangles_overlapping_make_one_outline_of_their_union() {
        let ring = outline(&[[0.0, 0.0, 10.0, 10.0], [5.0, 5.0, 20.0, 8.0]]);
        assert_eq!(ring.len(), 8, "{ring:?}");
        for point in [[15.0, 6.0], [2.0, 2.0], [9.0, 9.0]] {
            assert!(reach_inside(&ring, point), "{point:?} is in the union");
        }
        for point in [[15.0, 9.0], [15.0, 4.0], [-1.0, 5.0]] {
            assert!(!reach_inside(&ring, point), "{point:?} is out of it");
        }
    }

    #[test]
    fn rectangles_meeting_at_an_edge_make_one_outline() {
        let ring = outline(&[[0.0, 0.0, 10.0, 10.0], [10.0, 0.0, 20.0, 4.0], [20.0, -10.0, 24.0, 4.0]]);
        assert!(
            reach_inside(&ring, [22.0, -8.0]) && reach_inside(&ring, [12.0, 2.0]) && !reach_inside(&ring, [12.0, 6.0])
        );
    }

    /// Even-odd crossing, as `reach::inside` judges.
    fn reach_inside(ring: &[[f64; 2]], [x, y]: [f64; 2]) -> bool {
        let mut inside = false;
        for at in 0..ring.len() {
            let ([x0, y0], [x1, y1]) = (ring[at], ring[(at + 1) % ring.len()]);
            if (y0 > y) != (y1 > y) && x < x0 + (y - y0) / (y1 - y0) * (x1 - x0) {
                inside = !inside;
            }
        }
        inside
    }
}
