//! What stands in a run: its mouth, marked so the zone sees where it goes; cover no more than 10 m apart on each beat's
//! floor and a raised place with steps up at its edge; its kind's dressing (a gorge's fallen bridge, a ledge's broken
//! watch post, a rampart's wall along its drop); and the sealed door at its end. Every piece stands on the ground as
//! carved, and clear of the run's line, so the way through is never blocked short of the door.

use crate::brief::RunKind;
use crate::field::distance;
use crate::paths::off_line;
use crate::pieces::{Kit, turn_along};
use crate::rocks::stone;
use crate::runs::{Beat, Run, half_of};
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
/// A length of a rampart's wall, metres.
const WALL_LENGTH_M: f64 = 5.0;

/// Builds a run's mouth, beats, dressing and door, then leaves out any of its pieces whose box would stand within
/// 1.2 m of its line under head height: a body meets a solid's box, which for a piece turned or leaning reaches
/// further than the piece.
pub fn build(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let first = kit.into.solids.len();
    mouth(kit, run, carved);
    for (number, beat) in run.beats.iter().enumerate() {
        let raised = raised_place(kit, run, beat, carved);
        cover(kit, run, beat, carved, raised);
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
}

/// Whether a solid's box stands within 1.2 m of a run's line under head height (2.2 m over `floor`).
fn blocks(run: &Run, solid: &Solid, floor: f64) -> bool {
    let [west, north, east, south, bottom, _] = solid.bounds();
    // An arch is boxed as its jambs and head (collide.rs), and the kits stand its jambs clear of the line.
    if bottom >= floor + 2.2 || matches!(solid.shape, Shape::Arch { .. }) {
        return false;
    }
    let near =
        |at: [f64; 2]| at[0] >= west - 1.2 && at[0] <= east + 1.2 && at[1] >= north - 1.2 && at[1] <= south + 1.2;
    run.line.windows(2).any(|pair| {
        let length = distance(pair[0], pair[1]);
        let steps = (length / 0.5).ceil().max(1.0) as usize;
        (0..=steps).any(|step| {
            let share = step as f64 / steps as f64;
            near([pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share])
        })
    })
}

/// How far a point lies from a run's line, metres.
fn off_run(run: &Run, at: [f64; 2]) -> f64 {
    run.line.windows(2).map(|pair| off_line(at, pair[0], pair[1])).fold(f64::INFINITY, f64::min)
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
fn raised_place(kit: &mut Kit, run: &Run, beat: &Beat, carved: &Sculpts) -> Option<[f64; 2]> {
    let start = kit.draw() * std::f64::consts::TAU;
    // Well inside the rim, so the section (traced on 8 m cells) holds it whole.
    let out = (beat.radius - 6.0).max(4.0);
    let place = (0..12).find_map(|turn| {
        let (sine, cosine) = land::exact::sin_cos(start + f64::from(turn) * std::f64::consts::TAU / 12.0);
        let way = [sine, -cosine];
        let shelf = ahead(beat.at, way, out);
        // The steps run along the rim beside the shelf, so on a small beat they keep as far from the line as it does.
        let along = [-way[1], way[0]];
        let steps: Vec<[f64; 2]> = (1..=3).map(|step| ahead(shelf, along, 1.6 + 1.2 * f64::from(step) - 0.6)).collect();
        let clear =
            off_run(run, shelf) > LINE_CLEAR_M + 2.4 && steps.iter().all(|at| off_run(run, *at) > LINE_CLEAR_M + 1.0);
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
fn cover(kit: &mut Kit, run: &Run, beat: &Beat, carved: &Sculpts, raised: Option<[f64; 2]>) {
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
            if distance(at, beat.at) > reach || raised.is_some_and(|shelf| distance(at, shelf) < 5.0) {
                continue;
            }
            let across = 1.6 + kit.draw() * 0.8;
            let wanted = LINE_CLEAR_M + across / 2.0;
            let off = off_run(run, at);
            if off < wanted {
                at = away_from_line(run, at, wanted + 0.5);
                if distance(at, beat.at) > reach {
                    continue;
                }
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
            } else {
                let size = [across, 0.9, tall];
                let block = Solid::upright(Shape::Block, [at[0], at[1], ground - 0.3], size, Material::Stone);
                let turn = kit.draw() * std::f64::consts::TAU;
                kit.solid(block.turned(turn));
            }
        }
    }
}

/// A point moved straight away from the run's line until it lies `clear` metres off it.
fn away_from_line(run: &Run, at: [f64; 2], clear: f64) -> [f64; 2] {
    let nearest = run
        .line
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
            for side in [1.0, -1.0] {
                let stub = ahead(beat.at, across, side * (beat.radius - 1.0));
                let size = [3.0, 6.0, 1.2];
                let deck = Solid::upright(Shape::Block, [stub[0], stub[1], floor + 7.5], size, Material::Stone);
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

/// A rampart's wall along its drop side wherever its line has climbed to the top: lengths of curtain wall broken to
/// different heights, a length now and then fallen, each kept clear of the whole line where it bends.
fn rampart_wall(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let half = half_of(run.kind);
    let side = if kit.draw() < 0.5 { 1.0 } else { -1.0 };
    for (pair, levels) in run.line.windows(2).zip(run.levels.windows(2)) {
        if levels[0] < 0.95 || levels[1] < 0.95 {
            continue;
        }
        let length = distance(pair[0], pair[1]);
        let way = [(pair[1][0] - pair[0][0]) / length.max(1e-9), (pair[1][1] - pair[0][1]) / length.max(1e-9)];
        let across = [-way[1] * side, way[0] * side];
        let lengths = (length / WALL_LENGTH_M).floor() as u32;
        for piece in 0..lengths {
            let middle = ahead(ahead(pair[0], way, WALL_LENGTH_M * (f64::from(piece) + 0.5)), across, half + 2.2);
            let ends = [ahead(middle, way, -WALL_LENGTH_M / 2.0), ahead(middle, way, WALL_LENGTH_M / 2.0)];
            if kit.draw() < 0.2 || ends.iter().any(|end| off_run(run, *end) < half + 1.4) {
                continue;
            }
            let base = carved_at(kit, carved, middle) - 1.0;
            let high = 2.6 + kit.draw() * 2.8;
            let size = [1.6, WALL_LENGTH_M - 0.3, high];
            let wall = Solid::upright(Shape::Block, [middle[0], middle[1], base], size, Material::Stone);
            kit.solid(wall.turned(turn_along(way)));
            let merlon = [1.6, 1.0, 0.9];
            let crest = Solid::upright(Shape::Block, [middle[0], middle[1], base + high], merlon, Material::Stone);
            kit.solid(crest.turned(turn_along(way)));
        }
    }
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
