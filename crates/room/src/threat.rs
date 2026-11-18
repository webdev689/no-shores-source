//! A voyage held as pirates close, by DFO's law for a fast journey: the pace a ship sails at is capped so that she
//! takes `WARN_S` real seconds or more to reach a pirate's sight along her way, never under `FOE_PACE`, and within
//! `HOSTILE_NEAR_M` of a pirate she is held to the world's own time, where her guns can answer.

use crate::pirates::PIRATE_WAY_M_S;
use crate::sea::SHIP_SPEED_M_S;
use naval::captain::ENGAGE_RANGE;
use naval::fight::HOSTILE_NEAR_M;

/// Real seconds of warning a ship always has before a pirate's sight.
pub const WARN_S: f64 = 0.6;
/// The slowest pace a pirate's cap brings a voyage down to, short of her hold.
pub const FOE_PACE: f64 = 5.0;
/// A pirate's reach: her sight, past the ring inside which she holds the voyage.
const REACH_M: f64 = if ENGAGE_RANGE > HOSTILE_NEAR_M { ENGAGE_RANGE } else { HOSTILE_NEAR_M };

/// Metres along `way` (a unit vector east and south; none for a ship at rest) before a point `east` and `south` of the
/// ship is within `reach`: none inside it while the way leads deeper, and infinity where the way passes it by or it
/// lies behind. With no way, the straight distance to the reach's edge.
#[must_use]
pub fn metres_to_reach(east: f64, south: f64, reach: f64, way: Option<[f64; 2]>) -> f64 {
    let apart = (east * east + south * south).sqrt();
    let Some([way_east, way_south]) = way else { return (apart - reach).max(0.0) };
    let along = east * way_east + south * way_south;
    if apart <= reach {
        return if along >= 0.0 { 0.0 } else { f64::INFINITY };
    }
    let room = along * along - (apart * apart - reach * reach);
    if room < 0.0 {
        return f64::INFINITY;
    }
    let enter = along - room.sqrt();
    if enter >= 0.0 { enter } else { f64::INFINITY }
}

/// A rate down DFO's ladder of paces: whole fives, and whole ones under five; never under 1.
#[must_use]
pub fn step_down(rate: f64) -> f64 {
    if rate >= 5.0 { libm::floor(rate / 5.0) * 5.0 } else { libm::floor(rate).max(1.0) }
}

/// The pace a ship set to `pace` sails at, at `at` heading `heading` (radians clockwise from north), with pirates at
/// `pirates`: her pace, held down as one's sight comes near along her way, and to 1 within the hold of any.
#[must_use]
pub fn held_pace(pace: u16, at: [f64; 2], heading: f64, pirates: impl IntoIterator<Item = [f64; 2]>) -> u16 {
    if pace == 0 {
        return 0;
    }
    let way = Some([libm::sin(heading), -libm::cos(heading)]);
    let closing = SHIP_SPEED_M_S + PIRATE_WAY_M_S;
    let (mut ratio, mut held) = (f64::INFINITY, false);
    for [x, y] in pirates {
        let (east, south) = (x - at[0], y - at[1]);
        held |= (east * east + south * south).sqrt() <= HOSTILE_NEAR_M;
        ratio = ratio.min(metres_to_reach(east, south, REACH_M, way) / (WARN_S * closing));
    }
    if held {
        return 1;
    }
    if !ratio.is_finite() {
        return pace;
    }
    let capped = step_down(ratio).max(FOE_PACE).min(f64::from(pace));
    // The ladder's values are whole numbers, no more than the pace asked.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let rate = capped as u16;
    rate
}

#[cfg(test)]
#[path = "threat_tests.rs"]
mod tests;
