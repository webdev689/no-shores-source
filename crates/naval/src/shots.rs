//! Balls in flight: each stepped along its closed form in pieces, tearing through the canvas it crosses, and stopped
//! by the first hull, water or ground it meets. The water is the swell's surface under the ball, and the ground the
//! land's, sampled every few metres along a piece.

use crate::ballistics::{Ball, Block, flight, segment_entry};
use crate::damage::{Zone, zone_at};
use crate::guns::{Gun, Shot};
use sailing::waters::Waters;

/// A ball still aloft this long after its gun is gone (seconds).
pub const BALL_LIFE_S: f64 = 9.0;
/// The longest piece of a flight swept at once (seconds), and how far apart its water and ground are sampled (metres).
pub const BALL_STEP_S: f64 = 0.1;
pub const GROUND_STEP_M: f64 = 4.0;

/// A ship's number in a fight, never shared while she is in it.
pub type ShipId = u32;

/// Whom a ship sails for: the players, or the pirates. A ball strikes only a ship that flies another flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flag {
    Player,
    Pirate,
}

/// A ship as a ball meets her: her number and flag, her hull's box, her sails' boxes, and whether she is still there
/// to strike.
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub id: ShipId,
    pub flag: Flag,
    pub hull: Block,
    pub rig: Vec<Block>,
    pub alive: bool,
}

/// What became of a ball: it left its gun, struck a ship, fell into the water or onto the ground, or flew out of
/// reckoning. Ships are named by their numbers.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShotEvent {
    Muzzle { shooter: ShipId, point: [f64; 3], launch: [f64; 3] },
    Hit { shooter: ShipId, target: ShipId, zone: Zone, point: [f64; 3], flight: f64, gun: Gun, shot: Shot },
    Splash { shooter: ShipId, point: [f64; 3] },
    Land { shooter: ShipId, point: [f64; 3] },
    Gone { shooter: ShipId },
}

/// What stops a ball at a point: the water's surface, or the ground where there is none; and whether it is water.
fn floor_at(waters: &impl Waters, point: [f64; 3], time: f64) -> (f64, bool) {
    let spot = waters.at(point[0], point[1], time);
    spot.surface.map_or((spot.bed, false), |surface| (surface, true))
}

fn between(start: [f64; 3], end: [f64; 3], share: f64) -> [f64; 3] {
    [0, 1, 2].map(|axis| start[axis] + (end[axis] - start[axis]) * share)
}

/// Where along `start`-`end` a ball first goes under the water or the ground, as a share of the way, and whether it
/// is water: sampled every `GROUND_STEP_M`, the crossing found between the last sample over and the first under.
fn under_along(start: [f64; 3], end: [f64; 3], waters: &impl Waters, time: f64) -> Option<(f64, bool)> {
    let run = [0, 1, 2].map(|axis| end[axis] - start[axis]);
    let length = (run[0] * run[0] + run[1] * run[1] + run[2] * run[2]).sqrt();
    let samples = (length / GROUND_STEP_M).ceil().max(1.0);
    let (level, water) = floor_at(waters, start, time);
    let mut clear = start[2] - level;
    if clear < 0.0 {
        return Some((0.0, water));
    }
    let mut was = 0.0;
    for sample in 1..=(samples as u32) {
        let share = f64::from(sample) / samples;
        let point = between(start, end, share);
        let (level, water) = floor_at(waters, point, time);
        let now = point[2] - level;
        if now < 0.0 {
            return Some((was + (share - was) * clear / (clear - now), water));
        }
        (clear, was) = (now, share);
    }
    None
}

/// One piece of a ball's flight, `start` to `end` (its flight `to` seconds there): the canvas it tears on the way,
/// then what stops it. The share of the way it is spent at, if it is.
fn fly_piece(
    ball: &mut Ball,
    (start, end, to): ([f64; 3], [f64; 3], f64),
    targets: &[Target],
    waters: &impl Waters,
    time: f64,
    events: &mut Vec<ShotEvent>,
) -> Option<f64> {
    let radius = ball.gun.radius_m;
    let in_play = |at: usize| {
        let target = &targets[at];
        target.id != ball.shooter && target.flag != ball.flag && target.alive
    };
    let ship = (0..targets.len())
        .filter(|at| in_play(*at))
        .filter_map(|at| segment_entry(start, end, &targets[at].hull, radius).map(|share| (share, at)))
        .min_by(|one, other| one.0.total_cmp(&other.0));
    let under = under_along(start, end, waters, time);
    let first = ship.map_or(f64::INFINITY, |(share, _)| share).min(under.map_or(f64::INFINITY, |(share, _)| share));
    let flight_at = |share: f64| ball.flown + (to - ball.flown) * share;
    let mut torn: Vec<(f64, usize)> = (0..targets.len())
        .filter(|at| in_play(*at) && !ball.rigged.contains(&targets[*at].id))
        .filter_map(|at| {
            let entries = targets[at].rig.iter().filter_map(|sail| segment_entry(start, end, sail, radius));
            entries.filter(|share| *share <= first).min_by(f64::total_cmp).map(|share| (share, at))
        })
        .collect();
    torn.sort_by(|one, other| one.0.total_cmp(&other.0));
    for (share, at) in torn {
        ball.rigged.push(targets[at].id);
        let point = between(start, end, share);
        let (shooter, gun, shot) = (ball.shooter, ball.gun, ball.shot);
        events.push(ShotEvent::Hit {
            shooter,
            target: targets[at].id,
            zone: Zone::Rig,
            point,
            flight: flight_at(share),
            gun,
            shot,
        });
    }
    if first == f64::INFINITY {
        return None;
    }
    let shooter = ball.shooter;
    match (ship, under) {
        (Some((share, at)), _) if share == first => {
            let target = targets[at].id;
            let point = between(start, end, share);
            let zone = zone_at(point[2] - floor_at(waters, point, time).0);
            let (gun, shot) = (ball.gun, ball.shot);
            events.push(ShotEvent::Hit { shooter, target, zone, point, flight: flight_at(share), gun, shot });
        }
        (_, Some((share, true))) => {
            let mut point = between(start, end, share);
            point[2] = floor_at(waters, point, time).0;
            events.push(ShotEvent::Splash { shooter, point });
        }
        (_, Some((share, false))) => events.push(ShotEvent::Land { shooter, point: between(start, end, share) }),
        (_, None) => {}
    }
    Some(first)
}

/// Steps every ball to `clock` (seconds of the fight; `time` the world's): a ball whose time has come leaves its
/// gun, and each flies on until something stops it. The spent are taken out. Answers what became of them, in order.
pub fn step_balls(
    balls: &mut Vec<Ball>,
    clock: f64,
    targets: &[Target],
    waters: &impl Waters,
    time: f64,
) -> Vec<ShotEvent> {
    let mut events = Vec::new();
    balls.retain_mut(|ball| {
        if clock < ball.born {
            return true;
        }
        if !ball.fired {
            ball.fired = true;
            events.push(ShotEvent::Muzzle { shooter: ball.shooter, point: ball.start, launch: ball.launch });
        }
        let age = clock - ball.born;
        if age > BALL_LIFE_S {
            events.push(ShotEvent::Gone { shooter: ball.shooter });
            return false;
        }
        while ball.flown < age {
            let to = (ball.flown + BALL_STEP_S).min(age);
            let piece = (flight(ball.start, ball.launch, ball.flown), flight(ball.start, ball.launch, to), to);
            if fly_piece(ball, piece, targets, waters, time, &mut events).is_some() {
                return false;
            }
            ball.flown = to;
        }
        true
    });
    events
}

/// Where a ball stops: seconds after it left its gun, the point, whether in the water, and where it first met a
/// ship of another flag (her canvas or her hull), if it did.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Stop {
    pub time: f64,
    pub point: [f64; 3],
    pub water: bool,
    pub strike: Option<[f64; 3]>,
}

/// Where `ball`, flown alone by the same law in pieces of `piece_s` (a fight's tick, as its balls are stepped), stops:
/// the ships where `targets` has them each piece's end (seconds after it leaves its gun), the water as the swell
/// stands then, `time` the world's as it leaves. None if it is still aloft after `BALL_LIFE_S`.
pub fn stop_of(
    mut ball: Ball,
    targets: impl Fn(f64) -> Vec<Target>,
    (waters, time, piece_s): (&impl Waters, f64, f64),
) -> Option<Stop> {
    let mut events = Vec::new();
    while ball.flown < BALL_LIFE_S {
        let (from, to) = (ball.flown, ball.flown + piece_s.clamp(1e-3, BALL_STEP_S));
        let piece = (flight(ball.start, ball.launch, from), flight(ball.start, ball.launch, to), to);
        if let Some(share) = fly_piece(&mut ball, piece, &targets(to), waters, time + to, &mut events) {
            // A ball strikes only another flag's ships, so its first strike is on one.
            let strike = events.iter().find_map(|event| match *event {
                ShotEvent::Hit { point, .. } => Some(point),
                _ => None,
            });
            let (point, water) = match events.last() {
                Some(ShotEvent::Splash { point, .. }) => (*point, true),
                Some(ShotEvent::Hit { point, .. } | ShotEvent::Land { point, .. }) => (*point, false),
                _ => (between(piece.0, piece.1, share), false),
            };
            return Some(Stop { time: from + (to - from) * share, point, water, strike });
        }
        ball.flown = to;
    }
    None
}

#[cfg(test)]
#[path = "shots_tests.rs"]
mod tests;
