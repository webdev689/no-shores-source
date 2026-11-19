//! What a body climbs in a building run, every piece square to the world so its box is the piece itself: a keep's
//! stair up the inside of its ward's wall to a wall-walk along it and a turret's top at its corner, and an
//! undercroft's chapel floor raised at its mouth, with a stair up onto it from the zone and a stair down off it into
//! the undercroft.

use crate::brief::RunKind;
use crate::halls::{TURRET_M, WALL_M, stair, turret, wall};
use crate::paths::off_line;
use crate::pieces::Kit;
use crate::run_halls::{ROOM_SHARE, TOWER_UP_M, WARD_M};
use crate::runs::{Run, half_of};
use crate::skyline::carved_at;
use city::solids::{Material, Solid};
use land::sculpts::Sculpts;

/// A ward's wall-walk over its floor (a parapet's height under its wall's top), and the walk's and its stairs' width,
/// metres.
const WALK_UP_M: f64 = WARD_M + 0.6 - 1.2;
const WALK_WIDE_M: f64 = 2.0;
/// A stair's tread, metres: with 0.2 m risers, a stair's length is 1.5 times its rise.
const TREAD_PER_RISE: f64 = 1.5;
/// An undercroft's chapel floor over the floor, its platform's length along the way and its stairs' width, metres.
const CHAPEL_UP_M: f64 = 2.4;
const PLATFORM_M: f64 = 2.0;
const CHAPEL_STAIR_WIDE_M: f64 = 5.0;
/// The walls of a room square to the world, as `halls::room` lays them: north, east, south, west, each outward.
const OUTWARD: [[f64; 2]; 4] = [[0.0, -1.0], [1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]];

/// What a body climbs in a run: `walk` is its way over it, from the floor at its foot to a keep's turret top or on down
/// to an undercroft's floor past its chapel; `print` (west, north, east, south) the ground it takes, which the run's
/// other pieces keep off; `side` the ward's wall a keep's climbs, among a room's walls.
#[derive(Debug, Clone, PartialEq)]
pub struct Climb {
    pub walk: Vec<[f64; 2]>,
    pub print: [f64; 4],
    pub side: Option<usize>,
    /// Where its floor is read.
    base: [f64; 2],
    /// Its stairs: their foot and head, the heights they rise from and to over the floor, and their width.
    stairs: Vec<([[f64; 2]; 2], [f64; 2], f64)>,
    /// Its floors, solid to the ground: along a line, their top over the floor and their width.
    floors: Vec<([[f64; 2]; 2], f64, f64)>,
    /// A turret's middle, and the way its top is come onto from.
    turret: Option<([f64; 2], [f64; 2])>,
}

fn at(from: [f64; 2], ways: &[([f64; 2], f64)]) -> [f64; 2] {
    ways.iter().fold(from, |point, &(way, out)| [point[0] + way[0] * out, point[1] + way[1] * out])
}

fn unit(from: [f64; 2], to: [f64; 2]) -> [f64; 2] {
    let length = crate::field::distance(from, to).max(1e-9);
    [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

fn print_of(points: &[[f64; 2]]) -> [f64; 4] {
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    points
        .iter()
        .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)])
}

/// How far a point lies from a print, metres (0 inside it).
#[must_use]
pub fn off_print(print: [f64; 4], point: [f64; 2]) -> f64 {
    let across = (print[0] - point[0]).max(point[0] - print[2]).max(0.0);
    let down = (print[1] - point[1]).max(point[1] - print[3]).max(0.0);
    (across * across + down * down).sqrt()
}

/// A building run's climb: a keep's in its ward, along the wall its way keeps furthest from (none where every wall's
/// climb comes within the way's half-width and 1.2 m of it), or an undercroft's at its mouth; none for the rest.
#[must_use]
pub fn climb(run: &Run) -> Option<Climb> {
    match run.kind {
        RunKind::Keep => keep(run),
        RunKind::Undercroft => chapel(run),
        _ => None,
    }
}

/// A keep's stair along the inside of one of its ward's walls from near one corner, its wall-walk on to the other,
/// and a short stair up onto the turret there.
fn keep(run: &Run) -> Option<Climb> {
    let ward = run.beats.last()?;
    let half = ward.radius * ROOM_SHARE;
    let stair_m = WALK_UP_M * TREAD_PER_RISE;
    let steps_m = (TOWER_UP_M - WALK_UP_M) * TREAD_PER_RISE;
    // Along the wall from its far corner: the foot, the stair, the walk, the short stair onto the turret's box.
    let (foot, start) = (-half + 3.5, -half + 4.5);
    let (head, onto) = (start + stair_m, half + WALL_M / 2.0 - TURRET_M / 2.0);
    if head + 1.0 > onto - steps_m {
        return None;
    }
    let way = run.way();
    let off_way =
        |point: [f64; 2]| way.windows(2).map(|pair| off_line(point, pair[0], pair[1])).fold(f64::INFINITY, f64::min);
    let options = (0..4).flat_map(|side| [1.0, -1.0].map(|turn| (side, turn)));
    let shaped = options.map(|(side, turn)| {
        let out = OUTWARD[side];
        let along = [-out[1] * turn, out[0] * turn];
        // A point `x` along the wall and `inward` from its inner face.
        let on = |x: f64, inward: f64| at(ward.at, &[(out, half - inward), (along, x)]);
        let middle = WALK_WIDE_M / 2.0;
        let corner = at(ward.at, &[(out, half + WALL_M / 2.0), (along, half + WALL_M / 2.0)]);
        let climb = Climb {
            walk: vec![on(foot, middle), on(head + 0.5, middle), on(half - 0.6, middle), corner],
            print: print_of(&[on(foot - 1.0, 0.0), on(half, WALK_WIDE_M + 1.0)]),
            side: Some(side),
            base: ward.at,
            stairs: vec![
                ([on(start, middle), on(head, middle)], [0.0, WALK_UP_M], WALK_WIDE_M),
                ([on(onto - steps_m, middle), on(onto, middle)], [WALK_UP_M, TOWER_UP_M], WALK_WIDE_M),
            ],
            // The walk, and a landing from the short stair's head on into the turret, so no gap shows at its round
            // wall; the turret's box begins at the stair's head.
            floors: vec![
                ([on(head, middle), on(onto, middle)], WALK_UP_M, WALK_WIDE_M),
                ([on(onto - 0.3, middle), on(onto + 0.6, middle)], TOWER_UP_M, WALK_WIDE_M),
            ],
            turret: Some((corner, unit(corner, on(half - 1.2, middle)))),
        };
        let line = (0..=((half - foot) as usize)).map(|x| on(foot + x as f64, middle));
        let clear = line.map(|point| off_way(point) - middle).fold(off_way(corner) - TURRET_M / 2.0, f64::min);
        (clear, climb)
    });
    let (clear, climb) = shaped.fold(None, |best: Option<(f64, Climb)>, (clear, climb)| match best {
        Some(best) if best.0 >= clear => Some(best),
        _ => Some((clear, climb)),
    })?;
    (clear >= half_of(RunKind::Keep) + 1.2).then_some(climb)
}

/// An undercroft's chapel floor, inside its ruined chapel just past its mouth: a platform on its way, a stair up to it
/// and a stair down off it along the world's axis nearest the way in, each centred where the way crosses it.
fn chapel(run: &Run) -> Option<Climb> {
    let way = unit(run.mouth, *run.line.get(1)?);
    let axis = if way[0].abs() >= way[1].abs() { [way[0].signum(), 0.0] } else { [0.0, way[1].signum()] };
    let lateral = [-axis[1], axis[0]];
    let (edge, out) = (PLATFORM_M / 2.0, PLATFORM_M / 2.0 + CHAPEL_UP_M * TREAD_PER_RISE);
    // The stair up starts just past the mouth, the way's first point, so no point of the way is on a step.
    let forward = way[0] * axis[0] + way[1] * axis[1];
    let middle = at(run.mouth, &[(way, (out + 0.5) / forward)]);
    // How far the way strays across the axis a metre along it.
    let slope = (way[0] * lateral[0] + way[1] * lateral[1]) / forward;
    let on = |along: f64, across: f64| at(middle, &[(axis, along), (lateral, across)]);
    let stair_at = (edge + out) / 2.0;
    let stair_of = |sign: f64| {
        let across = stair_at * sign * slope;
        ([on(out * sign, across), on(edge * sign, across)], [0.0, CHAPEL_UP_M], CHAPEL_STAIR_WIDE_M)
    };
    // The platform spans both stairs across.
    let wide = CHAPEL_STAIR_WIDE_M / 2.0 + stair_at * slope.abs();
    Some(Climb {
        walk: vec![on(-out - 1.0, (-out - 1.0) * slope), middle, on(out + 2.5, (out + 2.5) * slope)],
        print: print_of(&[on(-out, -wide), on(out, wide)]),
        side: None,
        base: middle,
        stairs: vec![stair_of(-1.0), stair_of(1.0)],
        floors: vec![([on(-edge, 0.0), on(edge, 0.0)], CHAPEL_UP_M, 2.0 * wide)],
        turret: None,
    })
}

/// Lays a building run's climb, after its other pieces have been kept off its way: this is walked on.
pub fn build(kit: &mut Kit, run: &Run, carved: &Sculpts) {
    let Some(climb) = climb(run) else { return };
    let floor = carved_at(kit, carved, climb.base);
    let mut out: Vec<Solid> = Vec::new();
    for &([foot, head], [from, to], width) in &climb.stairs {
        stair(&mut out, [foot[0], foot[1], floor + from], [head[0], head[1], floor + to], width, Material::Stone);
    }
    for &([from, to], top, width) in &climb.floors {
        wall(&mut out, from, to, floor - 0.4, floor + top, width, Material::Stone);
    }
    if let Some((middle, open)) = climb.turret {
        turret(&mut out, middle, [floor - 1.0, floor + TOWER_UP_M], Some(open), Material::Stone);
    }
    kit.into.solids.extend(out);
}
