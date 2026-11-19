//! A captain sizing up a fight, as DFO's: how long each ship's broadsides take to make the other strike (by her hull
//! down to a quarter, or her last man), from her guns, reload, turn between volleys and the share of balls that hit
//! at a duel's range; the odds are the one time over the other.

use super::aim::{AIM_FREEBOARD, FIRE_EXTENT_K, FIRE_EXTENT_SKILL, LAY_ERR};
use crate::arms::{Arms, Build, Side};
use crate::ballistics::GRAVITY;
use crate::damage::{HOLED_BONUS, SHIP_TOUGHNESS, STRUCK_AT, WATERLINE_BAND_M};
use crate::gunnery::reload_seconds;
use crate::guns::SWIVEL;
use sailing::helm::STEER_PEAK;
use std::f64::consts::PI;

/// The range the hit share is reckoned at (metres), and the turn a ship makes between volleys (degrees).
pub const DUEL_RANGE: f64 = 110.0;
pub const TURN_PER_VOLLEY: f64 = 90.0;

/// A ship's fighting power: her hull's points and share left, her crew's share and men, whether she strikes by her
/// men, her gunners' skill, her turn (degrees a second), whether a crew loads her guns, the share of her hull she
/// strikes at, and her guns' harm and reload over a Major's (`ranks::Scale`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Power {
    pub hull_hp: f64,
    pub hull_share: f64,
    pub crew_share: f64,
    pub crew: f64,
    pub strikes: bool,
    pub skill: f64,
    pub turn: f64,
    pub crewed: bool,
    pub struck_at: f64,
    pub might: f64,
    pub reload: f64,
}

impl Power {
    /// A captain as she knows herself.
    #[must_use]
    pub fn captain(build: &Build, hull_share: f64, crew_share: f64) -> Self {
        Self {
            hull_hp: build.hull,
            hull_share: hull_share.clamp(0.0, 1.0),
            crew_share: crew_share.clamp(0.0, 1.0),
            crew: build.crew * crew_share.clamp(0.0, 1.0),
            strikes: build.crew > 0.0,
            skill: build.skill,
            turn: STEER_PEAK,
            crewed: build.crewed,
            struck_at: STRUCK_AT,
            might: 1.0,
            reload: 1.0,
        }
    }

    /// A player's boat as a captain sizes her up: her hull's points and share, a gunner's skill, her helm at its best,
    /// and a crew at her guns whatever she carries (DFO's own reckoning).
    #[must_use]
    pub fn player(build: &Build, hull_share: f64) -> Self {
        Self {
            hull_hp: build.hull,
            hull_share: hull_share.clamp(0.0, 1.0),
            crew_share: 1.0,
            crew: 0.0,
            strikes: false,
            skill: build.skill,
            turn: STEER_PEAK,
            crewed: true,
            struck_at: STRUCK_AT,
            might: 1.0,
            reload: 1.0,
        }
    }
}

/// The share of a broadside's balls that strike a ship like hers at `DUEL_RANGE`, from gunners of `skill`: how
/// much of the fall her hull's height and beam take, against the scatter and the lay's error, and how much of her
/// length against the scatter and the miss a gunner allows.
#[must_use]
pub fn hit_share(arms: &Arms, skill: f64) -> f64 {
    let gun = SWIVEL;
    let widen = (1.5 - skill).clamp(0.4, 1.5);
    let [low, high] = arms.hull;
    let (top, half_beam, half_length) = (high[2], (high[1] - low[1]) / 2.0, (high[0] - low[0]) / 2.0);
    let muzzle = arms.battery(Side::Starboard)[0][2];
    let flight = DUEL_RANGE / gun.speed;
    let fall = ((0.5 * GRAVITY * flight + (muzzle - top * AIM_FREEBOARD) / flight) / gun.speed).max(0.02);
    let deep = top / fall + 2.0 * half_beam;
    let lay = 0.5 * LAY_ERR * (1.0 - skill);
    let pitch = libm::tan(gun.pitch_spread_deg * widen * PI / 180.0) / fall;
    let error = DUEL_RANGE * (lay * lay + pitch * pitch).sqrt();
    let across = DUEL_RANGE * libm::tan(gun.yaw_spread_deg * widen * PI / 180.0)
        + half_length * (FIRE_EXTENT_K + FIRE_EXTENT_SKILL * (1.0 - skill));
    (deep / (2.0 * error)).min(1.0) * (half_length / across).min(1.0)
}

/// Seconds `one`'s fire takes to make `other` strike: her hull down to her strike, or her last man if she strikes by
/// her men, her balls' harm and her reload as her rank paces them. Both ships carry `arms`.
#[must_use]
pub fn strike_time(one: &Power, other: &Power, arms: &Arms) -> f64 {
    let guns = arms.battery(Side::Starboard).len() as f64;
    let reload = reload_seconds(&SWIVEL, one.crew_share, one.crewed) * one.reload;
    let balls = guns / (reload + TURN_PER_VOLLEY / one.turn.max(1.0));
    let hits = balls * hit_share(arms, one.skill);
    let top = arms.hull[1][2];
    let hull = hits * SWIVEL.hull * one.might * (1.0 + HOLED_BONUS * (WATERLINE_BAND_M / top).min(1.0));
    let men = hits * SWIVEL.crew * one.might / SHIP_TOUGHNESS;
    let by_hull =
        if hull > 0.0 { other.hull_hp * (other.hull_share - other.struck_at).max(0.0) / hull } else { f64::INFINITY };
    let by_men = if other.strikes && men > 0.0 { other.crew / men } else { f64::INFINITY };
    by_hull.min(by_men)
}

/// How far `one` outguns `other`: the time `other` takes to make her strike over the time she takes.
#[must_use]
pub fn odds(one: &Power, other: &Power, arms: &Arms) -> f64 {
    let (mine, theirs) = (strike_time(one, other, arms), strike_time(other, one, arms));
    if mine == theirs {
        1.0
    } else if mine == 0.0 || theirs == f64::INFINITY {
        f64::INFINITY
    } else {
        theirs / mine
    }
}

#[cfg(test)]
#[path = "odds_tests.rs"]
mod tests;
