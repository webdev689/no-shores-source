//! The lights Overlook's city burns at night ([[Overlook's City Below Is Lit at Night, in Detail]]): lamp posts along
//! the edges of the avenues' roads and their ramps, lanterns along the quay's seaward edge and down the piers, and the
//! harbour mouth's light on the heads of the two piers nearest the harbour. Where each stands is the plan's, the same
//! on every machine. The blocks' own streets are lit by the page, which holds their ground tiles. Only Overlook is
//! lit, and never as a ruin.

use crate::footprint::Footprint;
use crate::grid::{CELL_M, Grid};
use crate::landmarks::ahead;
use crate::solids::Solid;
use crate::terraces::Footing;
use crate::walls::{PIER_M, QUAY_M, QUAY_TOP_M, piers, quay_runs};
use crate::{Cell, Use};
use land::pads::Pad;
use serde::Serialize;
use std::collections::BTreeMap;

/// What kind of light it is: the page draws each its own post and flame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LightKind {
    /// A street lamp on its post.
    Lamp,
    /// A lantern on the quay or a pier, over the water.
    Lantern,
    /// The harbour mouth's light, on the head of a pier nearest the harbour.
    Mouth,
}

/// One light: where its post stands on the ground (east, south, up, world metres), and its kind.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Light {
    pub at: [f64; 3],
    pub kind: LightKind,
}

/// A cell's ground tiles a side, and the road's band through an avenue's middle, in tiles: the page's `avenueTile`.
const TILES: f64 = 16.0;
const TILE_M: f64 = CELL_M / TILES;
const ROAD_LOW: f64 = TILES / 2.0 - 3.0;
const ROAD_HIGH: f64 = TILES / 2.0 + 3.0;
/// A lamp every four tiles along a road's edge, the first in the middle of the first two.
const LAMP_EVERY_TILES: f64 = 4.0;
/// How far in from the paving's edge a post stands, metres.
const EDGE_INSET_M: f64 = 0.8;
/// How far a post keeps clear of a solid's footprint, metres.
pub const CLEAR_M: f64 = 0.5;
/// Lanterns along the quay, and down each edge of a pier, metres apart.
const QUAY_EVERY_M: f64 = 20.0;
const PIER_EVERY_M: f64 = 24.0;
/// The least distance between two lights, metres, so two edges meeting at a corner light it once.
pub const LEAST_APART_M: f64 = 6.0;

/// What the lights are placed by: the plan's grid, cells, pads (later over earlier), the solids that stand, the
/// ground kept clear of lamps (the plaza and the landmark's base) and the footprint the harbour is laid along.
#[derive(Debug)]
pub struct Lit<'plan> {
    pub grid: &'plan Grid,
    pub cells: &'plan [Cell],
    pub pads: &'plan [Pad],
    pub solids: Vec<&'plan Solid>,
    pub keep_off: &'plan [[f64; 4]],
    pub footprint: &'plan Footprint,
    /// Where the harbour's way meets the shore, if the city has one.
    pub harbour: Option<[f64; 2]>,
}

/// Whether a city is lit at night: Overlook's, standing; no other city's, and never a ruin.
#[must_use]
pub fn lit(city_id: &str, ruined: bool) -> bool {
    city_id == crate::hub::HUB_CITY && !ruined
}

/// Every light the city burns: the avenues' lamps, then the harbour's lanterns and its mouth, each standing on the
/// ground or on the quay, clear of every solid and of the kept ground, and no nearer another than LEAST_APART_M.
#[must_use]
pub fn lights(lit: &Lit) -> Vec<Light> {
    let mut kept: Vec<Light> = Vec::new();
    let candidates = avenue_lamps(lit).into_iter().chain(harbour_lights(lit.footprint, lit.harbour));
    for (place, kind, foot) in candidates {
        let Some(up) = foot.or_else(|| ground_under(lit.pads, place)) else { continue };
        let kept_off = lit.keep_off.iter().any(|&bounds| within(bounds, place, CLEAR_M));
        let crowded = kept.iter().any(|light| {
            let (east, south) = (light.at[0] - place[0], light.at[1] - place[1]);
            east * east + south * south < LEAST_APART_M * LEAST_APART_M
        });
        if kept_off || crowded || blocked(&lit.solids, place, up) {
            continue;
        }
        kept.push(Light { at: [place[0], place[1], up], kind });
    }
    kept
}

/// Whether a post standing on the ground at `up` would stand in a solid: one whose footprint (and CLEAR_M round it)
/// holds the post and which rises over the post's foot, low enough to meet the post. What it stands on is not one.
pub fn blocked(solids: &[&Solid], place: [f64; 2], up: f64) -> bool {
    solids.iter().any(|solid| {
        let [west, north, east, south, bottom, top] = solid.bounds();
        within([west, north, east, south], place, CLEAR_M) && top > up + 0.05 && bottom < up + 3.0
    })
}

/// Whether a rectangle (west, north, east, south), grown by `margin`, holds a point.
fn within(bounds: [f64; 4], place: [f64; 2], margin: f64) -> bool {
    let [west, north, east, south] = bounds;
    place[0] > west - margin && place[0] < east + margin && place[1] > north - margin && place[1] < south + margin
}

/// The ground's level at a point: the last pad laid over it.
fn ground_under(pads: &[Pad], place: [f64; 2]) -> Option<f64> {
    pads.iter().rev().find(|pad| within(pad.bounds, place, 0.0)).map(|pad| pad.level_at(place[0], place[1]))
}

/// A light to place: where, what kind, and the height it stands at where the plan knows it (the quay's top), else
/// the ground's under it.
type Candidate = ([f64; 2], LightKind, Option<f64>);

/// Which of an avenue's sides its road leaves by: north, south, west, east.
type Sides = [bool; 4];

/// Whether an avenue cell's road covers a point, in tiles from the cell's north-west corner (the page's `avenueTile`).
fn on_road(sides: Sides, across: f64, down: f64) -> bool {
    let [north, south, west, east] = sides;
    let band = ROAD_LOW..ROAD_HIGH;
    let (in_columns, in_rows) = (band.contains(&across), band.contains(&down));
    (in_columns && ((north && down < ROAD_HIGH) || (south && down >= ROAD_LOW)))
        || (in_rows && ((west && across < ROAD_HIGH) || (east && across >= ROAD_LOW)))
}

/// Lamps along every edge of each avenue's road: at every fourth tile along the four lines the road's band can
/// end on, where the road lies on one side of the line and not the other, just in on the road's side. A cell paved
/// whole (a gate's square) has no edge in it.
fn avenue_lamps(lit: &Lit) -> Vec<Candidate> {
    let used: BTreeMap<(usize, usize), &Use> =
        lit.cells.iter().map(|cell| ((cell.column, cell.row), &cell.used)).collect();
    let paved = |column: usize, row: usize, east: isize, south: isize| {
        let (Some(column), Some(row)) = (column.checked_add_signed(east), row.checked_add_signed(south)) else {
            return false;
        };
        matches!(used.get(&(column, row)), Some(Use::Avenue | Use::Landmark))
    };
    let inset = EDGE_INSET_M / TILE_M;
    let mut found = Vec::new();
    for cell in lit.cells {
        if cell.used != Use::Avenue || !matches!(cell.footing, Footing::Level { .. }) {
            continue;
        }
        let (column, row) = (cell.column, cell.row);
        let sides =
            [paved(column, row, 0, -1), paved(column, row, 0, 1), paved(column, row, -1, 0), paved(column, row, 1, 0)];
        if sides == [false; 4] {
            continue;
        }
        let [west, north, _, _] = lit.grid.bounds(column, row);
        let mut station = LAMP_EVERY_TILES / 2.0;
        while station < TILES {
            for line in [ROAD_LOW, ROAD_HIGH] {
                // A line down the cell (across = line) and one across it (down = line).
                for (along_columns, before, after) in [
                    (true, on_road(sides, line - inset, station), on_road(sides, line + inset, station)),
                    (false, on_road(sides, station, line - inset), on_road(sides, station, line + inset)),
                ] {
                    if before == after {
                        continue;
                    }
                    let edge = if before { line - inset } else { line + inset };
                    let (across, down) = if along_columns { (edge, station) } else { (station, edge) };
                    found.push(([west + across * TILE_M, north + down * TILE_M], LightKind::Lamp, None));
                }
            }
            station += LAMP_EVERY_TILES;
        }
    }
    found
}

/// The harbour's lights: lanterns along the quay's seaward edge, down both edges of every pier and at its head, and
/// the mouth's light on the heads of the two piers nearest the harbour, all at the quay's top.
fn harbour_lights(footprint: &Footprint, harbour: Option<[f64; 2]>) -> Vec<Candidate> {
    let mut found = Vec::new();
    let lantern = |place: [f64; 2], kind| (place, kind, Some(QUAY_TOP_M));
    for (from, to) in quay_runs(footprint) {
        let length = ((to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1])).sqrt();
        let along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let middle = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
        let toward = [middle[0] - footprint.centre[0], middle[1] - footprint.centre[1]];
        // the side away from the city's middle is the sea's
        let side = if -along[1] * toward[0] + along[0] * toward[1] >= 0.0 { 1.0 } else { -1.0 };
        let seaward = [-along[1] * side, along[0] * side];
        let count = (length / QUAY_EVERY_M).round().max(1.0);
        for step in 0..count as usize {
            let on_line = ahead(from, along, (step as f64 + 0.5) * length / count);
            found.push(lantern(ahead(on_line, seaward, QUAY_M / 2.0 - EDGE_INSET_M), LightKind::Lantern));
        }
    }
    let all = piers(footprint);
    let head = |pier: &crate::walls::Pier| ahead(pier.root, pier.direction, pier.length - 1.5);
    // The mouth: the two piers whose heads stand nearest the harbour.
    let mut nearest: Vec<(f64, usize)> = harbour
        .map(|at| {
            all.iter()
                .enumerate()
                .map(|(number, pier)| {
                    let end = head(pier);
                    ((end[0] - at[0]) * (end[0] - at[0]) + (end[1] - at[1]) * (end[1] - at[1]), number)
                })
                .collect()
        })
        .unwrap_or_default();
    nearest.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mouth: Vec<usize> = nearest.iter().take(2).map(|&(_, number)| number).collect();
    for (number, pier) in all.iter().enumerate() {
        let across = [-pier.direction[1], pier.direction[0]];
        let edge = PIER_M / 2.0 - EDGE_INSET_M;
        let mut out = PIER_EVERY_M / 2.0;
        while out < pier.length - PIER_EVERY_M / 2.0 {
            for sign in [-1.0, 1.0] {
                let on_line = ahead(pier.root, pier.direction, out);
                found.push(lantern(ahead(on_line, across, edge * sign), LightKind::Lantern));
            }
            out += PIER_EVERY_M;
        }
        if mouth.contains(&number) {
            found.push(lantern(head(pier), LightKind::Mouth));
        } else {
            for sign in [-1.0, 1.0] {
                found.push(lantern(ahead(head(pier), across, edge * sign), LightKind::Lantern));
            }
        }
    }
    found
}

#[cfg(test)]
#[path = "lights_tests.rs"]
mod tests;
