//! A ship, her helm and her pose as plain 64-bit numbers in one fixed order: how they cross into a browser, and what a
//! fingerprint of a voyage is taken over. Every number crosses with its bits intact.

use crate::pose::Pose;
use crate::ship::{Helm, Ship};

/// x, y, heading, ahead, abeam, turn, sail way, rung.
pub const SHIP_FLOATS: usize = 8;
/// Steer, crab (1 or 0), climb.
pub const HELM_FLOATS: usize = 3;
/// Heave, pitch, roll, aground (1 or 0).
pub const POSE_FLOATS: usize = 4;

impl Ship {
    #[must_use]
    pub fn to_floats(&self) -> [f64; SHIP_FLOATS] {
        [self.x, self.y, self.heading, self.ahead, self.abeam, self.turn, self.sail_way, f64::from(self.rung)]
    }

    /// Her numbers back; the rung is taken as a whole number (the door checks it is one first).
    #[must_use]
    pub fn from_floats(floats: &[f64; SHIP_FLOATS]) -> Self {
        let [x, y, heading, ahead, abeam, turn, sail_way, rung] = *floats;
        Self { x, y, heading, ahead, abeam, turn, sail_way, rung: rung as i8 }
    }
}

impl Helm {
    #[must_use]
    pub fn to_floats(&self) -> [f64; HELM_FLOATS] {
        [self.steer, if self.crab { 1.0 } else { 0.0 }, f64::from(self.climb)]
    }

    #[must_use]
    pub fn from_floats(floats: &[f64; HELM_FLOATS]) -> Self {
        let [steer, crab, climb] = *floats;
        Self { steer, crab: crab != 0.0, climb: climb as i8 }
    }
}

impl Pose {
    #[must_use]
    pub fn to_floats(&self) -> [f64; POSE_FLOATS] {
        [self.heave, self.pitch, self.roll, if self.aground { 1.0 } else { 0.0 }]
    }
}

/// FNV-1a over the numbers' bits: the same voyage on every machine has the same fingerprint.
#[must_use]
pub fn fingerprint(floats: &[f64]) -> u64 {
    floats.iter().fold(0xcbf2_9ce4_8422_2325, |hash: u64, number| {
        number
            .to_bits()
            .to_le_bytes()
            .iter()
            .fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pose::Pose;
    use crate::ship::{Helm, Ship};

    #[test]
    fn a_ship_and_her_helm_cross_as_numbers_with_their_bits_intact() {
        let ship = Ship {
            x: 1.0e5 + 0.1,
            y: -3.3,
            heading: 6.2,
            ahead: 2.36,
            abeam: -0.5,
            turn: 11.6,
            sail_way: 2.0,
            rung: -1,
        };
        assert_eq!(Ship::from_floats(&ship.to_floats()), ship);
        let helm = Helm { steer: -1.0, crab: true, climb: 1 };
        assert_eq!(Helm::from_floats(&helm.to_floats()), helm);
        let pose = Pose { heave: 0.25, pitch: -0.01, roll: 0.02, aground: true };
        assert_eq!(pose.to_floats(), [0.25, -0.01, 0.02, 1.0]);
    }

    #[test]
    fn a_fingerprint_tells_one_bit_apart() {
        let numbers = [1.0, 2.0, 3.0];
        assert_eq!(fingerprint(&numbers), fingerprint(&[1.0, 2.0, 3.0]));
        assert_ne!(fingerprint(&numbers), fingerprint(&[1.0, 2.0, f64::from_bits(3.0_f64.to_bits() + 1)]));
    }
}
