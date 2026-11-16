//! The places a player reaches on a landmass: its port city, and its nodes, each one section of the land a player
//! lands in (a social space, a patrol area, a mission, a dungeon or a world boss). Everything else on the island is
//! seen and never reached. Kept in the landmass's edits file with its other places, each with an id that never
//! changes, so rooms, saves and quests can name it.

use crate::places::distance_to_ring;
use serde::{Deserialize, Serialize};
use world::geometry::{Point, doubled_area, edges, ring_contains, ring_is_simple, segments_meet};

/// How far inland from the coast a port city's middle may stand, metres.
pub const CITY_REACH_M: f64 = 3000.0;
/// A node's section: the least and most land it may hold, square metres.
pub const SECTION_AREA_M2: (u128, u128) = (10_000, 9_000_000);
/// The longest name a city or a node may carry, in characters.
pub const NAME_LIMIT: usize = 48;
/// The suffix of the social space a city's plan makes, which no drawn node may take.
pub const SOCIAL_SUFFIX: &str = "-social";

/// A landmass's port city: its id and name, where its landmark stands, and the motif its plan is built round.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct City {
    pub id: String,
    pub name: String,
    pub centre: Point,
    pub motif: String,
}

/// What a node is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Social,
    Patrol,
    Mission,
    Dungeon,
    Boss,
}

/// A node: its section of the land, a closed ring, and the spawns a player lands and respawns at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub ring: Vec<Point>,
    pub spawns: Vec<Point>,
}

fn named_well(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= NAME_LIMIT
}

/// Every rule a city and its nodes break on a landmass whose coast is `coast`: one message each, named by the id.
#[must_use]
pub fn check_sites(coast: &[Point], city: Option<&City>, nodes: &[Node]) -> Vec<(String, String)> {
    let mut problems = Vec::new();
    let on_land = |point: &Point| ring_contains(coast, *point);
    if let Some(city) = city {
        if !on_land(&city.centre) || distance_to_ring(coast, city.centre) > CITY_REACH_M {
            problems.push((
                city.id.clone(),
                format!("a port city stands on the land within {CITY_REACH_M} m of the coast"),
            ));
        }
        if !named_well(&city.name) {
            problems.push((city.id.clone(), format!("a city's name is 1 to {NAME_LIMIT} characters")));
        }
        if city.motif.is_empty() || !city.motif.chars().all(|ch| ch.is_ascii_lowercase() || ch == '-') {
            problems.push((city.id.clone(), "a motif is lowercase letters and hyphens".into()));
        }
    }
    for node in nodes {
        let mut problem = |message: &str| problems.push((node.id.clone(), message.to_owned()));
        if !named_well(&node.name) {
            problem("a node's name is 1 to 48 characters");
        }
        if node.ring.len() < 3 || !ring_is_simple(&node.ring) {
            problem("its section must be a ring that never crosses itself");
            continue;
        }
        let crosses = (0..node.ring.len()).any(|at| {
            let span = (node.ring[at], node.ring[(at + 1) % node.ring.len()]);
            edges(coast).any(|edge| segments_meet(span, edge))
        });
        if !node.ring.iter().all(on_land) || crosses {
            problem("its section reaches past the coast");
        }
        let area = doubled_area(&node.ring) / 2;
        if !(SECTION_AREA_M2.0..=SECTION_AREA_M2.1).contains(&area) {
            problem("its section holds 0.01 to 9 square kilometres");
        }
        if node.spawns.is_empty() || !node.spawns.iter().all(|spawn| ring_contains(&node.ring, *spawn)) {
            problem("it needs a spawn, and every spawn inside its section");
        }
        if node.id.ends_with(SOCIAL_SUFFIX) {
            problem("ids ending -social are the cities' own social spaces");
        }
    }
    problems
}

/// The ids of a city and its nodes, for the edits file's check that no two places share one.
pub fn site_ids<'sites>(city: Option<&'sites City>, nodes: &'sites [Node]) -> impl Iterator<Item = &'sites String> {
    city.map(|city| &city.id).into_iter().chain(nodes.iter().map(|node| &node.id))
}

#[cfg(test)]
#[path = "sites_tests.rs"]
mod tests;
