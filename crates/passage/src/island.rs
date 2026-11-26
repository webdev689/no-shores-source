//! What an island's passages are laid from, as content/passages names it: its patrol zone, the runs whose sealed doors
//! are its mouths, the places already named its zones may lie under, the spine its web lies along from the patrol zone
//! across the island (each point with the depth it is reached at), and the climate its hollows are dressed in.

use serde::Deserialize;
use std::sync::OnceLock;

/// An island's passages.
#[derive(Clone, Debug, PartialEq)]
pub struct Island {
    /// Its continent's id, as the world names it.
    pub id: String,
    pub patrol: String,
    /// The islands' climate its hollows are dressed in (content/islands/kits.json).
    pub climate: String,
    /// The runs whose doors are its mouths, each leading to a zone of the first depth, in order.
    pub mouths: Vec<String>,
    /// The places already named that a zone near them is called by: each where it stands (x, y) and its name, a
    /// place inside a zone of the world at that zone's middle.
    pub places: Vec<([f64; 2], String)>,
    /// Points (x, y) along the island from the patrol zone, each with the depth reached there, rising.
    pub spine: Vec<[f64; 3]>,
}

#[derive(Deserialize)]
struct IslandFile {
    island: String,
    patrol: String,
    climate: String,
    mouths: Vec<String>,
    places: Vec<(f64, f64, String)>,
    spine: Vec<[f64; 3]>,
}

/// Every island's passages' file, by the island it lays.
const FILES: [&str; 1] = [include_str!("../../../content/passages/saltmere.json")];

fn read(text: &str) -> Result<Island, String> {
    let file: IslandFile = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let (id, patrol, climate, mouths, spine) = (file.island, file.patrol, file.climate, file.mouths, file.spine);
    let places = file.places.into_iter().map(|(x, y, name)| ([x, y], name)).collect();
    Ok(Island { id, patrol, climate, mouths, places, spine })
}

/// Every island with passages.
///
/// # Panics
/// Only if a file in content/passages is not the shape this reads, which the crate's tests catch first.
#[must_use]
pub fn islands() -> &'static [Island] {
    static ISLANDS: OnceLock<Vec<Island>> = OnceLock::new();
    ISLANDS.get_or_init(|| {
        FILES.iter().map(|text| read(text).unwrap_or_else(|error| panic!("content/passages: {error}"))).collect()
    })
}

/// The passages of an island by its continent's id, or of the island whose patrol zone this is.
#[must_use]
pub fn island(id: &str) -> Option<&'static Island> {
    islands().iter().find(|island| island.id == id || island.patrol == id)
}

impl Island {
    /// The point of its spine at a depth, and the way the spine runs there (a unit step, x east and y south):
    /// between two points, the share of the way between their depths.
    #[must_use]
    pub fn along(&self, depth: f64) -> ([f64; 2], [f64; 2]) {
        let spine = &self.spine;
        let last = spine.len().saturating_sub(1);
        let after = spine.iter().position(|point| point[2] >= depth).unwrap_or(last).max(1).min(last);
        let (from, to) = (spine[after - 1], spine[after]);
        let span = (to[2] - from[2]).max(1e-9);
        let share = ((depth - from[2]) / span).clamp(0.0, 1.0);
        let at = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
        let (east, south) = (to[0] - from[0], to[1] - from[1]);
        let length = libm::hypot(east, south).max(1e-9);
        (at, [east / length, south / length])
    }
}
