//! The body, what its player asks of it, and the numbers it moves by.

use std::f64::consts::PI;

/// One tick of the simulation, in seconds: the server and every predicting browser step bodies by exactly this.
pub const TICK_SECONDS: f64 = 1.0 / 60.0;

/// The body's measures and pace, in metres, metres a second and seconds: DFO's numbers.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tuning {
    pub walk: f64,
    pub run: f64,
    pub crouch: f64,
    pub ride_walk: f64,
    pub ride_gallop: f64,
    pub jump: f64,
    pub gravity: f64,
    pub radius: f64,
    pub step: f64,
    pub eye: f64,
    pub crouched_eye: f64,
    /// The body's height, feet to crown, standing and crouched: the eye and a little over it.
    pub height: f64,
    pub crouched_height: f64,
    pub crouch_seconds: f64,
    pub grounded_to_jump: f64,
    pub crouched_jump: f64,
    /// How high a lip can be grabbed from the feet, standing, and how much higher in the air.
    pub reach: f64,
    pub reach_in_air: f64,
    /// The highest lip vaulted over, and the deepest block.
    pub vault: f64,
    pub vault_depth: f64,
    /// Hanging from a lip, it is this far over the feet.
    pub hang: f64,
    pub shimmy: f64,
    pub climb: f64,
    /// The steepest terrain walked up, in metres of rise a metre across: about 50°. The game's own, not DFO's.
    pub slope: f64,
    /// A rider's boost: how much faster the horse goes, for how long, and how long it then takes to recharge
    /// (seconds), the same as a ship's burst.
    pub ride_boost: f64,
    pub boost_seconds: f64,
    pub recharge_seconds: f64,
}

pub const TUNING: Tuning = Tuning {
    walk: 4.43,
    run: 7.59,
    crouch: 2.53,
    ride_walk: 6.0,
    ride_gallop: 12.0,
    jump: 4.5,
    gravity: 20.0,
    radius: 0.35,
    step: 0.5,
    eye: 1.7,
    crouched_eye: 0.8,
    height: 1.8,
    crouched_height: 1.0,
    crouch_seconds: 0.1,
    grounded_to_jump: 0.1,
    crouched_jump: 0.8,
    reach: 1.8,
    reach_in_air: 0.15,
    vault: 1.2,
    vault_depth: 0.8,
    hang: 1.8,
    shimmy: 1.0,
    climb: 1.0,
    slope: 1.19,
    ride_boost: 1.5,
    boost_seconds: 4.0,
    recharge_seconds: 12.0,
};

/// What the player asks of the body this tick: movement relative to where it looks (-1..1), the look's bearing in
/// radians clockwise from north, and the keys that act once: the jump, the crouch and the rider's boost.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Controls {
    pub forward: f64,
    pub sideways: f64,
    pub yaw: f64,
    pub run: bool,
    pub jump: bool,
    pub crouch: bool,
    pub mounted: bool,
    pub boost: bool,
}

/// How the body is held: on its feet, in the air, hanging from a lip, on a wall, or mantling or vaulting over one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Ground = 0,
    Air = 1,
    Hang = 2,
    Climb = 3,
    Mantle = 4,
    Vault = 5,
}

/// A mantle's or a vault's start and end (x, y, z), its progress 0..1, and how long it takes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Over {
    pub from: [f64; 3],
    pub to: [f64; 3],
    pub progress: f64,
    pub seconds: f64,
}

/// The body: its feet (x east, y south, z up, metres), its velocity, the way it faces, and how it is held.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Body {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub facing: f64,
    pub mode: Mode,
    pub crouched: bool,
    /// 0 standing to 1 crouched, easing between.
    pub crouch: f64,
    /// How long it has stood on the ground, for the jump.
    pub grounded: f64,
    pub over: Option<Over>,
    /// The lip it hangs from, climbs towards or goes over.
    pub lip: f64,
    /// Whether it moved along the ground or the wall this tick.
    pub moving: bool,
    /// The seconds its rider's boost still runs, then the seconds before it may boost again.
    pub boosting: f64,
    pub recharging: f64,
}

impl Body {
    /// How tall it is, feet to crown: crouched or standing.
    #[must_use]
    pub fn height(&self) -> f64 {
        if self.crouched { TUNING.crouched_height } else { TUNING.height }
    }
}

/// A body standing on open ground at (x, y), facing south.
#[must_use]
pub const fn standing(x: f64, y: f64) -> Body {
    Body {
        x,
        y,
        z: 0.0,
        vx: 0.0,
        vy: 0.0,
        vz: 0.0,
        facing: PI,
        mode: Mode::Ground,
        crouched: false,
        crouch: 0.0,
        grounded: 1.0,
        over: None,
        lip: 0.0,
        moving: false,
        boosting: 0.0,
        recharging: 0.0,
    }
}
