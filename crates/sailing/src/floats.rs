//! A ship and its pose as plain 64-bit numbers in one fixed order: how they cross into a browser, and what a
//! fingerprint of a voyage is taken over (land::exact::fingerprint). Every number crosses with its bits intact.

use crate::pose::Pose;
use crate::ship::Ship;

/// x, y, heading, ahead, abeam, turn, sail way, rung.
pub const SHIP_FLOATS: usize = 8;
/// Steer, crab (1 or 0), climb: the helm's numbers in a request.
pub const HELM_FLOATS: usize = 3;
/// Heave, pitch, roll, aground (1 or 0).
pub const POSE_FLOATS: usize = 4;

impl Ship {
    #[must_use]
    pub fn to_floats(&self) -> [f64; SHIP_FLOATS] {
        [self.x, self.y, self.heading, self.ahead, self.abeam, self.turn, self.sail_way, f64::from(self.rung)]
    }
}

impl Pose {
    #[must_use]
    pub fn to_floats(&self) -> [f64; POSE_FLOATS] {
        [self.heave, self.pitch, self.roll, if self.aground { 1.0 } else { 0.0 }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ship_and_its_pose_cross_as_numbers_in_their_order() {
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
        assert_eq!(ship.to_floats(), [1.0e5 + 0.1, -3.3, 6.2, 2.36, -0.5, 11.6, 2.0, -1.0]);
        let pose = Pose { heave: 0.25, pitch: -0.01, roll: 0.02, aground: true };
        assert_eq!(pose.to_floats(), [0.25, -0.01, 0.02, 1.0]);
    }
}
