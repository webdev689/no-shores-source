//! The ranks a foe comes in, from a Minor to a Boss: each scales its type's numbers (a Major's), sets the telegraphed
//! blows it throws and its tier, and gives it its phases. A Minor throws no telegraphed blow, so a Minor shooter never
//! aims; an Elite throws its role's whole set; a Miniboss and a Boss feint and fight in phases, each Boss its own.

use crate::roles::{Numbers, Shapes};
use crate::roster::{COLLECTOR, CROSSBOWMAN, DECKHAND};
use combat::shapes::Shape;

/// The ranks, numbered as the wire carries them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rank {
    Minor = 1,
    Major = 2,
    Elite = 3,
    Miniboss = 4,
    Boss = 5,
}

impl Rank {
    pub const ALL: [Rank; 5] = [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss];

    /// The rank a number names (1 to 5), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Rank> {
        Self::ALL.iter().copied().find(|rank| *rank as u8 == number)
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Rank::Minor => "minor",
            Rank::Major => "major",
            Rank::Elite => "elite",
            Rank::Miniboss => "miniboss",
            Rank::Boss => "boss",
        }
    }
}

/// Defence shares (parry, block and dodge) together never pass this: past it they are scaled down evenly.
pub const DEFENCE_MOST: f64 = 0.85;
/// No rank answers a blow sooner than this many ticks after seeing it begin: a person's quickest.
pub const REACTION_LEAST: u64 = 13;

/// What a rank multiplies a Major's health, poise, might and defence shares by, and the ticks it adds to its reaction.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Scale {
    health: f64,
    poise: f64,
    might: f64,
    reaction: i64,
    defence: f64,
}

fn scale(rank: Rank) -> Scale {
    let (health, poise, might, reaction, defence) = match rank {
        Rank::Minor => (0.6, 0.7, 0.9, 4, 0.5),
        Rank::Major => (1.0, 1.0, 1.0, 0, 1.0),
        Rank::Elite => (2.2, 1.6, 1.15, -2, 1.25),
        Rank::Miniboss => (4.0, 2.4, 1.25, -3, 1.4),
        Rank::Boss => (7.0, 3.5, 1.35, -4, 1.5),
    };
    Scale { health, poise, might, reaction, defence }
}

/// One phase a foe fights in: the share of its health at or below which it begins, what its wind-ups and cooldowns are
/// multiplied by, what its blows are made harder by, how many blows it chains after a first, and, for a Boss, the
/// telegraphed blows the phase adds and the foes it calls as its roar into the phase begins.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Phase {
    pub from: f64,
    pub windup: f64,
    pub cooldown: f64,
    pub might: f64,
    pub chains: u32,
    pub adds: &'static [Shape],
    pub calls: Option<Call>,
}

/// Foes a phase calls to its foe: their type's number, their rank, how many, and where they stand by it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Call {
    pub foe_type: u8,
    pub rank: Rank,
    pub count: u8,
    pub place: Place,
}

/// Where called foes stand: either side of their caller, or behind it and either side.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Place {
    Beside,
    Behind,
}

const FIRST: Phase = Phase { from: 1.0, windup: 1.0, cooldown: 1.0, might: 1.0, chains: 1, adds: &[], calls: None };

/// A Miniboss's two: its first throws the same blows as an Elite more often (cooldowns ×0.8), and its second, at 35% of
/// its health, is quicker, harder, with chains of two.
const MINIBOSS: [Phase; 2] = [
    Phase { cooldown: 0.8, ..FIRST },
    Phase { from: 0.35, windup: 0.75, cooldown: 0.6, might: 1.25, chains: 2, ..FIRST },
];

/// Captain Brannoc Thule's three: the blade (sweep and lunge), the boarding at two thirds (charge and leap added,
/// quicker, chains of two), and the last stand at one third (iron slam and ring added, quicker still, harder, two Minor
/// Deckhands called to his sides).
pub const THULE: [Phase; 3] = [
    Phase { adds: &[Shape::Sweep, Shape::Lunge], ..FIRST },
    Phase { from: 2.0 / 3.0, windup: 0.85, cooldown: 0.8, chains: 2, adds: &[Shape::Charge, Shape::Leap], ..FIRST },
    Phase {
        from: 1.0 / 3.0,
        windup: 0.75,
        cooldown: 0.6,
        might: 1.25,
        chains: 2,
        adds: &[Shape::Slam, Shape::Ring],
        calls: Some(Call { foe_type: DECKHAND, rank: Rank::Minor, count: 2, place: Place::Beside }),
    },
];

/// High Assessor Corvane's three: the levy (sweep and lunge, his shield up while he waits), the summons at two thirds
/// (the iron slam added, wind-ups quicker, two Minor Crossbowmen called behind him), and the seizure at one third
/// (charge, leap and ring added, cooldowns shorter, harder, two Major Collectors called to his sides).
pub const CORVANE: [Phase; 3] = [
    Phase { adds: &[Shape::Sweep, Shape::Lunge], ..FIRST },
    Phase {
        from: 2.0 / 3.0,
        windup: 0.85,
        adds: &[Shape::Slam],
        calls: Some(Call { foe_type: CROSSBOWMAN, rank: Rank::Minor, count: 2, place: Place::Behind }),
        ..FIRST
    },
    Phase {
        from: 1.0 / 3.0,
        windup: 0.85,
        cooldown: 0.6,
        might: 1.25,
        chains: 1,
        adds: &[Shape::Charge, Shape::Leap, Shape::Ring],
        calls: Some(Call { foe_type: COLLECTOR, rank: Rank::Major, count: 2, place: Place::Beside }),
    },
];

/// The phases a type fights in at a rank, the first at full health: a Boss its type's own (`boss`), a Miniboss a
/// Miniboss's two, any other rank one.
#[must_use]
pub fn phases(boss: &'static [Phase], rank: Rank) -> &'static [Phase] {
    match rank {
        Rank::Miniboss => &MINIBOSS,
        Rank::Boss if !boss.is_empty() => boss,
        Rank::Minor | Rank::Major | Rank::Elite | Rank::Boss => core::slice::from_ref(&FIRST),
    }
}

/// Phase `number` (1 and up) of a type whose Boss phases are `boss`, at a rank; past its last, its last.
#[must_use]
pub fn phase(boss: &'static [Phase], rank: Rank, number: u8) -> Phase {
    let all = phases(boss, rank);
    all[usize::from(number.max(1) - 1).min(all.len() - 1)]
}

const GAP_CLOSERS: [Shape; 2] = [Shape::Charge, Shape::Leap];

/// The telegraphed blows a rank throws, from its role's: a Minor none; a Major half of them, rounded up, the
/// gap-closers left out first; an Elite all; a Miniboss all, and a melee role the charge and leap besides; a Boss
/// what its own phases (`boss`) so far have added.
#[must_use]
pub fn shapes(role: &[Shape], shooter: bool, rank: Rank, boss: &[Phase], phase_number: u8) -> Shapes {
    match rank {
        Rank::Minor => Shapes::NONE,
        Rank::Major => {
            let near = role.iter().filter(|shape| !GAP_CLOSERS.contains(shape));
            let ordered = near.chain(role.iter().filter(|shape| GAP_CLOSERS.contains(shape)));
            ordered.take(role.len().div_ceil(2)).fold(Shapes::NONE, |kept, shape| kept.with(*shape))
        }
        Rank::Elite => Shapes::of(role),
        Rank::Miniboss if shooter => Shapes::of(role),
        Rank::Miniboss => GAP_CLOSERS.iter().fold(Shapes::of(role), |kept, shape| kept.with(*shape)),
        Rank::Boss => boss[..usize::from(phase_number.max(1)).min(boss.len())]
            .iter()
            .flat_map(|phase| phase.adds)
            .fold(Shapes::NONE, |kept, shape| kept.with(*shape)),
    }
}

/// A type's numbers (a Major's) at a rank, in phase `phase_number`: health, poise and might scaled, reaction moved
/// (never under REACTION_LEAST), defence shares scaled (together never past DEFENCE_MOST), its telegraphed blows, its
/// tier and its phases (a Boss's its type's own, `boss`).
#[must_use]
pub fn ranked(base: &Numbers, rank: Rank, boss: &'static [Phase], phase_number: u8) -> Numbers {
    let scale = scale(rank);
    let shares = [base.parry, base.block, base.dodge].map(|share| share * scale.defence);
    let total = shares[0] + shares[1] + shares[2];
    let capped = if total > DEFENCE_MOST { shares.map(|share| share * DEFENCE_MOST / total) } else { shares };
    let reaction = u64::try_from(i64::try_from(base.reaction).unwrap_or(i64::MAX) + scale.reaction).unwrap_or(0);
    Numbers {
        health: base.health * scale.health,
        poise: base.poise * scale.poise,
        might: base.might * scale.might,
        reaction: reaction.max(REACTION_LEAST),
        parry: capped[0],
        block: capped[1],
        dodge: capped[2],
        shapes: shapes(&base.shapes, base.shooter, rank, boss, phase_number),
        elite: rank >= Rank::Elite,
        feints: rank >= Rank::Miniboss,
        phases: u8::try_from(phases(boss, rank).len()).unwrap_or(1),
        ..*base
    }
}
