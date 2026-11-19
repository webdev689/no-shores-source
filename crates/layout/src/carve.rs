//! How a layout carves its land (the land crate's sculpt): each area a basin shaped by its kind (basins.rs), each path
//! a canyon as wide as its tier wants, a gorge out of the claim at each gate and toward the sea from the landing, and
//! outcrops standing up in its open ground for cover and to break the long views, the rest raised into a massif
//! whose stepped cliffs are the layout's bounds. How high the massif stands is the biome's: tall in the highland and
//! the desert, low in the swamp; and its outcrops' shape is its brief's, or its climate's.

use crate::areas::Area;
use crate::basins::{Basin, basin};
use crate::brief::{AreaKind, Brief};
use crate::field::{Field, distance};
use crate::paths::{Path, Tier, off_line, rect_off_line, segments_apart, simplified};
use crate::seat::Seating;
use land::exact::rand01;
use land::sculpts::{Outcrop, Sculpt, Sculpts, Shape};

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

/// The shape a layout's outcrops stand in: its brief's, or else its biome's.
#[must_use]
pub fn shape_of(brief: &Brief, biome: Option<&str>) -> Shape {
    brief.rock.unwrap_or(match biome {
        Some("desert" | "steppe" | "savanna") => Shape::Mesa,
        Some("highland" | "tundra") => Shape::Crag,
        Some("rainforest") => Shape::Knoll,
        Some("swamp") => Shape::Hummock,
        _ => Shape::Tor,
    })
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

/// The way the water runs past a point: square to the way the fresh water's distance falls, or None where no water
/// is near enough to lean it.
fn along_water(field: &Field, at: [f64; 2]) -> Option<[f64; 2]> {
    let (column, row) = field.cell_of(at[0], at[1])?;
    let to_fresh = |column: usize, row: usize| field.to_fresh[field.index(column, row)];
    let (west, east) = (column.checked_sub(2)?, (column + 2).min(field.columns - 1));
    let (north, south) = (row.checked_sub(2)?, (row + 2).min(field.rows - 1));
    let falls = [to_fresh(east, row) - to_fresh(west, row), to_fresh(column, south) - to_fresh(column, north)];
    let steep = (falls[0] * falls[0] + falls[1] * falls[1]).sqrt();
    (steep > 1.0).then(|| [-falls[1] / steep, falls[0] / steep])
}

/// The climbs that run up to the massif's top to a lookout, each with its lookout: those `carve` finds first, before
/// the basins' terraces and ramps, which stand lower.
pub fn lookouts(climbs: &[[f64; 7]]) -> impl Iterator<Item = &[[f64; 7]]> {
    climbs.chunks_exact(2).take_while(|pair| pair[1][5] >= 1.0)
}

/// A layout's sculpt (its claim, its floors, its outcrops of a shape, its climbs, its massif's height and seed) and
/// each of its areas' basins.
#[must_use]
pub fn carve(
    field: &Field,
    claim: Vec<[f64; 2]>,
    network: Network,
    seating: &Seating,
    shape: Shape,
    rise: f64,
    seed: u32,
) -> (Sculpt, Vec<Basin>) {
    let Network { areas, paths, exits, pockets } = network;
    let mut drawn = 0_i64;
    let mut draw = || {
        drawn += 1;
        rand01(seed ^ 0xBA51, &[drawn])
    };
    let basins: Vec<Basin> = areas
        .iter()
        .map(|area| {
            let water = (area.kind == AreaKind::Mill).then(|| along_water(field, area.at)).flatten();
            basin(area, seating, paths, water, &mut draw)
        })
        .collect();
    let mut floors: Vec<[f64; 5]> = basins.iter().flat_map(|basin| basin.floors.iter().copied()).collect();
    let terraces: Vec<[f64; 7]> = basins.iter().flat_map(|basin| basin.terraces.iter().copied()).collect();
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
    let bare = Sculpts::from(vec![Sculpt {
        claim: claim.clone(),
        floors: floors.clone(),
        outcrops: Vec::new(),
        rise,
        seed,
        climbs: terraces.clone(),
        runs: Vec::new(),
        wings: Vec::new(),
    }]);
    let mut climbs = climbs(field, areas, &bare, rise, seed);
    climbs.extend(terraces);
    let outcrops = outcrops(areas, Ways { paths, climbs: &climbs }, seating, (shape, rise), seed);
    (Sculpt { claim, floors, outcrops, rise, seed, climbs, runs: Vec::new(), wings: Vec::new() }, basins)
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

/// How an outcrop of a shape is sized: its radius at least and at most, metres, and its tall, a share of its radius
/// at least and at most. A mesa is broad, wide enough at its largest for two faces and their ledge; a tor, a crag
/// and a knoll are as wide as they are tall or wider; a whaleback is low, and about seven times its radius long; a
/// hummock is low and wide. None is so small that its band is narrower than `BAND_M`.
const fn size_of(shape: Shape) -> (f64, f64, f64, f64) {
    match shape {
        Shape::Mesa => (18.0, 52.0, 0.45, 0.7),
        Shape::Tor => (11.0, 26.0, 0.6, 1.0),
        Shape::Whaleback => (8.0, 12.0, 0.45, 0.7),
        Shape::Crag => (14.0, 34.0, 0.6, 1.0),
        Shape::Knoll => (12.0, 26.0, 0.55, 0.9),
        Shape::Hummock => (10.0, 22.0, 0.25, 0.4),
    }
}

/// How tall an outcrop stands at most, a share of the massif's height: under the cliffs round it.
const UNDER_RISE: f64 = 0.8;

/// What a layout's outcrops keep off: its paths, and its climbs and their lookouts.
#[derive(Clone, Copy)]
struct Ways<'layout> {
    paths: &'layout [Path],
    climbs: &'layout [[f64; 7]],
}

/// The outcrops of a layout's open ground, of its shape and sized to it: three to five in each wilds and arena, a pair
/// at the rim of each other wide basin, each turned across the view from its area's middle (the way a whaleback runs
/// and a tor leans), its footprint never on a way, a building, a prop, a solid or another outcrop. Each later try is
/// smaller, so an outcrop is as large as the room left round it lets it be.
fn outcrops(areas: &[Area], ways: Ways, seating: &Seating, (shape, rise): (Shape, f64), seed: u32) -> Vec<Outcrop> {
    let Ways { paths, climbs } = ways;
    let (least, most, low, high) = size_of(shape);
    let mut found: Vec<Outcrop> = Vec::new();
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
            let room = 1.0 - f64::from(tries) / 40.0;
            tries += 1;
            let bearing = next() * std::f64::consts::TAU;
            let (sine, cosine) = land::exact::sin_cos(bearing);
            let out = area.radius * (inner + next() * (outer - inner));
            let at = [area.at[0] + sine * out, area.at[1] - cosine * out];
            let radius = least + (most - least) * room * (0.8 + 0.2 * next());
            let tall = (radius * (low + (high - low) * next())).min(rise * UNDER_RISE);
            let angle = bearing + std::f64::consts::FRAC_PI_2 + (next() - 0.5) * 0.6;
            let outcrop = Outcrop { at, radius, tall, shape, angle };
            let ([first, last], reach) = outcrop.footprint();
            let clear_of_paths = paths.iter().all(|path| {
                let half = if path.tier == Tier::Track { TRACK_HALF_M } else { FOOTPATH_HALF_M };
                path.points
                    .windows(2)
                    .all(|pair| segments_apart([first, last], [pair[0], pair[1]]) > half * 0.5 + reach + 3.0)
            });
            let clear_of_climbs = climbs.iter().all(|climb| {
                segments_apart([first, last], [[climb[0], climb[1]], [climb[2], climb[3]]]) > climb[4] + reach + 3.0
            });
            let clear_of_buildings = seating
                .buildings
                .iter()
                .chain(seating.props.iter())
                .all(|seated| rect_off_line(seated.footprint, first, last) > reach + 3.0);
            // A solid by the distance its corners reach from its middle, however it is turned.
            let clear_of_solids = seating.solids.iter().all(|solid| {
                let corner = 0.5 * (solid.size[0] * solid.size[0] + solid.size[1] * solid.size[1]).sqrt();
                off_line([solid.at[0], solid.at[1]], first, last) > reach + corner + 3.0
            });
            let clear_of_others = found.iter().all(|other| {
                let ([other_first, other_last], other_reach) = other.footprint();
                segments_apart([first, last], [other_first, other_last]) > (reach + other_reach) * 1.1 + 6.0
            });
            let clear_of_middle = off_line(area.at, first, last) > reach + 10.0;
            let clear = clear_of_paths && clear_of_climbs && clear_of_buildings && clear_of_solids;
            if clear && clear_of_others && clear_of_middle {
                found.push(outcrop);
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
    fn the_brief_names_a_zones_rock_and_the_climate_the_rest() {
        let briefs = crate::brief::Briefs::parse(
            r#"{ "downs": { "theme": "", "areas": [], "rock": "whaleback", "stone": "chalk" },
                 "vale": { "theme": "", "areas": [], "river": true } }"#,
        )
        .unwrap();
        let (downs, vale) = (&briefs.0["downs"], &briefs.0["vale"]);
        assert_eq!((downs.stone.as_deref(), downs.river, vale.river), (Some("chalk"), false, true));
        assert_eq!(shape_of(downs, Some("desert")), Shape::Whaleback, "the brief's rock over its climate's");
        let climates = [
            ("desert", Shape::Mesa),
            ("steppe", Shape::Mesa),
            ("savanna", Shape::Mesa),
            ("temperate-coast", Shape::Tor),
            ("woodland", Shape::Tor),
            ("highland", Shape::Crag),
            ("tundra", Shape::Crag),
            ("rainforest", Shape::Knoll),
            ("swamp", Shape::Hummock),
        ];
        for (biome, shape) in climates {
            assert_eq!(shape_of(vale, Some(biome)), shape, "{biome}");
        }
        assert_eq!(shape_of(vale, None), Shape::Tor);
    }

    #[test]
    fn the_massif_stands_tallest_in_the_highland_and_lowest_in_the_swamp() {
        assert!(rise_of(Some("highland")) > rise_of(Some("temperate-coast")));
        assert!(rise_of(Some("swamp")) < rise_of(Some("steppe")));
        assert!(rise_of(None) > 0.0);
    }
}
