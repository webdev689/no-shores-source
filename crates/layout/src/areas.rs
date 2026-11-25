//! Where each area of a brief stands: every kind scores the land by what it wants (flat ground for a hamlet, a
//! summit for a tower, the shore for a dock, a river bank for a mill), the areas keep their distance from one another
//! and spread over the claim, so a patrol area holds a point of interest every couple of hundred metres.

use crate::brief::AreaKind;
use crate::field::{CELL_M, Field, Water, distance};
use land::exact::rand01;
use serde::Serialize;

/// One placed area: what it is, its name, its middle and how far it reaches, metres.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Area {
    pub kind: AreaKind,
    pub name: String,
    pub at: [f64; 2],
    pub radius: f64,
    /// For a gate, the id of the node it leads to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leads_to: Option<String>,
    /// For a gate, whether it crosses to another patrol area of the island (`crossings::add`); written only when it
    /// does.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub crosses: bool,
}

/// The least open ground between two areas' reaches, metres.
const GAP_M: f64 = 50.0;
/// How far an area's spread counts, metres: past it, being further from the others earns nothing more.
const SPREAD_M: f64 = 520.0;

/// Half a plot's side, metres: the square a guild builds on, axis-aligned round its middle.
pub const PLOT_HALF_M: f64 = 32.0;
/// How far a plot's corners lie from its middle, metres.
pub const PLOT_CORNER_M: f64 = PLOT_HALF_M * std::f64::consts::SQRT_2;
/// How far a plot reaches: past its square's corners, with room to walk round it.
pub const PLOT_REACH_M: f64 = 52.0;
/// How far from the landing's middle a plot's middle lies at most, where the land allows, metres.
pub const PLOT_FROM_LANDING_M: f64 = 250.0;

/// Whether a point stands on a plot's square of the areas, or within `margin` metres of it.
#[must_use]
pub fn on_plot(areas: &[Area], at: [f64; 2], margin: f64) -> bool {
    let reach = PLOT_HALF_M + margin;
    areas
        .iter()
        .filter(|area| area.kind == AreaKind::Plot)
        .any(|area| (at[0] - area.at[0]).abs() <= reach && (at[1] - area.at[1]).abs() <= reach)
}

/// How far an area of a kind reaches, metres; a hamlet by its blocks.
#[must_use]
pub fn radius_of(kind: AreaKind, blocks: u8) -> f64 {
    match kind {
        AreaKind::Hamlet => 70.0 + 35.0 * f64::from(blocks.clamp(1, 4)),
        AreaKind::Farm | AreaKind::Hulks => 95.0,
        AreaKind::Ruin | AreaKind::Keep => 75.0,
        AreaKind::Graveyard | AreaKind::Coven | AreaKind::Wilds | AreaKind::Arena => 65.0,
        AreaKind::Quarry | AreaKind::Bones | AreaKind::Causeway => 55.0,
        AreaKind::Camp | AreaKind::Mill | AreaKind::Landing => 48.0,
        AreaKind::Dock | AreaKind::Wreck | AreaKind::Shrine | AreaKind::Entrance | AreaKind::Gate => 40.0,
        AreaKind::Tower | AreaKind::Lighthouse | AreaKind::Cave => 30.0,
        AreaKind::Plot => PLOT_REACH_M,
    }
}

/// What the land round a point is like, measured once for every kind's score.
struct Reading {
    slope: f64,
    /// The spread of heights within the area's reach, metres.
    relief: f64,
    /// How far the point stands over the land 200 m round it, metres.
    prominence: f64,
    to_sea: f64,
    to_fresh: f64,
    inside: f64,
    dry: bool,
}

/// A bell from 0 to 1 to 0: 1 between `low` and `high`, falling off over `soft` metres either side.
fn bell(value: f64, low: f64, high: f64, soft: f64) -> f64 {
    if value < low {
        (1.0 - (low - value) / soft).max(0.0)
    } else if value > high {
        (1.0 - (value - high) / soft).max(0.0)
    } else {
        1.0
    }
}

/// How much a kind wants a point, 0 to about 1; None where it cannot stand at all.
fn wants(kind: AreaKind, land: &Reading, radius: f64) -> Option<f64> {
    let flat = |most: f64| (1.0 - land.relief / most).max(0.0);
    let high = (land.prominence / 25.0).clamp(-1.0, 1.0);
    let edge_ok = land.inside >= radius * 0.85;
    let wet_kind = matches!(kind, AreaKind::Dock | AreaKind::Wreck | AreaKind::Causeway);
    if !edge_ok || !(land.dry || wet_kind) {
        return None;
    }
    let score = match kind {
        AreaKind::Landing => bell(land.to_sea, 25.0, 220.0, 260.0) * 0.6 + flat(8.0) * 0.4,
        AreaKind::Hamlet => flat(14.0) * 0.6 + bell(land.to_fresh, 30.0, 260.0, 400.0) * 0.2 + 0.2 - high.abs() * 0.1,
        AreaKind::Farm => flat(12.0) * 0.7 + (0.3 - high * 0.2),
        AreaKind::Hulks => flat(10.0) * 0.6 + (0.4 - high.max(0.0) * 0.3) + bell(land.to_sea, 0.0, 600.0, 900.0) * 0.2,
        AreaKind::Ruin => flat(16.0) * 0.5 + high.max(0.0) * 0.5,
        AreaKind::Keep => flat(10.0) * 0.4 + high * 0.6,
        AreaKind::Graveyard => flat(8.0) * 0.7 + high.max(0.0) * 0.3,
        AreaKind::Coven => flat(10.0) * 0.5 + bell(land.to_fresh, 20.0, 160.0, 300.0) * 0.5,
        AreaKind::Shrine | AreaKind::Bones => flat(6.0) * 0.4 + high.max(0.0) * 0.6,
        AreaKind::Camp | AreaKind::Wilds | AreaKind::Arena => flat(9.0) * 0.8 + 0.2 * (1.0 - land.slope * 4.0).max(0.0),
        AreaKind::Tower => flat(5.0) * 0.3 + high * 0.7,
        AreaKind::Lighthouse => bell(land.to_sea, 10.0, 70.0, 120.0) * 0.6 + high.max(0.0) * 0.4,
        AreaKind::Dock => bell(land.to_sea, 0.0, 24.0, 40.0) * 0.7 + flat(6.0) * 0.3,
        AreaKind::Wreck => bell(land.to_sea, 0.0, 30.0, 50.0) * 0.8 + flat(6.0) * 0.2,
        AreaKind::Mill => bell(land.to_fresh, 8.0, 40.0, 60.0) * 0.7 + flat(8.0) * 0.3,
        AreaKind::Causeway => bell(land.to_fresh, 0.0, 30.0, 80.0) * 0.6 + flat(5.0) * 0.4,
        AreaKind::Quarry | AreaKind::Cave => {
            bell(land.slope, 0.35, 0.9, 0.3) * 0.7 + (land.relief / 20.0).min(1.0) * 0.3
        }
        AreaKind::Entrance | AreaKind::Gate => flat(8.0),
        AreaKind::Plot => flat(4.0) * 0.8 + 0.2 * (1.0 - land.slope * 4.0).max(0.0),
    };
    (score > 0.0).then_some(score)
}

/// What a kind's area needs at its very middle beyond its score: flat enough to stand its buildings.
fn seats(kind: AreaKind, land: &Reading) -> bool {
    match kind {
        AreaKind::Quarry | AreaKind::Cave => land.slope < 1.4,
        AreaKind::Dock | AreaKind::Wreck | AreaKind::Causeway => true,
        _ => land.slope < 0.35,
    }
}

/// Reads the land round a cell for an area of `radius`.
fn read(field: &Field, column: usize, row: usize, radius: f64) -> Reading {
    let at = field.index(column, row);
    let [x, y] = field.centre(column, row);
    let (mut lowest, mut highest, mut around, mut counted) = (f64::INFINITY, f64::NEG_INFINITY, 0.0_f64, 0.0_f64);
    let reach = (radius.max(200.0) / CELL_M).ceil() as isize;
    let stride = (reach / 8).max(1);
    let mut row_offset = -reach;
    while row_offset <= reach {
        let mut column_offset = -reach;
        while column_offset <= reach {
            let (other_column, other_row) = (column as isize + column_offset, row as isize + row_offset);
            if other_column >= 0
                && other_row >= 0
                && (other_column as usize) < field.columns
                && (other_row as usize) < field.rows
            {
                let other = field.index(other_column as usize, other_row as usize);
                let [ox, oy] = field.centre(other_column as usize, other_row as usize);
                let distance = ((ox - x) * (ox - x) + (oy - y) * (oy - y)).sqrt();
                if distance <= radius {
                    lowest = lowest.min(field.height[other]);
                    highest = highest.max(field.height[other]);
                }
                if distance <= 200.0 {
                    around += field.height[other];
                    counted += 1.0;
                }
            }
            column_offset += stride;
        }
        row_offset += stride;
    }
    Reading {
        slope: field.slope[at],
        relief: if highest >= lowest { highest - lowest } else { 0.0 },
        prominence: field.height[at] - around / counted.max(1.0),
        to_sea: field.to_sea[at],
        to_fresh: field.to_fresh[at],
        inside: field.inside[at],
        dry: field.water[at] == Water::Dry,
    }
}

/// Where the next area goes: the best-scoring cell its reach leaves clear of the areas already placed, every second
/// cell tried. `pull` adds to a cell's score (toward a gate's far node, say); None where nothing fits.
pub fn place(
    field: &Field,
    kind: AreaKind,
    radius: f64,
    placed: &[Area],
    seed: u32,
    pull: &dyn Fn([f64; 2]) -> f64,
) -> Option<[f64; 2]> {
    let mut best: Option<(f64, [f64; 2])> = None;
    for row in (1..field.rows.saturating_sub(1)).step_by(2) {
        for column in (1..field.columns.saturating_sub(1)).step_by(2) {
            let at = field.centre(column, row);
            let nearest =
                placed.iter().map(|area| distance(area.at, at) - area.radius - radius).fold(f64::INFINITY, f64::min);
            if nearest < GAP_M {
                continue;
            }
            let land = read(field, column, row, radius);
            if !seats(kind, &land) {
                continue;
            }
            let Some(score) = wants(kind, &land, radius) else { continue };
            let spread = if placed.is_empty() { 0.0 } else { (nearest / SPREAD_M).min(1.0) * 0.35 };
            let jitter = rand01(seed, &[column as i64, row as i64]) * 0.02;
            let total = score + spread + pull(at) + jitter;
            if best.is_none_or(|(top, _)| total > top) {
                best = Some((total, at));
            }
        }
    }
    best.map(|(_, at)| at)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bell_is_whole_inside_and_falls_away_outside() {
        assert_eq!(bell(50.0, 25.0, 220.0, 100.0), 1.0);
        assert_eq!(bell(0.0, 25.0, 220.0, 100.0), 0.75);
        assert_eq!(bell(500.0, 25.0, 220.0, 100.0), 0.0);
    }

    #[test]
    fn every_kind_reaches_far_enough_to_hold_something() {
        for kind in [AreaKind::Hamlet, AreaKind::Tower, AreaKind::Farm, AreaKind::Cave] {
            assert!(radius_of(kind, 3) >= 30.0);
        }
        assert!(radius_of(AreaKind::Hamlet, 4) > radius_of(AreaKind::Hamlet, 1));
    }
}
