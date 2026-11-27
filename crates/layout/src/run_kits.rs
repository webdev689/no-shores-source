//! What stands in a run: its mouth, marked so the zone sees where it goes; cover no more than 10 m apart on each beat's
//! floor and a raised place with steps up at its edge; its kind's dressing (a gorge's fallen bridge, a ledge's broken
//! watch post, a rampart's wall along its drop); and the sealed door at its end. Every piece stands on the ground as
//! carved, and clear of the run's line, so the way through is never blocked short of the door.

use crate::brief::RunKind;
use crate::field::distance;
use crate::halls::WALL_M;
use crate::paths::off_line;
use crate::pieces::{Kit, turn_along};
use crate::rocks::{Kept, keep_off, loose, stone};
use crate::run_climbs::off_print;
use crate::run_halls::{ROOM_SHARE, roomed};
use crate::runs::{Beat, Run, WAY_CLEAR_M, half_of};
use crate::skyline::{carved_at, tower_stump};
use city::solids::{Material, Shape, Solid};
use land::sculpts::Sculpts;

/// The spacing of a beat's cover, metres: on a staggered lattice this far apart no floor point is more than 6.4 m from
/// a piece.
const COVER_EVERY_M: f64 = 11.0;
/// How far every piece keeps from the run's line beyond its own half-width, metres: past what keeps pieces off a way.
const LINE_CLEAR_M: f64 = 2.6;
/// A raised place's top over its beat's floor, and its steps' rise, metres.
const RAISED_M: f64 = 1.6;
const STEP_M: f64 = 0.4;
/// How far a room's stores (a keep's crates, an undercroft's coffins) reach from where they stand, turned any way,
/// metres: a coffin's half-diagonal.
const STORE_REACH_M: f64 = 1.4;
/// The share of a ledge's or a rampart's cover that is lengths of wall, and as much again squared blocks; the rest is
/// heaps of rubble.
const WALL_SHARE: f64 = 0.35;

/// Whether a run's cover is broken masonry: a ledge's and a rampart's, in the open.
const fn masonry(kind: RunKind) -> bool {
    matches!(kind, RunKind::Ledge | RunKind::Rampart)
}
/// A length of a rampart's wall, metres.
const WALL_LENGTH_M: f64 = 5.0;

/// Builds a run's mouth, beats, dressing and door, then leaves out any of its pieces whose box would stand within
/// `WAY_CLEAR_M` of its line under head height: a body meets a solid's box, which for a piece turned or leaning reaches
/// further than the piece.
pub fn build(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let first = kit.into.solids.len();
    let climb = crate::run_climbs::climb(run).map(|climb| climb.print);
    mouth(kit, run, carved);
    for (number, beat) in run.beats.iter().enumerate() {
        let raised = raised_place(kit, run, beat, carved, climb);
        cover(kit, run, beat, carved, (raised, climb));
        if number + 1 == run.beats.len() / 2 + 1 {
            middle_piece(kit, run, beat, carved);
        }
    }
    if run.kind == RunKind::Rampart {
        rampart_wall(kit, run, carved);
    }
    crate::run_halls::build(kit, run, carved);
    door(kit, run, carved);
    let ground: Vec<f64> =
        kit.into.solids[first..].iter().map(|solid| carved_at(kit, carved, [solid.at[0], solid.at[1]])).collect();
    let mut index = 0;
    kit.into.solids.retain(|solid| {
        let built = index >= first;
        let floor = if built { ground[index - first] } else { 0.0 };
        index += 1;
        !built || !blocks(run, solid, floor)
    });
    crate::run_climbs::build(kit, run, carved);
    // Its own loose rock (cover's boulders, a stump's fallen courses) keeps off the rest of what it built.
    let boxes: Vec<[f64; 6]> =
        kit.into.solids[first..].iter().filter(|solid| !loose(solid)).map(Solid::bounds).collect();
    keep_off(kit.into, first, &Kept { boxes, ways: Vec::new() });
}

/// Whether a solid's box stands within `WAY_CLEAR_M` of a run's way (its line and on to its door) under head height
/// (2.2 m over `floor`).
fn blocks(run: &Run, solid: &Solid, floor: f64) -> bool {
    // An arch is boxed as its jambs and head (collide.rs), and the kits stand its jambs clear of the line; rock by its
    // parts' boxes.
    if matches!(solid.shape, Shape::Arch { .. }) {
        return false;
    }
    if city::rock::is_rock(solid.shape) {
        return city::rock::boxes(solid).iter().any(|&[west, north, east, south, _, bottom]| {
            bottom < floor + 2.2 && near_way(run, [west, north, east, south])
        });
    }
    let [west, north, east, south, bottom, _] = solid.bounds();
    if bottom >= floor + 2.2 {
        return false;
    }
    near_way(run, [west, north, east, south])
}

/// Whether a footprint comes within `WAY_CLEAR_M` of a run's way (its line and on to its door), as rocks.rs measures
/// it: a box's corner is as far off the way as it lies, not as far as a square grown round the box would reach.
pub(crate) fn near_way(run: &Run, print: [f64; 4]) -> bool {
    run.way().windows(2).any(|pair| crate::paths::rect_off_line(print, pair[0], pair[1]) < WAY_CLEAR_M)
}

/// How far a point lies from a run's way, its line and on to its door, metres.
fn off_run(run: &Run, at: [f64; 2]) -> f64 {
    run.way().windows(2).map(|pair| off_line(at, pair[0], pair[1])).fold(f64::INFINITY, f64::min)
}

fn ahead(from: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [from[0] + way[0] * out, from[1] + way[1] * out]
}

/// The way the run's line leaves a point it passes through, a unit vector.
fn way_at(run: &Run, at: [f64; 2]) -> [f64; 2] {
    let next = run.line.iter().skip_while(|point| **point != at).nth(1).copied().unwrap_or(run.door);
    let length = distance(at, next).max(1e-9);
    [(next[0] - at[0]) / length, (next[1] - at[1]) / length]
}

/// The mouth: a gorge's fallen arch of rock over the way in, a ledge's two standing stones, a rampart's broken
/// gateway of two tower stumps; a building's is its building's (halls.rs).
fn mouth(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let way = way_at(run, run.mouth);
    let half = half_of(run.kind);
    let at = ahead(run.mouth, way, 10.0);
    let across = [-way[1], way[0]];
    let ground = carved_at(kit, carved, at);
    match run.kind {
        RunKind::Gorge => {
            let arch = Shape::Arch { opening: 0.72 };
            let size = [2.0 * half + 8.0, 3.5, 11.0];
            kit.solid(
                Solid::upright(arch, [at[0], at[1], ground - 1.0], size, Material::Rubble).turned(turn_along(way)),
            );
        }
        RunKind::Ledge => {
            for side in [1.0, -1.0] {
                let stone_at = ahead(at, across, side * (half + 2.0));
                let size = [1.3, 1.1, 4.2 + kit.draw()];
                let base = carved_at(kit, carved, stone_at) - 0.6;
                let shape = Shape::Column { sides: 7, top: 0.7 };
                let standing = Solid::upright(shape, [stone_at[0], stone_at[1], base], size, Material::Rubble);
                let turn = kit.draw() * 3.0;
                kit.solid(standing.turned(turn));
            }
        }
        RunKind::Rampart => {
            for side in [1.0, -1.0] {
                tower_stump(kit, carved, ahead(at, across, side * (half + 7.0)));
            }
        }
        RunKind::Keep | RunKind::Mine | RunKind::Undercroft => {}
    }
}

/// A raised place at a beat's edge, clear of the line: a shelf of stone 1.6 m over the floor with steps up to it from
/// the beat's middle side. Where it stands, so the cover keeps off it.
fn raised_place(kit: &mut Kit, run: &Run, beat: &Beat, carved: &Sculpts, climb: Option<[f64; 4]>) -> Option<[f64; 2]> {
    let start = kit.draw() * std::f64::consts::TAU;
    // Well inside the rim, so the section (traced on 8 m cells) holds it whole, and inside a beat's room.
    let inside = if roomed(run.kind) { beat.radius * ROOM_SHARE - 3.0 } else { beat.radius - 6.0 };
    let out = inside.max(4.0);
    let off_climb = |at: [f64; 2]| climb.map_or(f64::INFINITY, |print| off_print(print, at));
    let place = (0..12).find_map(|turn| {
        let (sine, cosine) = land::exact::sin_cos(start + f64::from(turn) * std::f64::consts::TAU / 12.0);
        let way = [sine, -cosine];
        let shelf = ahead(beat.at, way, out);
        // The steps run along the rim beside the shelf, so on a small beat they keep as far from the line as it does.
        let along = [-way[1], way[0]];
        let steps: Vec<[f64; 2]> = (1..=3).map(|step| ahead(shelf, along, 1.6 + 1.2 * f64::from(step) - 0.6)).collect();
        let clear = off_run(run, shelf) > LINE_CLEAR_M + 2.4
            && off_climb(shelf) > 2.4
            && steps.iter().all(|at| off_run(run, *at) > LINE_CLEAR_M + 1.0 && off_climb(*at) > 1.4);
        clear.then_some((shelf, way, steps))
    });
    let (shelf, way, steps) = place?;
    let floor = carved_at(kit, carved, beat.at);
    let material = if run.kind.building() { Material::Stone } else { Material::Rubble };
    let turn = turn_along(way);
    kit.solid(
        Solid::upright(Shape::Block, [shelf[0], shelf[1], floor - 0.4], [3.4, 3.2, RAISED_M + 0.4], material)
            .turned(turn),
    );
    for (number, at) in steps.iter().enumerate() {
        let top = STEP_M * (number as f64 + 1.0);
        let step = Solid::upright(Shape::Block, [at[0], at[1], floor - 0.3], [1.2, 2.4, top + 0.3], material);
        kit.solid(step.turned(turn));
    }
    Some(shelf)
}

/// Cover over a beat's floor on a staggered lattice, each piece moved off the line where it would stand on it and left
/// out where the raised place stands: rock in the open, broken masonry along a rampart or ledge.
fn cover(kit: &mut Kit, run: &Run, beat: &Beat, carved: &Sculpts, kept: (Option<[f64; 2]>, Option<[f64; 4]>)) {
    let (raised, climb) = kept;
    let reach = beat.radius - 1.5;
    let row_step = COVER_EVERY_M * 0.866;
    let rows = (reach / row_step).ceil() as i32;
    let columns = (reach / COVER_EVERY_M).ceil() as i32 + 1;
    for row in -rows..=rows {
        let shift = if row.rem_euclid(2) == 0 { 0.0 } else { COVER_EVERY_M / 2.0 };
        for column in -columns..=columns {
            let jitter = [(kit.draw() - 0.5) * 2.0, (kit.draw() - 0.5) * 2.0];
            let mut at = [
                beat.at[0] + f64::from(column) * COVER_EVERY_M + shift + jitter[0],
                beat.at[1] + f64::from(row) * row_step + jitter[1],
            ];
            // Broken masonry takes one of three forms by a draw: a length of wall, a squared block, a heap of rubble.
            let form = if masonry(run.kind) { kit.draw() } else { 0.5 };
            let across = if form < WALL_SHARE { 2.8 + kit.draw() * 1.4 } else { 1.6 + kit.draw() * 0.8 };
            if distance(at, beat.at) > reach || raised.is_some_and(|shelf| distance(at, shelf) < 4.2 + across / 2.0) {
                continue;
            }
            let wanted = LINE_CLEAR_M + across / 2.0;
            let off = off_run(run, at);
            if off < wanted {
                at = away_from_line(run, at, wanted + 0.5);
                if distance(at, beat.at) > reach {
                    continue;
                }
            }
            // Clear of what a body climbs, and of a beat's room's walls.
            let walls = beat.radius * ROOM_SHARE + WALL_M / 2.0;
            let off_walls = (walls - (at[0] - beat.at[0]).abs().max((at[1] - beat.at[1]).abs())).abs();
            if climb.is_some_and(|print| off_print(print, at) < across / 2.0 + 0.5)
                || (roomed(run.kind) && off_walls < WALL_M / 2.0 + STORE_REACH_M)
            {
                continue;
            }
            let ground = carved_at(kit, carved, at);
            // Tall enough to crouch behind wherever the floor rises toward a passage.
            let tall = 1.5 + kit.draw() * 0.4;
            if matches!(run.kind, RunKind::Gorge | RunKind::Mine) {
                let size = [across, across * (0.7 + kit.draw() * 0.3), tall];
                stone(kit, Shape::Dome { sides: 7 }, [at[0], at[1], ground], size, 0.1);
            } else if run.kind == RunKind::Keep {
                // A keep's stores: crates stacked in twos.
                let turn = kit.draw() * std::f64::consts::TAU;
                let crate_m = [1.3, 1.3, 1.3];
                kit.solid(
                    Solid::upright(Shape::Block, [at[0], at[1], ground - 0.1], crate_m, Material::Timber).turned(turn),
                );
                let top = [at[0] + 0.3, at[1] - 0.2, ground + 1.2];
                kit.solid(Solid::upright(Shape::Block, top, [1.1, 1.1, 1.0], Material::Timber).turned(turn + 0.4));
            } else if run.kind == RunKind::Undercroft {
                // An undercroft's tombs: a stone coffin on a plinth.
                let turn = kit.draw() * std::f64::consts::TAU;
                kit.solid(
                    Solid::upright(Shape::Block, [at[0], at[1], ground - 0.2], [2.4, 1.1, 1.5], Material::Stone)
                        .turned(turn),
                );
            } else if form < WALL_SHARE {
                // A length of wall along the way, a course fallen from one end of its top.
                let way = way_at(run, at);
                let turn = turn_along(way) + (kit.draw() - 0.5) * 0.3;
                let base = ground - 0.3;
                kit.solid(
                    Solid::upright(Shape::Block, [at[0], at[1], base], [0.9, across, tall], Material::Stone)
                        .turned(turn),
                );
                let end = ahead(at, way, across * 0.25 * if kit.draw() < 0.5 { 1.0 } else { -1.0 });
                let course = [0.9, across * 0.45, 0.5];
                kit.solid(
                    Solid::upright(Shape::Block, [end[0], end[1], base + tall], course, Material::Stone).turned(turn),
                );
            } else if form < 2.0 * WALL_SHARE {
                let size = [across, 0.9, tall];
                let block = Solid::upright(Shape::Block, [at[0], at[1], ground - 0.3], size, Material::Stone);
                let turn = kit.draw() * std::f64::consts::TAU;
                kit.solid(block.turned(turn));
            } else {
                let size = [across * 1.2, across, tall];
                stone(kit, Shape::Dome { sides: 7 }, [at[0], at[1], ground], size, 0.1);
            }
        }
    }
}

/// A point moved straight away from the run's line until it lies `clear` metres off it.
fn away_from_line(run: &Run, at: [f64; 2], clear: f64) -> [f64; 2] {
    let nearest = run
        .way()
        .windows(2)
        .map(|pair| {
            let span = [pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]];
            let length = span[0] * span[0] + span[1] * span[1];
            let along = if length > 0.0 {
                (((at[0] - pair[0][0]) * span[0] + (at[1] - pair[0][1]) * span[1]) / length).clamp(0.0, 1.0)
            } else {
                0.0
            };
            [pair[0][0] + span[0] * along, pair[0][1] + span[1] * along]
        })
        .min_by(|first, second| distance(*first, at).total_cmp(&distance(*second, at)))
        .unwrap_or(at);
    let off = distance(nearest, at);
    let way = if off > 1e-6 { [(at[0] - nearest[0]) / off, (at[1] - nearest[1]) / off] } else { [1.0, 0.0] };
    ahead(nearest, way, clear)
}

/// The middle beat's piece of its kind: a gorge's fallen bridge, its ends standing from the walls high over the way
/// and its deck lying broken at the side; a ledge's broken watch post at the beat's edge.
fn middle_piece(kit: &mut Kit, run: &Run, beat: &Beat, carved: &Sculpts) {
    let way = way_at(run, beat.at);
    let across = [-way[1], way[0]];
    let floor = carved_at(kit, carved, beat.at);
    match run.kind {
        RunKind::Gorge => {
            // Each end stands out of its wall where the wall reaches over the deck: the carved face leans back and
            // steps, so that is found by walking out across the gorge, not taken at its rim. A side lower than the
            // deck keeps no end.
            let (bottom, size) = (floor + 7.5, [3.0, 6.0, 1.2]);
            for side in [1.0, -1.0] {
                let rock = |out: f64| carved_at(kit, carved, ahead(beat.at, across, side * out)) >= bottom + size[2];
                let Some(face) = (0..=80).map(|step| beat.radius * 0.5 + f64::from(step) * 0.5).find(|&out| rock(out))
                else {
                    continue;
                };
                // Set 1.5 m into the rock, reaching 4.5 m out over the gorge.
                let stub = ahead(beat.at, across, side * (face + 1.5 - size[1] / 2.0));
                let deck = Solid::upright(Shape::Block, [stub[0], stub[1], bottom], size, Material::Stone);
                kit.solid(deck.turned(turn_along(across)));
            }
            for _ in 0..3 {
                let at =
                    away_from_line(run, ahead(beat.at, across, (kit.draw() - 0.5) * beat.radius), LINE_CLEAR_M + 3.0);
                let slab = Solid::upright(
                    Shape::Block,
                    [at[0], at[1], carved_at(kit, carved, at) - 0.2],
                    [2.4, 4.0, 0.7],
                    Material::Stone,
                );
                let turn = kit.draw() * std::f64::consts::TAU;
                kit.solid(Solid { lean: 0.25, ..slab.turned(turn) });
            }
        }
        RunKind::Ledge => {
            let post = away_from_line(run, ahead(beat.at, across, beat.radius * 0.7), LINE_CLEAR_M + 3.0);
            let base = carved_at(kit, carved, post) - 0.5;
            let tall = 4.5 + kit.draw() * 1.5;
            let size = [4.2, 4.2, tall];
            kit.solid(
                Solid::upright(Shape::Block, [post[0], post[1], base], size, Material::Stone).turned(turn_along(way)),
            );
            let merlon = [1.0, 0.8, 0.9];
            for corner in [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6]] {
                let at = [post[0] + corner[0], post[1] + corner[1]];
                kit.solid(Solid::upright(Shape::Block, [at[0], at[1], base + tall], merlon, Material::Stone));
            }
        }
        _ => {}
    }
}

/// A rampart's walls wherever its way runs along the massif's top: lengths of curtain wall either side of the way and
/// round the beats there, broken to different heights with a merlon on each, kept clear of the way where it bends
/// and open where it passes through a beat's ring.
fn rampart_wall(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let half = half_of(run.kind);
    let in_beat = |at: [f64; 2]| run.beats.iter().any(|beat| distance(at, beat.at) <= beat.radius + 0.1);
    for (pair, levels) in run.line.windows(2).zip(run.levels.windows(2)) {
        // Along the passages only: a beat on the top is walled round its rim.
        if levels[0] < 0.95 || levels[1] < 0.95 || (in_beat(pair[0]) && in_beat(pair[1])) {
            continue;
        }
        let length = distance(pair[0], pair[1]);
        let way = [(pair[1][0] - pair[0][0]) / length.max(1e-9), (pair[1][1] - pair[0][1]) / length.max(1e-9)];
        // Whole lengths from end to end of the passage, so no gap is left at its ends.
        let lengths = (length / WALL_LENGTH_M).ceil().max(1.0);
        let each = length / lengths;
        for side in [1.0, -1.0] {
            let across = [-way[1] * side, way[0] * side];
            for piece in 0..lengths as u32 {
                let middle = ahead(ahead(pair[0], way, each * (f64::from(piece) + 0.5)), across, half + 2.2);
                wall_length(kit, run, carved, middle, way, each);
            }
        }
    }
    for beat in run.beats.iter().filter(|beat| beat.level >= 0.95) {
        let pieces = (std::f64::consts::TAU * (beat.radius + 1.5) / WALL_LENGTH_M).floor().max(6.0);
        for piece in 0..pieces as u32 {
            let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(piece) / pieces);
            let middle = ahead(beat.at, [sine, -cosine], beat.radius + 1.5);
            let each = std::f64::consts::TAU * (beat.radius + 1.5) / pieces;
            wall_length(kit, run, carved, middle, [cosine, sine], each);
        }
    }
}

/// One length of a rampart's curtain wall `length` long at a point along `way`; where its ends come near the run's
/// way it is laid as two half lengths, each left out only where it comes near the way itself, so the wall stops at
/// the way and leaves no gap beside it.
fn wall_length(kit: &mut Kit, run: &Run, carved: &Sculpts, middle: [f64; 2], way: [f64; 2], length: f64) {
    let ends = [ahead(middle, way, -length / 2.0), ahead(middle, way, length / 2.0)];
    if ends.iter().chain(std::iter::once(&middle)).any(|end| off_run(run, *end) < half_of(run.kind) + 1.4) {
        if length > 1.5 {
            for side in [-1.0, 1.0] {
                wall_length(kit, run, carved, ahead(middle, way, side * length / 4.0), way, length / 2.0);
            }
        }
        return;
    }
    let base = carved_at(kit, carved, middle) - 1.0;
    let high = 3.4 + kit.draw() * 2.2;
    let size = [1.6, length + 0.2, high];
    kit.solid(
        Solid::upright(Shape::Block, [middle[0], middle[1], base], size, Material::Stone).turned(turn_along(way)),
    );
    let crest = Solid::upright(Shape::Block, [middle[0], middle[1], base + high], [1.6, 1.0, 0.9], Material::Stone);
    kit.solid(crest.turned(turn_along(way)));
}

/// The sealed door at the end arena's far rim: a great door of timber banded with iron in a stone arch; where the
/// run ends on the massif's top, walls either side of it, so it stands as a gate.
fn door(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let half = half_of(run.kind);
    let way = run.facing;
    let at = ahead(run.door, way, 1.0);
    let floor = carved_at(kit, carved, run.door);
    let width = (3.0 * half).max(5.5);
    let turn = turn_along(way);
    let frame = Solid::upright(
        Shape::Arch { opening: 0.75 },
        [at[0], at[1], floor - 0.5],
        [width + 3.0, 1.6, 8.5],
        Material::Stone,
    );
    kit.solid(frame.turned(turn));
    match run.kind {
        // A mine's door is an iron grate: bars too close for a body to pass, between two rails.
        RunKind::Mine => {
            let across = [-way[1], way[0]];
            let bars = (width / 0.3).floor() as i32;
            for bar in 0..=bars {
                let along = ahead(at, across, f64::from(bar) * 0.3 - width / 2.0);
                kit.solid(Solid::upright(
                    Shape::Column { sides: 6, top: 1.0 },
                    [along[0], along[1], floor - 0.3],
                    [0.12, 0.12, 6.6],
                    Material::Iron,
                ));
            }
            for rail in [0.2, 6.0] {
                let iron =
                    Solid::upright(Shape::Block, [at[0], at[1], floor + rail], [width + 0.3, 0.2, 0.2], Material::Iron);
                kit.solid(iron.turned(turn));
            }
        }
        // An undercroft's is a crypt's sealed slab of stone.
        RunKind::Undercroft => {
            let slab =
                Solid::upright(Shape::Block, [at[0], at[1], floor - 0.3], [width + 0.4, 0.7, 6.5], Material::Stone);
            kit.solid(slab.turned(turn));
        }
        _ => {
            let leaf =
                Solid::upright(Shape::Block, [at[0], at[1], floor - 0.3], [width + 0.4, 0.5, 6.5], Material::Timber);
            kit.solid(leaf.turned(turn));
            for band in [1.4, 3.1, 4.8] {
                let iron = Solid::upright(
                    Shape::Block,
                    [at[0], at[1], floor + band],
                    [width + 0.3, 0.62, 0.22],
                    Material::Iron,
                );
                kit.solid(iron.turned(turn));
            }
        }
    }
}
