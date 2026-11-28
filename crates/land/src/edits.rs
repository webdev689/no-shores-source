//! The hand edits to one landmass, kept in `content/world/land/<id>.json`: brush strokes that reshape the ground
//! the generator made. A stroke is its brush and the points it was dabbed at, whole metres, so a file holds a great
//! deal of sculpting in little space and reads as what was done. Strokes apply in order, each dab reading the
//! ground the dabs before it left, so the same file makes the same ground on any machine.

use crate::exact::smooth;
use crate::grid::Grid;
use crate::places::{CarvedRiver, Port, RIVER_DEPTH_M, RIVER_WIDTH_M, ROAD_WIDTH_M, Road, Town, check_places};
use crate::relief::{LAND_FLOOR_M, SEA_CEILING_M};
use crate::sites::{City, Node, check_sites, site_ids};
use serde::{Deserialize, Serialize};
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};
use world::geometry::Point;

/// A brush's limits, so a typo cannot flood a continent.
pub const RADIUS_M: (i64, i64) = (1_000, 200_000);
pub const RAISE_M: (u32, u32) = (1, 500);
pub const PERCENT: (u32, u32) = (1, 100);
pub const LEVEL_M: (i64, i64) = (-500, 9_000);
/// The most a file may hold, so no request can make the land run for hours: dabs in all its strokes, points in one
/// place, and the length of one river or road.
pub const MAX_DABS: usize = 200_000;
pub const MAX_PLACE_POINTS: usize = 10_000;
pub const MAX_COURSE_M: f64 = 5_000_000.0;

/// One landmass's edits file: its shaping strokes, and the places drawn on it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edits {
    #[serde(default)]
    pub strokes: Vec<Stroke>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rivers: Vec<CarvedRiver>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub roads: Vec<Road>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub towns: Vec<Town>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<Port>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city: Option<City>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    /// Lifts the ground `strength` metres a dab at the brush's centre.
    Raise,
    /// Lowers it the same way.
    Lower,
    /// Moves it `strength` percent of the way to its neighbours' mean a dab.
    Smooth,
    /// Moves it `strength` percent of the way to `level_m` a dab.
    Flatten,
}

/// How a brush's weight falls from its centre to its edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Falloff {
    #[default]
    Smooth,
    Linear,
    Flat,
}

/// One stroke: a brush, dabbed at each of its points in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stroke {
    pub tool: Tool,
    pub radius_m: i64,
    pub strength: u32,
    #[serde(default)]
    pub falloff: Falloff,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_m: Option<i64>,
    pub points: Vec<Point>,
}

/// One thing an edits file gets wrong: which stroke, and what.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub subject: String,
    pub message: String,
}

/// Reads an edits file's text.
pub fn parse(text: &str) -> Result<Edits, serde_json::Error> {
    serde_json::from_str(text)
}

/// Writes an edits file's text in the repository's one written form.
pub fn write(edits: &Edits) -> Result<String, serde_json::Error> {
    world::layout::write_value(edits)
}

/// Every rule a file breaks on the landmass whose coast is `coast`: its strokes', then its places'.
#[must_use]
pub fn check_on(edits: &Edits, coast: &[Point]) -> Vec<Problem> {
    let mut problems = check(edits);
    let mut places = check_places(coast, &edits.rivers, &edits.roads, &edits.towns, &edits.ports);
    places.extend(check_sites(coast, edits.city.as_ref(), &edits.nodes));
    let drawn: Vec<&String> = edits
        .rivers
        .iter()
        .map(|river| &river.id)
        .chain(edits.roads.iter().map(|road| &road.id))
        .chain(edits.towns.iter().map(|town| &town.id))
        .chain(edits.ports.iter().map(|port| &port.id))
        .collect();
    let mut seen: Vec<&String> = Vec::new();
    for id in site_ids(edits.city.as_ref(), &edits.nodes) {
        if drawn.contains(&id) || seen.contains(&id) {
            places.push((id.clone(), "another place has this id".into()));
        }
        if id.is_empty() || !id.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-') {
            places.push((id.clone(), "an id is lowercase letters, digits and hyphens".into()));
        }
        seen.push(id);
    }
    problems.extend(places.into_iter().map(|(subject, message)| Problem { subject, message }));
    problems
}

/// Every rule a file's strokes break, and every point of a place outside the world's frame.
#[must_use]
pub fn check(edits: &Edits) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (index, stroke) in edits.strokes.iter().enumerate() {
        let mut problem =
            |message: String| problems.push(Problem { subject: format!("stroke {}", index + 1), message });
        if !(RADIUS_M.0..=RADIUS_M.1).contains(&stroke.radius_m) {
            problem(format!("its radius must be {} to {} m", RADIUS_M.0, RADIUS_M.1));
        }
        let (low, high) = match stroke.tool {
            Tool::Raise | Tool::Lower => RAISE_M,
            Tool::Smooth | Tool::Flatten => PERCENT,
        };
        if !(low..=high).contains(&stroke.strength) {
            problem(format!("its strength must be {low} to {high}"));
        }
        match (stroke.tool, stroke.level_m) {
            (Tool::Flatten, None) => problem("a flatten stroke needs its level_m".into()),
            (Tool::Flatten, Some(level)) if !(LEVEL_M.0..=LEVEL_M.1).contains(&level) => {
                problem(format!("its level must be {} to {} m", LEVEL_M.0, LEVEL_M.1));
            }
            (Tool::Raise | Tool::Lower | Tool::Smooth, Some(_)) => problem("only a flatten stroke has a level".into()),
            _ => {}
        }
        if stroke.points.is_empty() {
            problem("it has no points".into());
        }
        if stroke
            .points
            .iter()
            .any(|point| !(0..=FRAME_WIDTH_M).contains(&point.x) || !(0..=FRAME_HEIGHT_M).contains(&point.y))
        {
            problem("a point lies outside the world's frame".into());
        }
    }
    let dabs: usize = edits.strokes.iter().map(|stroke| stroke.points.len()).sum();
    if dabs > MAX_DABS {
        problems.push(Problem { subject: "strokes".into(), message: format!("they hold over {MAX_DABS} dabs") });
    }
    let mut size = |id: &String, wrong: bool, message: String| {
        if wrong {
            problems.push(Problem { subject: id.clone(), message });
        }
    };
    for river in &edits.rivers {
        let (width, depth) = (RIVER_WIDTH_M, RIVER_DEPTH_M);
        let wide = !(width.0..=width.1).contains(&river.width_m);
        size(&river.id, wide, format!("its width must be {} to {} m", width.0, width.1));
        let deep = !(depth.0..=depth.1).contains(&river.depth_m);
        size(&river.id, deep, format!("its depth must be {} to {} m", depth.0, depth.1));
    }
    for road in &edits.roads {
        let wide = !(ROAD_WIDTH_M.0..=ROAD_WIDTH_M.1).contains(&road.width_m);
        size(&road.id, wide, format!("its width must be {} to {} m", ROAD_WIDTH_M.0, ROAD_WIDTH_M.1));
    }
    let courses = edits
        .rivers
        .iter()
        .map(|river| (&river.id, &river.points))
        .chain(edits.roads.iter().map(|road| (&road.id, &road.points)));
    for (id, points) in courses {
        let long = course_length_m(points) > MAX_COURSE_M;
        size(id, long, format!("it runs over {} km", MAX_COURSE_M / 1000.0));
    }
    let in_frame = |point: &Point| (0..=FRAME_WIDTH_M).contains(&point.x) && (0..=FRAME_HEIGHT_M).contains(&point.y);
    let places = edits
        .rivers
        .iter()
        .map(|river| (&river.id, river.points.as_slice()))
        .chain(edits.roads.iter().map(|road| (&road.id, road.points.as_slice())))
        .chain(edits.towns.iter().map(|town| (&town.id, town.outline.as_slice())))
        .chain(edits.ports.iter().map(|port| (&port.id, std::slice::from_ref(&port.at))));
    for (id, points) in places {
        if !points.iter().all(in_frame) {
            problems.push(Problem { subject: id.clone(), message: "a point lies outside the world's frame".into() });
        }
        if points.len() > MAX_PLACE_POINTS {
            problems.push(Problem { subject: id.clone(), message: format!("it has over {MAX_PLACE_POINTS} points") });
        }
    }
    problems
}

/// A course's length along its points, metres.
fn course_length_m(points: &[Point]) -> f64 {
    points
        .windows(2)
        .map(|pair| {
            let (dx, dy) = ((pair[1].x - pair[0].x) as f64, (pair[1].y - pair[0].y) as f64);
            (dx * dx + dy * dy).sqrt()
        })
        .sum()
}

/// The cells a dab changed, as a rectangle: `right` and `bottom` exclusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CellRect {
    pub left: usize,
    pub top: usize,
    pub right: usize,
    pub bottom: usize,
}

fn weight(falloff: Falloff, fraction: f64) -> f64 {
    if fraction >= 1.0 {
        return 0.0;
    }
    match falloff {
        Falloff::Flat => 1.0,
        Falloff::Linear => 1.0 - fraction,
        Falloff::Smooth => 1.0 - smooth(0.0, 1.0, fraction),
    }
}

/// Dabs one brush at one point on `ground`, every move read from the ground as it was before the dab; land stays
/// land and sea stays sea. Answers the cells it touched, or None when the dab misses the window.
pub fn dab(ground: &mut Grid, land: &[bool], stroke: &Stroke, point: Point) -> Option<CellRect> {
    let radius = stroke.radius_m as f64;
    let (x, y) = (point.x as f64, point.y as f64);
    let first = |centre: f64, origin: f64| ((centre - radius - origin) / ground.cell_m).floor().max(0.0) as usize;
    let last = |centre: f64, origin: f64, size: usize| {
        (((centre + radius - origin) / ground.cell_m).ceil().max(0.0) as usize).min(size)
    };
    let rect = CellRect {
        left: first(x, ground.left_m),
        top: first(y, ground.top_m),
        right: last(x, ground.left_m, ground.width),
        bottom: last(y, ground.top_m, ground.height),
    };
    if rect.left >= rect.right || rect.top >= rect.bottom {
        return None;
    }
    let strength = f64::from(stroke.strength);
    let mut moves = Vec::new();
    for j in rect.top..rect.bottom {
        for i in rect.left..rect.right {
            let (cell_x, cell_y) = ground.centre(i, j);
            let distance = ((cell_x - x) * (cell_x - x) + (cell_y - y) * (cell_y - y)).sqrt();
            let share = weight(stroke.falloff, distance / radius);
            if share <= 0.0 {
                continue;
            }
            let now = ground.data[j * ground.width + i];
            let change = match stroke.tool {
                Tool::Raise => strength * share,
                Tool::Lower => -strength * share,
                Tool::Flatten => (stroke.level_m.unwrap_or(0) as f64 - now) * share * strength / 100.0,
                Tool::Smooth => {
                    let mut sum = 0.0;
                    for (dx, dy) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
                        sum += ground.get(i as isize + dx, j as isize + dy);
                    }
                    (sum / 9.0 - now) * share * strength / 100.0
                }
            };
            moves.push((j * ground.width + i, change));
        }
    }
    for (index, change) in moves {
        let next = ground.data[index] + change;
        ground.data[index] = if land[index] { next.max(LAND_FLOOR_M) } else { next.min(SEA_CEILING_M) };
    }
    Some(rect)
}

/// Applies every stroke in order.
pub fn apply(ground: &mut Grid, land: &[bool], edits: &Edits) {
    for stroke in &edits.strokes {
        for &point in &stroke.points {
            dab(ground, land, stroke, point);
        }
    }
}

#[cfg(test)]
#[path = "edits_tests.rs"]
mod tests;
