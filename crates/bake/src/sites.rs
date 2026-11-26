//! What a node's layout gives its file: its places, its runs' sealed doors and its crossings to another patrol area,
//! the sites its foes stand at, its chests and the props that hold things, an outpost's ground and a Breach's gate.

use land::ground::Ground;
use serde::{Deserialize, Serialize};

/// Where a layout stood a Breach's gate (`layout::modules`), as its node's room stands it.
pub(crate) fn breach_of(layout: &layout::Layout) -> Option<([f64; 3], u8)> {
    let gate = city::modules::number_of("breach-gate")?;
    let solid = layout
        .seating
        .solids
        .iter()
        .find(|solid| solid.shape == city::solids::Shape::Module { module: gate, group: 0 })?;
    let quarters = (solid.turn / std::f64::consts::FRAC_PI_2).round().rem_euclid(4.0) as u8;
    Some((solid.at, quarters))
}

/// An outpost site's ground: its plot's middle and level (the ground's height on its platform, as the window reads
/// it), and the middles of its muster ground and its landing, metres.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OutpostGround {
    pub plot: [f64; 2],
    pub level: f64,
    pub muster: [f64; 2],
    pub landing: [f64; 2],
}

/// An outpost site's ground from its layout, its level read on the node's window; None for a layout with no plot,
/// muster ground or landing.
#[must_use]
pub fn outpost_of(layout: &layout::Layout, window: &Ground) -> Option<OutpostGround> {
    use layout::brief::AreaKind;
    let middle = |kind: AreaKind| layout.areas.iter().find(|area| area.kind == kind).map(|area| area.at);
    let (plot, muster, landing) = (middle(AreaKind::Plot)?, middle(AreaKind::Arena)?, middle(AreaKind::Landing)?);
    Some(OutpostGround { plot, level: window.height_at(plot[0], plot[1]), muster, landing })
}

/// A place of a node: its name, middle and reach, metres.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Place {
    pub name: String,
    pub at: [f64; 2],
    pub radius: f64,
}

/// How far a run's place reaches round its mouth, metres.
pub const RUN_REACH_M: f64 = 25.0;

/// A layout's foes' sites a room stands groups at, its territories across the zone: every one it lays, a camp's, a
/// ruin's, a keep's, a wreck's, an arena's, a coven's and a cave's area and its runs' beats (the room passes over
/// one by a public event's ground, `stands.rs`).
#[must_use]
pub fn foes_of(layout: &layout::Layout) -> Vec<[f64; 2]> {
    let held = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Foes);
    held.map(|site| site.at).collect()
}

/// A patrol's chest places, each x, y and the way it faces, in the layout's order.
#[must_use]
pub fn chests_of(layout: &layout::Layout) -> Vec<[f64; 3]> {
    let places = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Chest);
    places.map(|site| [site.at[0], site.at[1], site.facing.unwrap_or_default()]).collect()
}

/// A patrol's props that hold things, inside its ring: each its box across, its foot, its top and its model.
#[must_use]
pub fn holders_of(layout: &layout::Layout) -> Vec<[f64; 7]> {
    let held = layout.seating.props.iter().filter_map(|prop| {
        let [west, north, east, south] = prop.footprint;
        let inside = layout::field::ring_holds(&layout.ring, (west + east) / 2.0, (north + south) / 2.0);
        inside.then(|| dungeon::models::held_by(prop.model, prop.footprint, prop.at[2])).flatten()
    });
    held.collect()
}

/// A layout's places: its areas, then its runs at their mouths, but a run named as one of its areas is, whose name
/// names that area alone.
#[must_use]
pub fn places_of(layout: &layout::Layout) -> Vec<Place> {
    let areas = layout.areas.iter().map(|area| Place { name: area.name.clone(), at: area.at, radius: area.radius });
    let named = |name: &str| layout.areas.iter().any(|area| area.name == name);
    let runs = layout.runs.iter().filter(|run| !named(&run.name));
    areas.chain(runs.map(|run| Place { name: run.name.clone(), at: run.mouth, radius: RUN_REACH_M })).collect()
}

/// A layout's gates crossing to another patrol area, each named for the node it leads to, at its middle.
#[must_use]
pub fn crossings_of(layout: &layout::Layout) -> Vec<Place> {
    let crossing = layout.areas.iter().filter(|area| area.crosses);
    crossing.filter_map(|area| Some(Place { name: area.leads_to.clone()?, at: area.at, radius: area.radius })).collect()
}

/// A layout's runs' sealed doors, each its run's name and its door's middle, reached from 0 m.
#[must_use]
pub fn doors_of(layout: &layout::Layout) -> Vec<Place> {
    layout.runs.iter().map(|run| Place { name: run.name.clone(), at: run.door, radius: 0.0 }).collect()
}
