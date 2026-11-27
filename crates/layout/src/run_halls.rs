//! The large buildings a building run passes through, of the hall kit along its run's line: a keep (a gatehouse over
//! its mouth, walled courts and roofed great halls over its beats in turn, windowed and battlemented, roofed passages
//! between, a walled ward with a turret at each corner and two towers at its door), a mine (a head-frame and its spoil
//! at the mouth, timbered galleries boarded over, caverns roofed with rubble slabs on rock ribs) and an undercroft (a
//! ruined chapel at its mouth, vaulted passages, pillared vaults, an ossuary at its end). What a body climbs in a
//! keep's ward and at an undercroft's mouth is run_climbs'.

use crate::brief::RunKind;
use crate::field::distance;
use crate::halls::{Room, TURRET_M, WALL_M, corridor, room, turret, wall};
use crate::paths::off_line;
use crate::pieces::{Kit, turn_along};
use crate::run_climbs::Climb;
use crate::runs::{Run, half_of};
use crate::skyline::carved_at;
use city::solids::{Material, Shape, Solid};
use land::sculpts::Sculpts;

/// A keep's rooms' and an undercroft's vaults' inner half-width, a share of their beat's reach: so a room's corners,
/// and a turret on each, stand on the beat's flat floor, short of where the rock's face rises past its rim.
pub const ROOM_SHARE: f64 = 0.7;
/// Whether a run of a kind stands a room square to the world on each beat, at ROOM_SHARE: a keep and an undercroft.
#[must_use]
pub const fn roomed(kind: RunKind) -> bool {
    matches!(kind, RunKind::Keep | RunKind::Undercroft)
}
/// A building's ward's, courts' and halls' inner height, and its passages', metres.
pub const WARD_M: f64 = 9.0;
/// A ward's turrets' tops over its floor, metres: taller than its walls and their merlons.
pub const TOWER_UP_M: f64 = 11.0;
const HALL_M: f64 = 7.0;
const COURT_M: f64 = 5.0;
const PASSAGE_M: f64 = 4.0;
/// How far apart a mine's timber sets stand, metres.
const SET_EVERY_M: f64 = 2.5;
/// A cavern's roof's underside over its floor, metres: what carries it comes up to here.
pub const ROOF_UP_M: f64 = 7.0;
/// How far apart a beat's pillars stand, on a lattice, metres.
const PILLAR_EVERY_M: f64 = 11.0;
/// A cavern's bay: its ribs run both ways this far apart, over its pillars on every other one, and a slab spans each
/// bay from rib to rib, metres.
const BAY_M: f64 = PILLAR_EVERY_M / 2.0;
/// A cavern's ribs' width and depth, and its slabs' thickness, metres.
const RIB: [f64; 2] = [1.2, 0.9];
const SLAB_M: f64 = 1.6;
/// How far past its beat's rim a rib may run to meet the rock, metres: one along a passage's mouth meets none.
const SPRING_MOST_M: f64 = 24.0;
/// How far an undercroft's chapel runs in from its mouth, metres: past its raised floor (run_climbs.rs).
const CHAPEL_M: f64 = 12.0;
/// How far a cavern's ribs keep from its run's door, metres: past the reach of the door's frame (run_kits.rs).
const DOOR_CLEAR_M: f64 = 6.0;

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

/// The hall along a building run's way in from its mouth, its ends and its inner half-width: a keep's gatehouse to the
/// way's first bend, an undercroft's chapel a stretch in; none for the rest. Its walls stand on the passage's flat
/// floor, which runs some 3.5 m past the passage's half-width before the face rises (land::sculpts' face).
fn mouth_hall(run: &Run) -> Option<([[f64; 2]; 2], f64)> {
    let half = half_of(run.kind);
    let bend = run.line.get(1).copied().unwrap_or(run.door);
    match run.kind {
        RunKind::Keep => Some(([run.mouth, bend], half + 1.0)),
        RunKind::Undercroft => {
            let long = CHAPEL_M.min(distance(run.mouth, bend));
            Some(([run.mouth, ahead(run.mouth, unit(run.mouth, bend), long)], half + 2.0))
        }
        _ => None,
    }
}

/// Builds a building run's building; nothing for a run in the open.
pub fn build(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let mut out = Vec::new();
    let floor = |kit: &Kit, at: [f64; 2]| carved_at(kit, carved, at);
    let half = half_of(run.kind);
    let way_in = unit(run.mouth, run.line.get(1).copied().unwrap_or(run.door));
    match run.kind {
        RunKind::Keep => {
            let (gate, reach) = mouth_hall(run).unwrap_or_default();
            corridor(&mut out, gate, [floor(kit, gate[0]), floor(kit, gate[1])], reach, 5.5, Material::Stone);
            for side in [1.0, -1.0] {
                let tower = ahead(run.mouth, [-way_in[1], way_in[0]], side * (reach + 3.5));
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
            let climb = crate::run_climbs::climb(run);
            for (number, beat) in run.beats.iter().enumerate() {
                let last = number + 1 == run.beats.len();
                let hall = !last && number % 2 == 1;
                let reach = beat.radius * ROOM_SHARE;
                let height = if last {
                    WARD_M
                } else if hall {
                    HALL_M
                } else {
                    COURT_M
                };
                // The ward's wall its stair climbs has none: the stair and the walk stand against it.
                let mut windows = [true; 4];
                if let Some(side) = climb.as_ref().and_then(|climb| climb.side).filter(|_| last) {
                    windows[side] = false;
                }
                let (middle, ground) = (beat.at, floor(kit, beat.at));
                let shape =
                    Room { middle, floor: ground, half: [reach; 2], height, roofed: hall, windows, battled: true };
                room(&mut out, &run.way(), shape, Material::Stone);
                if last {
                    ward_turrets(&mut out, run, (middle, ground, reach), climb.as_ref());
                }
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
            // A nave open to the sky, its walls either side of the way.
            let (nave, reach) = mouth_hall(run).unwrap_or_default();
            let floors = [floor(kit, nave[0]), floor(kit, nave[1])];
            let (low, high) = (floors[0].min(floors[1]), floors[0].max(floors[1]));
            for side in [1.0, -1.0] {
                let off = [-way_in[1] * side * (reach + WALL_M / 2.0), way_in[0] * side * (reach + WALL_M / 2.0)];
                let [from, to] = nave.map(|end| [end[0] + off[0], end[1] + off[1]]);
                wall(&mut out, from, to, low - 0.4, high + 5.6, WALL_M, Material::Stone);
            }
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
                let reach = beat.radius * ROOM_SHARE;
                let shape = Room {
                    middle: beat.at,
                    floor: floor(kit, beat.at),
                    half: [reach, reach],
                    height: 5.5,
                    roofed: true,
                    windows: [false; 4],
                    battled: false,
                };
                room(&mut out, &run.way(), shape, Material::Stone);
                pillars(kit, &mut out, run, (beat.at, beat.radius, reach), carved, (Material::Stone, 1.3, 5.6));
            }
        }
        RunKind::Gorge | RunKind::Ledge | RunKind::Rampart => {}
    }
    kit.into.solids.extend(out);
}

/// A turret taller than the wall at each corner of a keep's ward (its middle, floor and inner half-width) but the one
/// its climb comes onto, and any its way passes near.
fn ward_turrets(out: &mut Vec<Solid>, run: &Run, (middle, ground, half): ([f64; 2], f64, f64), climb: Option<&Climb>) {
    let way = run.way();
    for corner in [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]] {
        let at = [middle[0] + corner[0] * (half + WALL_M / 2.0), middle[1] + corner[1] * (half + WALL_M / 2.0)];
        let off_way = way.windows(2).map(|pair| off_line(at, pair[0], pair[1])).fold(f64::INFINITY, f64::min);
        let climbed = climb.and_then(|climb| climb.walk.last()).is_some_and(|top| distance(*top, at) < 1.0);
        if !climbed && off_way > TURRET_M / 2.0 + 1.5 {
            turret(out, at, [ground - 1.0, ground + TOWER_UP_M], None, Material::Stone);
        }
    }
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

/// A cavern over a beat: rock pillars on a lattice clear of the line; rock ribs both ways a bay apart, each springing
/// from the rock walls either side and running over the pillars on every other one; and a roof of rubble slabs over
/// the bays, each on the ribs at its edges, with a few left out so light falls in shafts.
fn cavern(kit: &mut Kit, out: &mut Vec<Solid>, run: &Run, middle: [f64; 2], radius: f64, carved: &Sculpts) {
    pillars(kit, out, run, (middle, radius, f64::INFINITY), carved, (Material::Rubble, 2.6, ROOF_UP_M));
    let underside = carved_at(kit, carved, middle) + ROOF_UP_M;
    let mut ribs = Vec::new();
    let lines = ((radius + 2.0) / BAY_M).floor() as i32;
    for line in -lines..=lines {
        let off = f64::from(line) * BAY_M;
        // From the beat's rim, where its floor ends, on either way to the rock.
        let rim = (radius * radius - off * off).max(0.0).sqrt();
        for (along, across) in [([1.0, 0.0], [0.0, 1.0]), ([0.0, 1.0], [1.0, 0.0])] {
            let on = ahead(middle, across, off);
            let reach = [1.0, -1.0]
                .map(|side| springs(kit, carved, (on, [along[0] * side, along[1] * side]), rim, underside - RIB[1]));
            let [Some(on_ahead), Some(behind)] = reach else { continue };
            let at = ahead(on, along, (on_ahead - behind) / 2.0);
            let length = on_ahead + behind;
            let size = [along[0] * length + across[0] * RIB[0], along[1] * length + across[1] * RIB[0], RIB[1]];
            let rib = Solid::upright(Shape::Block, [at[0], at[1], underside - RIB[1]], size, Material::Rubble);
            let [west, north, east, south, ..] = rib.bounds();
            // None runs into the door's frame, set in the rock past the end.
            if crate::run_climbs::off_print([west, north, east, south], run.door) >= DOOR_CLEAR_M {
                ribs.push([west, north, east, south]);
                out.push(rib);
            }
        }
    }
    let bays = ((radius + 2.0) / BAY_M).ceil() as i32;
    for column in -bays..bays {
        for row in -bays..bays {
            let at = [middle[0] + (f64::from(column) + 0.5) * BAY_M, middle[1] + (f64::from(row) + 0.5) * BAY_M];
            let off = run
                .line
                .windows(2)
                .map(|pair| crate::paths::off_line(at, pair[0], pair[1]))
                .fold(f64::INFINITY, f64::min);
            // The shafts of light fall beside the way, not on it.
            if distance(at, middle) > radius + 2.0 || (off > 5.0 && kit.draw() < 0.3) {
                continue;
            }
            let wide = BAY_M + 0.2;
            let slab = Solid::upright(Shape::Block, [at[0], at[1], underside], [wide, wide, SLAB_M], Material::Rubble);
            // None hangs on nothing where no rib reached the rock, over a passage's mouth.
            let [west, north, east, south, ..] = slab.bounds();
            if ribs.iter().any(|rib| rib[0] < east && west < rib[2] && rib[1] < south && north < rib[3]) {
                out.push(slab);
            }
        }
    }
}

/// How far along a way from a point a rib meets the rock at its underside (`bottom`), walked from `rim` metres out to
/// SPRING_MOST_M past it, and half a metre on into it; none where it meets none.
fn springs(kit: &Kit, carved: &Sculpts, (from, way): ([f64; 2], [f64; 2]), rim: f64, bottom: f64) -> Option<f64> {
    let mut out = rim;
    while out <= rim + SPRING_MOST_M {
        if carved_at(kit, carved, ahead(from, way, out)) >= bottom {
            return Some(out + 0.5);
        }
        out += 0.5;
    }
    None
}

/// Pillars over a beat (its middle and reach) on an 11 m lattice, each 3 m or more inside its rim, 2 m or more inside
/// the walls of its room (`room`, its inner half-width, infinite in a cavern) and 3 m or more off the run's line:
/// `look` is their material, their width and their height.
fn pillars(
    kit: &Kit,
    out: &mut Vec<Solid>,
    run: &Run,
    (middle, radius, room): ([f64; 2], f64, f64),
    carved: &Sculpts,
    look: (Material, f64, f64),
) {
    let (material, across, tall) = look;
    let steps = (radius / PILLAR_EVERY_M).floor() as i32;
    for column in -steps..=steps {
        for row in -steps..=steps {
            let at = [
                middle[0] + (f64::from(column) + 0.5) * PILLAR_EVERY_M,
                middle[1] + (f64::from(row) + 0.5) * PILLAR_EVERY_M,
            ];
            let off = run
                .line
                .windows(2)
                .map(|pair| crate::paths::off_line(at, pair[0], pair[1]))
                .fold(f64::INFINITY, f64::min);
            let square = (at[0] - middle[0]).abs().max((at[1] - middle[1]).abs());
            if distance(at, middle) > radius - 3.0 || square > room - 2.0 || off < 3.0 + across / 2.0 {
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
