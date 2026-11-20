//! A ship's arms and her build: where her guns' mouths are and what a ball can strike on her, in her own frame (x to
//! her bow, y to starboard, z up, from her waterline's middle), as the ship export measured them off her model; and
//! the points, men and skill DFO gives her class.

use crate::ballistics::Block;
use sailing::HullKind;
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

/// Her guns' mouths on each side, fore to aft, her hull's box and each sail's.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Arms {
    pub port: &'static [[f64; 3]],
    pub starboard: &'static [[f64; 3]],
    pub hull: Bounds,
    pub sails: &'static [Bounds],
}

impl Arms {
    /// One side's mouths, fore to aft.
    #[must_use]
    pub fn battery(&self, side: Side) -> &'static [[f64; 3]] {
        match side {
            Side::Port => self.port,
            Side::Starboard => self.starboard,
        }
    }

    /// The share of the Sloop's broadside each of her guns on `side` throws: a side weighs the same whatever her hull,
    /// spread evenly over its guns.
    #[must_use]
    pub fn gun_share(&self, side: Side) -> f64 {
        SLOOP_GUNS_A_SIDE / self.battery(side).len().max(1) as f64
    }
}

/// The guns a side the Sloop carries: every hull's broadside weighs hers.
pub const SLOOP_GUNS_A_SIDE: f64 = 3.0;

/// The owner's Sloop, as `content/ships/ships.json` has her (a test holds each hull's arms to it).
pub const SLOOP_ARMS: Arms = Arms {
    port: &[[4.7229, -3.2218, 2.3844], [1.5322, -3.2218, 2.3595], [-1.7742, -3.1824, 2.3565]],
    starboard: &[[4.7023, 3.3269, 2.3586], [1.4848, 3.3269, 2.3456], [-1.797, 3.3663, 2.3471]],
    hull: [[-9.8095, -3.0026, -1.7999], [11.4969, 3.0009, 3.2996]],
    sails: &[
        [[-0.1485, -0.0233, 4.6543], [16.2511, -0.0008, 13.4853]],
        [[-8.5758, -0.0008, 4.2273], [-0.176, -0.0008, 13.1726]],
    ],
};

/// The Schooner, five guns a side.
pub const SCHOONER_ARMS: Arms = Arms {
    port: &[
        [5.6498, -3.1395, 2.5298],
        [3.0498, -3.4855, 2.444],
        [0.4498, -3.4855, 2.4284],
        [-2.1502, -3.4855, 2.4575],
        [-4.7502, -3.4855, 2.5226],
    ],
    starboard: &[
        [5.6498, 3.1395, 2.5298],
        [3.0498, 3.4855, 2.444],
        [0.4498, 3.4855, 2.4284],
        [-2.1502, 3.4855, 2.4575],
        [-4.7502, 3.4855, 2.5226],
    ],
    hull: [[-12.7002, -3.8436, -2.0], [14.3698, 3.8436, 4.8089]],
    sails: &[
        [[6.0628, 0.0, 4.8553], [20.7498, 0.0, 15.4553]],
        [[0.3498, 0.0, 4.2053], [6.1769, 0.0, 16.2522]],
        [[-12.6502, 0.0, 4.9129], [-1.5608, 0.0, 18.5123]],
    ],
};

/// The Brig, seven guns a side.
pub const BRIG_ARMS: Arms = Arms {
    port: &[
        [9.2847, -3.3561, 2.9644],
        [6.6847, -4.0521, 2.8323],
        [4.0847, -4.4665, 2.7531],
        [1.4847, -4.4665, 2.7267],
        [-1.1153, -4.4665, 2.7399],
        [-3.7153, -4.4665, 2.7795],
        [-6.3153, -4.4665, 2.8455],
    ],
    starboard: &[
        [9.2847, 3.3561, 2.9644],
        [6.6847, 4.0521, 2.8323],
        [4.0847, 4.4665, 2.7531],
        [1.4847, 4.4665, 2.7267],
        [-1.1153, 4.4665, 2.7399],
        [-3.7153, 4.4665, 2.7795],
        [-6.3153, 4.4665, 2.8455],
    ],
    hull: [[-15.4653, -4.81, -2.2], [17.6047, 4.81, 5.3129]],
    sails: &[
        [[16.4847, 0.15, 7.1], [29.6847, 0.15, 15.9452]],
        [[14.4847, -0.15, 5.9], [23.2847, -0.15, 15.1723]],
        [[8.6287, -5.55, 13.2833], [8.8941, 5.55, 20.6833]],
        [[8.5711, -5.9, 4.5826], [8.8679, 5.9, 12.8833]],
        [[8.6526, -4.15, 21.0833], [8.8167, 4.15, 25.5833]],
        [[-2.2574, -6.5, 4.4311], [-1.5936, 6.5, 13.7246]],
        [[-2.4858, -6.15, 14.1246], [-1.9194, 6.15, 22.0246]],
        [[-2.6344, -4.55, 22.4246], [-2.2918, 4.55, 27.1246]],
        [[-15.8153, 0.0, 5.8746], [-2.723, 0.0, 15.167]],
    ],
};

/// The Frigate, ten guns a side across her two gun decks, numbered from her bow to her stern.
pub const FRIGATE_ARMS: Arms = Arms {
    port: &[
        [11.4504, -4.0949, 3.3801],
        [9.3504, -4.2478, 1.6267],
        [7.2504, -5.1305, 3.2069],
        [5.1504, -4.9399, 1.6267],
        [3.0504, -5.3495, 3.1307],
        [0.9504, -4.9558, 1.6267],
        [-1.1496, -5.3495, 3.1391],
        [-3.2496, -4.9368, 1.6267],
        [-5.3496, -5.3495, 3.198],
        [-7.4496, -4.8923, 1.6267],
    ],
    starboard: &[
        [11.4504, 4.0949, 3.3801],
        [9.3504, 4.2478, 1.6267],
        [7.2504, 5.1305, 3.2069],
        [5.1504, 4.9399, 1.6267],
        [3.0504, 5.3495, 3.1307],
        [0.9504, 4.9558, 1.6267],
        [-1.1496, 5.3495, 3.1391],
        [-3.2496, 4.9368, 1.6267],
        [-5.3496, 5.3495, 3.198],
        [-7.4496, 4.8923, 1.6267],
    ],
    hull: [[-19.0996, -5.7237, -2.4], [21.9704, 5.7237, 5.9172]],
    sails: &[
        [[20.3504, 0.15, 8.8123], [36.8504, 0.15, 20.0427]],
        [[17.8504, -0.15, 7.3], [29.0504, -0.15, 19.9649]],
        [[13.5501, -6.95, 15.4574], [13.8679, 6.95, 24.3574]],
        [[13.4789, -7.3, 5.356], [13.8247, 7.3, 15.0574]],
        [[13.5816, -5.15, 24.7574], [13.7772, 5.15, 30.1574]],
        [[1.2777, -8.1, 5.0009], [1.8646, 8.1, 16.0004]],
        [[1.2198, -7.75, 16.4004], [1.7072, 7.75, 25.5004]],
        [[1.1496, -5.75, 25.9004], [1.4693, 5.75, 31.8004]],
        [[-12.0312, -5.55, 14.2506], [-11.5067, 5.55, 21.5506]],
        [[-12.1928, -3.95, 21.9506], [-11.8502, 3.95, 26.6506]],
        [[-20.3496, 0.0, 6.7006], [-12.3013, 0.0, 15.4618]],
    ],
};

/// A hull's arms.
#[must_use]
pub fn arms_of(kind: HullKind) -> &'static Arms {
    match kind {
        HullKind::Sloop => &SLOOP_ARMS,
        HullKind::Schooner => &SCHOONER_ARMS,
        HullKind::Brig => &BRIG_ARMS,
        HullKind::Frigate => &FRIGATE_ARMS,
    }
}

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

/// DFO's Large Boat as the player owns it, with its hands: ten men, as a captain's Sloop has, who work its guns (a
/// thinned crew reloads them slower) and whom balls cut down; and the player's own aim.
pub const LARGE_BOAT: Build =
    Build { name: "Sloop", hull: 240.0, sail: 96.0, crew: 10.0, skill: 0.6, range_m: 50.0, crewed: false };

/// DFO's Pirate Sloop, its only pirate at the first level, on the same hull.
pub const PIRATE_SLOOP: Build =
    Build { name: "Pirate Sloop", hull: 264.0, sail: 96.0, crew: 10.0, skill: 0.45, range_m: 50.0, crewed: true };

/// The Grey Tithe's Sloop: the pirates' class under the Tithe's colours, until it has hulls of its own.
pub const TITHE_SLOOP: Build = Build { name: "Tithe Sloop", ..PIRATE_SLOOP };

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

/// A point in the world in her own frame, through her pose: `posed` undone (her axes are square, so turned back by
/// their transpose).
#[must_use]
pub fn unposed(ship: &Ship, pose: &Pose, point: [f64; 3]) -> [f64; 3] {
    let turned = axes(ship, pose);
    let off = [point[0] - ship.x, point[1] - ship.y, point[2] - pose.heave];
    turned.map(|axis| off[0] * axis[0] + off[1] * axis[1] + off[2] * axis[2])
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
