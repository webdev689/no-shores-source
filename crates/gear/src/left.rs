//! The body a player left a room with, kept with their character so a return finds it as it was, as the owner chose:
//! leaving and coming back heals nothing.

use serde::{Deserialize, Serialize};

/// How long after leaving a return finds the health and healing charges left with, in minutes.
pub const BODY_KEPT_MINUTES: u64 = 2;
/// How long after leaving a return finds the Anima and Tenets left with, in minutes, as a room keeps them for a rejoin.
pub const ARTS_KEPT_MINUTES: u64 = 10;
/// Whole, in the ten-thousandths shares are kept in.
pub const WHOLE: u16 = 10_000;

/// The body as it last left a room: the Unix minute, its health as a share of whole (0 fallen) and its healing
/// charges; the Art it wore, with its Anima and Tenets as shares of charged, each in ten-thousandths.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Left {
    pub minute: u64,
    pub health: u16,
    pub charges: u8,
    pub art: u8,
    pub anima: u16,
    pub tenets: [u16; 2],
    /// Whether they left a dungeon by a way out, standing at its exit door or its open return portal: only then does
    /// its patrol stand them before the dungeon's door.
    #[serde(default)]
    pub out: bool,
}

impl Left {
    /// Whether the health and healing charges still hold at `minute`.
    #[must_use]
    pub fn body_holds(&self, minute: u64) -> bool {
        minute >= self.minute && minute <= self.minute + BODY_KEPT_MINUTES
    }

    /// Whether the Anima and Tenets still hold at `minute`.
    #[must_use]
    pub fn arts_hold(&self, minute: u64) -> bool {
        minute >= self.minute && minute <= self.minute + ARTS_KEPT_MINUTES
    }
}

/// A share of whole, 0 to 1, in ten-thousandths.
#[must_use]
pub fn share(of: f64) -> u16 {
    (libm::round(of.clamp(0.0, 1.0) * f64::from(WHOLE))) as u16
}

/// A share kept in ten-thousandths, 0 to 1.
#[must_use]
pub fn whole_of(kept: u16) -> f64 {
    f64::from(kept.min(WHOLE)) / f64::from(WHOLE)
}
