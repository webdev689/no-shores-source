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
use land::sculpts::{Sculpt, Sculpts};

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

/// What a layout's floor is carved round: its areas, its paths, the gorges out of it (each a start and a way), and
/// the pockets off its paths where its resources lie.
#[derive(Debug, Clone, Copy)]
pub struct Network<'layout> {
    pub areas: &'layout [Area],
    pub paths: &'layout [Path],
    pub exits: &'layout [([f64; 2], [f64; 2])],
    pub pockets: &'layout [[f64; 2]],
}

/// A pocket's half-width, metres: room round a resource and a way into it from the path.
const POCKET_HALF_M: f64 = 9.0;

/// The point of the paths nearest a point.
fn nearest_on(paths: &[Path], at: [f64; 2]) -> Option<[f64; 2]> {
    paths
        .iter()
        .flat_map(|path| path.points.windows(2))
        .map(|pair| {
            let (span_x, span_y) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
            let length = span_x * span_x + span_y * span_y;
            let along = if length > 0.0 {
                (((at[0] - pair[0][0]) * span_x + (at[1] - pair[0][1]) * span_y) / length).clamp(0.0, 1.0)
            } else {
                0.0
            };
            [pair[0][0] + span_x * along, pair[0][1] + span_y * along]
        })
        .min_by(|first, second| distance(*first, at).total_cmp(&distance(*second, at)))
}

/// A layout's sculpt: its claim, its floors, its outcrops, its massif's height and seed.
#[must_use]
pub fn carve(field: &Field, claim: Vec<[f64; 2]>, network: Network, seating: &Seating, rise: f64, seed: u32) -> Sculpt {
    let Network { areas, paths, exits, pockets } = network;
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
    for &pocket in pockets {
        let mouth = nearest_on(paths, pocket).unwrap_or(pocket);
        floors.push([mouth[0], mouth[1], pocket[0], pocket[1], POCKET_HALF_M]);
    }
    let outcrops = outcrops(areas, paths, seating, seed);
    let bare = Sculpts::from(vec![Sculpt {
        claim: claim.clone(),
        floors: floors.clone(),
        outcrops: Vec::new(),
        rise,
        seed,
        climbs: Vec::new(),
        runs: Vec::new(),
        wings: Vec::new(),
    }]);
    let climbs = climbs(field, areas, &bare, rise, seed);
    Sculpt { claim, floors, outcrops, rise, seed, climbs, runs: Vec::new(), wings: Vec::new() }
}

/// How steep a climb rises at most (a rise a metre, for the massif's tallest), its half-width, its lookout's reach,
/// metres, and how far it turns out from along the basin's rim, radians, so the face behind it stands over it.
const CLIMB_STEEPEST: f64 = 0.3;
const CLIMB_HALF_M: f64 = 3.5;
const LOOKOUT_HALF_M: f64 = 11.0;
const CLIMB_TURN: f64 = 0.32;
/// How far into the rock a climb must have bored for each metre it has run, metres.
const CLIMB_BORES: f64 = 0.28;
/// How many basins a layout climbs out of at most.
const MOST_CLIMBS: usize = 2;

/// Ways up the massif from the edges of the larger basins, each to a lookout on the top over its basin: a straight
/// climb from where the basin's floor really ends (`bare`, the floors as carved, wander and all), turned out from
/// along its edge, boring into the rock as it rises so its face stands over it and its drop falls to the floor, clear
/// of every other floor and well inside the claim; each a climb and its lookout (land's `Sculpt::climbs`).
fn climbs(field: &Field, areas: &[Area], bare: &Sculpts, rise: f64, seed: u32) -> Vec<[f64; 7]> {
    let length = rise * 1.15 / CLIMB_STEEPEST;
    let mut found: Vec<[f64; 7]> = Vec::new();
    for (number, area) in areas.iter().enumerate() {
        if found.len() >= 2 * MOST_CLIMBS {
            break;
        }
        let open = !matches!(area.kind, AreaKind::Gate | AreaKind::Landing | AreaKind::Entrance | AreaKind::Dock);
        if !open || area.radius < 40.0 {
            continue;
        }
        'tries: for attempt in 0..16 {
            let angle = std::f64::consts::TAU * (f64::from(attempt) / 16.0 + rand01(seed ^ 0xC11B, &[number as i64]));
            let (sine, cosine) = land::exact::sin_cos(angle);
            let radial = [sine, -cosine];
            let mut out = area.radius;
            while out < area.radius * 3.0
                && bare.floor_distance(area.at[0] + radial[0] * out, area.at[1] + radial[1] * out) <= 0.0
            {
                out += 2.0;
            }
            let start = [area.at[0] + radial[0] * (out - 2.0), area.at[1] + radial[1] * (out - 2.0)];
            let (out_sine, out_cosine) = land::exact::sin_cos(CLIMB_TURN);
            for side in [1.0, -1.0] {
                let along = [-radial[1] * side, radial[0] * side];
                let way = [along[0] * out_cosine + radial[0] * out_sine, along[1] * out_cosine + radial[1] * out_sine];
                let end = [start[0] + way[0] * length, start[1] + way[1] * length];
                if climb_clear(field, bare, &found, start, way, length) {
                    found.push([start[0], start[1], end[0], end[1], CLIMB_HALF_M, 0.0, 1.0]);
                    found.push([end[0], end[1], end[0], end[1], LOOKOUT_HALF_M, 1.0, 1.0]);
                    break 'tries;
                }
            }
        }
    }
    found
}

/// Whether a climb from `start` along `way` for `length` metres, and its lookout, lie on dry land well inside the
/// claim, bore into the rock as they rise (`bare`'s floors ever further off), and keep clear of other climbs.
fn climb_clear(
    field: &Field,
    bare: &Sculpts,
    climbs: &[[f64; 7]],
    start: [f64; 2],
    way: [f64; 2],
    length: f64,
) -> bool {
    let clearance = land::sculpts::CLIFF_RUN_M + CLIMB_HALF_M;
    let mut along = 10.0;
    while along <= length + LOOKOUT_HALF_M {
        let at = [start[0] + way[0] * along, start[1] + way[1] * along];
        let deep_enough = if along > length { LOOKOUT_HALF_M + 4.0 } else { (along * CLIMB_BORES).min(clearance) };
        along += 6.0;
        let Some((column, row)) = field.cell_of(at[0], at[1]) else { return false };
        let cell = field.index(column, row);
        if !field.claimed[cell] || field.inside[cell] < 30.0 || field.water[cell] != crate::field::Water::Dry {
            return false;
        }
        let off_climbs = climbs.iter().all(|climb| {
            crate::paths::off_line(at, [climb[0], climb[1]], [climb[2], climb[3]]) - climb[4] > 2.0 * clearance
        });
        if bare.floor_distance(at[0], at[1]) < deep_enough || !off_climbs {
            return false;
        }
    }
    true
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
    fn a_resource_off_a_path_is_reached_from_the_path_point_nearest_it() {
        let path = Path {
            tier: Tier::Track,
            points: vec![[0.0, 0.0], [100.0, 0.0], [100.0, 100.0]],
            crossings: Vec::new(),
            heights: Vec::new(),
        };
        assert_eq!(nearest_on(std::slice::from_ref(&path), [40.0, 35.0]), Some([40.0, 0.0]));
        assert_eq!(nearest_on(&[path], [130.0, 80.0]), Some([100.0, 80.0]));
    }

    #[test]
    fn the_massif_stands_tallest_in_the_highland_and_lowest_in_the_swamp() {
        assert!(rise_of(Some("highland")) > rise_of(Some("temperate-coast")));
        assert!(rise_of(Some("swamp")) < rise_of(Some("steppe")));
        assert!(rise_of(None) > 0.0);
    }
}
