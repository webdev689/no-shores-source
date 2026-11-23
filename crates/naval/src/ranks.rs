//! Whom a captain sails for and its rank: the factions by number, each one's class, the hull each rank sails, and what
//! each rank makes of its ship over a Major's (its hull and men, its way, its guns' harm and reload, its gunners' aim,
//! its boldness), kept in one table.

use crate::arms::{Arms, Build, SLOOP_ARMS, TITHE_SLOOP, arms_of};
use crate::captain::RUNS_AT;
use crate::captain::odds::hit_share;
use crate::damage::{Damage, HOLED_BONUS, STRUCK_AT, WATERLINE_BAND_M};
use crate::guns::Gun;
use sailing::HullKind;

/// The factions by number, as the foes number them: the players' own ships are 0, and so is a friendly ship of the
/// traffic a captain sails beside them. The Grey Tithe's captains alone sail against them.
pub const PLAYERS: u8 = 0;
pub const GREY_TITHE: u8 = 1;

/// A ship's rank, Minor to Boss, numbered 1 to 5 on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rank {
    Minor = 1,
    Major = 2,
    Elite = 3,
    Miniboss = 4,
    Boss = 5,
}

/// What a rank makes of a ship over a Major's: its hull's strength and its men alike (so hull and men give out in the
/// same proportion at every rank), the way its canvas gives it, its guns' harm, their reload, its gunners' aim error
/// (the lay's error and the volley's scatter), whether it is always bold whatever its seed, the share of its hull
/// under which it runs (0: never), and the share at which it strikes.
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

/// Every rank's scale, Minor to Boss. A Major is the plain ship: every factor 1. The higher ranks
/// strike later, so a Miniboss's run below 15% comes before its strike.
pub const SCALES: [Scale; 5] = [
    Scale {
        hull: 0.6,
        way: 0.9,
        might: 0.9,
        reload: 1.2,
        aim_error: 1.3,
        always_bold: false,
        runs_at: RUNS_AT,
        strikes_at: STRUCK_AT,
    },
    Scale {
        hull: 1.0,
        way: 1.0,
        might: 1.0,
        reload: 1.0,
        aim_error: 1.0,
        always_bold: false,
        runs_at: RUNS_AT,
        strikes_at: STRUCK_AT,
    },
    Scale {
        hull: 1.8,
        way: 1.1,
        might: 1.1,
        reload: 0.9,
        aim_error: 0.8,
        always_bold: true,
        runs_at: RUNS_AT,
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

    /// The hull a captain of this rank sails: the Sloop for a Minor and a Major, the Schooner for an Elite, the Brig
    /// for a Miniboss and the Frigate for a Boss.
    #[must_use]
    pub fn hull(self) -> HullKind {
        match self {
            Rank::Minor | Rank::Major => HullKind::Sloop,
            Rank::Elite => HullKind::Schooner,
            Rank::Miniboss => HullKind::Brig,
            Rank::Boss => HullKind::Frigate,
        }
    }
}

/// How much more often a broadside strikes it than the Sloop: the fight's hit share on its box over the Sloop's, from
/// the Sloop's guns at the duel's range by a captain's gunners. Its canvas and men are this many times its class's, so
/// the same fire takes as long to make any hull of one rank strike; the Sloop's is 1.
#[must_use]
pub fn exposure(hull: HullKind) -> f64 {
    let at = |arms: &Arms| hit_share(&SLOOP_ARMS, arms, TITHE_SLOOP.skill);
    at(arms_of(hull)) / at(&SLOOP_ARMS)
}

/// How much more harm a broadside does its hull than the Sloop's: its exposure, each hit holed as often as the
/// waterline band is of its height (as `strike_time` reckons it), over the Sloop's. Its hull points are this many
/// times its class's; the Sloop's is 1.
#[must_use]
pub fn hull_exposure(hull: HullKind) -> f64 {
    let holed = |arms: &Arms| 1.0 + HOLED_BONUS * (WATERLINE_BAND_M / arms.hull[1][2]).min(1.0);
    exposure(hull) * (holed(arms_of(hull)) / holed(&SLOOP_ARMS))
}

/// A captain's ship's name, by its faction and its hull: the Tithe's Sloop, Schooner, Brig or Frigate, or a friendly
/// merchant's of the players' side.
#[must_use]
pub fn ship_name(faction: u8, hull: HullKind) -> &'static str {
    let tithe = faction == GREY_TITHE;
    match hull {
        HullKind::Sloop if tithe => "Tithe Sloop",
        HullKind::Schooner if tithe => "Tithe Schooner",
        HullKind::Brig if tithe => "Tithe Brig",
        HullKind::Frigate if tithe => "Tithe Frigate",
        HullKind::Sloop => "Merchant Sloop",
        HullKind::Schooner => "Merchant Schooner",
        HullKind::Brig => "Merchant Brig",
        HullKind::Frigate => "Merchant Frigate",
    }
}

/// A captain's commission: the faction it sails for and its rank.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Commission {
    pub faction: u8,
    pub rank: Rank,
}

impl Default for Commission {
    /// A Major of the Grey Tithe: the plain captain, as a call that names no faction or rank brings.
    fn default() -> Self {
        Self { faction: GREY_TITHE, rank: Rank::Major }
    }
}

impl Commission {
    /// A commission for the Grey Tithe, whose captains sail against the players, or none: a friendly ship's is the
    /// room's to give.
    #[must_use]
    pub fn of(faction: u8, rank: Rank) -> Option<Commission> {
        (faction == GREY_TITHE).then_some(Commission { faction, rank })
    }

    /// The hull it sails: its rank's.
    #[must_use]
    pub fn hull(&self) -> HullKind {
        self.rank.hull()
    }

    /// Its faction's class, named for its faction and its hull, its hull as strong and its men as many as its rank
    /// makes them.
    #[must_use]
    pub fn build(&self) -> Build {
        self.build_at(1.0)
    }

    /// Its class as `build`, its hull and its men `strength` times as many: what its level makes of them.
    #[must_use]
    pub fn build_at(&self, strength: f64) -> Build {
        self.build_in(self.hull(), strength)
    }

    /// Its class as `build_at` makes it, sailing `kind` rather than its rank's hull: a friendly ship keeps its own.
    #[must_use]
    pub fn build_in(&self, kind: HullKind, strength: f64) -> Build {
        let base = TITHE_SLOOP;
        let scale = self.rank.scale().hull * strength;
        let (name, exposed) = (ship_name(self.faction, kind), exposure(kind));
        // Whole points and whole men, as every blow takes, so neither ever shows a fraction left.
        let (hull, crew) = ((base.hull * scale * hull_exposure(kind)).round(), (base.crew * scale * exposed).round());
        Build { name, hull, sail: (base.sail * exposed).round(), crew, ..base }
    }

    /// Its ship's hurts, sound: its hull as strong as its rank makes it, striking where its rank strikes.
    #[must_use]
    pub fn damage(&self) -> Damage {
        self.damage_at(1.0)
    }

    /// Its ship's hurts, sound, as `damage`, its hull and men `strength` times as many.
    #[must_use]
    pub fn damage_at(&self, strength: f64) -> Damage {
        self.damage_in(self.hull(), strength)
    }

    /// Its ship's hurts, sound, as `damage_at`, sailing `kind` (`build_in`).
    #[must_use]
    pub fn damage_in(&self, kind: HullKind, strength: f64) -> Damage {
        let mut damage = Damage::new(&self.build_in(kind, strength), false);
        damage.struck_at = self.rank.scale().strikes_at;
        damage
    }

    /// A gun as its gunners fire it: its harm by its rank's might and `strength`, what its level makes of it, its
    /// scatter by its rank's aim error.
    #[must_use]
    pub fn armed(&self, gun: Gun, strength: f64) -> Gun {
        let scale = self.rank.scale();
        let might = scale.might * strength;
        Gun {
            hull: gun.hull * might,
            sail: gun.sail * might,
            crew: gun.crew * might,
            yaw_spread_deg: gun.yaw_spread_deg * scale.aim_error,
            pitch_spread_deg: gun.pitch_spread_deg * scale.aim_error,
            ..gun
        }
    }
}

#[cfg(test)]
#[path = "ranks_tests.rs"]
mod tests;
