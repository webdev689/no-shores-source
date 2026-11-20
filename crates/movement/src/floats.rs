//! A body and its controls as plain 64-bit numbers, in one fixed order: how they cross into a browser, and what a
//! fingerprint of a run is taken over. Every number crosses with its bits intact.

use crate::blocks::Block;
use crate::body::{Body, Controls, Mode, Over};

/// A body's numbers: x, y, z, vx, vy, vz, facing, mode, crouched, crouch, grounded; then whether it is going over a
/// lip, the start (3) and end (3), progress and seconds of that; then lip and moving. Booleans are 0 or 1.
pub const BODY_FLOATS: usize = 22;
/// The controls' numbers: forward, sideways, yaw, run, jump, crouch, mounted.
pub const CONTROLS_FLOATS: usize = 7;
/// A block's numbers: min x, min y, max x, max y, top, bottom.
pub const BLOCK_FLOATS: usize = 6;

const MODES: [Mode; 6] = [Mode::Ground, Mode::Air, Mode::Hang, Mode::Climb, Mode::Mantle, Mode::Vault];

fn flag(value: bool) -> f64 {
    if value { 1.0 } else { 0.0 }
}

impl Mode {
    /// The mode's number, its place in the list a browser keeps too.
    #[must_use]
    pub fn number(self) -> f64 {
        f64::from(self as u8)
    }

    /// The mode a number names; anything else is the ground.
    #[must_use]
    pub fn from_number(number: f64) -> Self {
        MODES.iter().copied().find(|mode| mode.number() == number).unwrap_or(Mode::Ground)
    }
}

impl Body {
    #[must_use]
    pub fn to_floats(&self) -> [f64; BODY_FLOATS] {
        let over = self.over.unwrap_or(Over { from: [0.0; 3], to: [0.0; 3], progress: 0.0, seconds: 0.0 });
        [
            self.x,
            self.y,
            self.z,
            self.vx,
            self.vy,
            self.vz,
            self.facing,
            self.mode.number(),
            flag(self.crouched),
            self.crouch,
            self.grounded,
            flag(self.over.is_some()),
            over.from[0],
            over.from[1],
            over.from[2],
            over.to[0],
            over.to[1],
            over.to[2],
            over.progress,
            over.seconds,
            self.lip,
            flag(self.moving),
        ]
    }

    #[must_use]
    pub fn from_floats(floats: &[f64; BODY_FLOATS]) -> Self {
        let over = (floats[11] != 0.0).then_some(Over {
            from: [floats[12], floats[13], floats[14]],
            to: [floats[15], floats[16], floats[17]],
            progress: floats[18],
            seconds: floats[19],
        });
        Body {
            x: floats[0],
            y: floats[1],
            z: floats[2],
            vx: floats[3],
            vy: floats[4],
            vz: floats[5],
            facing: floats[6],
            mode: Mode::from_number(floats[7]),
            crouched: floats[8] != 0.0,
            crouch: floats[9],
            grounded: floats[10],
            over,
            lip: floats[20],
            moving: floats[21] != 0.0,
        }
    }
}

impl Controls {
    #[must_use]
    pub fn to_floats(&self) -> [f64; CONTROLS_FLOATS] {
        let (run, jump, crouch, mounted) = (flag(self.run), flag(self.jump), flag(self.crouch), flag(self.mounted));
        [self.forward, self.sideways, self.yaw, run, jump, crouch, mounted]
    }

    #[must_use]
    pub fn from_floats(floats: &[f64; CONTROLS_FLOATS]) -> Self {
        Controls {
            forward: floats[0],
            sideways: floats[1],
            yaw: floats[2],
            run: floats[3] != 0.0,
            jump: floats[4] != 0.0,
            crouch: floats[5] != 0.0,
            mounted: floats[6] != 0.0,
        }
    }
}

impl Block {
    #[must_use]
    pub fn from_floats(floats: &[f64; BLOCK_FLOATS]) -> Self {
        Block {
            min_x: floats[0],
            min_y: floats[1],
            max_x: floats[2],
            max_y: floats[3],
            top: floats[4],
            bottom: floats[5],
        }
    }
}

/// A fingerprint of bodies, one after another: FNV-1a over each number's little-endian bits, in the order above.
#[must_use]
pub fn fingerprint<'bodies>(bodies: impl IntoIterator<Item = &'bodies Body>) -> u64 {
    bodies.into_iter().flat_map(Body::to_floats).fold(0xcbf2_9ce4_8422_2325, |hash: u64, value| {
        value
            .to_bits()
            .to_le_bytes()
            .iter()
            .fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::body::standing;

    #[test]
    fn a_body_comes_back_from_its_numbers_unchanged() {
        let going_over = Body {
            mode: Mode::Vault,
            over: Some(Over { from: [1.0, 2.0, 0.0], to: [1.0, -0.5, 0.0], progress: 0.25, seconds: 0.4 }),
            lip: 1.1,
            moving: true,
            ..standing(1.0, 2.0)
        };
        for body in [standing(0.1, -3.7), going_over] {
            assert_eq!(Body::from_floats(&body.to_floats()), body);
        }
    }

    #[test]
    fn every_mode_has_its_own_number() {
        for mode in MODES {
            assert_eq!(Mode::from_number(mode.number()), mode);
        }
    }
}
