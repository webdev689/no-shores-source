//! What lines a layout's ways, so walking them reads as a land travelled: a signpost where a way leaves each place,
//! a milestone every so often between the places and now and then a scene by the way (a cart broken down with its
//! crates, a fallen log, a cold campfire with a log to sit on, a heap of stones); lanterns on posts along the ways
//! into a settlement; and drystone walls along the tracks out of the farms and hamlets. All of it beside the way,
//! clear of every other way and of what already stands. And, once the ways are laid, a shrine's ring of standing
//! stones, which keeps off them.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::{Path, Tier, off_line};
use crate::pieces::{Kit, ahead, fire, lantern, model, turn_along, yaw_toward};
use crate::rocks::stone;
use city::solids::{Material, Shape, Solid};
use std::f64::consts::TAU;

/// How far apart a way's samples, milestones, scenes and lanterns lie along it, metres.
const STEP_M: f64 = 2.0;
const MILESTONE_EVERY_M: f64 = 160.0;
const SCENE_EVERY_M: f64 = 130.0;
const LANTERN_EVERY_M: f64 = 42.0;
/// How far past a settlement's reach its lanterns and its drystone walls run, metres.
const LANTERN_REACH_M: f64 = 70.0;
pub(crate) const WALL_REACH_M: f64 = 170.0;
/// A drystone wall's length a stretch and how far it stands off the track's edge, metres.
const WALL_STRETCH_M: f64 = 8.0;
pub(crate) const WALL_OFF_M: f64 = 3.5;
/// A drystone wall's thickness, metres.
pub(crate) const DRYSTONE_M: f64 = 0.8;

/// Places with folk living or working in them, lit along their ways.
const fn settled(kind: AreaKind) -> bool {
    matches!(
        kind,
        AreaKind::Hamlet
            | AreaKind::Farm
            | AreaKind::Keep
            | AreaKind::Landing
            | AreaKind::Camp
            | AreaKind::Dock
            | AreaKind::Mill
    )
}

/// A path's samples every STEP_M: each point and the unit way the path runs there.
pub(crate) fn samples(path: &Path) -> Vec<([f64; 2], [f64; 2])> {
    let mut found = Vec::new();
    let mut carried = 0.0;
    for pair in path.points.windows(2) {
        let length = distance(pair[0], pair[1]);
        if length < 1e-6 {
            continue;
        }
        let way = [(pair[1][0] - pair[0][0]) / length, (pair[1][1] - pair[0][1]) / length];
        let mut step = STEP_M - carried;
        while step <= length {
            found.push(([pair[0][0] + way[0] * step, pair[0][1] + way[1] * step], way));
            step += STEP_M;
        }
        carried = length - (step - STEP_M);
    }
    found
}

/// A point `out` metres to a side of a way (positive to its left).
pub(crate) fn beside(at: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [at[0] - way[1] * out, at[1] + way[0] * out]
}

/// Whether a point stands clear of the other ways by `margin` past their edges, and of everything seated by it.
fn clear(kit: &Kit, others: &[&Path], at: [f64; 2], margin: f64) -> bool {
    let off_ways = others.iter().all(|other| {
        let reach = other.tier.width() / 2.0 + margin;
        other.points.windows(2).all(|pair| off_line(at, pair[0], pair[1]) > reach)
    });
    let seats = kit.into.buildings.iter().chain(kit.into.props.iter());
    let off_seats = seats.map(|seated| seated.footprint).all(|[west, north, east, south]| {
        at[0] < west - margin || at[0] > east + margin || at[1] < north - margin || at[1] > south + margin
    });
    off_ways && off_seats && kit.dry(at)
}

/// Whether a point keeps at least `at_least` metres off a way's middle line, all along it: a post set beside one
/// stretch can lie on another where the way bends.
fn off_way(path: &Path, at: [f64; 2], at_least: f64) -> bool {
    path.points.windows(2).all(|pair| off_line(at, pair[0], pair[1]) >= at_least)
}

/// Dresses every way of a layout, and rings each shrine with its stones, where no module (`moduled`) stands in its
/// place.
pub fn dress(kit: &mut Kit, areas: &[Area], paths: &[Path], moduled: &[bool]) {
    for (number, path) in paths.iter().enumerate() {
        let others: Vec<&Path> =
            paths.iter().enumerate().filter(|(other, _)| *other != number).map(|(_, other)| other).collect();
        along(kit, areas, path, &others);
    }
    let all: Vec<&Path> = paths.iter().collect();
    for (area, _) in areas.iter().zip(moduled.iter().chain(std::iter::repeat(&false))).filter(|(_, module)| !**module) {
        match area.kind {
            AreaKind::Shrine => stone_ring(kit, area, &all),
            AreaKind::Farm => fold(kit, area, &all),
            _ => {}
        }
    }
}

/// How far from an area's middle what is seated about it reaches, metres.
fn seated_rim(kit: &Kit, area: &Area) -> f64 {
    let near = area.radius * 0.7;
    let seats = kit.into.buildings.iter().chain(kit.into.props.iter()).map(|seated| seated.footprint);
    seats
        .filter(|&[west, north, east, south]| distance([(west + east) / 2.0, (north + south) / 2.0], area.at) < near)
        .flat_map(|[west, north, east, south]| [[west, north], [east, north], [east, south], [west, south]])
        .map(|corner| distance(corner, area.at))
        .fold(0.0, f64::max)
}

/// A fold's length along its bearing from its farm and its width, its gate's width and its walls' thickness, metres.
const FOLD_M: [f64; 2] = [12.0, 9.0];
const FOLD_GATE_M: f64 = 2.4;
const FOLD_WALL_M: f64 = 0.7;

/// A farm's fold for its stock: a pen of drystone beyond what is seated at its middle, by the way in where it can be,
/// its gate toward the farm, on level ground clear of every way, of what is seated and of what stands; none where no
/// such ground lies near.
fn fold(kit: &mut Kit, area: &Area, ways: &[&Path]) {
    let rim = seated_rim(kit, area);
    // Tried first beside where the first way comes in, so it is seen on arriving, then round both ways from there.
    let entry = ways.iter().find_map(|way| {
        let inside = way.points.iter().filter(|&&at| distance(at, area.at) <= area.radius);
        inside.copied().max_by(|first, second| distance(*first, area.at).total_cmp(&distance(*second, area.at)))
    });
    let start = entry.map_or_else(|| kit.draw() * TAU, |at| libm::atan2(at[0] - area.at[0], area.at[1] - at[1]));
    let [long, wide] = [FOLD_M[0] / 2.0, FOLD_M[1] / 2.0];
    let spot = (0..24).find_map(|attempt| {
        let turn = f64::from((attempt % 12 + 1) / 2) * if attempt % 2 == 1 { 1.0 } else { -1.0 };
        let toward = ahead([0.0, 0.0], [0.0, -1.0], 1.0, start + turn * TAU / 12.0);
        let middle = ahead(area.at, toward, rim + 10.0 + f64::from(attempt / 12) * 10.0, 0.0);
        let across = [-toward[1], toward[0]];
        let at = |along: f64, side: f64| ahead(ahead(middle, toward, along, 0.0), across, side, 0.0);
        let points = [-1.0, 0.0, 1.0].map(|along| [-1.0, 0.0, 1.0].map(|side| at(along * long, side * wide)));
        let heights = points.as_flattened().iter().map(|&point| kit.height(point));
        let (low, high) =
            heights.fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), each| (low.min(each), high.max(each)));
        let reach = long + 1.5;
        let middle_off = |solid: &Solid| {
            let [west, north, east, south, ..] = solid.bounds();
            middle[0] < west - reach
                || middle[0] > east + reach
                || middle[1] < north - reach
                || middle[1] > south + reach
        };
        let open = points.as_flattened().iter().all(|&point| clear(kit, ways, point, 3.0))
            && kit.into.solids.iter().all(middle_off);
        (high - low < 0.4 && open).then_some((across, at(-long, 0.0), at(long, 0.0)))
    });
    let Some((across, near, far)) = spot else { return };
    let side = |from: [f64; 2], out: f64| ahead(from, across, out, 0.0);
    let gate = FOLD_GATE_M / 2.0;
    let sides = [
        [side(near, -wide), side(near, -gate)],
        [side(near, gate), side(near, wide)],
        [side(far, -wide), side(far, wide)],
        [side(near, -wide), side(far, -wide)],
        [side(near, wide), side(far, wide)],
    ];
    let high = 1.0 + kit.draw() * 0.3;
    for [from, to] in sides {
        let mut lengths = Vec::new();
        crate::halls::wall(&mut lengths, from, to, 0.0, high, FOLD_WALL_M, Material::Rubble);
        for length in lengths {
            let [west, north, east, south, ..] = length.bounds();
            if crate::paths::clear_of([west, north, east, south], ways.iter().copied()) {
                kit.solid(on_ground(kit, length));
            }
        }
    }
}

/// How many stones a shrine's ring stands, and how far past the corners of what it rings, metres.
const RING_STONES: u32 = 12;
const RING_PAST_M: f64 = 6.0;

/// A shrine's ring of standing stones round the largest thing seated about its middle (a shrine is standing stones
/// round an altar), a few leaning, every fifth fallen; none on a way or on what is seated.
fn stone_ring(kit: &mut Kit, area: &Area, ways: &[&Path]) {
    // Round the largest thing seated about the middle (the shrine's mound or altar), not the middle itself.
    let near = area.radius * 0.7;
    let seats = kit.into.buildings.iter().chain(kit.into.props.iter()).map(|seated| seated.footprint);
    let middle_of = |[west, north, east, south]: [f64; 4]| [(west + east) / 2.0, (north + south) / 2.0];
    let size = |[west, north, east, south]: [f64; 4]| (east - west) * (south - north);
    let largest =
        seats.filter(|&print| distance(middle_of(print), area.at) < near).max_by(|a, b| size(*a).total_cmp(&size(*b)));
    let (centre, radius) = largest.map_or((area.at, 10.0), |print @ [west, north, east, south]| {
        (middle_of(print), (0.5 * libm::hypot(east - west, south - north) + RING_PAST_M).min(area.radius * 0.6))
    });
    let start = kit.draw() * TAU;
    for number in 0..RING_STONES {
        let angle = start + f64::from(number) * TAU / f64::from(RING_STONES) + (kit.draw() - 0.5) * 0.15;
        let at = ahead(centre, [0.0, -1.0], radius, angle);
        let size = [1.1 + kit.draw() * 0.4, 0.7 + kit.draw() * 0.2, 2.6 + kit.draw() * 1.6];
        let lean = (kit.draw() - 0.5) * 0.12;
        if !clear(kit, ways, at, 2.0) {
            continue;
        }
        if number % 5 == 2 {
            kit.stand(Shape::Block, at, [size[1] + 0.3, size[2], size[1]], angle, Material::Stone, 0.3);
        } else {
            let base = kit.height(at) - 0.5;
            let upright = Solid::upright(Shape::Block, [at[0], at[1], base], size, Material::Stone).turned(angle);
            kit.solid(Solid { lean, ..upright });
        }
    }
}

/// Walks one way, dressing it as it goes.
fn along(kit: &mut Kit, areas: &[Area], path: &Path, others: &[&Path]) {
    let edge = path.tier.width() / 2.0;
    let mut was_in: Option<usize> = None;
    let (mut since_mile, mut since_scene, mut since_lantern, mut since_wall) = (0.0, 0.0, LANTERN_EVERY_M, 0.0);
    let mut next_scene = SCENE_EVERY_M * (0.6 + kit.draw() * 0.8);
    let mut lantern_side = 1.0;
    for (at, way) in samples(path) {
        let within = areas.iter().position(|area| distance(area.at, at) < area.radius);
        if within.is_some() != was_in.is_some() {
            // Leaving a place a signpost faces on along the way; reaching one, it faces back along it.
            let facing = if within.is_none() { way } else { [-way[0], -way[1]] };
            let post = beside(at, way, edge + 1.2);
            if clear(kit, others, post, 1.0) && off_way(path, post, edge + 1.0) {
                let sign = kit.pick(&model::SIGNPOSTS);
                kit.prop(sign, post, yaw_toward(facing));
            }
        }
        was_in = within;
        let near = |reach: f64, wanted: fn(AreaKind) -> bool| {
            areas.iter().any(|area| wanted(area.kind) && distance(area.at, at) < area.radius + reach)
        };
        since_lantern += STEP_M;
        if since_lantern >= LANTERN_EVERY_M && near(LANTERN_REACH_M, settled) {
            let post = beside(at, way, (edge + 1.4) * lantern_side);
            if clear(kit, others, post, 1.0) && off_way(path, post, edge + 1.1) {
                lantern(kit, post, 2.8);
                since_lantern = 0.0;
                lantern_side = -lantern_side;
            }
        }
        since_wall += STEP_M;
        let walled = |kind| matches!(kind, AreaKind::Hamlet | AreaKind::Farm);
        if within.is_none() && path.tier == Tier::Track && since_wall >= WALL_STRETCH_M && near(WALL_REACH_M, walled) {
            since_wall = 0.0;
            for side in [-1.0, 1.0] {
                let stretch = beside(at, way, (edge + WALL_OFF_M) * side);
                if off_way(path, stretch, edge + WALL_OFF_M - 0.5) {
                    let ways: Vec<&Path> = others.iter().copied().chain(std::iter::once(path)).collect();
                    drystone(kit, &ways, others, stretch, way);
                }
            }
        }
        if within.is_some() {
            continue;
        }
        since_mile += STEP_M;
        since_scene += STEP_M;
        if since_mile >= MILESTONE_EVERY_M {
            let stone_at = beside(at, way, -(edge + 0.8));
            if clear(kit, others, stone_at, 0.8) && off_way(path, stone_at, edge + 0.6) {
                kit.stand(
                    Shape::Pyramid { top: 0.7 },
                    stone_at,
                    [0.5, 0.34, 1.05],
                    turn_along(way),
                    Material::Stone,
                    0.2,
                );
                since_mile = 0.0;
            }
        }
        if since_scene >= next_scene {
            let side = if kit.draw() < 0.5 { 1.0 } else { -1.0 };
            let middle = beside(at, way, (edge + 5.0) * side);
            if clear(kit, others, middle, 4.0) && off_way(path, middle, edge + 3.0) {
                scene(kit, middle, way);
                since_scene = 0.0;
                next_scene = SCENE_EVERY_M * (0.6 + kit.draw() * 0.8);
            }
        }
    }
}

/// A length of wall (laid along its own y) on the ground under it: its foot sunk 0.25 m under the lower of its ends
/// and its middle, and as much taller as the ground rises along it, so neither end hangs nor sinks out of sight.
fn on_ground(kit: &Kit, mut length: Solid) -> Solid {
    let reach = length.size[1] / 2.0;
    let heights = [-reach, 0.0, reach].map(|along| {
        let [x, y, _] = length.place([0.0, along, 0.0]);
        kit.height([x, y])
    });
    let (low, high) =
        heights.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), &each| (low.min(each), high.max(each)));
    length.at[2] = low - 0.25;
    length.size[2] += high - low;
    length
}

/// One stretch of drystone wall along a way, broken now and then by a gap, a field's gate or its fall.
fn drystone(kit: &mut Kit, ways: &[&Path], others: &[&Path], at: [f64; 2], way: [f64; 2]) {
    if kit.draw() < 0.18 || !clear(kit, others, at, WALL_STRETCH_M / 2.0) {
        return;
    }
    let high = 1.0 + kit.draw() * 0.35;
    // In lengths whose boxes keep close to the wall, each left out where its box would reach onto a way.
    let reach = (WALL_STRETCH_M + 0.3) / 2.0;
    let (from, to) =
        ([at[0] - way[0] * reach, at[1] - way[1] * reach], [at[0] + way[0] * reach, at[1] + way[1] * reach]);
    let mut lengths = Vec::new();
    crate::halls::wall(&mut lengths, from, to, 0.0, high, DRYSTONE_M, Material::Rubble);
    for length in lengths {
        let [west, north, east, south, ..] = length.bounds();
        if crate::paths::clear_of([west, north, east, south], ways.iter().copied()) {
            kit.solid(on_ground(kit, length));
        }
    }
    if kit.draw() < 0.25 {
        let fallen = beside(at, way, 0.9);
        let size = [0.6 + kit.draw() * 0.4, 0.5 + kit.draw() * 0.3, 0.3 + kit.draw() * 0.1];
        stone(kit, Shape::Pyramid { top: 0.5 }, [fallen[0], fallen[1], kit.height(fallen)], size, 0.3);
    }
}

/// A scene by the way: a cart broken down with its crates, a fallen log, a cold campfire with a log to sit on, or a
/// heap of stones.
fn scene(kit: &mut Kit, middle: [f64; 2], way: [f64; 2]) {
    let kind = kit.draw();
    if kind < 0.3 {
        let cart = kit.pick(&model::CARTS);
        let yaw = yaw_toward(way) + (kit.draw() - 0.5) * 50.0;
        kit.prop(cart, middle, yaw);
        for _ in 0..2 + (kit.draw() * 2.0) as u32 {
            let crate_at = beside(middle, [-way[1], way[0]], (kit.draw() - 0.5) * 5.0);
            let crate_at = [crate_at[0] + way[0] * 2.5, crate_at[1] + way[1] * 2.5];
            let model = kit.pick(&model::CRATES);
            let yaw = kit.draw() * 360.0;
            kit.prop(model, crate_at, yaw);
        }
    } else if kind < 0.55 {
        let yaw = kit.draw() * 360.0;
        kit.prop(model::LOG, middle, yaw);
    } else if kind < 0.8 {
        fire(kit, middle, 1.2);
        let seat = beside(middle, way, 2.2);
        kit.prop(model::LOG, seat, yaw_toward(way));
    } else {
        for _ in 0..3 + (kit.draw() * 3.0) as u32 {
            let at = [middle[0] + (kit.draw() - 0.5) * 4.0, middle[1] + (kit.draw() - 0.5) * 4.0];
            let size = [0.7 + kit.draw() * 1.2, 0.6 + kit.draw() * 1.0, 0.5 + kit.draw() * 0.9];
            stone(kit, Shape::Dome { sides: 6 }, [at[0], at[1], kit.height(at)], size, 0.35);
        }
    }
}
