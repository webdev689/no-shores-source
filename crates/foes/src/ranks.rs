//! The ranks a foe comes in, from a Minor to a Boss: each scales its type's numbers (a Major's), sets the telegraphed
//! blows it throws and its tier, and gives it its phases. A Minor throws no telegraphed blow, so a Minor shooter never
//! aims; an Elite throws its role's whole set; a Miniboss and a Boss feint and fight in phases.

use crate::roles::{Numbers, Shapes};
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
/// telegraphed blows the phase adds.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Phase {
    pub from: f64,
    pub windup: f64,
    pub cooldown: f64,
    pub might: f64,
    pub chains: u32,
    pub adds: &'static [Shape],
}

const FIRST: Phase = Phase { from: 1.0, windup: 1.0, cooldown: 1.0, might: 1.0, chains: 1, adds: &[] };

/// A Miniboss's second phase, at 35% of its health: quicker, harder, chains of two.
const MINIBOSS: [Phase; 2] =
    [FIRST, Phase { from: 0.35, windup: 0.75, cooldown: 0.6, might: 1.25, chains: 2, adds: &[] }];

/// A Boss's three: the blade (sweep and lunge), the boarding at two thirds (charge and leap added, quicker, chains of
/// two), and the last stand at one third (iron slam and ring added, quicker still, harder, its crew called).
const BOSS: [Phase; 3] = [
    Phase { adds: &[Shape::Sweep, Shape::Lunge], ..FIRST },
    Phase { from: 2.0 / 3.0, windup: 0.85, cooldown: 0.8, might: 1.0, chains: 2, adds: &[Shape::Charge, Shape::Leap] },
    Phase { from: 1.0 / 3.0, windup: 0.75, cooldown: 0.6, might: 1.25, chains: 2, adds: &[Shape::Slam, Shape::Ring] },
];

/// The phases a rank fights in, the first at full health.
#[must_use]
pub fn phases(rank: Rank) -> &'static [Phase] {
    match rank {
        Rank::Miniboss => &MINIBOSS,
        Rank::Boss => &BOSS,
        Rank::Minor | Rank::Major | Rank::Elite => core::slice::from_ref(&FIRST),
    }
}

/// Phase `number` (1 and up) of a rank; past its last, its last.
#[must_use]
pub fn phase(rank: Rank, number: u8) -> Phase {
    let all = phases(rank);
    all[usize::from(number.max(1) - 1).min(all.len() - 1)]
}

const GAP_CLOSERS: [Shape; 2] = [Shape::Charge, Shape::Leap];

/// The telegraphed blows a rank throws, from its role's: a Minor none; a Major half of them, rounded up, the
/// gap-closers left out first; an Elite all; a Miniboss all, and a melee role the charge and leap besides; a Boss
/// what its phases so far have added.
#[must_use]
pub fn shapes(role: &[Shape], shooter: bool, rank: Rank, phase_number: u8) -> Shapes {
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
        Rank::Boss => BOSS[..usize::from(phase_number.clamp(1, 3))]
            .iter()
            .flat_map(|phase| phase.adds)
            .fold(Shapes::NONE, |kept, shape| kept.with(*shape)),
    }
}

/// A type's numbers (a Major's) at a rank, in phase `phase_number`: health, poise and might scaled, reaction moved
/// (never under REACTION_LEAST), defence shares scaled (together never past DEFENCE_MOST), its telegraphed blows, its
/// tier and its phases.
#[must_use]
pub fn ranked(base: &Numbers, rank: Rank, phase_number: u8) -> Numbers {
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
        shapes: shapes(&base.shapes, base.shooter, rank, phase_number),
        elite: rank >= Rank::Elite,
        feints: rank >= Rank::Miniboss,
        phases: u8::try_from(phases(rank).len()).unwrap_or(1),
        ..*base
    }
}
