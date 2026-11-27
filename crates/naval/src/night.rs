//! The sea by night: which ships show their lanterns, and how far a lookout sees a ship once it is dark. A ship lights
//! her lanterns as the daylight fades; the Grey Tithe's prowl with theirs out, and a friendly ship running from an
//! attack puts hers out. A lit ship is seen far across the water, a dark one only close, by every captain's lookout
//! and by the player's.

use crate::ranks::{GREY_TITHE, PLAYERS};

/// By night a lit ship is seen no farther than this, metres, and a dark one no farther than this.
pub const NIGHT_LIT_SIGHT_M: f64 = 650.0;
pub const NIGHT_DARK_SIGHT_M: f64 = 220.0;
/// The daylight (0 night to 1 day) at and under which it is night: the lamps are half up through the dusk then.
pub const NIGHT_DAYLIGHT: f64 = 0.375;

/// Whether it is night under `daylight` (0 night to 1 day).
#[must_use]
pub fn is_night(daylight: f64) -> bool {
    daylight <= NIGHT_DAYLIGHT
}

/// How far a lookout who sees `range_m` by day sees a ship under `daylight`, `lit` or dark: by day its whole range; by
/// night a lit ship to `NIGHT_LIT_SIGHT_M` and a dark one to `NIGHT_DARK_SIGHT_M`, never farther than by day.
#[must_use]
pub fn night_sight(range_m: f64, daylight: f64, lit: bool) -> f64 {
    if !is_night(daylight) {
        return range_m;
    }
    range_m.min(if lit { NIGHT_LIT_SIGHT_M } else { NIGHT_DARK_SIGHT_M })
}

/// Whether a captain's ship of `faction` sails with her lanterns out: the Grey Tithe's always, a friendly one while
/// she is `fleeing`.
#[must_use]
pub fn runs_dark(faction: u8, fleeing: bool) -> bool {
    faction == GREY_TITHE || (faction == PLAYERS && fleeing)
}

#[cfg(test)]
#[path = "night_tests.rs"]
mod tests;
