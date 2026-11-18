//! The large buildings a building run passes through, of the hall kit along its run's line: a keep (a gatehouse over its
//! mouth, walled courts and roofed great halls over its beats in turn, roofed passages between, a walled ward and two
//! towers at its door), a mine (a head-frame and its spoil at the mouth, timbered galleries boarded over, caverns roofed
//! with rubble slabs on rock pillars) and an undercroft (a ruined chapel at its mouth, vaulted passages, pillared vaults,
//! an ossuary at its end).

use crate::brief::RunKind;
use crate::field::distance;
use crate::halls::{Room, WALL_M, corridor, room, wall};
use crate::pieces::{Kit, turn_along};
use crate::runs::{Run, half_of};
use crate::skyline::carved_at;
use city::solids::{Material, Shape, Solid};
use land::sculpts::Sculpts;

/// A building's courts' and halls' inner height, and its passages', metres.
const HALL_M: f64 = 7.0;
const COURT_M: f64 = 5.0;
const PASSAGE_M: f64 = 4.0;
/// How far apart a mine's timber sets stand, metres.
const SET_EVERY_M: f64 = 2.5;

fn ahead(from: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [from[0] + way[0] * out, from[1] + way[1] * out]
}

fn unit(from: [f64; 2], to: [f64; 2]) -> [f64; 2] {
    let length = distance(from, to).max(1e-9);
    [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

/// The run's passages: the segments of its line outside its beats, mouth to first rim and rim to rim by their elbows.
fn passages(run: &Run) -> Vec<[[f64; 2]; 2]> {
    let in_beat = |at: [f64; 2]| run.beats.iter().any(|beat| distance(at, beat.at) <= beat.radius + 0.1);
    run.line.windows(2).filter(|pair| !(in_beat(pair[0]) && in_beat(pair[1]))).map(|pair| [pair[0], pair[1]]).collect()
}

/// Builds a building run's building; nothing for a run in the open.
pub fn build(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let mut out = Vec::new();
    let floor = |kit: &Kit, at: [f64; 2]| carved_at(kit, carved, at);
    let half = half_of(run.kind);
    let way_in = unit(run.mouth, run.line.get(1).copied().unwrap_or(run.door));
    match run.kind {
        RunKind::Keep => {
            let gate = run.line.get(1).copied().unwrap_or(run.mouth);
            let middle = [(run.mouth[0] + gate[0]) / 2.0, (run.mouth[1] + gate[1]) / 2.0];
            let reach = [
                ((gate[0] - run.mouth[0]).abs() / 2.0).max(half + 2.5),
                ((gate[1] - run.mouth[1]).abs() / 2.0).max(half + 2.5),
            ];
            room(
                &mut out,
                &run.line,
                Room { middle, floor: floor(kit, middle), half: reach, height: 5.5, roofed: true },
                Material::Stone,
            );
            for side in [1.0, -1.0] {
                let tower = ahead(run.mouth, [-way_in[1], way_in[0]], side * (reach[0].max(reach[1]) + 3.5));
                out.push(Solid::upright(
                    Shape::Column { sides: 10, top: 1.0 },
                    [tower[0], tower[1], floor(kit, tower) - 1.0],
                    [5.5, 5.5, 13.0],
                    Material::Stone,
                ));
            }
            for ends in passages(run).iter().skip(1) {
                corridor(&mut out, *ends, [floor(kit, ends[0]), floor(kit, ends[1])], half, PASSAGE_M, Material::Stone);
            }
            for (number, beat) in run.beats.iter().enumerate() {
                let last = number + 1 == run.beats.len();
                let hall = !last && number % 2 == 1;
                let reach = beat.radius * 0.9;
                let height = if last {
                    9.0
                } else if hall {
                    HALL_M
                } else {
                    COURT_M
                };
                let shape =
                    Room { middle: beat.at, floor: floor(kit, beat.at), half: [reach, reach], height, roofed: hall };
                room(&mut out, &run.line, shape, Material::Stone);
            }
            let across = [-run.facing[1], run.facing[0]];
            for side in [1.0, -1.0] {
                let tower = ahead(ahead(run.door, run.facing, -1.0), across, side * 8.5);
                out.push(Solid::upright(
                    Shape::Block,
                    [tower[0], tower[1], floor(kit, tower) - 1.0],
                    [5.0, 5.0, 14.0],
                    Material::Stone,
                ));
            }
        }
        RunKind::Mine => {
            let frame = ahead(run.mouth, way_in, 6.0);
            let across = [-way_in[1], way_in[0]];
            let ground = floor(kit, frame);
            for side in [1.0, -1.0] {
                let post = ahead(frame, across, side * (half + 1.5));
                out.push(Solid::upright(
                    Shape::Block,
                    [post[0], post[1], ground - 0.5],
                    [0.5, 0.5, 10.5],
                    Material::Timber,
                ));
            }
            let beam = Solid::upright(
                Shape::Block,
                [frame[0], frame[1], ground + 9.6],
                [2.0 * half + 4.0, 0.5, 0.6],
                Material::Timber,
            );
            out.push(beam.turned(turn_along(way_in)));
            let heap = ahead(run.mouth, across, half + 14.0);
            out.push(Solid::upright(
                Shape::Dome { sides: 9 },
                [heap[0], heap[1], floor(kit, heap) - 1.0],
                [13.0, 10.0, 5.0],
                Material::Rubble,
            ));
            for ends in passages(run) {
                gallery(kit, &mut out, ends, half, carved);
            }
            for beat in &run.beats {
                cavern(kit, &mut out, run, beat.at, beat.radius, carved);
            }
        }
        RunKind::Undercroft => {
            let chapel = ahead(run.mouth, way_in, 4.0);
            let reach = [half + 5.0, half + 5.0];
            room(
                &mut out,
                &run.line,
                Room { middle: chapel, floor: floor(kit, chapel), half: reach, height: 5.0, roofed: false },
                Material::Stone,
            );
            // A ruin: a share of the chapel's wall has fallen.
            let mut kept = Vec::new();
            for solid in out.drain(..) {
                if kit.draw() > 0.3 {
                    kept.push(solid);
                }
            }
            out = kept;
            for ends in passages(run).iter().skip(1) {
                let floors = [floor(kit, ends[0]), floor(kit, ends[1])];
                corridor(&mut out, *ends, floors, half, PASSAGE_M - 0.4, Material::Stone);
                ribs(&mut out, *ends, floors, half);
            }
            for beat in &run.beats {
                let reach = beat.radius * 0.9;
                let shape = Room {
                    middle: beat.at,
                    floor: floor(kit, beat.at),
                    half: [reach, reach],
                    height: 5.5,
                    roofed: true,
                };
                room(&mut out, &run.line, shape, Material::Stone);
                pillars(kit, &mut out, run, beat.at, beat.radius, carved, (Material::Stone, 1.3, 5.6));
            }
        }
        RunKind::Gorge | RunKind::Ledge | RunKind::Rampart => {}
    }
    kit.into.solids.extend(out);
}

/// A mine's gallery along a passage: timber sets of two posts and a cap every 2.5 m, boards along both sides between
/// them, and boards over the cap.
fn gallery(kit: &Kit, out: &mut Vec<Solid>, ends: [[f64; 2]; 2], half: f64, carved: &Sculpts) {
    let way = unit(ends[0], ends[1]);
    let across = [-way[1], way[0]];
    let length = distance(ends[0], ends[1]);
    let sets = (length / SET_EVERY_M).floor() as usize;
    for set in 0..=sets {
        let at = ahead(ends[0], way, (set as f64 * SET_EVERY_M).min(length));
        let ground = carved_at(kit, carved, at);
        for side in [1.0, -1.0] {
            let post = ahead(at, across, side * (half + 0.2));
            out.push(Solid::upright(
                Shape::Block,
                [post[0], post[1], ground - 0.3],
                [0.32, 0.32, 3.3],
                Material::Timber,
            ));
        }
        let cap = Solid::upright(
            Shape::Block,
            [at[0], at[1], ground + 2.9],
            [2.0 * half + 0.9, 0.32, 0.32],
            Material::Timber,
        );
        out.push(cap.turned(turn_along(way)));
    }
    let floors = [carved_at(kit, carved, ends[0]), carved_at(kit, carved, ends[1])];
    let (low, high) = (floors[0].min(floors[1]), floors[0].max(floors[1]));
    for side in [1.0, -1.0] {
        let off = side * (half + 0.35);
        wall(
            out,
            ahead(ends[0], across, off),
            ahead(ends[1], across, off),
            low - 0.2,
            high + 2.9,
            0.12,
            Material::Timber,
        );
    }
    wall(out, ends[0], ends[1], high + 3.22, high + 3.42, 2.0 * half + 1.0, Material::Timber);
}

/// A cavern over a beat: rock pillars on a lattice clear of the line, and a roof of rubble slabs over them with a few
/// left out, so light falls in shafts.
fn cavern(kit: &mut Kit, out: &mut Vec<Solid>, run: &Run, middle: [f64; 2], radius: f64, carved: &Sculpts) {
    pillars(kit, out, run, middle, radius, carved, (Material::Rubble, 2.6, 7.0));
    let ground = carved_at(kit, carved, middle);
    let slabs = (radius / 6.0).ceil() as i32;
    for column in -slabs..=slabs {
        for row in -slabs..=slabs {
            let at = [middle[0] + f64::from(column) * 6.0, middle[1] + f64::from(row) * 6.0];
            let off = run
                .line
                .windows(2)
                .map(|pair| crate::paths::off_line(at, pair[0], pair[1]))
                .fold(f64::INFINITY, f64::min);
            // The shafts of light fall beside the way, not on it.
            if distance(at, middle) > radius + 2.0 || (off > 5.0 && kit.draw() < 0.3) {
                continue;
            }
            out.push(Solid::upright(Shape::Block, [at[0], at[1], ground + 7.0], [6.2, 6.2, 1.6], Material::Rubble));
        }
    }
}

/// Pillars over a beat on an 11 m lattice, each 3 m or more off the run's line: `look` is their material, their width
/// and their height.
fn pillars(
    kit: &Kit,
    out: &mut Vec<Solid>,
    run: &Run,
    middle: [f64; 2],
    radius: f64,
    carved: &Sculpts,
    look: (Material, f64, f64),
) {
    let (material, across, tall) = look;
    let steps = (radius / 11.0).floor() as i32;
    for column in -steps..=steps {
        for row in -steps..=steps {
            let at = [middle[0] + f64::from(column) * 11.0 + 5.5, middle[1] + f64::from(row) * 11.0 + 5.5];
            let off = run
                .line
                .windows(2)
                .map(|pair| crate::paths::off_line(at, pair[0], pair[1]))
                .fold(f64::INFINITY, f64::min);
            if distance(at, middle) > radius - 3.0 || off < 3.0 + across / 2.0 {
                continue;
            }
            let base = carved_at(kit, carved, at) - 0.4;
            out.push(Solid::upright(
                Shape::Column { sides: 9, top: 0.9 },
                [at[0], at[1], base],
                [across, across, tall + 0.4],
                material,
            ));
        }
    }
}

/// An undercroft passage's vault ribs: a stone rib across its roof every 4 m.
fn ribs(out: &mut Vec<Solid>, ends: [[f64; 2]; 2], floors: [f64; 2], half: f64) {
    let way = unit(ends[0], ends[1]);
    let length = distance(ends[0], ends[1]);
    let high = floors[0].max(floors[1]);
    let mut along = 2.0;
    while along < length {
        let at = ahead(ends[0], way, along);
        let rib = Solid::upright(
            Shape::Block,
            [at[0], at[1], high + PASSAGE_M - 0.9],
            [2.0 * (half + WALL_M), 0.45, 0.5],
            Material::Stone,
        );
        out.push(rib.turned(turn_along(way)));
        along += 4.0;
    }
}
