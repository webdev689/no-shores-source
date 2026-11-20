//! A ship's step, as Come Sail Away's UpdateSailing under DFO's responsive helm: its helm's ladder, its turn and way
//! eased toward what its oars or sails ask, its move in its own frame and then its swing, and the ground refusing a
//! move that would put its keel on it.

use crate::Hull;
use crate::helm::{
    COAST, HANDLING, PACE, SAIL_ACCEL, TURN_ACCEL_SAIL, canvas_drive, point_of_sail, sea_wind, steerage,
};
use crate::pose::{frame, keel_spots, shallower};
use crate::waters::Waters;
use std::f64::consts::TAU;

/// A ship: its middle (metres east and south), its heading (radians clockwise from north, in [0, 2π)), its way ahead
/// and to starboard (m/s, its own frame), its swing (degrees a second, to starboard), the share of its way its canvas
/// made (m/s), and its helm's rung: -1 oars astern, 0 at rest, 1 oars ahead, 2 sails set.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ship {
    pub x: f64,
    pub y: f64,
    pub heading: f64,
    pub ahead: f64,
    pub abeam: f64,
    pub turn: f64,
    pub sail_way: f64,
    pub rung: i8,
}

/// What the helm asks for a tick: the rudder (-1 to port, 1 to starboard), whether the oars pull it sideways
/// (Shift), and a rung up or down the ladder (a W or S press, for one tick).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Helm {
    pub steer: f64,
    pub crab: bool,
    pub climb: i8,
}

/// The rung its sails are set at.
pub const SAILS_SET: i8 = 2;

/// The shares of the way its sails and its oars may ask that its hurts leave it (naval combat's: canvas shot away,
/// a wreck's oars), and of the turn its helm asks that its trim gives it; whole for a sound ship.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pull {
    pub sail: f64,
    pub oars: f64,
    pub turn: f64,
}

/// A sound ship's pull.
pub const WHOLE: Pull = Pull { sail: 1.0, oars: 1.0, turn: 1.0 };

/// A vector's length, from a square root alone.
#[must_use]
pub fn length(east: f64, south: f64) -> f64 {
    (east * east + south * south).sqrt()
}

/// Unity's MoveTowards: `current` toward `target` by at most `most`.
fn toward(current: f64, target: f64, most: f64) -> f64 {
    if (target - current).abs() <= most { target } else { current + (target - current).signum() * most }
}

/// Unity's Vector3.MoveTowards, in the plane.
fn toward_vector(current: [f64; 2], target: [f64; 2], most: f64) -> [f64; 2] {
    let (east, south) = (target[0] - current[0], target[1] - current[1]);
    let square = east * east + south * south;
    if square == 0.0 || square <= most * most {
        return target;
    }
    let distance = square.sqrt();
    [current[0] + east / distance * most, current[1] + south / distance * most]
}

/// Degrees between its forward and where the wind blows to: 0 running before it, 180 in its eye.
#[must_use]
pub fn off_run_deg(forward: [f64; 2], wind: [f64; 2]) -> f64 {
    let cross = forward[0] * wind[1] - forward[1] * wind[0];
    let dot = forward[0] * wind[0] + forward[1] * wind[1];
    libm::atan2(cross.abs(), dot).to_degrees()
}

/// How fast it loses a way its oars or sails no longer hold (coastAccel): faster, up to its gain, for the share of
/// it its canvas made.
fn coast_accel(way: f64, sail_way: f64, hull: &Hull) -> f64 {
    let coast = HANDLING.move_accel_sail * COAST;
    let share = if way > 0.0 { (sail_way / way).min(1.0) } else { 0.0 };
    if share <= 0.0 { coast } else { coast * (1.0 + (hull.gain - 1.0) * share) }
}

/// What its helm asks: its swing (degrees a second), its way ahead and abeam (m/s), and the rates it reaches them.
struct Asked {
    turn: f64,
    way: [f64; 2],
    accel: f64,
    turn_accel: f64,
}

fn under_sail(helm: &Helm, hull: &Hull, way: f64, forward: [f64; 2], wind: [f64; 2]) -> Asked {
    let blowing = sea_wind(length(wind[0], wind[1]));
    let drive = canvas_drive(hull) * point_of_sail(off_run_deg(forward, wind)) * blowing * PACE;
    Asked {
        turn: helm.steer * steerage(way / hull.gain),
        way: [drive * HANDLING.move_speed_sail, 0.0],
        accel: HANDLING.move_accel_sail * blowing * SAIL_ACCEL * hull.gain,
        turn_accel: HANDLING.turn_accel_sail * TURN_ACCEL_SAIL,
    }
}

fn under_oars(helm: &Helm, hull: &Hull, rung: i8, way: f64, sail_way: f64) -> Asked {
    let steering = helm.steer != 0.0;
    let aside = if helm.crab { 0.5 * helm.steer } else { 0.0 };
    // Backing water, the helm answers the other way; pulling the ship sideways, it does not swing it.
    let swing = if helm.crab {
        0.0
    } else if rung < 0 {
        -helm.steer
    } else {
        helm.steer
    };
    let target = [f64::from(rung) * HANDLING.move_speed_oar, aside * HANDLING.move_speed_oar];
    let coast = coast_accel(way, sail_way, hull);
    let accel = if rung == 0 && !(helm.crab && steering) {
        coast
    } else if way > length(target[0], target[1]) {
        HANDLING.move_accel_oar.max(coast)
    } else {
        HANDLING.move_accel_oar
    };
    let turn_accel = if steering { HANDLING.turn_accel_oar } else { HANDLING.turn_accel_sail * TURN_ACCEL_SAIL };
    Asked { turn: swing * HANDLING.turn_speed_oar, way: target, accel, turn_accel }
}

/// One step of `seconds`: `wind` is where the wind blows to and how hard (m/s, east and south).
#[must_use]
pub fn step_ship(
    ship: &Ship,
    helm: &Helm,
    hull: &Hull,
    wind: [f64; 2],
    waters: &impl Waters,
    time: f64,
    seconds: f64,
) -> Ship {
    step_pulled(ship, helm, hull, wind, waters, time, seconds, WHOLE)
}

/// One step of a ship its hurts hold back: the way its sails or its oars ask is `pull`'s share of a sound ship's.
#[must_use]
#[allow(clippy::too_many_arguments, reason = "a sound ship's step and the pull its hurts leave")]
pub fn step_pulled(
    ship: &Ship,
    helm: &Helm,
    hull: &Hull,
    wind: [f64; 2],
    waters: &impl Waters,
    time: f64,
    seconds: f64,
    pull: Pull,
) -> Ship {
    let top = if hull.sails.is_empty() { 1 } else { SAILS_SET };
    let rung = ship.rung.saturating_add(helm.climb).clamp(-1, top);
    let was = length(ship.ahead, ship.abeam);
    let (forward, starboard) = frame(ship.heading);
    let sail_way = ship.sail_way.min(was);
    let (asked, share) = if rung == SAILS_SET {
        (under_sail(helm, hull, was, forward, wind), pull.sail)
    } else {
        (under_oars(helm, hull, rung, was, sail_way), pull.oars)
    };
    let asked = Asked { way: [asked.way[0] * share, asked.way[1] * share], ..asked };
    let turn = toward(ship.turn, asked.turn * pull.turn, asked.turn_accel * pull.turn * seconds);
    let [ahead, abeam] = toward_vector([ship.ahead, ship.abeam], asked.way, asked.accel * seconds);
    let way = length(ahead, abeam);
    let sail_way = if way < was {
        sail_way * (way / was)
    } else if rung == SAILS_SET {
        sail_way + (way - was)
    } else {
        sail_way
    };
    // The mod's order: it moves in its own frame, then swings.
    let heading = (ship.heading + turn.to_radians() * seconds).rem_euclid(TAU);
    let moved = Ship {
        x: ship.x + (forward[0] * ahead + starboard[0] * abeam) * seconds,
        y: ship.y + (forward[1] * ahead + starboard[1] * abeam) * seconds,
        // A heading a hair under zero wraps to 2π itself: that is north, 0.
        heading: if heading < TAU { heading } else { 0.0 },
        ahead,
        abeam,
        turn,
        sail_way,
        rung,
    };
    // A keel point grounds where it was afloat, or where it was aground already and the bed rises under it.
    let before = keel_spots(ship, hull, waters, time);
    let grounds = |candidate: &Ship| {
        keel_spots(candidate, hull, waters, time).iter().zip(&before).any(|(now, then)| {
            shallower(now, hull.draught_m) && (!shallower(then, hull.draught_m) || now.bed > then.bed)
        })
    };
    if !grounds(&moved) {
        return moved;
    }
    // It runs on unswung where only its swing would ground it, or swings clear where only its way would: the mod
    // refused only the part that ran into what it touched. Both grounding, it is held and loses its way.
    let unswung = Ship { heading: ship.heading, turn: 0.0, ..moved };
    if !grounds(&unswung) {
        return unswung;
    }
    let swung = Ship { heading: moved.heading, ahead: 0.0, abeam: 0.0, turn, sail_way: 0.0, rung, ..*ship };
    if grounds(&swung) { Ship { ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung, ..*ship } } else { swung }
}

#[cfg(test)]
#[path = "ship_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "rig_tests.rs"]
mod rig_tests;
