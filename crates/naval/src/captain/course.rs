//! A captain's geometry, as DFO's: bearings clockwise from north, where to steer to meet a ship, where a ball meets
//! her, the course that runs from a threat with the best wind, and the bend that keeps her clear of another hull.

use sailing::helm::point_of_sail;
use sailing::pose::frame;
use sailing::ship::{Ship, length, off_run_deg};
use std::f64::consts::{PI, TAU};

pub const DEG: f64 = PI / 180.0;
/// A ship that outruns her is led this long at most (seconds).
pub const PURSUIT_LEAD_S: f64 = 20.0;
/// Running, she takes a course within this many degrees of dead away, in steps of 15.
pub const FLEE_SPREAD_DEG: f64 = 60.0;
/// Another hull that will pass within both reaches and this margin (metres) inside this many seconds, from within
/// this range, bends her course by up to this many degrees: to starboard for one within this many of her bow.
pub const AVOID_SHIP_CLEAR: f64 = 15.0;
pub const AVOID_SHIP_S: f64 = 25.0;
pub const AVOID_SHIP_RANGE: f64 = 250.0;
pub const AVOID_SHIP_SWING_DEG: f64 = 60.0;
pub const AVOID_HEAD_ON_DEG: f64 = 22.5;

/// An angle within (-π, π].
#[must_use]
pub fn wrap(angle: f64) -> f64 {
    let within = (angle + PI).rem_euclid(TAU) - PI;
    if within <= -PI { within + TAU } else { within }
}

/// The heading from one point to another, radians clockwise from north.
#[must_use]
pub fn heading_to(from: [f64; 2], to: [f64; 2]) -> f64 {
    libm::atan2(to[0] - from[0], from[1] - to[1])
}

#[must_use]
pub fn distance(from: [f64; 2], to: [f64; 2]) -> f64 {
    length(to[0] - from[0], to[1] - from[1])
}

/// Her velocity over the water, east and south.
#[must_use]
pub fn velocity_of(ship: &Ship) -> [f64; 2] {
    let (forward, starboard) = frame(ship.heading);
    [forward[0] * ship.ahead + starboard[0] * ship.abeam, forward[1] * ship.ahead + starboard[1] * ship.abeam]
}

/// Where a ball of `speed` from `from` meets a target moving at `rel` to her: three passes of its flight, a laid
/// gun's way along the flat (0.97 of its speed).
#[must_use]
pub fn lead_point(from: [f64; 2], target: [f64; 2], rel: [f64; 2], speed: f64) -> [f64; 2] {
    let mut point = target;
    for _ in 0..3 {
        let flight = distance(from, point) / (speed * 0.97).max(1.0);
        point = [target[0] + rel[0] * flight, target[1] + rel[1] * flight];
    }
    point
}

/// Where she meets a ship moving at `vel` if she sails at `speed`, and the heading there: the first time both come
/// to one point, or, if it outruns her, where it will be a while on.
#[must_use]
pub fn intercept(from: [f64; 2], speed: f64, target: [f64; 2], vel: [f64; 2]) -> ([f64; 2], f64) {
    let gap = [target[0] - from[0], target[1] - from[1]];
    let speed = speed.max(0.5);
    let square = vel[0] * vel[0] + vel[1] * vel[1] - speed * speed;
    let linear = 2.0 * (gap[0] * vel[0] + gap[1] * vel[1]);
    let constant = gap[0] * gap[0] + gap[1] * gap[1];
    let meet = if square.abs() < 1e-9 {
        (linear < 0.0).then(|| -constant / linear)
    } else {
        let room = linear * linear - 4.0 * square * constant;
        (room >= 0.0)
            .then(|| {
                let root = room.sqrt();
                [(-linear - root) / (2.0 * square), (-linear + root) / (2.0 * square)]
                    .into_iter()
                    .filter(|time| *time > 0.0)
                    .min_by(f64::total_cmp)
            })
            .flatten()
    };
    let time = meet.unwrap_or_else(|| PURSUIT_LEAD_S.min(constant.sqrt() / speed));
    let point = [target[0] + vel[0] * time, target[1] + vel[1] * time];
    (point, heading_to(from, point))
}

/// Running from a threat at `from`: the heading within `FLEE_SPREAD_DEG` of dead away whose wind, weighed by how
/// near dead away it is, is best.
#[must_use]
pub fn flee_course(me: [f64; 2], from: [f64; 2], wind: [f64; 2]) -> f64 {
    let away = heading_to(from, me);
    let mut best = (away, f64::NEG_INFINITY);
    let mut off = -FLEE_SPREAD_DEG;
    while off <= FLEE_SPREAD_DEG {
        let heading = wrap(away + off * DEG);
        let worth = point_of_sail(off_run_deg(frame(heading).0, wind)) * libm::cos(off * DEG);
        if worth > best.1 + 1e-9 {
            best = (heading, worth);
        }
        off += 15.0;
    }
    best.0
}

/// A hull about her: where it is and its way, east and south, and its pass reach (`pass_reach`).
pub type Traffic = ([f64; 2], [f64; 2], f64);

/// A hull's pass reach, metres: half of half her box's beam and half its length.
#[must_use]
pub fn pass_reach(arms: &crate::arms::Arms) -> f64 {
    let [low, high] = arms.hull;
    0.5 * ((high[1] - low[1]) / 2.0 + (high[0] - low[0]) / 2.0)
}

/// `want` bent clear of the hulls about her (`others`, each where it is, its way and its pass reach; hers `vel`, her
/// heading `heading`, her pass reach `reach`): each that will pass within both reaches and `AVOID_SHIP_CLEAR` soon
/// bends it by its urgency, to starboard for a hull off her bow, else away from where it will lie, up to
/// `AVOID_SHIP_SWING_DEG` in all.
#[must_use]
pub fn traffic_course((me, heading, vel): ([f64; 2], f64, [f64; 2]), want: f64, others: &[Traffic], reach: f64) -> f64 {
    let most = AVOID_SHIP_SWING_DEG * DEG;
    let mut bend = None;
    for &(other, other_vel, other_reach) in others {
        let gap = [other[0] - me[0], other[1] - me[1]];
        if length(gap[0], gap[1]) > AVOID_SHIP_RANGE {
            continue;
        }
        let closing = [other_vel[0] - vel[0], other_vel[1] - vel[1]];
        let square = closing[0] * closing[0] + closing[1] * closing[1];
        let nearest =
            if square > 1e-6 { (-(gap[0] * closing[0] + gap[1] * closing[1]) / square).max(0.0) } else { 0.0 };
        if nearest > AVOID_SHIP_S {
            continue;
        }
        let then = [gap[0] + closing[0] * nearest, gap[1] + closing[1] * nearest];
        let pass = length(then[0], then[1]);
        let room = reach + other_reach + AVOID_SHIP_CLEAR;
        if pass >= room {
            continue;
        }
        let urgency = (1.0 - pass / room) * (1.0 - nearest / AVOID_SHIP_S);
        let bearing = wrap(heading_to([0.0, 0.0], gap) - heading);
        let lies = wrap(heading_to([0.0, 0.0], then) - heading);
        let way = if bearing.abs() < AVOID_HEAD_ON_DEG * DEG || lies <= 0.0 { 1.0 } else { -1.0 };
        let this = way * urgency * most;
        bend = Some(bend.map_or(this, |sum: f64| sum + this));
    }
    bend.map_or(want, |bend| wrap(want + bend.clamp(-most, most)))
}

#[cfg(test)]
#[path = "course_tests.rs"]
mod tests;
