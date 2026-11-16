//! A ship's arms and her build: where her guns' mouths are and what a ball can strike on her, in her own frame (x to
//! her bow, y to starboard, z up, from her waterline's middle), as the ship export measured them off her model; and
//! the points, men and skill DFO gives her class.

use crate::ballistics::Block;
use sailing::pose::{Pose, frame};
use sailing::ship::Ship;

/// A broadside: the guns along one side.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Port,
    Starboard,
}

impl Side {
    pub const BOTH: [Side; 2] = [Side::Port, Side::Starboard];

    #[must_use]
    pub fn index(self) -> usize {
        match self {
            Side::Port => 0,
            Side::Starboard => 1,
        }
    }

    /// -1 to port, 1 to starboard.
    #[must_use]
    pub fn sign(self) -> f64 {
        match self {
            Side::Port => -1.0,
            Side::Starboard => 1.0,
        }
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Side::Port => "port",
            Side::Starboard => "starboard",
        }
    }
}

/// A box in her own frame: its low and high corners.
pub type Bounds = [[f64; 3]; 2];

/// Her guns' mouths, three a side fore to aft (port, then starboard), her hull's box and each sail's.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Arms {
    pub mouths: [[f64; 3]; 6],
    pub hull: Bounds,
    pub sails: [Bounds; 2],
}

impl Arms {
    /// One side's mouths, fore to aft.
    #[must_use]
    pub fn battery(&self, side: Side) -> &[[f64; 3]] {
        &self.mouths[side.index() * 3..side.index() * 3 + 3]
    }
}

/// The owner's Sloop, as `content/ships/ships.json` has her (a test holds the two together).
pub const SLOOP_ARMS: Arms = Arms {
    mouths: [
        [1.5743, -1.0743, 0.7787],
        [0.5107, -1.0743, 0.7704],
        [-0.5914, -1.0612, 0.7694],
        [1.5674, 1.1093, 0.7701],
        [0.4949, 1.1093, 0.7657],
        [-0.599, 1.1225, 0.7662],
    ],
    hull: [[-3.2698, -1.0009, -0.6], [3.8323, 1.0003, 1.0999]],
    sails: [
        [[-0.0495, -0.0078, 1.5514], [5.417, -0.0003, 4.4951]],
        [[-2.8586, -0.0003, 1.4091], [-0.0587, -0.0003, 4.3909]],
    ],
};

/// What DFO's class gives a ship: hull and canvas points (its build's, toughened), men, her gunners' skill, the range
/// she likes to fight at (metres), and whether a crew works her guns.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Build {
    pub name: &'static str,
    pub hull: f64,
    pub sail: f64,
    pub crew: f64,
    pub skill: f64,
    pub range_m: f64,
    pub crewed: bool,
}

/// DFO's Large Boat as the player owns her: single-handed, so no men to lose and the player's own aim.
pub const LARGE_BOAT: Build =
    Build { name: "Sloop", hull: 240.0, sail: 96.0, crew: 0.0, skill: 0.6, range_m: 50.0, crewed: false };

/// DFO's Pirate Sloop, its only pirate at the first level, on the same hull.
pub const PIRATE_SLOOP: Build =
    Build { name: "Pirate Sloop", hull: 264.0, sail: 96.0, crew: 10.0, skill: 0.45, range_m: 50.0, crewed: true };

/// No battery bears within this of her bow or her stern, degrees: the Sloop has guns only along her sides.
pub const BOW_ARC_DEG: f64 = 35.0;
pub const STERN_ARC_DEG: f64 = 40.0;

/// The side a look this many degrees off her bow (to starboard positive) lays, if any.
#[must_use]
pub fn side_for_bearing(bearing_deg: f64) -> Option<Side> {
    let off = bearing_deg.abs();
    if off.is_nan() || off <= BOW_ARC_DEG || off >= 180.0 - STERN_ARC_DEG {
        return None;
    }
    Some(if bearing_deg > 0.0 { Side::Starboard } else { Side::Port })
}

/// Her own axes in the world (east, south, up) through her heading, rise and heel: her bow's, her starboard's and her
/// up's, as the ship view turns her.
fn axes(ship: &Ship, pose: &Pose) -> [[f64; 3]; 3] {
    let (forward, starboard) = frame(ship.heading);
    let (sin_pitch, cos_pitch) = (libm::sin(pose.pitch), libm::cos(pose.pitch));
    let (sin_roll, cos_roll) = (libm::sin(pose.roll), libm::cos(pose.roll));
    let along = |ahead: f64, aside: f64, above: f64| {
        [ahead * forward[0] + aside * starboard[0], ahead * forward[1] + aside * starboard[1], above]
    };
    [
        along(cos_pitch, 0.0, sin_pitch),
        along(sin_roll * sin_pitch, cos_roll, -sin_roll * cos_pitch),
        along(-cos_roll * sin_pitch, sin_roll, cos_roll * cos_pitch),
    ]
}

/// A point of her own frame in the world, through her pose.
#[must_use]
pub fn posed(ship: &Ship, pose: &Pose, point: [f64; 3]) -> [f64; 3] {
    let turned = axes(ship, pose);
    let moved = |axis: usize| point[0] * turned[0][axis] + point[1] * turned[1][axis] + point[2] * turned[2][axis];
    [ship.x + moved(0), ship.y + moved(1), pose.heave + moved(2)]
}

fn block(ship: &Ship, pose: &Pose, bounds: &Bounds) -> Block {
    let [low, high] = bounds;
    let centre = [0, 1, 2].map(|axis| (low[axis] + high[axis]) / 2.0);
    Block {
        centre: posed(ship, pose, centre),
        axes: axes(ship, pose),
        half: [0, 1, 2].map(|axis| (high[axis] - low[axis]) / 2.0),
    }
}

/// Her hull's box in the world.
#[must_use]
pub fn hull_block(ship: &Ship, pose: &Pose, arms: &Arms) -> Block {
    block(ship, pose, &arms.hull)
}

/// Each sail's box in the world.
#[must_use]
pub fn sail_blocks(ship: &Ship, pose: &Pose, arms: &Arms) -> Vec<Block> {
    arms.sails.iter().map(|bounds| block(ship, pose, bounds)).collect()
}

#[cfg(test)]
#[path = "arms_tests.rs"]
mod tests;
