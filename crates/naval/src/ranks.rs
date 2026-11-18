//! Whom a captain sails for and her rank: the factions by number, each one's Sloop, and what each rank makes of her
//! ship over a Major's (her hull and men, her way, her guns' harm and reload, her gunners' aim, her boldness), kept in
//! one table.

use crate::arms::{Build, PIRATE_SLOOP, TITHE_SLOOP};
use crate::captain::PIRATE_RUNS_AT;
use crate::damage::{Damage, STRUCK_AT};
use crate::guns::Gun;

/// The factions by number, as the foes number them: the players' own ships are 0.
pub const PLAYERS: u8 = 0;
pub const GREY_TITHE: u8 = 1;
pub const PIRATES: u8 = 2;
/// The factions whose captains sail, in their numbers' order.
pub const CAPTAIN_FACTIONS: [u8; 2] = [GREY_TITHE, PIRATES];

/// A ship's rank, Minor to Boss, numbered 1 to 5 on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rank {
    Minor = 1,
    Major = 2,
    Elite = 3,
    Miniboss = 4,
    Boss = 5,
}

/// What a rank makes of a ship over a Major's: her hull's strength and her men alike (so hull and men give out in the
/// same proportion at every rank), the way her canvas gives her, her guns' harm, their reload, her gunners' aim error
/// (the lay's error and the volley's scatter), whether she is always bold whatever her seed, the share of her hull
/// under which she runs (0: never), and the share at which she strikes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Scale {
    pub hull: f64,
    pub way: f64,
    pub might: f64,
    pub reload: f64,
    pub aim_error: f64,
    pub always_bold: bool,
    pub runs_at: f64,
    pub strikes_at: f64,
}

/// Every rank's scale, Minor to Boss. A Major is a ship as she was before ranks: every factor 1. The higher ranks
/// strike later, so a Miniboss's run below 15% comes before her strike.
pub const SCALES: [Scale; 5] = [
    Scale {
        hull: 0.6,
        way: 0.9,
        might: 0.9,
        reload: 1.2,
        aim_error: 1.3,
        always_bold: false,
        runs_at: PIRATE_RUNS_AT,
        strikes_at: STRUCK_AT,
    },
    Scale {
        hull: 1.0,
        way: 1.0,
        might: 1.0,
        reload: 1.0,
        aim_error: 1.0,
        always_bold: false,
        runs_at: PIRATE_RUNS_AT,
        strikes_at: STRUCK_AT,
    },
    Scale {
        hull: 1.8,
        way: 1.1,
        might: 1.1,
        reload: 0.9,
        aim_error: 0.8,
        always_bold: true,
        runs_at: PIRATE_RUNS_AT,
        strikes_at: 0.2,
    },
    Scale {
        hull: 3.0,
        way: 1.2,
        might: 1.2,
        reload: 0.8,
        aim_error: 0.7,
        always_bold: true,
        runs_at: 0.15,
        strikes_at: 0.1,
    },
    Scale {
        hull: 5.0,
        way: 1.3,
        might: 1.3,
        reload: 0.7,
        aim_error: 0.6,
        always_bold: true,
        runs_at: 0.0,
        strikes_at: 0.05,
    },
];

impl Rank {
    pub const ALL: [Rank; 5] = [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss];

    /// Its number on the wire, 1 to 5.
    #[must_use]
    pub fn number(self) -> u8 {
        self as u8
    }

    /// The rank numbered so, if any.
    #[must_use]
    pub fn numbered(number: u8) -> Option<Rank> {
        Self::ALL.into_iter().find(|rank| rank.number() == number)
    }

    #[must_use]
    pub fn scale(self) -> &'static Scale {
        &SCALES[usize::from(self.number() - 1)]
    }
}

/// A captain's commission: the faction she sails for and her rank.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Commission {
    pub faction: u8,
    pub rank: Rank,
}

impl Default for Commission {
    /// A Major of the pirates: a captain as she was before factions and ranks.
    fn default() -> Self {
        Self { faction: PIRATES, rank: Rank::Major }
    }
}

impl Commission {
    /// A commission for a faction whose captains sail, or none.
    #[must_use]
    pub fn of(faction: u8, rank: Rank) -> Option<Commission> {
        CAPTAIN_FACTIONS.contains(&faction).then_some(Commission { faction, rank })
    }

    /// Her faction's Sloop, her hull as strong and her men as many as her rank makes them.
    #[must_use]
    pub fn build(&self) -> Build {
        let base = if self.faction == GREY_TITHE { TITHE_SLOOP } else { PIRATE_SLOOP };
        let scale = self.rank.scale().hull;
        // Whole points and whole men, as every blow takes, so neither ever shows a fraction left.
        Build { hull: (base.hull * scale).round(), crew: (base.crew * scale).round(), ..base }
    }

    /// Her ship's hurts, sound: her hull as strong as her rank makes it, striking where her rank strikes.
    #[must_use]
    pub fn damage(&self) -> Damage {
        let mut damage = Damage::new(&self.build(), false);
        damage.struck_at = self.rank.scale().strikes_at;
        damage
    }

    /// A gun as her gunners fire it: its harm by her rank's might, its scatter by her rank's aim error.
    #[must_use]
    pub fn armed(&self, gun: Gun) -> Gun {
        let scale = self.rank.scale();
        Gun {
            hull: gun.hull * scale.might,
            sail: gun.sail * scale.might,
            crew: gun.crew * scale.might,
            yaw_spread_deg: gun.yaw_spread_deg * scale.aim_error,
            pitch_spread_deg: gun.pitch_spread_deg * scale.aim_error,
            ..gun
        }
    }
}

#[cfg(test)]
#[path = "ranks_tests.rs"]
mod tests;
