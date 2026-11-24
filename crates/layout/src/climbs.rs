//! Ways up the massif: from the edges of the larger basins (and from a dead mass's floor, masses.rs), each a climb
//! bored into the rock as it rises to a lookout on the top over its basin.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::Field;
use land::exact::rand01;
use land::sculpts::Sculpts;

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
/// of every other floor and well inside the claim; each a climb and its lookout (land's `Sculpt::climbs`), and the
/// area each climbs out of (its place among `areas`).
pub(crate) fn climbs(
    field: &Field,
    areas: &[Area],
    bare: &Sculpts,
    rise: f64,
    seed: u32,
) -> (Vec<[f64; 7]>, Vec<usize>) {
    let mut found: Vec<[f64; 7]> = Vec::new();
    let mut from = Vec::new();
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
                if let Some(climb) = climb_along(field, bare, &found, start, way, rise) {
                    found.extend(climb);
                    from.push(number);
                    break 'tries;
                }
            }
        }
    }
    (found, from)
}

/// A climb from `start` (on a floor's edge, at its level) along `way` up the massif, and its lookout on the top, where
/// they fit (`climb_clear`): each a capsule of the sculpt's climbs.
pub(crate) fn climb_along(
    field: &Field,
    bare: &Sculpts,
    taken: &[[f64; 7]],
    start: [f64; 2],
    way: [f64; 2],
    rise: f64,
) -> Option<[[f64; 7]; 2]> {
    let from = bare.floor_share(start[0], start[1]).clamp(0.0, 1.0);
    let length = (rise * 1.15 * (1.0 - from) / CLIMB_STEEPEST).max(LOOKOUT_HALF_M);
    let end = [start[0] + way[0] * length, start[1] + way[1] * length];
    climb_clear(field, bare, taken, start, way, length).then_some([
        [start[0], start[1], end[0], end[1], CLIMB_HALF_M, from, 1.0],
        [end[0], end[1], end[0], end[1], LOOKOUT_HALF_M, 1.0, 1.0],
    ])
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
