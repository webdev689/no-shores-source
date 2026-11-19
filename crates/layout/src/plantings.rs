//! What a layout plants, from the kinds its climate's nature already grows (content/nature/flora.json), so worked
//! land reads as worked: an orchard's trees in rows in a farm named an orchard, a hedgerow behind the drystone walls
//! along each farm's tracks, and thickets in a wilds named a moor. The client grows each where it is planted, as
//! nature's own kind (client/src/nature/scatter.ts).

use crate::areas::Area;
use crate::basins::Basin;
use crate::brief::AreaKind;
use crate::dressing::{WALL_OFF_M, WALL_REACH_M, beside, samples};
use crate::field::{distance, ring_holds};
use crate::paths::{Path, Tier, off_line};
use crate::runs::{Run, half_of};
use crate::seat::{Seating, TILE_M};
use land::exact::{rand01, sin_cos};
use land::ground::{Ground, WaterAt};
use land::sculpts::{Sculpt, Sculpts};
use serde::Serialize;
use std::f64::consts::TAU;

/// One kind a layout plants and where each of it stands, metres east and south.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Planting {
    pub kind: String,
    pub points: Vec<[f64; 2]>,
}

/// What a zone plants with and where: its climate (its landmass's biome), its seed, and whether its land takes a
/// planting at a point that reaches so far round it.
pub struct Zone<'a> {
    pub biome: Option<&'a str>,
    pub seed: u32,
    pub takes: &'a dyn Fn([f64; 2], f64) -> bool,
}

impl std::fmt::Debug for Zone<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("Zone").field("biome", &self.biome).field("seed", &self.seed).finish_non_exhaustive()
    }
}

/// Each climate's orchard tree and its shrub for hedges and thickets, both kinds its nature grows: its fruiting or
/// broadleaf tree (no apple or pear grows anywhere, so the oak stands in for them where it grows), and its one shrub.
/// The tundra and the swamp grow no tree an orchard is planted with (spruce and dead trees, cypress and mangrove), and
/// the swamp no shrub, only reeds and ferns.
const CLIMATES: [(&str, Option<&str>, Option<&str>); 9] = [
    ("temperate-coast", Some("oak"), Some("gorse")),
    ("highland", Some("birch"), Some("heather")),
    ("woodland", Some("oak"), Some("hazel")),
    ("steppe", Some("birch"), Some("sagebrush")),
    ("tundra", None, Some("dwarf shrub")),
    ("desert", Some("date palm"), Some("dry shrub")),
    ("savanna", Some("acacia"), Some("thorn bush")),
    ("rainforest", Some("palm"), Some("understory")),
    ("swamp", None, None),
];

/// How far apart an orchard's trees stand along its rows, and its rows, metres, and how far it is planted from its
/// farm's middle along its field and across it.
const ORCHARD_TREE_M: f64 = 9.0;
const ORCHARD_ROW_M: f64 = 10.0;
const ORCHARD_REACH_M: [f64; 2] = [60.0, 45.0];
/// How far a hedgerow's bushes stand out from the wall's middle, on the field's side of it (the wall is 0.8 m thick).
const HEDGE_BEHIND_M: f64 = 1.8;
/// How many thickets a moor's wilds holds, how far its bushes stand apart in one, and the least and most a thicket
/// reaches from its middle, metres; a share of its bushes is left out, so its edge is ragged.
const THICKETS: u32 = 8;
const THICKET_BUSH_M: f64 = 1.8;
const THICKET_REACH_M: [f64; 2] = [5.0, 10.0];
const THICKET_KEPT: f64 = 0.75;
/// How far round its foot a tree and a shrub reach, metres: what each keeps clear by.
const TREE_REACH_M: f64 = 4.0;
const SHRUB_REACH_M: f64 = 1.6;
/// How far round a building and a run's way nothing is planted, metres, as nature keeps them clear
/// (client/src/layout/layoutPlan.ts YARD_CLEAR_M and RUN_CLEAR_M), and how much further round a run's beat.
const YARD_M: f64 = 10.0;
const RUN_CLEAR_M: f64 = 6.0;
const BEAT_CLEAR_M: f64 = 2.0;
/// Half the run the land's slope is read across, metres, and the steepest it may be: a little under the steepest
/// nature's own trees grow on (0.6).
const LEVEL_M: f64 = 1.5;
const STEEPEST: f64 = 0.4;

/// A layout's plantings, each kept where its land takes it and clear of every way, yard, run, building, prop and
/// solid: an orchard in each farm named one, thickets in each wilds named a moor, and the hedgerows behind the walls
/// along the farms' tracks.
#[must_use]
pub fn plantings(
    areas: &[Area],
    basins: &[Basin],
    paths: &[Path],
    seating: &Seating,
    runs: &[Run],
    zone: &Zone,
) -> Vec<Planting> {
    let Some(&(_, tree, shrub)) = CLIMATES.iter().find(|(climate, ..)| Some(*climate) == zone.biome) else {
        return Vec::new();
    };
    // A whole word of the area's own name, so Moorhold is no moor.
    let named = |area: &Area, word: &str| {
        area.name.split(|letter: char| !letter.is_alphanumeric()).any(|each| each.eq_ignore_ascii_case(word))
    };
    let mut wanted: Vec<(&str, f64, Vec<[f64; 2]>)> = Vec::new();
    for (number, (area, basin)) in areas.iter().zip(basins).enumerate() {
        let (kind, reach, points) = match area.kind {
            AreaKind::Farm if named(area, "orchard") => (tree, TREE_REACH_M, orchard(area, basin)),
            AreaKind::Wilds if named(area, "moor") => (shrub, SHRUB_REACH_M, thickets(area, zone.seed ^ number as u32)),
            _ => continue,
        };
        wanted.extend(kind.map(|kind| (kind, reach, points)));
    }
    wanted.extend(shrub.map(|shrub| (shrub, SHRUB_REACH_M, hedgerows(areas, paths))));
    let Some(near) = wanted
        .iter()
        .flat_map(|(_, _, points)| points)
        .map(|&[x, y]| [x, y, x, y])
        .reduce(|[west, north, east, south], [x, y, ..]| [west.min(x), north.min(y), east.max(x), south.max(y)])
    else {
        return Vec::new();
    };
    let kept = Kept::of((paths, seating, runs), near);
    wanted
        .into_iter()
        .map(|(kind, reach, points)| Planting {
            kind: kind.to_owned(),
            points: points.into_iter().filter(|&at| kept.clear(at, reach) && (zone.takes)(at, reach)).collect(),
        })
        .filter(|planting| !planting.points.is_empty())
        .collect()
}

/// An orchard's trees in rows along its farm's field (its basin's first floor), round its middle.
fn orchard(area: &Area, basin: &Basin) -> Vec<[f64; 2]> {
    let axis = basin.floors.first().map_or([1.0, 0.0], |&[x1, y1, x2, y2, _]| {
        let length = distance([x1, y1], [x2, y2]);
        if length > 1e-6 { [(x2 - x1) / length, (y2 - y1) / length] } else { [1.0, 0.0] }
    });
    let trees = (ORCHARD_REACH_M[0] / ORCHARD_TREE_M) as i32;
    let rows = (ORCHARD_REACH_M[1] / ORCHARD_ROW_M) as i32;
    (-rows..=rows)
        .flat_map(|row| {
            (-trees..=trees).map(move |tree| (f64::from(tree) * ORCHARD_TREE_M, f64::from(row) * ORCHARD_ROW_M))
        })
        .map(|(along, across)| {
            [area.at[0] + axis[0] * along - axis[1] * across, area.at[1] + axis[1] * along + axis[0] * across]
        })
        .collect()
}

/// A moor's thickets: clumps of bushes round its wilds, between a quarter and most of the way out.
fn thickets(area: &Area, seed: u32) -> Vec<[f64; 2]> {
    let mut bushes = Vec::new();
    for thicket in 0..THICKETS {
        let draw = |salt: i64| rand01(seed, &[i64::from(thicket), salt]);
        let (sine, cosine) = sin_cos((f64::from(thicket) + draw(0) * 0.6) / f64::from(THICKETS) * TAU);
        let out = area.radius * (0.25 + 0.6 * draw(1));
        let middle = [area.at[0] + sine * out, area.at[1] - cosine * out];
        let reach = THICKET_REACH_M[0] + (THICKET_REACH_M[1] - THICKET_REACH_M[0]) * draw(2);
        let steps = (reach / THICKET_BUSH_M) as i64;
        for row in -steps..=steps {
            // Every other row set half a bush along, so the bushes pack as a thicket does, not in a grid.
            let shift = if row % 2 == 0 { 0.0 } else { 0.5 };
            for column in -steps..=steps {
                let at = [
                    middle[0] + (column as f64 + shift) * THICKET_BUSH_M,
                    middle[1] + row as f64 * THICKET_BUSH_M * 0.87,
                ];
                if distance(at, middle) <= reach && rand01(seed, &[i64::from(thicket), row, column]) < THICKET_KEPT {
                    bushes.push(at);
                }
            }
        }
    }
    bushes
}

/// The hedgerows behind the drystone walls along the tracks out of every farm, as far out as the walls run
/// (dressing.rs), on both sides.
fn hedgerows(areas: &[Area], paths: &[Path]) -> Vec<[f64; 2]> {
    let farms: Vec<&Area> = areas.iter().filter(|area| area.kind == AreaKind::Farm).collect();
    let mut bushes = Vec::new();
    for path in paths.iter().filter(|path| path.tier == Tier::Track) {
        let out = path.tier.width() / 2.0 + WALL_OFF_M + HEDGE_BEHIND_M;
        for (at, way) in samples(path) {
            let walled = farms.iter().any(|farm| distance(farm.at, at) < farm.radius + WALL_REACH_M)
                && areas.iter().all(|area| distance(area.at, at) >= area.radius);
            if walled {
                bushes.extend([beside(at, way, out), beside(at, way, -out)]);
            }
        }
    }
    bushes
}

/// What a planting keeps clear of near where it may stand: the prints (west, north, east, south) of all a layout
/// stands, a building's grown by its yard; its ways' and runs' stretches, each with how far either side of its line it
/// is kept clear; and its runs' beats, each with its reach.
struct Kept {
    prints: Vec<[f64; 4]>,
    ways: Vec<([f64; 2], [f64; 2], f64)>,
    beats: Vec<([f64; 2], f64)>,
}

impl Kept {
    /// What is kept clear of within a tree's reach of `near`, the bounds of where something may be planted.
    fn of((paths, seating, runs): (&[Path], &Seating, &[Run]), near: [f64; 4]) -> Self {
        let near = [near[0] - TREE_REACH_M, near[1] - TREE_REACH_M, near[2] + TREE_REACH_M, near[3] + TREE_REACH_M];
        let meets = |&[west, north, east, south]: &[f64; 4]| {
            west <= near[2] && east >= near[0] && north <= near[3] && south >= near[1]
        };
        let round = |[x, y]: [f64; 2], reach: f64| [x - reach, y - reach, x + reach, y + reach];
        let grown = |[west, north, east, south]: [f64; 4], by: f64| [west - by, north - by, east + by, south + by];
        let yards = seating.buildings.iter().map(|building| grown(building.footprint, YARD_M));
        let tiles = seating.tiles.iter().map(|tile| round(tile.at, TILE_M / 2.0));
        let pads = seating.pads.iter().map(|pad| pad.bounds);
        let props = seating.props.iter().map(|prop| prop.footprint);
        // A solid turned or leaned any way stays within its box's diagonal of the middle of its base.
        let solids = seating
            .solids
            .iter()
            .filter(|solid| {
                let [east, south, up] = solid.size;
                meets(&round([solid.at[0], solid.at[1]], (east * east + south * south + up * up).sqrt()))
            })
            .map(|solid| {
                let [west, north, east, south, ..] = solid.bounds();
                [west, north, east, south]
            });
        let prints = yards.chain(tiles).chain(pads).chain(props).chain(solids).filter(meets).collect();
        let lines = paths.iter().map(|path| (path.points.clone(), path.tier.width() / 2.0));
        let passages = runs.iter().map(|run| (run.way(), half_of(run.kind).max(RUN_CLEAR_M)));
        let ways = lines
            .chain(passages)
            .flat_map(|(points, half)| points.windows(2).map(|pair| (pair[0], pair[1], half)).collect::<Vec<_>>())
            .filter(|&(from, to, half)| {
                meets(&grown([from[0].min(to[0]), from[1].min(to[1]), from[0].max(to[0]), from[1].max(to[1])], half))
            })
            .collect();
        let beats = runs.iter().flat_map(|run| run.beats.iter().map(|beat| (beat.at, beat.radius + BEAT_CLEAR_M)));
        Self { prints, ways, beats: beats.filter(|&(at, reach)| meets(&round(at, reach))).collect() }
    }

    /// Whether a planting reaching `reach` round a point stands clear of every print, way and beat.
    fn clear(&self, at: [f64; 2], reach: f64) -> bool {
        self.prints.iter().all(|&[west, north, east, south]| {
            at[0] < west - reach || at[0] > east + reach || at[1] < north - reach || at[1] > south + reach
        }) && self.ways.iter().all(|&(from, to, half)| off_line(at, from, to) > half + reach)
            && self.beats.iter().all(|&(middle, beat)| distance(middle, at) > beat + reach)
    }
}

/// Whether a layout's land takes a planting reaching `reach` round a point: in its section, on its floor by that
/// reach and as far off its climbs, its runs' rock and its outcrops, so nothing stands up or into a face; dry; and no
/// steeper there than STEEPEST, on the ground as `carved` carves it.
#[must_use]
pub fn takes(ground: &Ground, sculpt: &Sculpt, carved: &Sculpts, ring: &[[f64; 2]], at: [f64; 2], reach: f64) -> bool {
    let off = |capsule: &[f64]| off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]) - capsule[4];
    let height = |east: f64, south: f64| {
        let (x, y) = (at[0] + east, at[1] + south);
        ground.height_at(x, y) + carved.raise(x, y, ground.coast.at(x, y))
    };
    let level = || {
        let east = height(LEVEL_M, 0.0) - height(-LEVEL_M, 0.0);
        let south = height(0.0, LEVEL_M) - height(0.0, -LEVEL_M);
        let most = STEEPEST * 2.0 * LEVEL_M;
        east * east + south * south <= most * most
    };
    ring_holds(ring, at[0], at[1])
        && sculpt.floors.iter().any(|floor| off(floor) <= -reach)
        && sculpt.climbs.iter().chain(&sculpt.runs).all(|climb| off(climb) > reach)
        && sculpt.outcrops.iter().all(|outcrop| {
            let ([first, last], out) = outcrop.footprint();
            off_line(at, first, last) > out + reach
        })
        && ground.water_at(at[0], at[1]) == WaterAt::Dry
        && level()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brief::AreaKind;
    use crate::paths::{Tier, off_line};

    const AT: [f64; 2] = [1000.0, 2000.0];
    /// The field's way, a unit vector to the north-east.
    const AXIS: [f64; 2] = [0.8, -0.6];

    #[test]
    fn an_orchard_is_in_rows() {
        let farm = Area { kind: AreaKind::Farm, name: "Orchard Farm".into(), at: AT, radius: 95.0, leads_to: None };
        let reach = 171.0;
        let ends =
            [[AT[0] - AXIS[0] * reach, AT[1] - AXIS[1] * reach], [AT[0] + AXIS[0] * reach, AT[1] + AXIS[1] * reach]];
        let basin =
            Basin { floors: vec![[ends[0][0], ends[0][1], ends[1][0], ends[1][1], 95.0]], terraces: Vec::new() };
        let track = Path {
            tier: Tier::Track,
            points: vec![[AT[0] + 20.0, AT[1] - 150.0], [AT[0] + 20.0, AT[1] + 150.0]],
            crossings: Vec::new(),
            heights: Vec::new(),
        };
        let zone = Zone { biome: Some("temperate-coast"), seed: 7, takes: &|_, _| true };
        let planted = plantings(&[farm], &[basin], std::slice::from_ref(&track), &Seating::default(), &[], &zone);
        let trees = planted.iter().find(|planting| planting.kind == "oak").map_or(&[][..], |orchard| &orchard.points);
        // Each tree's place along the field and across it, from the farm's middle.
        let placed: Vec<(f64, f64)> = trees
            .iter()
            .map(|at| {
                let (east, south) = (at[0] - AT[0], at[1] - AT[1]);
                (east * AXIS[0] + south * AXIS[1], south * AXIS[0] - east * AXIS[1])
            })
            .collect();
        let mut rows: Vec<i64> = placed.iter().map(|&(_, across)| (across / ORCHARD_ROW_M).round() as i64).collect();
        rows.sort_unstable();
        rows.dedup();
        assert!(rows.len() >= 4, "an orchard of {} trees in {} rows", trees.len(), rows.len());
        for &row in &rows {
            let along: Vec<f64> = placed
                .iter()
                .filter(|&&(_, across)| (across / ORCHARD_ROW_M).round() as i64 == row)
                .map(|&(along, _)| along)
                .collect();
            assert!(along.len() >= 4, "row {row} holds {} trees", along.len());
        }
        for &(along, across) in &placed {
            let off_row = (across - (across / ORCHARD_ROW_M).round() * ORCHARD_ROW_M).abs();
            let off_step = (along - (along / ORCHARD_TREE_M).round() * ORCHARD_TREE_M).abs();
            assert!(
                off_row < 1e-6 && off_step < 1e-6,
                "a tree {along:.2} along and {across:.2} across stands out of line"
            );
        }
        for at in trees {
            let off = off_line(*at, track.points[0], track.points[1]);
            assert!(off > Tier::Track.width() / 2.0, "a tree at {at:?} stands on the track, {off:.1} m off its middle");
        }
    }

    #[test]
    fn only_an_area_named_a_moor_is_planted_with_thickets() {
        let wilds =
            |name: &str| Area { kind: AreaKind::Wilds, name: name.into(), at: AT, radius: 65.0, leads_to: None };
        let floor = Basin { floors: vec![[AT[0], AT[1], AT[0], AT[1], 120.0]], terraces: Vec::new() };
        let zone = Zone { biome: Some("temperate-coast"), seed: 7, takes: &|_, _| true };
        let planted =
            |name: &str| plantings(&[wilds(name)], std::slice::from_ref(&floor), &[], &Seating::default(), &[], &zone);
        assert_eq!(planted("The Gorse Moor").len(), 1, "a moor is planted with thickets");
        for name in ["Moorhold", "The Moored Boats", "The Water Meadows"] {
            assert!(planted(name).is_empty(), "{name} is no moor");
        }
    }
}
