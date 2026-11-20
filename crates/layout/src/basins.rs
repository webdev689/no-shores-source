//! The basin an area is carved round, shaped by what the area is: a farm's a long field, a hamlet's a bowl with a lobe
//! toward each of its blocks, a graveyard's a bowl with raised shelves its graves stand on, a keep's or a camp's a bowl
//! with a raised platform reached by ramps, the wilds' a cluster of bowls of different sizes, a ruin's a bowl broken by
//! spurs of rock, a mill's long along its water, and the rest a round bowl. Every basin holds its area's reach, and
//! room round its buildings; its shelves and platforms are level capsules of the land crate's climbs.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::{Path, off_line, rect_off_line, segments_apart};
use crate::pieces::{Kit, turn_along};
use crate::seat::Seating;
use crate::skyline::carved_at;
use city::solids::{Material, Shape, Solid};
use land::exact::sin_cos;
use land::sculpts::Sculpts;
use std::f64::consts::{PI, TAU};

/// The room a basin keeps round its area's buildings, and past its reach where nothing else shapes it, metres.
pub const BASIN_ROOM_M: f64 = 32.0;
/// How long a field (a farm's, a mill's) is over how wide.
const FIELD_LONG: f64 = 1.8;
/// How far a hamlet's lobe runs past its main bowl, and its half-width, metres.
const LOBE_OUT_M: f64 = 56.0;
const LOBE_HALF_M: f64 = 32.0;
/// How far a ruin's broken bowl reaches past its main bowl, metres.
const RUIN_OUT_M: f64 = 40.0;
/// A terrace's level, a share of the massif's height: a graveyard's shelf, a keep's platform, a camp's.
const SHELF_SHARE: f64 = 0.14;
const KEEP_SHARE: f64 = 0.18;
const CAMP_SHARE: f64 = 0.12;
/// A graveyard's shelf: its half-width and how far its ends lie from its middle, metres.
const SHELF_HALF_M: f64 = 12.0;
const SHELF_END_M: f64 = 20.0;
/// A keep's platform reaches this far at the least, and this far past its buildings and a camp's palisade, metres.
const KEEP_PLATFORM_M: f64 = 34.0;
const PLATFORM_ROOM_M: f64 = 6.0;
/// A ramp's half-width, metres, and how steep it rises at most, a rise a metre, where the massif's level stands
/// highest (the highland's at its roughest, `TALLEST_LEVEL_M`): lower massifs' ramps are gentler.
const RAMP_HALF_M: f64 = 4.5;
/// How near two ramps' bearings run (the cosine of the angle between them) for one to serve the way the other climbs.
const SAME_WAY: f64 = 0.9;
const RAMP_STEEPEST: f64 = 0.25;
const TALLEST_LEVEL_M: f64 = 44.0;
/// How far a terrace's edge runs from its level down to the floor, metres, as the land crate cuts a climb's.
pub(crate) const TERRACE_EDGE_M: f64 = 2.0;
/// How far apart a shelf's headstones stand along it, and its rows across it, metres: a lane down its middle.
const GRAVE_EVERY_M: f64 = 3.2;
const GRAVE_ROWS_M: [f64; 4] = [-8.5, -4.5, 4.5, 8.5];

/// An area's basin: its floor's capsules (`[x1, y1, x2, y2, half]`, the first the main one) and its terraces, level
/// capsules (`[x1, y1, x2, y2, half, from, to]`) raised on that floor with the ramps up to them.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Basin {
    pub floors: Vec<[f64; 5]>,
    pub terraces: Vec<[f64; 7]>,
}

impl Basin {
    /// How long its floor is over how wide: its widest extent, over 36 bearings, against its extent square to that.
    #[must_use]
    pub fn long_over_short(&self) -> f64 {
        let extent = |along: [f64; 2]| {
            let (low, high) =
                self.floors.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), &[x1, y1, x2, y2, half]| {
                    let (first, second) = (x1 * along[0] + y1 * along[1], x2 * along[0] + y2 * along[1]);
                    (low.min(first.min(second) - half), high.max(first.max(second) + half))
                });
            high - low
        };
        let (long, short) = (0..36)
            .map(|step| {
                let (sine, cosine) = sin_cos(f64::from(step) * PI / 36.0);
                (extent([cosine, sine]), extent([-sine, cosine]))
            })
            .fold((0.0, 1.0), |widest, next| if next.0 > widest.0 { next } else { widest });
        long / short
    }

    /// How many lobes stand out of its main bowl: its floors past the first.
    #[must_use]
    pub fn lobes(&self) -> usize {
        self.floors.len().saturating_sub(1)
    }
}

/// An area's basin, by its kind: `paths` are the ways its terraces keep off or are ramped from, `water` the way the
/// water runs past it (a mill's), and `draw` gives the turns and sizes left to chance.
pub fn basin(
    area: &Area,
    seating: &Seating,
    paths: &[Path],
    water: Option<[f64; 2]>,
    draw: &mut impl FnMut() -> f64,
) -> Basin {
    let corners = corners_of(area, seating);
    let held = corners.iter().map(|&corner| distance(corner, area.at) + BASIN_ROOM_M).fold(area.radius, f64::max);
    let bowl = held.max(area.radius + BASIN_ROOM_M);
    let disc = |radius: f64| [area.at[0], area.at[1], area.at[0], area.at[1], radius];
    let floors = match area.kind {
        AreaKind::Farm => vec![field(area, run_of(area, seating).unwrap_or_else(|| drawn_way(draw)), &corners)],
        AreaKind::Mill => vec![field(area, water.unwrap_or_else(|| drawn_way(draw)), &corners)],
        AreaKind::Hamlet => lobed(area, seating, held, draw),
        AreaKind::Wilds | AreaKind::Arena => clustered(area, held, draw),
        AreaKind::Ruin => broken(area, held, draw),
        _ => vec![disc(bowl)],
    };
    let terraces = match area.kind {
        AreaKind::Graveyard => shelves(area, seating, paths, bowl, draw),
        AreaKind::Keep => {
            let reach = corners.iter().map(|&corner| distance(corner, area.at) + PLATFORM_ROOM_M);
            platform(area, seating, paths, (reach.fold(KEEP_PLATFORM_M, f64::max), KEEP_SHARE), draw)
        }
        AreaKind::Camp => {
            let half = crate::pieces::palisade_radius(area) + PLATFORM_ROOM_M;
            platform(area, seating, paths, (half, CAMP_SHARE), draw)
        }
        _ => Vec::new(),
    };
    Basin { floors, terraces }
}

/// A way drawn at chance, for a field whose own way is not known.
fn drawn_way(draw: &mut impl FnMut() -> f64) -> [f64; 2] {
    let (sine, cosine) = sin_cos(draw() * PI);
    [cosine, sine]
}

/// The corners of the buildings whose middles stand in an area's reach.
fn corners_of(area: &Area, seating: &Seating) -> Vec<[f64; 2]> {
    seating
        .buildings
        .iter()
        .map(|building| building.footprint)
        .filter(|print| distance(middle_of(*print), area.at) <= area.radius)
        .flat_map(|[west, north, east, south]| [[west, north], [east, north], [east, south], [west, south]])
        .collect()
}

fn middle_of([west, north, east, south]: [f64; 4]) -> [f64; 2] {
    [(west + east) / 2.0, (north + south) / 2.0]
}

/// The way a farm's yards and buildings run: the main axis of their spread over its reach, or None where they spread
/// about as far one way as any other.
fn run_of(area: &Area, seating: &Seating) -> Option<[f64; 2]> {
    let buildings = seating.buildings.iter().map(|building| middle_of(building.footprint));
    let points: Vec<[f64; 2]> = seating
        .tiles
        .iter()
        .map(|tile| tile.at)
        .chain(buildings)
        .filter(|&at| distance(at, area.at) <= area.radius)
        .collect();
    if points.len() < 3 {
        return None;
    }
    let count = points.len() as f64;
    let mean = points.iter().fold([0.0, 0.0], |sum, at| [sum[0] + at[0] / count, sum[1] + at[1] / count]);
    let (across, down, both) = points.iter().fold((0.0, 0.0, 0.0), |(across, down, both), at| {
        let (east, south) = (at[0] - mean[0], at[1] - mean[1]);
        (across + east * east, down + south * south, both + east * south)
    });
    let lean = ((across - down) * (across - down) + 4.0 * both * both).sqrt();
    if lean < 0.1 * (across + down) {
        return None;
    }
    let (sine, cosine) = sin_cos(0.5 * libm::atan2(2.0 * both, across - down));
    Some([cosine, sine])
}

/// A long straight-sided field along `axis` (a unit vector) through an area's middle: as wide as its reach and the room
/// round its buildings, and `FIELD_LONG` times as long or longer.
fn field(area: &Area, axis: [f64; 2], corners: &[[f64; 2]]) -> [f64; 5] {
    let offset = |corner: [f64; 2]| {
        let (east, south) = (corner[0] - area.at[0], corner[1] - area.at[1]);
        (east * axis[0] + south * axis[1], south * axis[0] - east * axis[1])
    };
    let half = corners.iter().map(|&corner| offset(corner).1.abs() + BASIN_ROOM_M).fold(area.radius, f64::max);
    let room = |corner: [f64; 2]| offset(corner).0.abs() + BASIN_ROOM_M - half;
    let length = corners.iter().map(|&corner| room(corner)).fold(half * (FIELD_LONG - 1.0), f64::max);
    let (east, south) = (axis[0] * length, axis[1] * length);
    [area.at[0] - east, area.at[1] - south, area.at[0] + east, area.at[1] + south, half]
}

/// A hamlet's main bowl and a lobe from it toward each block it stands, so its ways out turn between rock.
fn lobed(area: &Area, seating: &Seating, held: f64, draw: &mut impl FnMut() -> f64) -> Vec<[f64; 5]> {
    let mut floors = vec![[area.at[0], area.at[1], area.at[0], area.at[1], held]];
    for block in seating.blocks.iter().filter(|block| distance(block.at, area.at) <= area.radius) {
        let off = distance(block.at, area.at);
        let toward = if off > 1e-6 {
            [(block.at[0] - area.at[0]) / off, (block.at[1] - area.at[1]) / off]
        } else {
            let (sine, cosine) = sin_cos(draw() * TAU);
            [sine, -cosine]
        };
        let out = held + LOBE_OUT_M - LOBE_HALF_M;
        floors.push([area.at[0], area.at[1], area.at[0] + toward[0] * out, area.at[1] + toward[1] * out, LOBE_HALF_M]);
    }
    floors
}

/// The wilds' bowl holding their reach, and three to five bowls of different sizes round it, standing out of it at
/// their own bearings, so a fight there has corners and lines of sight.
fn clustered(area: &Area, held: f64, draw: &mut impl FnMut() -> f64) -> Vec<[f64; 5]> {
    let mut floors = vec![[area.at[0], area.at[1], area.at[0], area.at[1], held]];
    let count = 3 + (draw() * 3.0) as usize;
    let start = draw() * TAU;
    for bowl in 0..count {
        let bearing = start + TAU * (bowl as f64 + 0.3 * (draw() - 0.5)) / count as f64;
        let radius = held * (0.35 + 0.35 * draw());
        let reach = held * (1.15 + 0.3 * draw());
        let (sine, cosine) = sin_cos(bearing);
        let middle = [area.at[0] + sine * (reach - radius), area.at[1] - cosine * (reach - radius)];
        floors.push([middle[0], middle[1], middle[0], middle[1], radius]);
    }
    floors
}

/// A ruin's bowl, broken: five or six capsules out from its middle, their sides parting past its reach so spurs of
/// rock run in between them to its edge.
fn broken(area: &Area, held: f64, draw: &mut impl FnMut() -> f64) -> Vec<[f64; 5]> {
    let mut floors = vec![[area.at[0], area.at[1], area.at[0], area.at[1], held]];
    let count = 5 + usize::from(draw() < 0.5);
    let start = draw() * TAU;
    let (half_sine, _) = sin_cos(PI / count as f64);
    let half = held * half_sine * 0.95;
    let out = held + RUIN_OUT_M - half;
    for petal in 0..count {
        let (sine, cosine) = sin_cos(start + TAU * petal as f64 / count as f64);
        floors.push([area.at[0], area.at[1], area.at[0] + sine * out, area.at[1] - cosine * out, half]);
    }
    floors
}

/// How long a ramp runs to a terrace at a share of the massif's height, metres.
fn ramp_run(share: f64) -> f64 {
    share * TALLEST_LEVEL_M / RAMP_STEEPEST
}

/// Whether a terrace or ramp `[from, to]` of `half` keeps clear of every way, with the way's walked width and room
/// past its edge.
fn off_ways(paths: &[Path], from: [f64; 2], to: [f64; 2], half: f64) -> bool {
    paths.iter().all(|path| {
        let room = half + TERRACE_EDGE_M + path.tier.width() / 2.0 + 1.5;
        path.points.windows(2).all(|pair| segments_apart([from, to], [pair[0], pair[1]]) > room)
    })
}

/// Whether no building stands across a terrace's edge: each wholly on its level, or clear of its edge.
fn none_across(seating: &Seating, from: [f64; 2], to: [f64; 2], half: f64) -> bool {
    seating.buildings.iter().all(|building| {
        let [west, north, east, south] = building.footprint;
        let on = [[west, north], [east, north], [east, south], [west, south]]
            .iter()
            .all(|&corner| off_line(corner, from, to) <= half - 1.0);
        on || rect_off_line(building.footprint, from, to) > half + TERRACE_EDGE_M + 1.0
    })
}

/// A graveyard's one or two shelves, each a level capsule lying along its bowl's rim with a ramp running on from one
/// of its ends along the rim down to the floor: the outermost that keep off the ways, other shelves and every solid,
/// and cut through no building.
fn shelves(area: &Area, seating: &Seating, paths: &[Path], bowl: f64, draw: &mut impl FnMut() -> f64) -> Vec<[f64; 7]> {
    let count = 1 + usize::from(draw() < 0.5);
    let start = draw() * TAU;
    let run = ramp_run(SHELF_SHARE);
    let reach = bowl - TERRACE_EDGE_M - RAMP_HALF_M;
    let furthest = (reach * reach - (SHELF_END_M + run) * (SHELF_END_M + run)).max(0.0).sqrt();
    // Each shelf at a bearing and a step in from the rim, with its ramp off one end or the other.
    let candidates =
        (0..4).flat_map(|inward| (0..16).flat_map(move |bearing| [(inward, bearing, -1.0), (inward, bearing, 1.0)]));
    let made = candidates.map(|(inward, bearing, side)| {
        let (sine, cosine) = sin_cos(start + TAU * f64::from(bearing) / 16.0);
        let (out, along) = ([sine, -cosine], [cosine, sine]);
        let middle = furthest - 10.0 * f64::from(inward);
        let at = |along_m: f64| {
            [area.at[0] + out[0] * middle + along[0] * along_m, area.at[1] + out[1] * middle + along[1] * along_m]
        };
        let (first, last) = (at(-SHELF_END_M), at(SHELF_END_M));
        let (top, foot) = (at(side * (SHELF_END_M - 2.0)), at(side * (SHELF_END_M + run)));
        (
            [first[0], first[1], last[0], last[1], SHELF_HALF_M, SHELF_SHARE, SHELF_SHARE],
            [foot[0], foot[1], top[0], top[1], RAMP_HALF_M, 0.0, SHELF_SHARE],
        )
    });
    let made: Vec<([f64; 7], [f64; 7])> = made.collect();
    let mut terraces: Vec<[f64; 7]> = Vec::new();
    for _ in 0..count {
        let fits = |&&(shelf, ramp): &&([f64; 7], [f64; 7])| {
            let ([first, last], [foot, top]) = (ends(shelf), ends(ramp));
            let apart = terraces.iter().all(|other| {
                let room = other[4] + SHELF_HALF_M + 2.0 * TERRACE_EDGE_M + 4.0;
                segments_apart([first, last], ends(*other)) > room && segments_apart([foot, top], ends(*other)) > room
            });
            apart
                && off_ways(paths, first, last, SHELF_HALF_M)
                && off_ways(paths, foot, top, RAMP_HALF_M)
                && none_across(seating, first, last, SHELF_HALF_M)
                && seating
                    .buildings
                    .iter()
                    .all(|building| rect_off_line(building.footprint, foot, top) > RAMP_HALF_M + TERRACE_EDGE_M + 1.0)
                && seating
                    .solids
                    .iter()
                    .all(|solid| off_line([solid.at[0], solid.at[1]], foot, top) > RAMP_HALF_M + TERRACE_EDGE_M)
        };
        if let Some(&(shelf, ramp)) = made.iter().find(fits) {
            terraces.extend([shelf, ramp]);
        }
    }
    terraces
}

/// A capsule's two ends.
fn ends(capsule: [f64; 7]) -> [[f64; 2]; 2] {
    [[capsule[0], capsule[1]], [capsule[2], capsule[3]]]
}

/// A level platform round an area's middle (`half` its reach, `share` its level), with a ramp up to it wherever a way
/// crosses its edge or ends short of it, or else one toward the nearest way; none where a building stands across its
/// edge.
fn platform(
    area: &Area,
    seating: &Seating,
    paths: &[Path],
    (half, share): (f64, f64),
    draw: &mut impl FnMut() -> f64,
) -> Vec<[f64; 7]> {
    let middle = area.at;
    if !none_across(seating, middle, middle, half) {
        return Vec::new();
    }
    let run = ramp_run(share);
    let mut terraces = vec![[middle[0], middle[1], middle[0], middle[1], half, share, share]];
    let unit = |from: [f64; 2], to: [f64; 2]| {
        let length = distance(from, to).max(1e-9);
        [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
    };
    // A ramp from `run` metres out along `out` up to just inside the edge at `edge`, unless one already arrives there
    // along the same way: two ways meeting the edge side by side from different bearings each climb their own.
    let ramp = |terraces: &mut Vec<[f64; 7]>, edge: [f64; 2], out: [f64; 2]| {
        let foot = [edge[0] + out[0] * run, edge[1] + out[1] * run];
        let top = [edge[0] - out[0] * 2.0, edge[1] - out[1] * 2.0];
        let served = terraces[1..].iter().any(|other| {
            let along = unit([other[0], other[1]], [other[2], other[3]]);
            distance([other[2], other[3]], top) <= 2.0 * RAMP_HALF_M
                && -(along[0] * out[0] + along[1] * out[1]) >= SAME_WAY
        });
        if !served {
            terraces.push([foot[0], foot[1], top[0], top[1], RAMP_HALF_M, 0.0, share]);
        }
    };
    for path in paths {
        for pair in path.points.windows(2) {
            let (inside, outside) = match (distance(pair[0], middle) < half, distance(pair[1], middle) < half) {
                (true, false) => (pair[0], pair[1]),
                (false, true) => (pair[1], pair[0]),
                _ => continue,
            };
            // Where the way crosses the edge: |inside + t (outside - inside) - middle| = half, t in 0..1.
            let span = [outside[0] - inside[0], outside[1] - inside[1]];
            let from = [inside[0] - middle[0], inside[1] - middle[1]];
            let (square, along) = (span[0] * span[0] + span[1] * span[1], from[0] * span[0] + from[1] * span[1]);
            let rest = from[0] * from[0] + from[1] * from[1] - half * half;
            let share_of = (-along + (along * along - square * rest).max(0.0).sqrt()) / square.max(1e-9);
            ramp(
                &mut terraces,
                [inside[0] + span[0] * share_of, inside[1] + span[1] * share_of],
                unit(inside, outside),
            );
        }
        for end in [path.points.first(), path.points.last()].into_iter().flatten() {
            let off = distance(*end, middle);
            if off > half && off <= half + run {
                let out = unit(middle, *end);
                ramp(&mut terraces, [middle[0] + out[0] * half, middle[1] + out[1] * half], out);
            }
        }
    }
    if terraces.len() == 1 {
        let nearest = paths
            .iter()
            .flat_map(|path| path.points.iter().copied())
            .min_by(|first, second| distance(*first, middle).total_cmp(&distance(*second, middle)));
        let out = nearest.filter(|&at| distance(at, middle) > 1e-6).map_or_else(
            || {
                let (sine, cosine) = sin_cos(draw() * TAU);
                [sine, -cosine]
            },
            |at| unit(middle, at),
        );
        ramp(&mut terraces, [middle[0] + out[0] * half, middle[1] + out[1] * half], out);
    }
    terraces
}

/// Rows of headstones along each of a graveyard's shelves, on the land as carved (`headstones`): every shelf holds
/// graves, whatever its block stood there.
pub fn graves(kit: &mut Kit, terraces: &[[f64; 7]], carved: &Sculpts) {
    let ramps: Vec<[[f64; 2]; 2]> =
        terraces.iter().filter(|terrace| terrace[5] == 0.0).map(|ramp| ends(*ramp)).collect();
    let shelves = terraces.iter().filter(|terrace| terrace[5] == SHELF_SHARE && terrace[6] == SHELF_SHARE);
    for &shelf in shelves {
        let (seed, mut draws) = (kit.seed, kit.draws);
        let stones = {
            let mut draw = || {
                draws += 1;
                land::exact::rand01(seed, &[draws])
            };
            headstones(shelf, &ramps, kit.into, &mut draw)
        };
        kit.draws = draws;
        for mut stone in stones {
            stone.at[2] = carved_at(kit, carved, [stone.at[0], stone.at[1]]) - 0.25;
            kit.solid(stone);
        }
    }
}

/// A shelf's headstones, their bases at 0: rows along it either side of a lane down its middle from where its ramp
/// arrives, weathered askew and a few fallen away, none standing in a building, a prop, a solid or on a ramp.
fn headstones(
    shelf: [f64; 7],
    ramps: &[[[f64; 2]; 2]],
    seating: &Seating,
    draw: &mut impl FnMut() -> f64,
) -> Vec<Solid> {
    let [first, last] = ends(shelf);
    let length = distance(first, last);
    let along = [(last[0] - first[0]) / length, (last[1] - first[1]) / length];
    let across = [-along[1], along[0]];
    let solids =
        seating.solids.iter().filter(|solid| off_line([solid.at[0], solid.at[1]], first, last) < shelf[4] + 30.0).map(
            |solid| {
                let [west, north, east, south, ..] = solid.bounds();
                [west, north, east, south]
            },
        );
    let footprints = seating.buildings.iter().chain(&seating.props).map(|seated| seated.footprint);
    let standing: Vec<[f64; 4]> =
        footprints.chain(solids).filter(|&print| rect_off_line(print, first, last) < shelf[4] + 1.0).collect();
    let clear = |stone: &Solid| {
        let [west, north, east, south, ..] = stone.bounds();
        let meets = |print: &[f64; 4]| print[0] < east && print[2] > west && print[1] < south && print[3] > north;
        let on_ramp =
            |&[foot, top]: &[[f64; 2]; 2]| off_line([stone.at[0], stone.at[1]], foot, top) <= RAMP_HALF_M + 0.5;
        !standing.iter().any(meets) && !ramps.iter().any(on_ramp)
    };
    let mut stones = Vec::new();
    let mut step = GRAVE_EVERY_M / 2.0;
    while step < length {
        for row in GRAVE_ROWS_M {
            if draw() < 0.25 {
                continue;
            }
            let at = [first[0] + along[0] * step + across[0] * row, first[1] + along[1] * step + across[1] * row];
            let stone = Solid::upright(Shape::Block, [at[0], at[1], 0.0], [0.7, 0.22, 1.1], Material::Stone);
            let lean = (draw() - 0.5) * 0.16;
            let stone = Solid { lean, ..stone.turned(turn_along(across)) };
            if clear(&stone) {
                stones.push(stone);
            }
        }
        step += GRAVE_EVERY_M;
    }
    stones
}

/// Lifts what stands on a terrace or its ramp (or within its edge's fall) onto the land as carved there, `raised` being
/// how far the carving raises the land at a point and `floor` whether the carving makes a point floor: a building
/// whole, with its pad, plinth, rooms and walls and all in its footprint, by the raise at its middle, and every other
/// prop and solid by the raise under it. A raised floor's edge wanders out past its reach as a floor's does, and what
/// stands where it has wandered is on it too.
pub fn seat_on_terraces(
    seating: &mut Seating,
    terraces: &[[f64; 7]],
    raised: &dyn Fn([f64; 2]) -> f64,
    floor: &dyn Fn([f64; 2]) -> bool,
) {
    let on = |at: [f64; 2]| {
        terraces.iter().any(|&[x1, y1, x2, y2, half, ..]| {
            let off = off_line(at, [x1, y1], [x2, y2]);
            off <= half + TERRACE_EDGE_M || (off <= half * (1.0 + land::sculpts::WANDER) + TERRACE_EDGE_M && floor(at))
        })
    };
    let mut lifted: Vec<([f64; 4], f64)> = Vec::new();
    for building in &mut seating.buildings {
        let middle = middle_of(building.footprint);
        if on(middle) {
            let by = raised(middle);
            building.at[2] += by;
            lifted.push((building.footprint, by));
        }
    }
    let within = |[west, north, east, south]: [f64; 4], at: [f64; 2]| {
        at[0] >= west && at[0] <= east && at[1] >= north && at[1] <= south
    };
    let by_at = |at: [f64; 2]| {
        lifted.iter().find(|(print, _)| within(*print, at)).map(|&(_, by)| by).or_else(|| on(at).then(|| raised(at)))
    };
    for pad in &mut seating.pads {
        if let Some(&(_, by)) = lifted.iter().find(|(print, _)| *print == pad.bounds) {
            pad.level += by;
        }
    }
    for solid in seating.solids.iter_mut().chain(seating.rooms.iter_mut()) {
        if let Some(by) = by_at([solid.at[0], solid.at[1]]) {
            solid.at[2] += by;
        }
    }
    for prop in &mut seating.props {
        if let Some(by) = by_at([prop.at[0], prop.at[1]]) {
            prop.at[2] += by;
        }
    }
    for wall in &mut seating.walls {
        let middle = middle_of([wall[0], wall[1], wall[2], wall[3]]);
        if let Some(&(_, by)) = lifted.iter().find(|(print, _)| within(*print, middle)) {
            wall[4] += by;
            wall[5] += by;
        }
    }
}

#[cfg(test)]
#[path = "basins_tests.rs"]
mod tests;
