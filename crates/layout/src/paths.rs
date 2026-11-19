//! The paths between a layout's areas: least-cost ways over the land (Galin et al.'s roads: the cost of a step grows
//! with its grade and stops at a cap, water is bridged at a price, ways already laid cost less so new ones branch off
//! them), joined into a loop with a cross-link or two, as Destiny's public areas are, and smoothed into curves.

use crate::field::{CELL_M, Field, Water, distance};
use land::exact::fbm;
use land::heap::CellHeap;
use serde::Serialize;

/// How a path is used, which sets its width and the steepest grade it climbs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    /// A cart track joining the areas: 4.5 m wide, at most 18 % steep.
    Track,
    /// A footpath closing a loop or reaching a gate: 2.6 m, at most 32 %.
    Footpath,
}

impl Tier {
    #[must_use]
    pub const fn width(self) -> f64 {
        match self {
            Self::Track => 4.5,
            Self::Footpath => 2.6,
        }
    }

    /// The steepest grade the tier climbs, as a rise a metre.
    #[must_use]
    pub const fn steepest(self) -> f64 {
        match self {
            Self::Track => 0.18,
            Self::Footpath => 0.32,
        }
    }
}

/// A laid path: its points (world metres) and its tier, and where it crosses running water.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Path {
    pub tier: Tier,
    pub points: Vec<[f64; 2]>,
    /// Each crossing of a river: the dry points either side of the water.
    pub crossings: Vec<[[f64; 2]; 2]>,
    /// The ground's height at each point once the layout is laid on it, metres.
    pub heights: Vec<f64>,
}

/// The sixteen steps a path takes from a cell: every (i, j) within two with no common factor, so a way runs at any of
/// sixteen headings rather than eight.
const STEPS: [(i32, i32); 16] = [
    (1, 0),
    (2, 1),
    (1, 1),
    (1, 2),
    (0, 1),
    (-1, 2),
    (-1, 1),
    (-2, 1),
    (-1, 0),
    (-2, -1),
    (-1, -1),
    (-1, -2),
    (0, -1),
    (1, -2),
    (1, -1),
    (2, -1),
];
/// What a cell already on a path costs, as a share: well under one, so new ways join old ones (Emilien et al.).
const LAID_SHARE: f64 = 0.35;
/// The extra cost of a metre over a river, in metres of dry ground: a bridge is worth a detour, but not a long one.
const RIVER_COST_M: f64 = 14.0;
/// How far round its ends a path may pass between buildings, metres: out of a village's yards.
const END_YARD_M: f64 = 18.0;
/// The steepest grade any way climbs where no gentler one is open: stepped like a stair.
pub const STEPPED: f64 = 0.7;
/// How far inside the claim a path keeps, metres.
const EDGE_KEEP_M: f64 = 14.0;

/// The cells a body cannot path through: what stands there (a building), or lies past the claim's edge.
#[derive(Debug, Clone)]
pub struct Blocked(pub Vec<bool>);

/// Finds the least-cost way from one point to another over the field, as cell indices; None where none is open.
#[must_use]
pub fn find(
    field: &Field,
    ends: [[f64; 2]; 2],
    steepest: f64,
    laid: &[bool],
    blocked: &Blocked,
    seed: u32,
) -> Option<Vec<usize>> {
    let [from, to] = ends;
    let (start, goal) = (field.nearest(from[0], from[1]), field.nearest(to[0], to[1]));
    let count = field.columns * field.rows;
    let mut cost = vec![f64::INFINITY; count];
    let mut came = vec![usize::MAX; count];
    let mut heap = CellHeap::with_capacity(4096);
    cost[start] = 0.0;
    heap.push(start as u32, 0.0);
    let goal_at = field.centre(goal % field.columns, goal / field.columns);
    let start_at = field.centre(start % field.columns, start / field.columns);
    // A way leaves its own ends' yards between the buildings round them: near an end what stands is walked round.
    let by_end = |at: usize| {
        let centre = field.centre(at % field.columns, at / field.columns);
        distance(centre, start_at).min(distance(centre, goal_at)) <= END_YARD_M
    };
    let passable = |at: usize| {
        at == goal
            || at == start
            || ((!blocked.0[at] || by_end(at))
                && field.inside[at] >= EDGE_KEEP_M
                && matches!(field.water[at], Water::Dry | Water::River)
                && field.slope[at] <= 1.2)
    };
    while let Some(cell) = heap.pop() {
        let cell = cell as usize;
        if cell == goal {
            break;
        }
        let (column, row) = ((cell % field.columns) as i32, (cell / field.columns) as i32);
        for (step_x, step_y) in STEPS {
            let (next_column, next_row) = (column + step_x, row + step_y);
            if next_column < 0 || next_row < 0 || next_column >= field.columns as i32 || next_row >= field.rows as i32 {
                continue;
            }
            let next = field.index(next_column as usize, next_row as usize);
            // A long step must not jump over what a short one would meet: its middle cell is passable too.
            let middle = field.index((column + step_x / 2) as usize, (row + step_y / 2) as usize);
            if !passable(next) || !passable(middle) {
                continue;
            }
            let length = CELL_M * f64::from(step_x * step_x + step_y * step_y).sqrt();
            let grade = (field.height[next] - field.height[cell]).abs() / length;
            if grade > steepest && next != goal {
                continue;
            }
            let over_grade = grade / steepest;
            let [x, y] = field.centre(next_column as usize, next_row as usize);
            // A slow noise in the cost bends a way over open level ground, as worn tracks wander.
            let wander = 1.0 + 0.4 * fbm(seed, x / 120.0, y / 120.0, 2);
            let mut step = length * (1.0 + 2.5 * over_grade * over_grade) * wander;
            if field.water[next] == Water::River {
                step += RIVER_COST_M * length;
            }
            if laid[next] {
                step *= LAID_SHARE;
            }
            if blocked.0[next] {
                step *= 4.0;
            }
            let total = cost[cell] + step;
            if total < cost[next] {
                cost[next] = total;
                came[next] = cell;
                heap.push(next as u32, total + distance([x, y], goal_at) * LAID_SHARE * 0.6);
            }
        }
    }
    if came[goal] == usize::MAX && goal != start {
        return None;
    }
    let mut cells = vec![goal];
    while let Some(&last) = cells.last() {
        if last == start {
            break;
        }
        cells.push(came[last]);
    }
    cells.reverse();
    Some(cells)
}

/// A way of cells as a smooth line: its corners cut twice (Chaikin), its ends kept where they were asked for.
#[must_use]
pub fn smoothed(field: &Field, cells: &[usize], from: [f64; 2], to: [f64; 2]) -> Vec<[f64; 2]> {
    let mut points: Vec<[f64; 2]> =
        cells.iter().map(|&at| field.centre(at % field.columns, at / field.columns)).collect();
    if let Some(first) = points.first_mut() {
        *first = from;
    }
    if let Some(last) = points.last_mut() {
        *last = to;
    }
    // Straight runs first lose their middle cells, so the cut corners round the bends and not each cell's step.
    points = simplified(&points, CELL_M * 0.6);
    for _ in 0..3 {
        points = land::ground::chaikin(&points);
    }
    points.dedup_by(|later, earlier| distance(*later, *earlier) < 0.5);
    // To the centimetre: a path's points are written into every window it crosses.
    points.iter().map(|point| point.map(|value| (value * 100.0).round() / 100.0)).collect()
}

/// A line with every point dropped that lies within `tolerance` of the line its neighbours kept make
/// (Douglas and Peucker), its ends kept.
#[must_use]
pub fn simplified(points: &[[f64; 2]], tolerance: f64) -> Vec<[f64; 2]> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let mut keep = vec![false; points.len()];
    let (first, last) = (0, points.len() - 1);
    keep[first] = true;
    keep[last] = true;
    let mut spans = vec![(first, last)];
    while let Some((from, to)) = spans.pop() {
        let (mut farthest, mut far) = (0.0, from);
        for at in from + 1..to {
            let away = off_line(points[at], points[from], points[to]);
            if away > farthest {
                (farthest, far) = (away, at);
            }
        }
        if farthest > tolerance {
            keep[far] = true;
            spans.push((from, far));
            spans.push((far, to));
        }
    }
    points.iter().zip(keep).filter(|(_, kept)| *kept).map(|(point, _)| *point).collect()
}

/// How far a point lies from the segment between two others.
#[must_use]
pub fn off_line(point: [f64; 2], from: [f64; 2], to: [f64; 2]) -> f64 {
    let (span_x, span_y) = (to[0] - from[0], to[1] - from[1]);
    let length = span_x * span_x + span_y * span_y;
    let along = if length > 0.0 {
        (((point[0] - from[0]) * span_x + (point[1] - from[1]) * span_y) / length).clamp(0.0, 1.0)
    } else {
        0.0
    };
    distance(point, [from[0] + span_x * along, from[1] + span_y * along])
}

/// Whether a footprint square to the world (west, north, east, south) keeps more than 0.3 m off every way's walked
/// width.
#[must_use]
pub fn clear_of<'a>(print: [f64; 4], ways: impl IntoIterator<Item = &'a Path>) -> bool {
    ways.into_iter().all(|way| {
        let reach = way.tier.width() / 2.0 + 0.3;
        let [west, north, east, south] = [print[0] - reach, print[1] - reach, print[2] + reach, print[3] + reach];
        way.points.windows(2).all(|pair| {
            // Most segments lie far off: their bounds never come near the footprint.
            let apart = pair[0][0].max(pair[1][0]) < west
                || pair[0][0].min(pair[1][0]) > east
                || pair[0][1].max(pair[1][1]) < north
                || pair[0][1].min(pair[1][1]) > south;
            apart || rect_off_line(print, pair[0], pair[1]) > reach
        })
    })
}

/// How far a footprint square to the world (west, north, east, south) lies from the segment between two points: 0
/// where the segment runs into it.
#[must_use]
pub fn rect_off_line([west, north, east, south]: [f64; 4], from: [f64; 2], to: [f64; 2]) -> f64 {
    let inside = |[x, y]: [f64; 2]| x >= west && x <= east && y >= north && y <= south;
    let corners = [[west, north], [east, north], [east, south], [west, south]];
    let crosses = (0..4).any(|side| segments_cross(from, to, corners[side], corners[(side + 1) % 4]));
    if inside(from) || inside(to) || crosses {
        return 0.0;
    }
    let to_rect = |[x, y]: [f64; 2]| {
        let (east_of, south_of) = ((west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0));
        (east_of * east_of + south_of * south_of).sqrt()
    };
    corners.iter().map(|&corner| off_line(corner, from, to)).fold(to_rect(from).min(to_rect(to)), f64::min)
}

/// Where a way of cells crosses a river: the last dry cell before the water and the first after it, each a point.
#[must_use]
pub fn crossings(field: &Field, cells: &[usize]) -> Vec<[[f64; 2]; 2]> {
    let mut found = Vec::new();
    let mut entered: Option<usize> = None;
    for pair in cells.windows(2) {
        let (was_river, is_river) = (field.water[pair[0]] == Water::River, field.water[pair[1]] == Water::River);
        if !was_river && is_river {
            entered = Some(pair[0]);
        }
        if was_river
            && !is_river
            && let Some(bank) = entered.take()
        {
            let centre = |at: usize| field.centre(at % field.columns, at / field.columns);
            found.push([centre(bank), centre(pair[1])]);
        }
    }
    found
}

/// Pairs of points, by their places in a list.
pub type Links = Vec<(usize, usize)>;

/// The pairs of areas a network joins: a tree of the shortest links (Kruskal over the straight distances), then the
/// shortest further links that close `loops` loops, none shorter than a fifth of the tree's span so a loop is felt.
#[must_use]
pub fn network(points: &[[f64; 2]], loops: usize) -> (Links, Links) {
    let mut pairs: Vec<(f64, usize, usize)> = Vec::new();
    for first in 0..points.len() {
        for second in first + 1..points.len() {
            pairs.push((distance(points[first], points[second]), first, second));
        }
    }
    pairs.sort_by(|left, right| left.0.total_cmp(&right.0).then(left.1.cmp(&right.1)).then(left.2.cmp(&right.2)));
    let mut group: Vec<usize> = (0..points.len()).collect();
    let root = |group: &[usize], mut at: usize| {
        while group[at] != at {
            at = group[at];
        }
        at
    };
    let (mut tree, mut spare) = (Vec::new(), Vec::new());
    for &(_, first, second) in &pairs {
        let (first_root, second_root) = (root(&group, first), root(&group, second));
        if first_root == second_root {
            spare.push((first, second));
        } else {
            group[first_root] = second_root;
            tree.push((first, second));
        }
    }
    // A link that crosses a tree link would make a crossroads in the open; a loop runs round, not through.
    let crosses = |link: (usize, usize), other: (usize, usize)| {
        let shared = link.0 == other.0 || link.0 == other.1 || link.1 == other.0 || link.1 == other.1;
        !shared && segments_cross(points[link.0], points[link.1], points[other.0], points[other.1])
    };
    let mut closing = Vec::new();
    for link in spare {
        if closing.len() >= loops {
            break;
        }
        if tree.iter().chain(closing.iter()).all(|&other| !crosses(link, other)) {
            closing.push(link);
        }
    }
    (tree, closing)
}

/// Whether two segments cross at a point inside both.
fn segments_cross(a1: [f64; 2], a2: [f64; 2], b1: [f64; 2], b2: [f64; 2]) -> bool {
    let side = |from: [f64; 2], to: [f64; 2], point: [f64; 2]| {
        (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0])
    };
    let (d1, d2) = (side(b1, b2, a1), side(b1, b2, a2));
    let (d3, d4) = (side(a1, a2, b1), side(a1, a2, b2));
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0)) && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_square_of_points_is_joined_by_a_tree_and_one_loop() {
        let points = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]];
        let (tree, closing) = network(&points, 1);
        assert_eq!(tree.len(), 3);
        assert_eq!(closing.len(), 1);
        let (none_tree, none_closing) = network(&points, 0);
        assert_eq!((none_tree.len(), none_closing.len()), (3, 0));
    }

    #[test]
    fn crossing_segments_are_found_and_touching_ones_are_not() {
        assert!(segments_cross([0.0, 0.0], [10.0, 10.0], [0.0, 10.0], [10.0, 0.0]));
        assert!(!segments_cross([0.0, 0.0], [10.0, 0.0], [10.0, 0.0], [10.0, 10.0]));
    }

    #[test]
    fn a_footprint_is_as_far_from_a_segment_as_their_nearest_points() {
        let print = [0.0, 0.0, 4.0, 2.0];
        assert_eq!(rect_off_line(print, [-5.0, 1.0], [10.0, 1.0]), 0.0, "through it");
        assert!((rect_off_line(print, [-5.0, 5.0], [10.0, 5.0]) - 3.0).abs() < 1e-12, "past its south side");
        // Passing its corner at a slant: nearest at the corner, not at either end.
        let slant = rect_off_line(print, [6.0, 0.0], [4.0, -2.0]);
        assert!((slant - 2.0_f64.sqrt()).abs() < 1e-12, "{slant}");
    }
}
