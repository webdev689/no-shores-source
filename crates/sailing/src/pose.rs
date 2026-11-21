//! How a ship lies on the water: its height, pitch and roll from the water under its bow, stern, sides and middle,
//! and its keel's points that touch the ground.

use crate::Hull;
use crate::helm::HANDLING;
use crate::ship::{Ship, length};
use crate::waters::{Spot, Waters};

/// Its waterline's middle above still water (metres), its bow's rise and its heel to starboard (radians), and
/// whether its keel touches the ground anywhere (within a hand of it, so a ship the ground has stopped says so).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pose {
    pub heave: f64,
    pub pitch: f64,
    pub roll: f64,
    pub aground: bool,
}

/// Its forward and starboard directions, east and south, at `heading` radians clockwise from north.
#[must_use]
pub fn frame(heading: f64) -> ([f64; 2], [f64; 2]) {
    let (sine, cosine) = (libm::sin(heading), libm::cos(heading));
    ([sine, -cosine], [cosine, sine])
}

/// The world point `along` metres toward its bow and `across` to starboard of its middle.
fn place(ship: &Ship, along: f64, across: f64) -> (f64, f64) {
    let (forward, starboard) = frame(ship.heading);
    (ship.x + forward[0] * along + starboard[0] * across, ship.y + forward[1] * along + starboard[1] * across)
}

/// The water's height at a point as a hull of time constant `lag` seconds rides it, or the ground's where it is dry.
fn level_at(waters: &impl Waters, (x, y): (f64, f64), time: f64, lag: f64) -> f64 {
    let spot = waters.lagged(x, y, time, lag);
    spot.surface.unwrap_or(spot.bed)
}

/// A hull's time constant on the swell, seconds a metre of its waterline's length: a bigger hull answers slower.
pub const LAG_S_PER_M: f64 = 0.02;

/// Its time constant on the swell, seconds, by its waterline's length.
#[must_use]
pub fn lag_of(hull: &Hull) -> f64 {
    LAG_S_PER_M * 2.0 * hull.half_length_m
}

/// How near its draught the water under its keel may come before it is said to touch the ground, metres.
const TOUCH_M: f64 = 0.05;

/// The bed and the water under its keel's points aft, amidships and forward.
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

/// Come Sail Away's heel in a turn, radians: into it, by its swing and its way, once it makes a wake.
fn turn_heel(ship: &Ship) -> f64 {
    let way = length(ship.ahead, ship.abeam);
    if way < HANDLING.move_speed_sail * 0.25 {
        return 0.0;
    }
    let lean = (ship.turn / HANDLING.turn_speed_sail) * (way * 0.1 / HANDLING.move_speed_sail);
    (lean * 5.0).clamp(-30.0, 30.0).to_radians()
}

/// Its pose at `time`: the mean of the water under its bow, stern, sides and middle at its waterline, its slope along
/// and across it, each felt through its inertia (`lag_of`), and its heel in a turn.
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
