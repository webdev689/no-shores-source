//! Who a roll at sea sends, and where it is seen. The water at the player's ship names its faction, none in home
//! waters; its island's level band sets its rank and its level. It is sighted farther the faster the player sails,
//! so one met head-on stays in sight half a minute, and it comes out near that distance ahead of them: a pirate by a
//! coast, a Tithe ship on a lane. The sea's map is a `Chart`, so the law can be tried on any sea.

use crate::pirates::PIRATE_WAY_M_S;
use crate::sea::SHIP_SPEED_M_S;
use core::f64::consts::{PI, TAU};
use naval::ranks::{GREY_TITHE, PIRATES, Rank};
use world::waters::Holder;

/// The nearest a hostile ship is sighted from, metres, and the seconds a ship met head-on stays in sight at any pace.
pub const SIGHT_LEAST_M: f64 = 5_000.0;
pub const SIGHT_HOLD_S: f64 = 30.0;
/// A ship goes once no player is within this many times its sight.
pub const KEEP_SHARE: f64 = 1.1;
/// It comes out between these shares of its sight from the player, within this of their heading under way.
pub const COME_OUT: [f64; 2] = [0.9, 1.0];
pub const AHEAD_ARC_RAD: f64 = PI / 3.0;
/// A Tithe ship keeps to a lane within this of where it comes (metres).
pub const LANE_REACH_M: f64 = 50_000.0;
/// The ranks a roll sends, and their shares by the lowest level of the water's band, a row for each island's band:
/// each row holds from its level up to the next row's.
pub const RANKS_AT_SEA: [Rank; 4] = [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss];
pub const RANKS_BY_BAND: [(u8, [f64; 4]); 9] = [
    (1, [0.50, 0.40, 0.10, 0.0]),
    (4, [0.45, 0.42, 0.13, 0.0]),
    (7, [0.40, 0.43, 0.17, 0.0]),
    (10, [0.35, 0.45, 0.20, 0.0]),
    (13, [0.25, 0.45, 0.25, 0.05]),
    (16, [0.20, 0.45, 0.27, 0.08]),
    (19, [0.15, 0.45, 0.30, 0.10]),
    (22, [0.13, 0.43, 0.32, 0.12]),
    (26, [0.10, 0.40, 0.35, 0.15]),
];
/// A roll's chance of a hostile ship in the first island's band and in the last: it rises evenly band by band.
pub const HOSTILE_CHANCE: [f64; 2] = [0.18, 0.36];
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

/// A roll's chance of a hostile ship in a water of this band: `HOSTILE_CHANCE` from the first island's band to the
/// last, evenly between; a water with no band rolls as the first.
#[must_use]
pub fn hostile_chance(levels: Option<(u8, u8)>) -> f64 {
    let bands = gear::world::ISLANDS.len() - 1;
    let band = levels.and_then(|(low, _)| gear::world::ISLANDS.iter().rposition(|&(_, from, _)| low >= from));
    let [first, last] = HOSTILE_CHANCE;
    first + (last - first) * band.unwrap_or(0) as f64 / bands as f64
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
    // A roll the shares' rounded sum falls a hair short of: the highest rank the row sends.
    RANKS_AT_SEA.into_iter().zip(shares).rfind(|(_, share)| *share > 0.0).map_or(Rank::Major, |(rank, _)| rank)
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

/// A ship's way at sea by its rank, metres a second: the Sloop's, a Minor slower and the higher ranks faster.
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

/// The paces at which a voyage is sighted from the least sight, 5 km, and a bold ship comes anywhere ahead as a wary
/// one does: the helm's own.
pub const SLOW_PACE: u16 = 10;
/// The share of its meeting cone a bold ship comes within, so it meets a voyage that holds its course.
pub const MEETING_MARGIN: f64 = 0.8;

/// The half-angle off a voyage's course, radians, within which a bold ship of `rank` can meet it at all: on the
/// voyage's clock it sails at its way and the ship at 12 m/s, so only from where sin(angle) <= its way / his. Shrunk
/// by `MEETING_MARGIN`, so a ship placed within it meets him if he holds his course.
#[must_use]
pub fn meeting_arc(rank: Rank) -> f64 {
    libm::asin(way_of(rank) / SHIP_SPEED_M_S) * MEETING_MARGIN
}

/// A ship's helm turns it at most this fast, radians a second of its clock: the Sloop's helm (the page's
/// `HELM_TURN`), so a captain coming for a player turns as a player can.
pub const HELM_TURN_RAD_S: f64 = 10.0 * PI / 180.0;

/// The heading (radians clockwise from north) from `from`, sailing at `speed`, to where a ship at `at` sailing at
/// `velocity` (east and south, metres a second) will be when it can be reached: lead pursuit. Straight at it where
/// it cannot be reached, as when it is the faster sailing away.
#[must_use]
pub fn intercept_heading(from: [f64; 2], speed: f64, at: [f64; 2], velocity: [f64; 2]) -> f64 {
    let gap = [at[0] - from[0], at[1] - from[1]];
    // Solving |gap + velocity t| = speed t for the soonest t past now.
    let square = velocity[0] * velocity[0] + velocity[1] * velocity[1] - speed * speed;
    let linear = 2.0 * (gap[0] * velocity[0] + gap[1] * velocity[1]);
    let constant = gap[0] * gap[0] + gap[1] * gap[1];
    let soonest = if square.abs() < 1e-12 {
        (linear < 0.0).then(|| -constant / linear)
    } else {
        let room = linear * linear - 4.0 * square * constant;
        (room >= 0.0).then(|| {
            let [one, other] = [(-linear - room.sqrt()) / (2.0 * square), (-linear + room.sqrt()) / (2.0 * square)];
            let soonest = one.min(other);
            if soonest > 0.0 { soonest } else { one.max(other) }
        })
    };
    let time = soonest.filter(|&time| time > 0.0).unwrap_or(0.0);
    let ahead = [gap[0] + velocity[0] * time, gap[1] + velocity[1] * time];
    libm::atan2(ahead[0], -ahead[1]).rem_euclid(TAU)
}

/// A heading turned toward `want` by at most `most` radians, the shorter way round.
#[must_use]
pub fn turned_toward(heading: f64, want: f64, most: f64) -> f64 {
    let off = (want - heading + PI).rem_euclid(TAU) - PI;
    (heading + off.clamp(-most, most)).rem_euclid(TAU)
}

#[cfg(test)]
#[path = "sighting_tests.rs"]
mod tests;
