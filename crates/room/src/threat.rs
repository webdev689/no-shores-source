//! A voyage held as hostiles close, by DFO's law for a fast journey: the pace a ship sails at is capped so that it
//! takes `WARN_S` real seconds or more to reach a hostile's sight along its way, never under `FOE_PACE`, and within
//! `HOSTILE_NEAR_M` of a hostile who would engage it, the ship is held to the world's own time, where its guns can
//! answer.

use crate::hostiles::{HOSTILE_WAY_M_S, Hostile};
use crate::sea::SHIP_SPEED_M_S;
use crate::sighting::FASTEST_WAY;
use naval::captain::{ENGAGE_RANGE, wary_takes};
use naval::fight::HOSTILE_NEAR_M;

/// Real seconds of warning a ship always has before a hostile's sight.
pub const WARN_S: f64 = 0.6;
/// The slowest pace a hostile's cap brings a voyage down to, short of the hostile's hold.
pub const FOE_PACE: f64 = 5.0;
/// A hostile's reach: its sight, past the ring inside which it holds the voyage.
const REACH_M: f64 = if ENGAGE_RANGE > HOSTILE_NEAR_M { ENGAGE_RANGE } else { HOSTILE_NEAR_M };

/// Metres along `way` (a unit vector east and south) before a point `east` and `south` of the ship is within `reach`:
/// none inside it while the way leads deeper, and infinity where the way passes it by or it lies behind.
#[must_use]
pub fn metres_to_reach(east: f64, south: f64, reach: f64, [way_east, way_south]: [f64; 2]) -> f64 {
    let apart = (east * east + south * south).sqrt();
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

/// The fastest closing of a voyage at `way` times a whole Sloop's (its hull's class, `naval::class`) and a hostile,
/// metres a second: the fastest rank's way with its own, so the warning holds whoever comes.
fn closing_m_s(way: f64) -> f64 {
    SHIP_SPEED_M_S * way + HOSTILE_WAY_M_S * FASTEST_WAY
}

/// How far off a hostile may hold a voyage at its fastest pace, metres: its reach, and the warning at that pace closing
/// as fast as any rank can on the fastest hull. Past it no hostile slows the ship.
#[must_use]
pub fn hold_reach_m() -> f64 {
    let most = crate::sea::PACES.iter().copied().max().unwrap_or(1);
    REACH_M + WARN_S * closing_m_s(naval::class::FASTEST) * f64::from(most)
}

/// A rate down DFO's ladder of paces, by whole fives: none under five, where `held_pace` keeps to `FOE_PACE`.
#[must_use]
pub fn step_down(rate: f64) -> f64 {
    libm::floor(rate / 5.0) * 5.0
}

/// The pace a ship set to `pace` sails at, at `at` heading `heading` (radians clockwise from north) at `way` times a
/// whole Sloop's way, with hostiles at `hostiles`, each with whether it would engage this ship (`holds`): its pace,
/// held down as one's sight comes near along its way, and to 1 within the hold of one that would engage.
#[must_use]
pub fn held_pace(
    pace: u16,
    at: [f64; 2],
    (heading, way): (f64, f64),
    hostiles: impl IntoIterator<Item = ([f64; 2], bool)>,
) -> u16 {
    if pace == 0 {
        return 0;
    }
    let closing = closing_m_s(way);
    let way = [libm::sin(heading), -libm::cos(heading)];
    let (mut ratio, mut held) = (f64::INFINITY, false);
    for ([x, y], engages) in hostiles {
        let (east, south) = (x - at[0], y - at[1]);
        held |= engages && (east * east + south * south).sqrt() <= HOSTILE_NEAR_M;
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

/// Whether a hostile ship holds a voyage at `at` of a ship of `hull`, its hull at that share of whole, that it would
/// meet: it is within its hold of it and bold, or chased by its player (`chased`, its number), or wary and one it
/// would fall on (`wary_takes`). A ship beyond its hold, or one that will not engage, caps the pace only by the ladder.
#[must_use]
pub fn holds(hostile: &Hostile, at: [f64; 2], chased: Option<u32>, hull: (sailing::HullKind, f64)) -> bool {
    libm::hypot(hostile.x - at[0], hostile.y - at[1]) <= HOSTILE_NEAR_M
        && (hostile.bold || chased == Some(hostile.id) || wary_takes(hostile.commission, hostile.strength(), hull))
}

#[cfg(test)]
#[path = "threat_tests.rs"]
mod tests;
