//! What an island's passages are laid from, as content/passages names it: its patrol zone, the runs whose sealed doors
//! are its mouths, the spine its web lies along from the patrol zone across the island (each point with the depth it
//! is reached at), and its landmark zones, the places of zones folded into the passages, each at its own depth.

use crate::zone::Form;
use serde::Deserialize;
use std::sync::OnceLock;

/// A zone standing at a place already named on the island, dressed after it.
#[derive(Clone, Debug, PartialEq)]
pub struct Landmark {
    pub name: String,
    pub at: [f64; 2],
    pub depth: u8,
    /// The style it is laid in under ground, or the form of its hollow above ground: one of the two.
    pub style: Option<String>,
    pub form: Option<Form>,
    /// Whether it stands every week; any other is one of the week's share at its depth.
    pub anchor: bool,
}

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
    /// Points (x, y) along the island from the patrol zone, each with the depth reached there, rising.
    pub spine: Vec<[f64; 3]>,
    pub landmarks: Vec<Landmark>,
}

#[derive(Deserialize)]
struct LandmarkFile {
    name: String,
    at: [f64; 2],
    depth: u8,
    ground: String,
    form: String,
    #[serde(default)]
    anchor: bool,
}

#[derive(Deserialize)]
struct IslandFile {
    island: String,
    patrol: String,
    climate: String,
    mouths: Vec<String>,
    spine: Vec<[f64; 3]>,
    landmarks: Vec<LandmarkFile>,
}

/// Every island's passages' file, by the island it lays.
const FILES: [&str; 1] = [include_str!("../../../content/passages/saltmere.json")];

fn read(text: &str) -> Result<Island, String> {
    let file: IslandFile = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let landmarks = file.landmarks.into_iter().map(|mark| {
        let (style, form) = match mark.ground.as_str() {
            "under" => (Some(mark.form.clone()), None),
            "open" => {
                let form = Form::of_key(&mark.form).ok_or_else(|| format!("{}: no form {}", mark.name, mark.form))?;
                (None, Some(form))
            }
            other => return Err(format!("{}: no ground {other}", mark.name)),
        };
        Ok(Landmark { name: mark.name, at: mark.at, depth: mark.depth, style, form, anchor: mark.anchor })
    });
    let landmarks = landmarks.collect::<Result<Vec<_>, String>>()?;
    let (id, patrol, climate, mouths, spine) = (file.island, file.patrol, file.climate, file.mouths, file.spine);
    Ok(Island { id, patrol, climate, mouths, spine, landmarks })
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
