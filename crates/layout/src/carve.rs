//! How a layout carves its land (the land crate's sculpt): each area a basin a little wider than its reach, each path
//! a canyon as wide as its tier wants, a gorge out of the claim at each gate and toward the sea from the landing, and
//! mesas and spires standing up in its open ground for cover and to break the long views, the rest raised into a
//! massif whose stepped cliffs are the layout's bounds. How high the massif stands is the biome's: tall in the
//! highland and the desert, low in the swamp.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::{Field, distance};
use crate::paths::{Path, Tier, simplified};
use crate::seat::Seating;
use land::exact::rand01;
use land::sculpts::Sculpt;

/// How much wider than its area's reach a basin is, metres.
const BASIN_ROOM_M: f64 = 32.0;
/// A canyon's half-width along each tier of path, metres.
const TRACK_HALF_M: f64 = 15.0;
const FOOTPATH_HALF_M: f64 = 11.0;
/// How far a gate's gorge runs on past the claim's edge, metres.
const EXIT_M: f64 = 60.0;

/// The massif's height a biome stands, metres.
#[must_use]
pub fn rise_of(biome: Option<&str>) -> f64 {
    match biome {
        Some("highland") => 38.0,
        Some("desert") => 34.0,
        Some("tundra") => 30.0,
        Some("temperate-coast") => 28.0,
        Some("steppe" | "savanna") => 22.0,
        Some("woodland" | "rainforest") => 24.0,
        Some("swamp") => 12.0,
        _ => 26.0,
    }
}

/// The capsule from a point to the claim's edge along a way, and on past it.
fn gorge(field: &Field, from: [f64; 2], way: [f64; 2], half: f64) -> [f64; 5] {
    let mut reach = 0.0;
    while reach < 2000.0 {
        let at = [from[0] + way[0] * reach, from[1] + way[1] * reach];
        if field.cell_of(at[0], at[1]).is_none_or(|(column, row)| !field.claimed[field.index(column, row)]) {
            break;
        }
        reach += 8.0;
    }
    let end = [from[0] + way[0] * (reach + EXIT_M), from[1] + way[1] * (reach + EXIT_M)];
    [from[0], from[1], end[0], end[1], half]
}

/// What a layout's floor is carved round: its areas, its paths, and the gorges out of it (each a start and a way).
#[derive(Debug, Clone, Copy)]
pub struct Network<'layout> {
    pub areas: &'layout [Area],
    pub paths: &'layout [Path],
    pub exits: &'layout [([f64; 2], [f64; 2])],
}

/// A layout's sculpt: its claim, its floors, its outcrops, its massif's height and seed.
#[must_use]
pub fn carve(field: &Field, claim: Vec<[f64; 2]>, network: Network, seating: &Seating, rise: f64, seed: u32) -> Sculpt {
    let Network { areas, paths, exits } = network;
    let mut floors: Vec<[f64; 5]> =
        areas.iter().map(|area| [area.at[0], area.at[1], area.at[0], area.at[1], area.radius + BASIN_ROOM_M]).collect();
    for path in paths {
        let half = if path.tier == Tier::Track { TRACK_HALF_M } else { FOOTPATH_HALF_M };
        for pair in simplified(&path.points, 3.0).windows(2) {
            floors.push([pair[0][0], pair[0][1], pair[1][0], pair[1][1], half]);
        }
    }
    for &(from, way) in exits {
        floors.push(gorge(field, from, way, FOOTPATH_HALF_M + 3.0));
    }
    let outcrops = outcrops(areas, paths, seating, seed);
    Sculpt { claim, floors, outcrops, rise, seed }
}

/// The mesas and spires of a layout's open ground: three to five in each wilds and arena, a pair at the rim of each
/// other wide basin, never on a path, a building or another outcrop.
fn outcrops(areas: &[Area], paths: &[Path], seating: &Seating, seed: u32) -> Vec<[f64; 4]> {
    let mut found: Vec<[f64; 4]> = Vec::new();
    let mut draw = 0_i64;
    let mut next = || {
        draw += 1;
        rand01(seed ^ 0x0C2A, &[draw])
    };
    for area in areas {
        let (count, inner, outer) = match area.kind {
            AreaKind::Wilds | AreaKind::Arena => (5, 0.35, 0.85),
            AreaKind::Gate | AreaKind::Entrance | AreaKind::Landing | AreaKind::Tower | AreaKind::Lighthouse => {
                (0, 0.0, 0.0)
            }
            _ if area.radius >= 60.0 => (2, 1.05, 1.25),
            _ => (0, 0.0, 0.0),
        };
        let mut tries = 0;
        let mut placed = 0;
        while placed < count && tries < 40 {
            tries += 1;
            let angle = next() * std::f64::consts::TAU;
            let (sine, cosine) = land::exact::sin_cos(angle);
            let out = area.radius * (inner + next() * (outer - inner));
            let at = [area.at[0] + sine * out, area.at[1] - cosine * out];
            let spire = next() < 0.4;
            let radius = if spire { 4.0 + next() * 3.0 } else { 7.0 + next() * 8.0 };
            let tall = if spire { 12.0 + next() * 10.0 } else { 5.0 + next() * 9.0 };
            let clear_of_paths = paths.iter().all(|path| {
                let half = if path.tier == Tier::Track { TRACK_HALF_M } else { FOOTPATH_HALF_M };
                path.points
                    .windows(2)
                    .all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > half * 0.5 + radius * 1.4 + 3.0)
            });
            let clear_of_buildings = seating.buildings.iter().chain(seating.props.iter()).all(|seated| {
                let [west, north, east, south] = seated.footprint;
                let margin = radius * 1.4 + 3.0;
                at[0] < west - margin || at[0] > east + margin || at[1] < north - margin || at[1] > south + margin
            });
            let clear_of_others =
                found.iter().all(|other| distance([other[0], other[1]], at) > (other[2] + radius) * 1.5 + 6.0);
            let clear_of_middle = distance(at, area.at) > radius * 1.4 + 10.0;
            if clear_of_paths && clear_of_buildings && clear_of_others && clear_of_middle {
                found.push([at[0], at[1], radius, tall]);
                placed += 1;
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_massif_stands_tallest_in_the_highland_and_lowest_in_the_swamp() {
        assert!(rise_of(Some("highland")) > rise_of(Some("temperate-coast")));
        assert!(rise_of(Some("swamp")) < rise_of(Some("steppe")));
        assert!(rise_of(None) > 0.0);
    }
}
