//! Planning the traffic's routes round land: each port's roadstead, an A* path over a sea mask kept clear of every
//! coast, then string-pulled into legs each checked exactly to stay clear of every coast and isle.

use super::{
    BERTH_APART_M, BERTH_LEVELS, BERTH_M, BERTH_STEP_M, LEG_CLEAR_M, MASK_CELL_M, MASK_CLEAR_M, ROADSTEAD_CLEAR_M,
    ROADSTEAD_OUT_M, ROADSTEAD_STEP_M, Route, Way,
};
use crate::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use crate::geometry::{Point, edges, segment_clear_of_circle, segments_meet};
use crate::layout::Layout;
use crate::waters::{Waters, to_segment};
use std::cmp::Reverse;
use std::collections::BinaryHeap;

/// A* step costs in metres: straight across a cell and corner to corner, rounded down so the guess never overshoots.
const STRAIGHT_COST: u64 = 5_000;
const DIAGONAL_COST: u64 = 7_071;

/// How many cells round a roadstead are searched for the clear cell its path starts from.
const START_SEARCH_CELLS: i64 = 20;
/// A cell no port's way reaches, in `Mask::nearest_ports`.
pub(super) const NO_PORT: u8 = u8::MAX;

/// A point in whole metres.
fn rounded(point: [f64; 2]) -> Point {
    Point::new(point[0].round() as i64, point[1].round() as i64)
}

/// Where a port's ships come and go: the nearest point of its own coast to its centre, 3 km out to sea away from the
/// centre, then on outward in 500 m steps until it is at least 1 km clear of every coast. None when the way out leaves
/// the frame before it is clear.
pub(super) fn roadstead(waters: &Waters, continent: usize, centre: [f64; 2]) -> Option<Point> {
    let ring = waters.ring(continent);
    let mut coast = *ring.first()?;
    let mut least = f64::INFINITY;
    for i in 0..ring.len() {
        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
        let (distance, fraction) = to_segment(centre, a, b);
        if distance < least {
            (least, coast) = (distance, [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])]);
        }
    }
    let (away_x, away_y) = (coast[0] - centre[0], coast[1] - centre[1]);
    let length = (away_x * away_x + away_y * away_y).sqrt();
    let away = if length > 0.0 { [away_x / length, away_y / length] } else { [0.0, -1.0] };
    let mut out = ROADSTEAD_OUT_M;
    loop {
        let point = rounded([coast[0] + out * away[0], coast[1] + out * away[1]]);
        if !((0..=FRAME_WIDTH_M).contains(&point.x) && (0..=FRAME_HEIGHT_M).contains(&point.y)) {
            return None;
        }
        if waters.clearance([point.x as f64, point.y as f64]) >= ROADSTEAD_CLEAR_M {
            return Some(point);
        }
        out += ROADSTEAD_STEP_M;
    }
}

/// Gives each course its berths off both its ports' roadsteads, in the routes' order (`BERTH_M`): each way then runs
/// from the berth its ships leave at to the one they lie at.
pub(super) fn berth(routes: &mut [Route], roadsteads: &[Point]) {
    let mut laid: Vec<Vec<Point>> = vec![Vec::new(); roadsteads.len()];
    for route in routes.iter_mut() {
        let last = route.path.len() - 1;
        let mut berth_at = |port: usize, from: Point| {
            let (arrive, leave) = berths(roadsteads[port], from, &laid[port]);
            laid[port].extend([arrive, leave]);
            (arrive, leave)
        };
        let (into_first, out_of_first) = berth_at(route.from_port, route.path[1]);
        let (into_second, out_of_second) = berth_at(route.to_port, route.path[last - 1]);
        let mut paths = [route.path.clone(), route.path.iter().rev().copied().collect()];
        [paths[0][0], paths[0][last]] = [out_of_first, into_second];
        [paths[1][0], paths[1][last]] = [out_of_second, into_first];
        route.ways = paths.map(Way::new);
    }
}

/// A course's two berths off `roadstead`, its last leg coming in from `from`: the one its arrivals lie at, to starboard
/// of the way in, and the one its departures leave from, as far to port; moved out a step while either comes within
/// BERTH_APART_M of a berth `laid` there before.
fn berths(roadstead: Point, from: Point, laid: &[Point]) -> (Point, Point) {
    let (x, y) = ((roadstead.x - from.x) as f64, (roadstead.y - from.y) as f64);
    let length = (x * x + y * y).sqrt();
    // A quarter turn clockwise of the way in, east and south: its starboard.
    let starboard = if length > 0.0 { [-y / length, x / length] } else { [1.0, 0.0] };
    let at = |out: f64| rounded([roadstead.x as f64 + out * starboard[0], roadstead.y as f64 + out * starboard[1]]);
    let clear = |point: Point| {
        laid.iter().all(|other| {
            let (dx, dy) = ((point.x - other.x) as f64, (point.y - other.y) as f64);
            dx * dx + dy * dy >= BERTH_APART_M * BERTH_APART_M
        })
    };
    let out = |level: u32| BERTH_M + f64::from(level) * BERTH_STEP_M;
    let level = (0..BERTH_LEVELS).find(|&level| clear(at(out(level))) && clear(at(-out(level))));
    let out = out(level.unwrap_or(BERTH_LEVELS - 1));
    (at(out), at(-out))
}

/// The land a leg must keep clear of: every coast edge and every isle, in whole metres.
pub(super) struct Land {
    coast: Vec<(Point, Point)>,
    isles: Vec<(Point, i64)>,
}

impl Land {
    pub(super) fn new(layout: &Layout) -> Self {
        let coast =
            layout.continents.iter().flat_map(|continent| edges(&continent.outline).collect::<Vec<_>>()).collect();
        let isles = layout.isles.iter().map(|isle| (isle.centre, isle.radius_m)).collect();
        Self { coast, isles }
    }

    /// Whether a leg stays more than `LEG_CLEAR_M` from every coast edge and every isle. Two segments that do not meet
    /// are nearest at an end of one, so each end is held clear of the other segment.
    pub(super) fn leg_clear(&self, from: Point, to: Point) -> bool {
        let clear = LEG_CLEAR_M as i64;
        let apart = |(a, b): (Point, Point)| {
            a.x.max(b.x) + clear < from.x.min(to.x)
                || from.x.max(to.x) + clear < a.x.min(b.x)
                || a.y.max(b.y) + clear < from.y.min(to.y)
                || from.y.max(to.y) + clear < a.y.min(b.y)
        };
        let edge_clear = |&edge: &(Point, Point)| {
            apart(edge)
                || (!segments_meet((from, to), edge)
                    && segment_clear_of_circle((from, to), edge.0, clear)
                    && segment_clear_of_circle((from, to), edge.1, clear)
                    && segment_clear_of_circle(edge, from, clear)
                    && segment_clear_of_circle(edge, to, clear))
        };
        self.coast.iter().all(edge_clear)
            && self.isles.iter().all(|&(centre, radius)| segment_clear_of_circle((from, to), centre, radius + clear))
    }
}

/// The sea mask: each 5 km cell whose middle is at least 3 km clear of every coast and isle.
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
    pub(super) fn start_cell(&self, land: &Land, point: Point) -> Option<usize> {
        self.cells_near(point).into_iter().find(|&cell| land.leg_clear(point, self.point(cell)))
    }

    /// The middle of the clear cell nearest a point, however land lies between; ties to the lower cell.
    pub(super) fn clear_near(&self, point: Point) -> Option<Point> {
        self.cells_near(point).first().map(|&cell| self.point(cell))
    }

    /// The clear cells within START_SEARCH_CELLS of a point, nearest first, ties to the lower cell.
    fn cells_near(&self, point: Point) -> Vec<usize> {
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
        cells.into_iter().map(|(_, cell)| cell).collect()
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
            for (next, step) in self.steps(cell) {
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

    /// The clear cells a path steps to from `cell`, eight neighbours, never cutting a corner past an unclear cell, each
    /// with the step's cost.
    fn steps(&self, cell: usize) -> impl Iterator<Item = (usize, u64)> + '_ {
        let (column, row) = ((cell % self.columns) as i64, (cell / self.columns) as i64);
        [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)].into_iter().filter_map(
            move |(dx, dy)| {
                let diagonal = dx != 0 && dy != 0;
                let open = self.clear_at(column + dx, row + dy)
                    && (!diagonal || (self.clear_at(column + dx, row) && self.clear_at(column, row + dy)));
                let step = if diagonal { DIAGONAL_COST } else { STRAIGHT_COST };
                open.then(|| ((row + dy) as usize * self.columns + (column + dx) as usize, step))
            },
        )
    }

    /// Each cell's nearest of `ports` by the cheapest path of clear cells, the leg from a port to the cell its path
    /// starts from counted: `NO_PORT` where none reaches. One search from every port at once, so the nearest from any
    /// point is a lookup; ties go to the lower port, so every machine reckons the same.
    pub(super) fn nearest_ports(&self, land: &Land, ports: &[Point]) -> Vec<u8> {
        assert!(ports.len() < usize::from(NO_PORT), "a port's number fits below NO_PORT");
        let mut best = vec![(u64::MAX, NO_PORT); self.clear.len()];
        let mut open = BinaryHeap::new();
        for (port, &at) in ports.iter().enumerate() {
            let Some(cell) = self.start_cell(land, at) else { continue };
            let middle = self.point(cell);
            let (dx, dy) = (i128::from(middle.x - at.x), i128::from(middle.y - at.y));
            let here = (((dx * dx + dy * dy) as f64).sqrt() as u64, port as u8);
            if here < best[cell] {
                best[cell] = here;
                open.push(Reverse((here, cell)));
            }
        }
        while let Some(Reverse(((cost, port), cell))) = open.pop() {
            if (cost, port) > best[cell] {
                continue;
            }
            for (next, step) in self.steps(cell) {
                let reached = (cost + step, port);
                if reached < best[next] {
                    best[next] = reached;
                    open.push(Reverse((reached, next)));
                }
            }
        }
        best.into_iter().map(|(_, port)| port).collect()
    }

    /// The route between two roadsteads: from each to its nearest reachable clear cell, A* between those cells, then
    /// string-pulled, each leg running as far ahead as it can without touching land. None when no path is found, or
    /// when even one step between neighbouring cells touches land (a rock smaller than a cell at its corner).
    pub(super) fn route(&self, land: &Land, from: Point, to: Point) -> Option<Vec<Point>> {
        let cells = self.path(self.start_cell(land, from)?, self.start_cell(land, to)?)?;
        let mut points = vec![from];
        points.extend(cells.iter().map(|&cell| self.point(cell)));
        points.push(to);
        let mut pulled = vec![from];
        let mut anchor = 0;
        while anchor + 1 < points.len() {
            let mut reach = anchor + 1;
            if !land.leg_clear(points[anchor], points[reach]) {
                return None;
            }
            while reach + 1 < points.len() && land.leg_clear(points[anchor], points[reach + 1]) {
                reach += 1;
            }
            pulled.push(points[reach]);
            anchor = reach;
        }
        pulled.dedup();
        Some(pulled)
    }
}
