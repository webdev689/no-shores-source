//! What the owner draws on a landmass besides its shape: rivers carved by hand, roads, town areas and ports. Kept in
//! the landmass's edits file with its strokes, each with an id that never changes, so saves and quests can name it.
//! The ground under them is shaped where it is sampled (see `ground.rs`): a river's channel cut, a road's bed eased,
//! a town's ground levelled.

use serde::{Deserialize, Serialize};
use world::geometry::{Point, edges, ring_contains, ring_is_simple, rings_overlap, segments_meet};

/// A hand-carved river's width and depth limits, metres.
pub const RIVER_WIDTH_M: (i64, i64) = (5, 300);
pub const RIVER_DEPTH_M: (i64, i64) = (1, 30);
/// A road's width limits, metres.
pub const ROAD_WIDTH_M: (i64, i64) = (2, 30);
/// How far inland from the coast a port may stand, metres.
pub const PORT_REACH_M: f64 = 3000.0;

/// A river carved by hand: its course from source to mouth.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CarvedRiver {
    pub id: String,
    pub width_m: i64,
    pub depth_m: i64,
    pub points: Vec<Point>,
}

/// A road: its course, end to end.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Road {
    pub id: String,
    pub width_m: i64,
    pub points: Vec<Point>,
}

/// A town's area: a closed ring of points.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Town {
    pub id: String,
    pub outline: Vec<Point>,
}

/// A port: where ships put in, on the land by the coast.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Port {
    pub id: String,
    pub at: Point,
}

/// The distance from a point to the nearest edge of a closed ring, metres.
#[must_use]
pub fn distance_to_ring(ring: &[Point], point: Point) -> f64 {
    let (x, y) = (point.x as f64, point.y as f64);
    let mut best = f64::MAX;
    for (index, from) in ring.iter().enumerate() {
        let to = ring[(index + 1) % ring.len()];
        let (start_x, start_y, span_x, span_y) =
            (from.x as f64, from.y as f64, (to.x - from.x) as f64, (to.y - from.y) as f64);
        let length = span_x * span_x + span_y * span_y;
        let along = if length > 0.0 {
            (((x - start_x) * span_x + (y - start_y) * span_y) / length).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let (dx, dy) = (x - start_x - span_x * along, y - start_y - span_y * along);
        best = best.min((dx * dx + dy * dy).sqrt());
    }
    best
}

/// Every rule the places break on a landmass whose coast is `coast`: one message each, named by the place's id.
#[must_use]
pub fn check_places(
    coast: &[Point],
    rivers: &[CarvedRiver],
    roads: &[Road],
    towns: &[Town],
    ports: &[Port],
) -> Vec<(String, String)> {
    let mut problems = Vec::new();
    let on_land = |point: &Point| ring_contains(coast, *point);
    // A course or an area stays on the land only if no edge of it crosses the coast between its points.
    let crosses_coast = |points: &[Point], closed: bool| {
        let spans = if closed { points.len() } else { points.len().saturating_sub(1) };
        (0..spans).any(|at| {
            let span = (points[at], points[(at + 1) % points.len()]);
            edges(coast).any(|edge| segments_meet(span, edge))
        })
    };
    for river in rivers {
        if river.points.len() < 2 {
            problems.push((river.id.clone(), "a river runs between two points or more".into()));
        } else if !on_land(&river.points[0]) {
            problems.push((river.id.clone(), "its source is not on the land".into()));
        }
    }
    for road in roads {
        if road.points.len() < 2 {
            problems.push((road.id.clone(), "a road runs between two points or more".into()));
        }
        if !road.points.iter().all(on_land) || crosses_coast(&road.points, false) {
            problems.push((road.id.clone(), "it leaves the land".into()));
        }
    }
    for (index, town) in towns.iter().enumerate() {
        if town.outline.len() < 3 || !ring_is_simple(&town.outline) {
            problems.push((town.id.clone(), "its area must be a ring that never crosses itself".into()));
            continue;
        }
        if !town.outline.iter().all(on_land) || crosses_coast(&town.outline, true) {
            problems.push((town.id.clone(), "its area reaches past the coast".into()));
        }
        for other in &towns[index + 1..] {
            if other.outline.len() >= 3 && rings_overlap(&town.outline, &other.outline) {
                problems.push((town.id.clone(), format!("its area overlaps {}", other.id)));
            }
        }
    }
    for port in ports {
        if !on_land(&port.at) || distance_to_ring(coast, port.at) > PORT_REACH_M {
            problems.push((port.id.clone(), format!("a port stands on the land within {PORT_REACH_M} m of the coast")));
        }
    }
    let ids: Vec<&String> = rivers
        .iter()
        .map(|river| &river.id)
        .chain(roads.iter().map(|road| &road.id))
        .chain(towns.iter().map(|town| &town.id))
        .chain(ports.iter().map(|port| &port.id))
        .collect();
    for (index, id) in ids.iter().enumerate() {
        if ids[..index].contains(id) {
            problems.push(((*id).clone(), "another place has this id".into()));
        }
        if id.is_empty() || !id.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-') {
            problems.push(((*id).clone(), "an id is lowercase letters, digits and hyphens".into()));
        }
    }
    problems
}

#[cfg(test)]
#[path = "places_tests.rs"]
mod tests;
