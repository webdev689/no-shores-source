//! How a ship lies on the water: her height, pitch and roll from the water under her bow, stern, sides and middle,
//! and her keel's points that touch the ground.

use crate::Hull;
use crate::helm::HANDLING;
use crate::ship::{Ship, length};
use crate::waters::{Spot, Waters};

/// Her waterline's middle above still water (metres), her bow's rise and her heel to starboard (radians), and
/// whether her keel touches the ground anywhere (within a hand of it, so a ship the ground has stopped says so).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pose {
    pub heave: f64,
    pub pitch: f64,
    pub roll: f64,
    pub aground: bool,
}

/// Her forward and starboard directions, east and south, at `heading` radians clockwise from north.
#[must_use]
pub fn frame(heading: f64) -> ([f64; 2], [f64; 2]) {
    let (sine, cosine) = (libm::sin(heading), libm::cos(heading));
    ([sine, -cosine], [cosine, sine])
}

/// The world point `along` metres toward her bow and `across` to starboard of her middle.
fn place(ship: &Ship, along: f64, across: f64) -> (f64, f64) {
    let (forward, starboard) = frame(ship.heading);
    (ship.x + forward[0] * along + starboard[0] * across, ship.y + forward[1] * along + starboard[1] * across)
}

/// The water's height at a point as a hull of time constant `lag` seconds rides it, or the ground's where it is dry.
fn level_at(waters: &impl Waters, (x, y): (f64, f64), time: f64, lag: f64) -> f64 {
    let spot = waters.lagged(x, y, time, lag);
    spot.surface.unwrap_or(spot.bed)
}

/// A hull's time constant on the swell, seconds a metre of her waterline's length: a bigger hull answers slower.
pub const LAG_S_PER_M: f64 = 0.02;

/// Her time constant on the swell, seconds, by her waterline's length.
#[must_use]
pub fn lag_of(hull: &Hull) -> f64 {
    LAG_S_PER_M * 2.0 * hull.half_length_m
}

/// How near her draught the water under her keel may come before she is said to touch the ground, metres.
const TOUCH_M: f64 = 0.05;

/// The bed and the water under her keel's points aft, amidships and forward.
#[must_use]
pub fn keel_spots(ship: &Ship, hull: &Hull, waters: &impl Waters, time: f64) -> [Spot; 3] {
    [-0.8, 0.0, 0.8].map(|share| {
        let (x, y) = place(ship, share * hull.half_length_m, 0.0);
        waters.at(x, y, time)
    })
}

/// Whether the water over the bed at a spot is shallower than `depth` metres (or there is none).
#[must_use]
pub fn shallower(spot: &Spot, depth: f64) -> bool {
    spot.surface.is_none_or(|surface| surface - spot.bed < depth)
}

/// Come Sail Away's heel in a turn, radians: into it, by her swing and her way, once she makes a wake.
fn turn_heel(ship: &Ship) -> f64 {
    let way = length(ship.ahead, ship.abeam);
    if way < HANDLING.move_speed_sail * 0.25 {
        return 0.0;
    }
    let lean = (ship.turn / HANDLING.turn_speed_sail) * (way * 0.1 / HANDLING.move_speed_sail);
    (lean * 5.0).clamp(-30.0, 30.0).to_radians()
}

/// Her pose at `time`: the mean of the water under her bow, stern, sides and middle at her waterline, its slope along
/// and across her, each felt through her inertia (`lag_of`), and her heel in a turn.
#[must_use]
pub fn pose_of(ship: &Ship, hull: &Hull, waters: &impl Waters, time: f64) -> Pose {
    let lag = lag_of(hull);
    let at = |along: f64, across: f64| level_at(waters, place(ship, along, across), time, lag);
    let (half_length, half_beam) = (hull.half_length_m, hull.half_beam_m);
    let (bow, stern) = (at(half_length, 0.0), at(-half_length, 0.0));
    let (port, starboard) = (at(0.0, -half_beam), at(0.0, half_beam));
    let heave = (bow + stern + port + starboard + at(0.0, 0.0)) / 5.0;
    Pose {
        heave,
        pitch: libm::atan2(bow - stern, 2.0 * half_length),
        roll: libm::atan2(port - starboard, 2.0 * half_beam) + turn_heel(ship),
        aground: keel_spots(ship, hull, waters, time).iter().any(|spot| shallower(spot, hull.draught_m + TOUCH_M)),
    }
}
