//! A path: A* over the poly graph for the corridor of polys, then the funnel pulls the line from start to goal taut
//! through the corridor's portals into a few corners.

use crate::locate::Mesh;
use crate::obstacles::{ObstacleId, Obstacles};

/// Which obstacles a search walks through.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Waive {
    None,
    One(ObstacleId),
    All,
}

/// A* over the polys from `start` to `goal`, measured centre to centre; the heuristic is the straight line between
/// centres, which never overestimates. A blocked poly cannot be entered unless it is the goal or its obstacle is
/// waived; leaving the start is always allowed. Answers the corridor, start to goal.
pub(crate) fn corridor(
    mesh: &Mesh,
    obstacles: &Obstacles,
    start: usize,
    goal: usize,
    waive: Waive,
) -> Option<Vec<usize>> {
    let count = mesh.polys.len();
    let centre = |poly: usize| mesh.centres[poly];
    let apart = |one: usize, two: usize| libm::hypot(centre(one).0 - centre(two).0, centre(one).1 - centre(two).1);
    let mut cost = vec![f64::INFINITY; count];
    let mut estimate = vec![f64::INFINITY; count];
    let mut came_from: Vec<Option<usize>> = vec![None; count];
    let mut closed = vec![false; count];
    cost[start] = 0.0;
    estimate[start] = apart(start, goal);
    let mut open = vec![start];
    while !open.is_empty() {
        let best =
            (1..open.len()).fold(0, |best, at| if estimate[open[at]] < estimate[open[best]] { at } else { best });
        let current = open.remove(best);
        if current == goal {
            break;
        }
        if closed[current] {
            continue;
        }
        closed[current] = true;
        for &next in mesh.polys[current].neighbours.iter().flatten() {
            if closed[next] {
                continue;
            }
            let blocker = if obstacles.is_empty() { None } else { obstacles.blocked[next] };
            let waived = match (blocker, waive) {
                (None, _) | (_, Waive::All) => true,
                (Some(blocker), Waive::One(id)) => blocker == id,
                (Some(_), Waive::None) => false,
            };
            if !waived && next != goal {
                continue;
            }
            let through = cost[current] + apart(current, next);
            if through < cost[next] {
                cost[next] = through;
                came_from[next] = Some(current);
                estimate[next] = through + apart(next, goal);
                open.push(next);
            }
        }
    }
    if start != goal && came_from[goal].is_none() {
        return None;
    }
    let mut path = vec![goal];
    let mut at = goal;
    while at != start {
        at = came_from[at]?;
        path.push(at);
    }
    path.reverse();
    Some(path)
}

/// A portal's two ends, left and right as seen walking through it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Portal {
    pub left: (f64, f64),
    pub right: (f64, f64),
}

/// Twice the signed area of the triangle `a`, `point`, `b`, in the funnel's sign convention.
fn triangle_area(a: (f64, f64), b: (f64, f64), point: (f64, f64)) -> f64 {
    (point.0 - a.0) * (b.1 - a.1) - (b.0 - a.0) * (point.1 - a.1)
}

fn same(a: (f64, f64), b: (f64, f64)) -> bool {
    (a.0 - b.0).abs() < 1e-6 && (a.1 - b.1).abs() < 1e-6
}

/// The simple stupid funnel: pulls the line taut through the portals, the first and last of which are the start
/// and the goal as points. Answers the corners, start and goal included.
pub(crate) fn funnel(portals: &[Portal]) -> Vec<(f64, f64)> {
    let mut points = vec![portals[0].left];
    let (mut apex, mut left, mut right) = (portals[0].left, portals[0].left, portals[0].right);
    let (mut left_at, mut right_at) = (0, 0);
    let mut i = 1;
    while i < portals.len() {
        let Portal { left: next_left, right: next_right } = portals[i];
        if triangle_area(apex, right, next_right) <= 0.0 {
            if same(apex, right) || triangle_area(apex, left, next_right) > 0.0 {
                right = next_right;
                right_at = i;
            } else {
                points.push(left);
                apex = left;
                right = apex;
                right_at = left_at;
                i = left_at + 1;
                continue;
            }
        }
        if triangle_area(apex, left, next_left) >= 0.0 {
            if same(apex, left) || triangle_area(apex, right, next_left) < 0.0 {
                left = next_left;
                left_at = i;
            } else {
                points.push(right);
                apex = right;
                left = apex;
                left_at = right_at;
                i = right_at + 1;
                continue;
            }
        }
        i += 1;
    }
    let end = portals[portals.len() - 1].left;
    if points.last().is_none_or(|&last| !same(last, end)) {
        points.push(end);
    }
    points
}

/// The portals along a corridor from a start to a goal point: the shared edge into each next poly, its head on the
/// left and its tail on the right, as the current poly winds.
pub(crate) fn portals(mesh: &Mesh, corridor: &[usize], start: (f64, f64), goal: (f64, f64)) -> Option<Vec<Portal>> {
    let mut portals = vec![Portal { left: start, right: start }];
    for pair in corridor.windows(2) {
        let edge = mesh.polys[pair[0]].neighbours.iter().position(|&next| next == Some(pair[1]))?;
        portals.push(Portal { left: mesh.corner(pair[0], edge + 1), right: mesh.corner(pair[0], edge) });
    }
    portals.push(Portal { left: goal, right: goal });
    Some(portals)
}
