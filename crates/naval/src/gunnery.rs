//! A ship's guns: a reload clock for each broadside, the brace, the load, a side laid square to her hull for a range,
//! and the volley it fires, rippled down the side and scattered by its seed.

use crate::arms::{Arms, Side, posed};
use crate::ballistics::{Ball, elevation_for_range, launch_velocity, max_range, scatter};
use crate::guns::{Gun, SHOT_SWITCH, SWIVEL, Shot, loaded};
use crate::random::Mulberry32;
use sailing::pose::{Pose, frame};
use sailing::ship::Ship;
use std::f64::consts::PI;

/// Seconds between one gun of a broadside and the next.
pub const RIPPLE_S: f64 = 0.09;
/// A gun's reload alone at it, and how much longer each man short of a full crew makes it.
pub const RELOAD_SINGLEHANDED: f64 = 1.4;
pub const RELOAD_UNDERMANNED: f64 = 0.8;
const DEGREE: f64 = PI / 180.0;

/// The seconds a gun as loaded takes to load again: alone at it, or by a crew this share of its full number.
#[must_use]
pub fn reload_seconds(gun: &Gun, crew_share: f64, crewed: bool) -> f64 {
    if !crewed {
        return gun.reload_s * RELOAD_SINGLEHANDED;
    }
    gun.reload_s * (1.0 + RELOAD_UNDERMANNED * (1.0 - crew_share.clamp(0.0, 1.0)))
}

/// A ship's two broadsides: each one's seconds left to load and the length of its last reload, the load both fire,
/// and whether her crew is braced (no gun fires and no gun loads).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Guns {
    clocks: [f64; 2],
    lengths: [f64; 2],
    pub load: Shot,
    pub braced: bool,
}

impl Default for Guns {
    fn default() -> Self {
        Self::new()
    }
}

impl Guns {
    #[must_use]
    pub fn new() -> Self {
        Self { clocks: [0.0; 2], lengths: [1.0; 2], load: Shot::Round, braced: false }
    }

    /// Seconds left before a side is loaded.
    #[must_use]
    pub fn left(&self, side: Side) -> f64 {
        self.clocks[side.index()]
    }

    /// The share of its reload a side has done: 1 loaded.
    #[must_use]
    pub fn progress(&self, side: Side) -> f64 {
        let at = side.index();
        if self.clocks[at] > 0.0 { (1.0 - self.clocks[at] / self.lengths[at]).clamp(0.0, 1.0) } else { 1.0 }
    }

    #[must_use]
    pub fn ready(&self, side: Side) -> bool {
        !self.braced && self.clocks[side.index()] <= 0.0
    }

    /// The gun as both sides fire it now.
    #[must_use]
    pub fn gun(&self) -> Gun {
        loaded(&SWIVEL, self.load)
    }

    /// A side fired: its reload starts.
    pub fn fired(&mut self, side: Side, crew_share: f64, crewed: bool) {
        let seconds = reload_seconds(&self.gun(), crew_share, crewed);
        self.clocks[side.index()] = seconds;
        self.lengths[side.index()] = seconds;
    }

    /// Loads `shot`: a side standing loaded is drawn and loaded again in a share of the new load's reload; one loading
    /// takes the new load in, its clock scaled to the new reload. False when it is the load already.
    pub fn set_load(&mut self, shot: Shot, crew_share: f64, crewed: bool) -> bool {
        if shot == self.load {
            return false;
        }
        let was = reload_seconds(&self.gun(), crew_share, crewed);
        let now = reload_seconds(&loaded(&SWIVEL, shot), crew_share, crewed);
        for at in 0..2 {
            if self.clocks[at] > 0.0 {
                self.clocks[at] *= now / was;
                self.lengths[at] *= now / was;
            } else {
                self.clocks[at] = SHOT_SWITCH * now;
                self.lengths[at] = SHOT_SWITCH * now;
            }
        }
        self.load = shot;
        true
    }

    /// The clocks run, unless her crew is braced.
    pub fn step(&mut self, seconds: f64) {
        if self.braced {
            return;
        }
        for clock in &mut self.clocks {
            *clock = (*clock - seconds.max(0.0)).max(0.0);
        }
    }
}

/// A side laid: its guns' mouths in the world (through her heel), their middle, the direction it fires (square to her
/// upright hull, east and south), its elevation (radians), the gun as loaded with its load, and its longest throw from
/// that middle over the water under her.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lay {
    pub side: Side,
    pub mouths: [[f64; 3]; 3],
    pub centre: [f64; 3],
    pub dir: [f64; 2],
    pub elevation: f64,
    pub gun: Gun,
    pub shot: Shot,
    pub reach: f64,
}

/// `side` laid to throw `range` metres out along its fire, from her pose over still water at her heave: onto the
/// water there, or onto a point `rise` metres above it.
#[must_use]
pub fn lay(ship: &Ship, pose: &Pose, arms: &Arms, side: Side, shot: Shot, range: f64, rise: Option<f64>) -> Lay {
    let gun = loaded(&SWIVEL, shot);
    let battery = arms.battery(side);
    let mouths = [0, 1, 2].map(|index| posed(ship, pose, battery[index]));
    let centre = [0, 1, 2].map(|axis| mouths.iter().map(|mouth| mouth[axis]).sum::<f64>() / 3.0);
    let (_, starboard) = frame(ship.heading);
    let dir = [starboard[0] * side.sign(), starboard[1] * side.sign()];
    let above = centre[2] - pose.heave;
    let (low, high) = (gun.min_el_deg * DEGREE, gun.max_el_deg * DEGREE);
    let elevation = elevation_for_range(range, gun.speed, above - rise.unwrap_or(0.0), low, high);
    Lay { side, mouths, centre, dir, elevation, gun, shot, reach: max_range(gun.speed, above, high) }
}

/// The balls a laid side fires: one from each mouth, each `RIPPLE_S` after the one before and from where its port is
/// by then, carried at the deck's velocity, scattered by its crew's skill and the volley's seed.
#[must_use]
pub fn volley(lay: &Lay, carry: [f64; 3], skill: f64, seed: u32, clock: f64, shooter: usize) -> Vec<Ball> {
    let mut draws = Mulberry32::new(seed);
    let widen = (1.5 - skill).clamp(0.4, 1.5);
    lay.mouths
        .iter()
        .enumerate()
        .map(|(index, mouth)| {
            let (dir, elevation) = scatter(
                lay.dir,
                lay.elevation,
                lay.gun.yaw_spread_deg * widen,
                lay.gun.pitch_spread_deg * widen,
                &mut draws,
            );
            let delay = index as f64 * RIPPLE_S;
            Ball {
                start: [0, 1, 2].map(|axis| mouth[axis] + carry[axis] * delay),
                launch: launch_velocity(dir, elevation, lay.gun.speed, carry),
                born: clock + delay,
                shooter,
                gun: lay.gun,
                shot: lay.shot,
                flown: 0.0,
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "gunnery_tests.rs"]
mod tests;
