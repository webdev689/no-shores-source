//! Who a roll at sea sends, and where she is seen. The water at the player's ship names her faction, none in home
//! waters; its island's level band sets her rank and her level. She is sighted farther the faster the player sails,
//! so one met head-on stays in sight half a minute, and she comes out near that distance ahead of them: a pirate by a
//! coast, a Tithe ship on a lane. The sea's map is a `Chart`, so the law can be tried on any sea.

use crate::pirates::PIRATE_WAY_M_S;
use crate::sea::SHIP_SPEED_M_S;
use core::f64::consts::{PI, TAU};
use naval::ranks::{GREY_TITHE, PIRATES, Rank};
use world::waters::Holder;

/// The nearest a hostile ship is sighted from, metres, and the seconds a ship met head-on stays in sight at any pace.
pub const SIGHT_LEAST_M: f64 = 5_000.0;
pub const SIGHT_HOLD_S: f64 = 30.0;
/// A ship goes once no player is within this many times her sight.
pub const KEEP_SHARE: f64 = 1.1;
/// She comes out between these shares of her sight from the player, within this of their heading under way.
pub const COME_OUT: [f64; 2] = [0.9, 1.0];
pub const AHEAD_ARC_RAD: f64 = PI / 3.0;
/// A Tithe ship keeps to a lane within this of where she comes (metres).
pub const LANE_REACH_M: f64 = 50_000.0;
/// The ranks a roll sends, and their shares by the lowest level of the water's band: each row holds from its level
/// up to the next row's.
pub const RANKS_AT_SEA: [Rank; 4] = [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss];
pub const RANKS_BY_BAND: [(u8, [f64; 4]); 5] = [
    (0, [0.50, 0.40, 0.10, 0.0]),
    (10, [0.35, 0.45, 0.20, 0.0]),
    (13, [0.25, 0.45, 0.25, 0.05]),
    (19, [0.15, 0.45, 0.30, 0.10]),
    (26, [0.10, 0.40, 0.35, 0.15]),
];
/// A Miniboss's way over the Sloop's, the fastest at sea.
pub const FASTEST_WAY: f64 = 1.2;

/// The water at a point of sea: who holds it and its island's band of levels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WaterHere {
    pub holder: Holder,
    pub levels: Option<(u8, u8)>,
}

/// The sea as a hostile ship reads it.
pub trait Chart {
    /// Whether a ship may sail straight from one point to another: no land between, and no home water at the end.
    fn open(&self, from: [f64; 2], to: [f64; 2]) -> bool;
    /// The water at a point; none on land.
    fn water(&self, at: [f64; 2]) -> Option<WaterHere>;
    /// Metres to the nearest coast.
    fn coast(&self, at: [f64; 2]) -> f64;
    /// The nearest friendly lane: metres to it, and the unit way its leg runs (east and south); none with no lane.
    fn lane(&self, at: [f64; 2]) -> Option<(f64, [f64; 2])>;
}

/// How far a ship is sighted from a player sailing at `pace` (0, at rest, counts as 1): half a minute of the two
/// closing head-on, and never under `SIGHT_LEAST_M`.
#[must_use]
pub fn sight_for(pace: f64) -> f64 {
    (SIGHT_HOLD_S * (SHIP_SPEED_M_S + PIRATE_WAY_M_S) * pace.max(1.0)).max(SIGHT_LEAST_M)
}

/// The faction a roll in this water sends, by `roll` in 0 to 1 on contested water; none in home waters.
#[must_use]
pub fn faction_of(holder: Holder, roll: f64) -> Option<u8> {
    match holder {
        Holder::Home => None,
        Holder::Pirates => Some(PIRATES),
        Holder::GreyTithe => Some(GREY_TITHE),
        Holder::Contested => Some(if roll < 0.5 { GREY_TITHE } else { PIRATES }),
    }
}

/// The rank `roll` in 0 to 1 draws in a water whose band starts at `low`.
#[must_use]
pub fn rank_for(low: u8, roll: f64) -> Rank {
    let shares = RANKS_BY_BAND.iter().rev().find(|(from, _)| low >= *from).map_or(RANKS_BY_BAND[0].1, |row| row.1);
    let mut below = 0.0;
    for (rank, share) in RANKS_AT_SEA.into_iter().zip(shares) {
        below += share;
        if roll < below {
            return rank;
        }
    }
    Rank::Major
}

/// The level `roll` in 0 to 1 draws evenly from a band, as a garrison foe's is; 0 with none.
#[must_use]
pub fn level_in(levels: Option<(u8, u8)>, roll: f64) -> u8 {
    levels.map_or(0, |(low, high)| {
        let band = f64::from(high.saturating_sub(low)) + 1.0;
        // The roll is under 1, so the step is a whole number within the band.
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let step = libm::floor(roll * band).min(band - 1.0) as u8;
        low.saturating_add(step)
    })
}

/// A ship's way at sea by her rank, metres a second: the Sloop's, a Minor slower and the higher ranks faster.
#[must_use]
pub fn way_of(rank: Rank) -> f64 {
    PIRATE_WAY_M_S
        * match rank {
            Rank::Minor => 0.9,
            Rank::Major | Rank::Boss => 1.0,
            Rank::Elite => 1.1,
            Rank::Miniboss => FASTEST_WAY,
        }
}

/// The heading along a leg running `way` (east and south), of its two, nearer `slant` (radians clockwise from north).
#[must_use]
pub fn along_lane([east, south]: [f64; 2], slant: f64) -> f64 {
    let one = libm::atan2(east, -south).rem_euclid(TAU);
    let off = |heading: f64| ((heading - slant + PI).rem_euclid(TAU) - PI).abs();
    let other = (one + PI).rem_euclid(TAU);
    if off(one) <= off(other) { one } else { other }
}

#[cfg(test)]
#[path = "sighting_tests.rs"]
mod tests;
