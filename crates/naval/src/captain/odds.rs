//! A captain sizing up a fight, as DFO's: how long each ship's broadsides take to make the other strike (by its hull
//! down to a quarter, or its last man), from its guns, reload, turn between volleys and the share of balls that hit
//! at a duel's range; the odds are the one time over the other.

use super::aim::{AIM_FREEBOARD, FIRE_EXTENT_K, FIRE_EXTENT_SKILL, LAY_ERR};
use crate::arms::{Arms, Build, SLOOP_GUNS_A_SIDE, Side};
use crate::ballistics::GRAVITY;
use crate::damage::{HOLED_BONUS, SHIP_TOUGHNESS, STRUCK_AT, WATERLINE_BAND_M};
use crate::gunnery::reload_seconds;
use crate::guns::SWIVEL;
use sailing::helm::STEER_PEAK;
use std::f64::consts::PI;

/// The range the hit share is reckoned at (metres), and the turn a ship makes between volleys (degrees).
pub const DUEL_RANGE: f64 = 110.0;
pub const TURN_PER_VOLLEY: f64 = 90.0;

/// A ship's fighting power: its hull's points and share left, its crew's share and men, whether it strikes by its
/// men, its gunners' skill, its turn (degrees a second), whether a crew loads its guns, the share of its hull it
/// strikes at, and its guns' harm and reload over a Major's (`ranks::Scale`).
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
    /// A captain as it knows itself.
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

    /// A player's boat as a captain sizes it up: its hull's points and share, a gunner's skill, its helm at its best,
    /// and a crew at its guns whatever it carries (DFO's own reckoning).
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

/// The share of a broadside's balls from a ship of `shooter`'s arms that strike one of `target`'s at `DUEL_RANGE`,
/// from gunners of `skill`.
#[must_use]
pub fn hit_share(shooter: &Arms, target: &Arms, skill: f64) -> f64 {
    hit_share_at(shooter, target, skill, DUEL_RANGE)
}

/// The share of a broadside's balls from a ship of `shooter`'s arms that strike one of `target`'s `range` metres off,
/// from gunners of `skill`: how much of the fall its hull's height and beam take, against the scatter and the lay's
/// error, and how much of its length against the scatter and the miss a gunner allows.
#[must_use]
pub fn hit_share_at(shooter: &Arms, target: &Arms, skill: f64, range: f64) -> f64 {
    let gun = SWIVEL;
    let widen = (1.5 - skill).clamp(0.4, 1.5);
    let [low, high] = target.hull;
    let (top, half_beam, half_length) = (high[2], (high[1] - low[1]) / 2.0, (high[0] - low[0]) / 2.0);
    let muzzle = shooter.battery(Side::Starboard)[0][2];
    let flight = range / gun.speed;
    let fall = ((0.5 * GRAVITY * flight + (muzzle - top * AIM_FREEBOARD) / flight) / gun.speed).max(0.02);
    let deep = top / fall + 2.0 * half_beam;
    let lay = 0.5 * LAY_ERR * (1.0 - skill);
    let pitch = libm::tan(gun.pitch_spread_deg * widen * PI / 180.0) / fall;
    let error = range * (lay * lay + pitch * pitch).sqrt();
    let across = range * libm::tan(gun.yaw_spread_deg * widen * PI / 180.0)
        + half_length * (FIRE_EXTENT_K + FIRE_EXTENT_SKILL * (1.0 - skill));
    (deep / (2.0 * error)).min(1.0) * (half_length / across).min(1.0)
}

/// Seconds `one`'s fire takes to make `other` strike: its hull down to its strike, or its last man if it strikes by
/// its men, its balls' harm and its reload as its rank paces them. `one` carries the first arms, `other` the second.
/// Every side throws the Sloop's broadside, however many guns share it.
#[must_use]
pub fn strike_time(one: &Power, other: &Power, [shooter, target]: [&Arms; 2]) -> f64 {
    let guns = SLOOP_GUNS_A_SIDE;
    let reload = reload_seconds(&SWIVEL, one.crew_share, one.crewed) * one.reload;
    let balls = guns / (reload + TURN_PER_VOLLEY / one.turn.max(1.0));
    let hits = balls * hit_share(shooter, target, one.skill);
    let top = target.hull[1][2];
    let hull = hits * SWIVEL.hull * one.might * (1.0 + HOLED_BONUS * (WATERLINE_BAND_M / top).min(1.0));
    let men = hits * SWIVEL.crew * one.might / SHIP_TOUGHNESS;
    let by_hull =
        if hull > 0.0 { other.hull_hp * (other.hull_share - other.struck_at).max(0.0) / hull } else { f64::INFINITY };
    let by_men = if other.strikes && men > 0.0 { other.crew / men } else { f64::INFINITY };
    by_hull.min(by_men)
}

/// How far `one` (of the first arms) outguns `other` (of the second): the time `other` takes to make `one` strike over
/// the time `one` takes.
#[must_use]
pub fn odds(one: &Power, other: &Power, [own, theirs]: [&Arms; 2]) -> f64 {
    let (mine, theirs) = (strike_time(one, other, [own, theirs]), strike_time(other, one, [theirs, own]));
    if mine == theirs {
        1.0
    } else if mine == 0.0 || theirs == f64::INFINITY {
        f64::INFINITY
    } else {
        theirs / mine
    }
}

/// Whether a wary captain of `commission` at `strength` (`Captain::raised`), sound, falls on a player's Sloop met at
/// sea with `hull_share` of its hull left, by DFO's `takesPrize` (navalAI.js): one holed under `GRAPPLE_HULL`, or one
/// it outguns `WARY_ODDS` to one by their fighting powers.
#[must_use]
pub fn wary_takes(commission: crate::ranks::Commission, strength: f64, hull_share: f64) -> bool {
    if hull_share < super::GRAPPLE_HULL {
        return true;
    }
    let arms = crate::arms::arms_of(commission.hull());
    let mind = super::Captain::new(commission, 0, 0.0, arms).raised(strength);
    let prize = Power::player(&crate::arms::LARGE_BOAT, hull_share);
    let sloop = crate::arms::arms_of(sailing::HullKind::Sloop);
    odds(&mind.power(&commission.damage_at(strength)), &prize, [arms, sloop]) >= super::WARY_ODDS
}

#[cfg(test)]
#[path = "odds_tests.rs"]
mod tests;
