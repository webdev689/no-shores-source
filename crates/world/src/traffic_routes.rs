//! Planning the traffic's routes round land: each port's roadstead, an A* path over a sea mask kept clear of every
//! coast, then string-pulled into legs each checked exactly against every coast.

use super::{MASK_CELL_M, MASK_CLEAR_M, ROADSTEAD_CLEAR_M, ROADSTEAD_OUT_M, ROADSTEAD_STEP_M};
use crate::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use crate::geometry::{Point, edges, segments_meet};
use crate::layout::Layout;
use crate::waters::Waters;
use std::cmp::Reverse;
use std::collections::BinaryHeap;

/// A* step costs in metres: straight across a cell and corner to corner, rounded down so the guess never overshoots.
const STRAIGHT_COST: u64 = 5_000;
const DIAGONAL_COST: u64 = 7_071;

/// How many cells round a roadstead are searched for the clear cell its path starts from.
const START_SEARCH_CELLS: i64 = 20;

fn rounded(point: [f64; 2]) -> Point {
    Point::new(point[0].round() as i64, point[1].round() as i64)
}

/// Where a port's ships come and go: the nearest point of its own coast to its centre, 3 km out to sea away from the
/// centre, then on outward in 500 m steps until it is at least 1 km clear of every coast.
pub(super) fn roadstead(waters: &Waters, continent: usize, centre: [f64; 2]) -> Point {
    let ring = waters.ring(continent);
    let mut coast = ring[0];
    let mut least = f64::INFINITY;
    for i in 0..ring.len() {
        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
        let (along_x, along_y) = (b[0] - a[0], b[1] - a[1]);
        let length_squared = along_x * along_x + along_y * along_y;
        let fraction = if length_squared == 0.0 {
            0.0
        } else {
            (((centre[0] - a[0]) * along_x + (centre[1] - a[1]) * along_y) / length_squared).clamp(0.0, 1.0)
        };
        let near = [a[0] + fraction * along_x, a[1] + fraction * along_y];
        let distance = (near[0] - centre[0]) * (near[0] - centre[0]) + (near[1] - centre[1]) * (near[1] - centre[1]);
        if distance < least {
            (least, coast) = (distance, near);
        }
    }
    let (away_x, away_y) = (coast[0] - centre[0], coast[1] - centre[1]);
    let length = (away_x * away_x + away_y * away_y).sqrt();
    let away = if length > 0.0 { [away_x / length, away_y / length] } else { [0.0, -1.0] };
    let mut out = ROADSTEAD_OUT_M;
    let limit = (FRAME_WIDTH_M + FRAME_HEIGHT_M) as f64;
    loop {
        let point = rounded([coast[0] + out * away[0], coast[1] + out * away[1]]);
        if waters.clearance([point.x as f64, point.y as f64]) >= ROADSTEAD_CLEAR_M || out > limit {
            return point;
        }
        out += ROADSTEAD_STEP_M;
    }
}

/// Every coast edge of a layout, as whole-metre segments.
pub(super) fn coast_edges(layout: &Layout) -> Vec<(Point, Point)> {
    layout.continents.iter().flat_map(|continent| edges(&continent.outline).collect::<Vec<_>>()).collect()
}

/// Whether a leg touches no coast anywhere.
pub(super) fn leg_clear(coast: &[(Point, Point)], from: Point, to: Point) -> bool {
    coast.iter().all(|&edge| !segments_meet((from, to), edge))
}

/// The sea mask: each 5 km cell whose middle is at least 3 km clear of every coast.
pub(super) struct Mask {
    columns: usize,
    rows: usize,
    clear: Vec<bool>,
}

impl Mask {
    pub(super) fn new(waters: &Waters) -> Self {
        let columns = (FRAME_WIDTH_M as f64 / MASK_CELL_M).ceil() as usize;
        let rows = (FRAME_HEIGHT_M as f64 / MASK_CELL_M).ceil() as usize;
        let clear =
            (0..rows * columns).map(|cell| waters.clearance(Self::middle(columns, cell)) >= MASK_CLEAR_M).collect();
        Self { columns, rows, clear }
    }

    fn middle(columns: usize, cell: usize) -> [f64; 2] {
        [((cell % columns) as f64 + 0.5) * MASK_CELL_M, ((cell / columns) as f64 + 0.5) * MASK_CELL_M]
    }

    fn point(&self, cell: usize) -> Point {
        rounded(Self::middle(self.columns, cell))
    }

    fn clear_at(&self, column: i64, row: i64) -> bool {
        (0..self.columns as i64).contains(&column)
            && (0..self.rows as i64).contains(&row)
            && self.clear[row as usize * self.columns + column as usize]
    }

    /// The nearest clear cell to a point that a straight leg reaches without touching land; ties to the lower cell.
    fn start_cell(&self, coast: &[(Point, Point)], point: Point) -> Option<usize> {
        let column = (point.x as f64 / MASK_CELL_M).floor() as i64;
        let row = (point.y as f64 / MASK_CELL_M).floor() as i64;
        let mut cells: Vec<(i128, usize)> = Vec::new();
        for near_row in row - START_SEARCH_CELLS..=row + START_SEARCH_CELLS {
            for near_column in column - START_SEARCH_CELLS..=column + START_SEARCH_CELLS {
                if self.clear_at(near_column, near_row) {
                    let cell = near_row as usize * self.columns + near_column as usize;
                    let middle = self.point(cell);
                    let (dx, dy) = (i128::from(middle.x - point.x), i128::from(middle.y - point.y));
                    cells.push((dx * dx + dy * dy, cell));
                }
            }
        }
        cells.sort_unstable();
        cells.into_iter().map(|(_, cell)| cell).find(|&cell| leg_clear(coast, point, self.point(cell)))
    }

    fn guess(&self, cell: usize, goal: usize) -> u64 {
        let dx = (cell % self.columns).abs_diff(goal % self.columns) as u64;
        let dy = (cell / self.columns).abs_diff(goal / self.columns) as u64;
        STRAIGHT_COST * dx.max(dy).saturating_sub(dx.min(dy)) + DIAGONAL_COST * dx.min(dy)
    }

    /// The cheapest path of clear cells between two cells, eight neighbours, never cutting a corner past an unclear
    /// cell; ties go to the lower cell index, so every machine finds the same path.
    fn path(&self, start: usize, goal: usize) -> Option<Vec<usize>> {
        let mut cost = vec![u64::MAX; self.clear.len()];
        let mut came_from = vec![usize::MAX; self.clear.len()];
        let mut open = BinaryHeap::new();
        cost[start] = 0;
        open.push(Reverse((self.guess(start, goal), start)));
        while let Some(Reverse((estimate, cell))) = open.pop() {
            if estimate > cost[cell] + self.guess(cell, goal) {
                continue;
            }
            if cell == goal {
                let mut path = vec![goal];
                while let Some(&last) = path.last()
                    && last != start
                {
                    path.push(came_from[last]);
                }
                path.reverse();
                return Some(path);
            }
            let (column, row) = ((cell % self.columns) as i64, (cell / self.columns) as i64);
            for (dx, dy) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
                let diagonal = dx != 0 && dy != 0;
                if !self.clear_at(column + dx, row + dy)
                    || (diagonal && !(self.clear_at(column + dx, row) && self.clear_at(column, row + dy)))
                {
                    continue;
                }
                let next = (row + dy) as usize * self.columns + (column + dx) as usize;
                let step = if diagonal { DIAGONAL_COST } else { STRAIGHT_COST };
                let reached = cost[cell] + step;
                if reached < cost[next] {
                    cost[next] = reached;
                    came_from[next] = cell;
                    open.push(Reverse((reached + self.guess(next, goal), next)));
                }
            }
        }
        None
    }

    /// The route between two roadsteads: from each to its nearest reachable clear cell, A* between those cells, then
    /// string-pulled, each leg running as far ahead as it can without touching land. None when no path is found.
    pub(super) fn route(&self, coast: &[(Point, Point)], from: Point, to: Point) -> Option<Vec<Point>> {
        let cells = self.path(self.start_cell(coast, from)?, self.start_cell(coast, to)?)?;
        let mut points = vec![from];
        points.extend(cells.iter().map(|&cell| self.point(cell)));
        points.push(to);
        let mut pulled = vec![from];
        let mut anchor = 0;
        while anchor + 1 < points.len() {
            let mut reach = anchor + 1;
            while reach + 1 < points.len() && leg_clear(coast, points[anchor], points[reach + 1]) {
                reach += 1;
            }
            pulled.push(points[reach]);
            anchor = reach;
        }
        pulled.dedup();
        Some(pulled)
    }
}
