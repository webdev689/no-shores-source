//! The rock fallen from a layout's cliffs and outcrops, in rubble: boulders and scree lying on the floor where each
//! face meets it, never up the face, so every stone rests on level ground as if it had rolled there, and never in what
//! a run built or on its climb. Scree is stepped over; a boulder is a box.

use crate::field::{distance, ring_holds};
use crate::paths::{Path, off_line};
use crate::pieces::Kit;
use crate::run_climbs::climb;
use crate::runs::Run;
use crate::seat::Seating;
use city::solids::{Material, Shape, Solid};
use land::sculpts::{Outcrop, Sculpts};

/// How far apart the heaps lie along a cliff's foot, and the share of them left bare, metres.
const HEAP_EVERY_M: f64 = 11.0;
const BARE_SHARE: f64 = 0.35;
/// How far rock keeps from a path's line, metres.
const PATH_CLEAR_M: f64 = 10.0;
/// How far rock keeps from a gorge's line, metres: its half-width (carve.rs) with a heap's lie and a body's way beside.
const GORGE_CLEAR_M: f64 = 22.0;
/// Scree is lower than a body steps over (collide.rs STEPPED_OVER_M).
const SCREE_TALLEST_M: f64 = 0.4;
/// The carving raises the floor no more than this where a face meets it, metres: a face's foot.
pub(crate) const FOOT_RISE_M: f64 = 0.3;

/// What fallen rock keeps clear of in a zone's runs, as boxes (west, north, east, south, bottom, top): each solid a run
/// built, and the ground its climb takes, whatever the height.
#[must_use]
pub(crate) fn kept_clear(built: &[Solid], runs: &[Run]) -> Vec<[f64; 6]> {
    let climbs = runs.iter().filter_map(climb).map(|climb| {
        let [west, north, east, south] = climb.print;
        [west, north, east, south, f64::NEG_INFINITY, f64::INFINITY]
    });
    built.iter().map(Solid::bounds).chain(climbs).collect()
}

/// Whether a solid is loose rock: rubble tipped as it fell (`stone`).
#[must_use]
pub(crate) fn loose(solid: &Solid) -> bool {
    solid.material == Material::Rubble && (solid.lean != 0.0 || solid.roll != 0.0)
}

/// Leaves out each loose stone laid from `from` on whose box meets one of `kept` (west, north, east, south, bottom,
/// top), so none lies in a run's stone or on its climb.
pub(crate) fn keep_off(seating: &mut Seating, from: usize, kept: &[[f64; 6]]) {
    let meets = |[west, north, east, south, bottom, top]: [f64; 6]| {
        kept.iter().any(|b| west < b[2] && b[0] < east && north < b[3] && b[1] < south && bottom < b[5] && b[4] < top)
    };
    let mut index = 0;
    seating.solids.retain(|solid| {
        index += 1;
        index <= from || !loose(solid) || !meets(solid.bounds())
    });
}

/// Whether a point lies within `clear` metres of a path's line.
fn near_path(paths: &[Path], at: [f64; 2], clear: f64) -> bool {
    paths.iter().any(|path| path.points.windows(2).any(|pair| off_line(at, pair[0], pair[1]) < clear))
}

/// A stone of rubble whose base stands at a point on the ground (`at`, its height the ground's there), sunk a share
/// of its height, turned at random and tipped up to `tip` radians either way.
pub fn stone(kit: &mut Kit, shape: Shape, at: [f64; 3], size: [f64; 3], tip: f64) {
    let base = at[2] - size[2] * 0.25;
    let turn = kit.draw() * std::f64::consts::TAU;
    let (lean, roll) = ((kit.draw() - 0.5) * 2.0 * tip, (kit.draw() - 0.5) * 2.0 * tip);
    let upright = Solid::upright(shape, [at[0], at[1], base], size, Material::Rubble).turned(turn);
    kit.solid(Solid { lean, roll, ..upright });
}

/// A stone fallen onto the floor at a point, on the ground as carved; none where the carving raises the land over its
/// floor, up a face, so every stone rests on level ground.
pub(crate) fn fallen(kit: &mut Kit, carved: &Sculpts, shape: Shape, at: [f64; 2], size: [f64; 3], tip: f64) {
    if raised(kit, carved, at) <= FOOT_RISE_M {
        let ground = crate::skyline::carved_at(kit, carved, at);
        stone(kit, shape, [at[0], at[1], ground], size, tip);
    }
}

/// How far the carving raises the land at a point over its nearest floor's level, metres: a terrace, a ramp or a
/// raised floor is floor, not face.
pub(crate) fn raised(kit: &Kit, carved: &Sculpts, at: [f64; 2]) -> f64 {
    carved.raise(at[0], at[1], kit.ground.coast.at(at[0], at[1])) - carved.floor_level(at[0], at[1])
}

/// A point `out` metres along `way` from `from`, and `side` metres across it.
fn off(from: [f64; 2], way: [f64; 2], out: f64, side: f64) -> [f64; 2] {
    [from[0] + way[0] * out - way[1] * side, from[1] + way[1] * out + way[0] * side]
}

/// Where a face meets the floor, walking from `from` along `way` (half a metre a step, `most` metres at the most) to
/// the first point the carving no longer raises; none if the walk never leaves the face.
fn foot_of(kit: &Kit, carved: &Sculpts, from: [f64; 2], way: [f64; 2], most: f64) -> Option<[f64; 2]> {
    let mut along = 0.0;
    while along <= most {
        let at = off(from, way, along, 0.0);
        if raised(kit, carved, at) < FOOT_RISE_M {
            return Some(at);
        }
        along += 0.5;
    }
    None
}

/// Talus along the section's edge, walked at even steps, a heap where each cliff's foot is; never on a path, nor at
/// the foot of a gorge's walls (`gorges`, each a line out of its gate).
pub fn talus(kit: &mut Kit, ring: &[[f64; 2]], (paths, gorges): (&[Path], &[Path]), carved: &Sculpts) {
    let mut carried = 0.0;
    for (at, &from) in ring.iter().enumerate() {
        let to = ring[(at + 1) % ring.len()];
        let length = distance(from, to);
        if length < 1e-6 {
            continue;
        }
        let along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let mut step = HEAP_EVERY_M - carried;
        while step <= length {
            let edge = [from[0] + along[0] * step, from[1] + along[1] * step];
            step += HEAP_EVERY_M;
            if near_path(paths, edge, PATH_CLEAR_M) || kit.draw() < BARE_SHARE {
                continue;
            }
            // Inward is the side of the edge the section holds: toward the floor.
            let normal = [along[1], -along[0]];
            let inward = if ring_holds(ring, edge[0] + normal[0] * 3.0, edge[1] + normal[1] * 3.0) {
                normal
            } else {
                [-normal[0], -normal[1]]
            };
            if let Some(foot) =
                foot_of(kit, carved, edge, inward, 10.0).filter(|&foot| !near_path(gorges, foot, GORGE_CLEAR_M))
            {
                heap(kit, carved, foot, inward);
            }
        }
        carried = length - (step - HEAP_EVERY_M);
    }
}

/// A heap on the floor at a face's foot (`inward`, away from the face): a boulder or two against the foot, smaller
/// stones by them, and scree spilt out onto the floor. Each stone stands on the ground as carved, and one that would
/// lie up the face is left out.
fn heap(kit: &mut Kit, carved: &Sculpts, foot: [f64; 2], inward: [f64; 2]) {
    for _ in 0..1 + (kit.draw() * 2.0) as u32 {
        let at = off(foot, inward, 0.6 + kit.draw() * 1.4, (kit.draw() - 0.5) * 4.0);
        let across = 1.2 + kit.draw() * 1.4;
        let size = [across, across * (0.7 + kit.draw() * 0.3), 0.7 + kit.draw() * 0.9];
        fallen(kit, carved, Shape::Dome { sides: 7 }, at, size, 0.12);
    }
    for _ in 0..1 + (kit.draw() * 2.0) as u32 {
        let at = off(foot, inward, 1.0 + kit.draw() * 2.5, (kit.draw() - 0.5) * 5.0);
        let across = 0.6 + kit.draw() * 0.6;
        let size = [across, across * (0.7 + kit.draw() * 0.3), 0.45 + kit.draw() * 0.35];
        fallen(kit, carved, Shape::Dome { sides: 6 }, at, size, 0.15);
    }
    for _ in 0..3 + (kit.draw() * 3.0) as u32 {
        let at = off(foot, inward, 1.5 + kit.draw() * 4.0, (kit.draw() - 0.5) * 7.0);
        let across = 0.3 + kit.draw() * 0.5;
        let size = [across, across * (0.6 + kit.draw() * 0.4), 0.15 + kit.draw() * (SCREE_TALLEST_M - 0.15)];
        fallen(kit, carved, Shape::Pyramid { top: 0.45 }, at, size, 0.2);
    }
}

/// A point 0.9 of an outcrop's radius out from its spine, `share` of the way round it, and the way out there: along a
/// side of its spine, or round one of its ends.
fn round_footprint(outcrop: &Outcrop, share: f64) -> ([f64; 2], [f64; 2]) {
    let ([first, last], _) = outcrop.footprint();
    let length = distance(first, last);
    let (sine, cosine) = land::exact::sin_cos(outcrop.angle);
    let (along, across) = ([sine, -cosine], [cosine, sine]);
    let round = share * (2.0 * length + std::f64::consts::TAU * outcrop.radius);
    let (middle, outward) = if round < 2.0 * length {
        let side = if round < length { 1.0 } else { -1.0 };
        let on = round % length;
        ([first[0] + along[0] * on, first[1] + along[1] * on], [across[0] * side, across[1] * side])
    } else {
        let turn = (round - 2.0 * length) / outcrop.radius;
        let (turn_sine, turn_cosine) = land::exact::sin_cos(turn);
        let end = if turn < std::f64::consts::PI { last } else { first };
        (end, [across[0] * turn_cosine + along[0] * turn_sine, across[1] * turn_cosine + along[1] * turn_sine])
    };
    let out = outcrop.radius * 0.9;
    ([middle[0] + outward[0] * out, middle[1] + outward[1] * out], outward)
}

/// Boulders fallen at each outcrop's foot (the sculpt's), on the floor where its face meets it, all round its
/// footprint (a whaleback's ends too), as many as its footprint is long round; none on a path.
pub fn clad(kit: &mut Kit, outcrops: &[Outcrop], paths: &[Path], carved: &Sculpts) {
    for outcrop in outcrops {
        let ([first, last], _) = outcrop.footprint();
        let round = 1.0 + 2.0 * distance(first, last) / (std::f64::consts::TAU * outcrop.radius);
        for _ in 0..((3.0 + kit.draw() * 3.0) * round) as u32 {
            let (from, outward) = round_footprint(outcrop, kit.draw());
            let Some(foot) = foot_of(kit, carved, from, outward, outcrop.radius) else { continue };
            if near_path(paths, foot, PATH_CLEAR_M) {
                continue;
            }
            heap(kit, carved, foot, outward);
        }
    }
}
