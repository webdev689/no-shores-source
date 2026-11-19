//! A path: A* over the poly graph for the corridor of polys, then the funnel pulls the line from start to goal taut
//! through the corridor's portals into a few corners.

use crate::locate::{self, Mesh};
use crate::obstacles::{ObstacleId, Obstacles};
use core::cell::{RefCell, RefMut};
use core::cmp::Ordering;
use std::collections::BinaryHeap;

/// Which obstacles a search walks through.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Waive {
    None,
    One(ObstacleId),
    All,
}

/// A poly waiting to be searched: its estimate when it was offered, and the order it was first offered in.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Open {
    estimate: f64,
    order: usize,
    poly: usize,
}

impl Eq for Open {}

impl Ord for Open {
    /// The heap pops the greatest, so the greatest is the least estimate, then the poly offered first.
    fn cmp(&self, other: &Self) -> Ordering {
        other.estimate.total_cmp(&self.estimate).then(other.order.cmp(&self.order))
    }
}

impl PartialOrd for Open {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// What a search keeps between runs: each poly's cost, estimate, the poly it was reached from, whether it is closed
/// and when it was first offered, read only where its stamp is the current search's, so a search costs what it visits
/// rather than the whole mesh.
#[derive(Debug, Default)]
pub(crate) struct Search {
    stamp: u32,
    stamps: Vec<u32>,
    cost: Vec<f64>,
    estimate: Vec<f64>,
    came_from: Vec<Option<usize>>,
    closed: Vec<bool>,
    order: Vec<usize>,
    open: BinaryHeap<Open>,
}

impl Search {
    /// Starts a search over `count` polys: every poly unvisited.
    fn begin(&mut self, count: usize) {
        if self.stamps.len() != count || self.stamp == u32::MAX {
            *self = Self { stamps: vec![0; count], ..Self::default() };
            for list in [&mut self.cost, &mut self.estimate] {
                list.resize(count, f64::INFINITY);
            }
            self.came_from.resize(count, None);
            self.closed.resize(count, false);
            self.order.resize(count, usize::MAX);
        }
        self.stamp += 1;
        self.open.clear();
    }

    /// Readies a poly's slots for this search, fresh if it has not been visited yet.
    fn visit(&mut self, poly: usize) {
        if self.stamps[poly] != self.stamp {
            self.stamps[poly] = self.stamp;
            self.cost[poly] = f64::INFINITY;
            self.estimate[poly] = f64::INFINITY;
            self.came_from[poly] = None;
            self.closed[poly] = false;
            self.order[poly] = usize::MAX;
        }
    }

    /// Offers a poly at its estimate. A poly offered again keeps the order it was first offered in, so the open set
    /// pops the least estimate, then the poly first offered.
    fn offer(&mut self, poly: usize, offered: &mut usize) {
        if self.order[poly] == usize::MAX {
            self.order[poly] = *offered;
            *offered += 1;
        }
        self.open.push(Open { estimate: self.estimate[poly], order: self.order[poly], poly });
    }
}

/// A mesh's search, kept for its next path. A copy starts empty and any two are alike, so the buffers never tell two
/// meshes apart.
#[derive(Default)]
pub(crate) struct Scratch(RefCell<Search>);

impl Scratch {
    pub fn borrow(&self) -> RefMut<'_, Search> {
        self.0.borrow_mut()
    }
}

impl Clone for Scratch {
    fn clone(&self) -> Self {
        Self::default()
    }
}

impl PartialEq for Scratch {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

impl core::fmt::Debug for Scratch {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter.write_str("Scratch")
    }
}

/// A* over the polys and links from `start` to `goal`, measured centre to centre, a link's cost added to the way to
/// its start; the heuristic is the straight line to the goal's centre from a poly's centre or a link's end, which
/// never overestimates. A blocked poly cannot be entered unless it is the goal or its obstacle is waived; leaving the
/// start is always allowed. Answers the corridor of nodes, start to goal; none at once when no walk joins the two.
pub(crate) fn corridor(
    mesh: &Mesh,
    obstacles: &Obstacles,
    search: &mut Search,
    (start, goal): (usize, usize),
    waive: Waive,
) -> Option<Vec<usize>> {
    if mesh.islands[start] != mesh.islands[goal] {
        return None;
    }
    let target = mesh.centres[goal];
    let to_goal = |node: usize| {
        let at = mesh.link_of(node).map_or_else(|| mesh.centres[node], |laid| laid.to);
        libm::hypot(at.0 - target.0, at.1 - target.1)
    };
    search.begin(mesh.polys.len() + mesh.links.len());
    search.visit(start);
    search.cost[start] = 0.0;
    search.estimate[start] = locate::apart(&mesh.centres, start, goal);
    let mut offered = 0;
    search.offer(start, &mut offered);
    let mut ways = Vec::new();
    while let Some(Open { poly: current, .. }) = search.open.pop() {
        if current == goal {
            break;
        }
        if search.closed[current] {
            continue;
        }
        search.closed[current] = true;
        ways.clear();
        if let Some(laid) = mesh.link_of(current) {
            let (end, to) = (mesh.centres[laid.end], laid.to);
            ways.push((laid.end, libm::hypot(end.0 - to.0, end.1 - to.1)));
        } else {
            let edges = mesh.polys[current].neighbours.iter().zip(&mesh.steps[current]);
            ways.extend(edges.filter_map(|(next, step)| Some((*next.as_ref()?, *step))));
            let centre = mesh.centres[current];
            ways.extend(mesh.exits[current].iter().map(|&at| {
                let laid = &mesh.links[at];
                (mesh.polys.len() + at, libm::hypot(laid.from.0 - centre.0, laid.from.1 - centre.1) + laid.cost)
            }));
        }
        for &(next, step) in &ways {
            search.visit(next);
            if search.closed[next] {
                continue;
            }
            let blocker = if obstacles.is_empty() { None } else { obstacles.blocked.get(next).copied().flatten() };
            let waived = match (blocker, waive) {
                (None, _) | (_, Waive::All) => true,
                (Some(blocker), Waive::One(id)) => blocker == id,
                (Some(_), Waive::None) => false,
            };
            if !waived && next != goal {
                continue;
            }
            let through = search.cost[current] + step;
            if through < search.cost[next] {
                search.cost[next] = through;
                search.came_from[next] = Some(current);
                search.estimate[next] = through + to_goal(next);
                search.offer(next, &mut offered);
            }
        }
    }
    search.visit(goal);
    if start != goal && search.came_from[goal].is_none() {
        return None;
    }
    let mut path = vec![goal];
    let mut at = goal;
    while at != start {
        at = search.came_from[at]?;
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

/// Whether a point stands on a portal's edge between its ends: a walker there is already through it. A funnel opened
/// along the edge itself would point both ways at once, and turn back to the end behind the walker.
fn on_edge(point: (f64, f64), portal: Portal) -> bool {
    let (along_x, along_y) = (portal.left.0 - portal.right.0, portal.left.1 - portal.right.1);
    let length = (along_x * along_x + along_y * along_y).sqrt();
    if length < 1e-6 {
        return false;
    }
    let across = triangle_area(portal.right, portal.left, point).abs() / length;
    let reach = ((point.0 - portal.right.0) * along_x + (point.1 - portal.right.1) * along_y) / length;
    across < 1e-6 && reach > 1e-6 && reach < length - 1e-6
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
        if on_edge(apex, portals[i]) {
            i += 1;
            continue;
        }
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

#[cfg(test)]
#[path = "path_tests.rs"]
mod path_tests;
