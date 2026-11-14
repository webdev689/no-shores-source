//! The rules a layout keeps, from the owner's world map decision. A layout being drafted may hold fewer continents;
//! a finished one holds exactly nine.

use crate::geometry::{Point, circle_clear_of_ring, circles_apart, doubled_area, ring_is_simple, rings_overlap};
use crate::layout::Layout;
use std::collections::HashSet;
use std::fmt;

/// Tamriel's frame at DFO's scale: 6,000 by 3,750 map pixels of 819.2 metres.
pub const FRAME_WIDTH_M: i64 = 4_915_200;
pub const FRAME_HEIGHT_M: i64 = 3_072_000;

/// The number of continents in the finished world.
pub const CONTINENT_COUNT: usize = 9;

/// The smallest continent: Daggerfall's whole map, about 161,600 square kilometres of land.
pub const MIN_CONTINENT_M2: u128 = 161_600 * 1_000_000;

/// The largest continent: Hammerfell as DFO draws it, about 940,000 square kilometres.
pub const MAX_CONTINENT_M2: u128 = 940_000 * 1_000_000;

/// One thing a layout gets wrong: what, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub subject: String,
    pub message: String,
}

impl fmt::Display for Problem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.subject, self.message)
    }
}

fn problem(subject: &str, message: impl Into<String>) -> Problem {
    Problem { subject: subject.to_owned(), message: message.into() }
}

fn inside_frame(point: Point) -> bool {
    (0..=FRAME_WIDTH_M).contains(&point.x) && (0..=FRAME_HEIGHT_M).contains(&point.y)
}

fn square_kilometres(doubled_m2: u128) -> u128 {
    doubled_m2 / 2 / 1_000_000
}

/// Every rule a layout keeps while it is being drafted.
pub fn check(layout: &Layout) -> Vec<Problem> {
    let mut problems = Vec::new();
    let mut seen = HashSet::new();
    for id in layout.continents.iter().map(|continent| &continent.id).chain(layout.isles.iter().map(|isle| &isle.id)) {
        if id.is_empty() {
            problems.push(problem("layout", "an id is empty"));
        } else if !seen.insert(id.as_str()) {
            problems.push(problem(id, "the id is used twice"));
        }
    }
    if layout.continents.len() > CONTINENT_COUNT {
        let message = format!("{} continents: the world has {CONTINENT_COUNT}", layout.continents.len());
        problems.push(problem("layout", message));
    }
    let mut sound = Vec::new();
    for continent in &layout.continents {
        let found = check_outline(&continent.id, &continent.outline);
        if found.is_empty() {
            sound.push(continent);
        }
        problems.extend(found);
    }
    for (index, first) in sound.iter().enumerate() {
        for second in &sound[index + 1..] {
            if rings_overlap(&first.outline, &second.outline) {
                problems.push(problem(&first.id, format!("overlaps {}", second.id)));
            }
        }
    }
    problems
        .extend(check_isles(layout, &sound.iter().map(|continent| continent.outline.as_slice()).collect::<Vec<_>>()));
    problems
}

/// The drafting rules, and the finished world's: exactly nine continents.
pub fn check_finished(layout: &Layout) -> Vec<Problem> {
    let mut problems = check(layout);
    if layout.continents.len() < CONTINENT_COUNT {
        let message = format!("{} continents: the finished world has {CONTINENT_COUNT}", layout.continents.len());
        problems.push(problem("layout", message));
    }
    problems
}

fn check_outline(id: &str, outline: &[Point]) -> Vec<Problem> {
    if outline.len() < 3 {
        return vec![problem(id, "an outline needs at least three points")];
    }
    if outline.iter().any(|&point| !inside_frame(point)) {
        return vec![problem(id, "the outline leaves the world's frame")];
    }
    if !ring_is_simple(outline) {
        return vec![problem(id, "the outline crosses or touches itself")];
    }
    let doubled = doubled_area(outline);
    if !(MIN_CONTINENT_M2 * 2..=MAX_CONTINENT_M2 * 2).contains(&doubled) {
        let message = format!(
            "{} km², outside the {}-{} km² a continent may cover",
            square_kilometres(doubled),
            MIN_CONTINENT_M2 / 1_000_000,
            MAX_CONTINENT_M2 / 1_000_000
        );
        return vec![problem(id, message)];
    }
    Vec::new()
}

fn check_isles(layout: &Layout, continents: &[&[Point]]) -> Vec<Problem> {
    let mut problems = Vec::new();
    let mut placed: Vec<(&str, Point, i64)> = Vec::new();
    for isle in &layout.isles {
        let (centre, radius) = (isle.centre, isle.radius_m);
        if radius <= 0 {
            problems.push(problem(&isle.id, "the radius must be above zero"));
            continue;
        }
        let corners =
            [Point::new(centre.x - radius, centre.y - radius), Point::new(centre.x + radius, centre.y + radius)];
        if !corners.iter().all(|&corner| inside_frame(corner)) {
            problems.push(problem(&isle.id, "the isle leaves the world's frame"));
            continue;
        }
        let area_upper_bound = u128::from(radius.unsigned_abs()).pow(2) * 22 / 7;
        if area_upper_bound >= MIN_CONTINENT_M2 {
            problems.push(problem(&isle.id, "an isle must be smaller than the smallest continent"));
            continue;
        }
        if continents.iter().any(|ring| !circle_clear_of_ring(centre, radius, ring)) {
            problems.push(problem(&isle.id, "the isle touches a continent"));
            continue;
        }
        if let Some((other, _, _)) =
            placed.iter().find(|&&(_, at, reach)| !circles_apart((centre, radius), (at, reach)))
        {
            problems.push(problem(&isle.id, format!("the isle touches {other}")));
            continue;
        }
        placed.push((&isle.id, centre, radius));
    }
    problems
}

#[cfg(test)]
#[path = "check_tests.rs"]
mod tests;
