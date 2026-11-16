//! The kinds of foe, Overlook's own table: what each holds (forge layers, so the client dresses it alike), how much it
//! takes, how quickly and how it answers a blow, and which telegraphed blows it throws.

use crate::brain::Brain;
use combat::fighter::{Side, Weight};
use combat::shapes::Shape;
use combat::{Fighter, arms_of};

/// The kinds, by role.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Skirmisher = 1,
    Swordsman = 2,
    Brute = 3,
    Archer = 4,
    Captain = 5,
}

impl Kind {
    pub const ALL: [Kind; 5] = [Kind::Skirmisher, Kind::Swordsman, Kind::Brute, Kind::Archer, Kind::Captain];

    /// The kind a number names (1 to 5), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Kind> {
        Self::ALL.iter().copied().find(|kind| *kind as u8 == number)
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Kind::Skirmisher => "skirmisher",
            Kind::Swordsman => "swordsman",
            Kind::Brute => "brute",
            Kind::Archer => "archer",
            Kind::Captain => "captain",
        }
    }
}

/// A kind's numbers: the forge layers in its right and left hands, its health, poise, weight and might; the ticks
/// from seeing a swing begin to answering it, and the shares of swings it parries, blocks and dodges (the rest it
/// takes); the telegraphed blows it throws; whether it is elite (TELL's higher tier: quicker wind-ups and cooldowns,
/// one blow in three iron, chains), feints, runs when badly hurt, shoots, or has a second phase.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct KindNumbers {
    pub right: &'static str,
    pub left: &'static str,
    pub health: f64,
    pub poise: f64,
    pub weight: Weight,
    pub might: f64,
    pub reaction: u64,
    pub parry: f64,
    pub block: f64,
    pub dodge: f64,
    pub shapes: &'static [Shape],
    pub elite: bool,
    pub feints: bool,
    pub coward: bool,
    pub shooter: bool,
    pub phase_two: bool,
}

const PLAIN: KindNumbers = KindNumbers {
    right: "",
    left: "",
    health: 1.0,
    poise: 1.0,
    weight: Weight::Medium,
    might: 1.0,
    reaction: 12,
    parry: 0.0,
    block: 0.0,
    dodge: 0.0,
    shapes: &[],
    elite: false,
    feints: false,
    coward: false,
    shooter: false,
    phase_two: false,
};

/// Each kind's numbers. A skirmisher lives by not being hit and runs when it is; a swordsman's shield takes blows; a
/// brute stands through them until its poise breaks; an archer keeps its distance; the captain does everything, and
/// its blade's whole set.
#[must_use]
pub fn numbers(kind: Kind) -> KindNumbers {
    match kind {
        Kind::Skirmisher => KindNumbers {
            right: "dagger_iron",
            left: "dagger_iron_l",
            health: 45.0,
            poise: 18.0,
            weight: Weight::Light,
            reaction: 10,
            parry: 0.05,
            dodge: 0.45,
            shapes: &[Shape::Lunge],
            coward: true,
            ..PLAIN
        },
        Kind::Swordsman => KindNumbers {
            right: "sword_steel",
            left: "shield_kite_steel",
            health: 70.0,
            poise: 35.0,
            parry: 0.25,
            block: 0.35,
            dodge: 0.1,
            shapes: &[Shape::Sweep, Shape::Lunge],
            ..PLAIN
        },
        Kind::Brute => KindNumbers {
            right: "warhammer_iron",
            health: 130.0,
            poise: 70.0,
            weight: Weight::Heavy,
            might: 1.1,
            reaction: 18,
            shapes: &[Shape::Slam, Shape::Sweep],
            ..PLAIN
        },
        Kind::Archer => KindNumbers {
            right: "bow_short_iron",
            health: 50.0,
            poise: 18.0,
            weight: Weight::Light,
            reaction: 16,
            dodge: 0.25,
            shapes: &[Shape::Aimed],
            shooter: true,
            ..PLAIN
        },
        Kind::Captain => KindNumbers {
            right: "sword_ebony",
            health: 400.0,
            poise: 120.0,
            weight: Weight::Heavy,
            might: 1.2,
            reaction: 10,
            parry: 0.35,
            block: 0.3,
            dodge: 0.15,
            shapes: &[Shape::Sweep, Shape::Lunge, Shape::Charge, Shape::Leap],
            elite: true,
            feints: true,
            phase_two: true,
            ..PLAIN
        },
    }
}

impl KindNumbers {
    /// Whether it raises a guard at all: such a foe keeps stamina for it, and backs off before its poise breaks.
    #[must_use]
    pub fn guards(&self) -> bool {
        self.parry + self.block > 0.0
    }

    #[must_use]
    pub fn defends(&self) -> bool {
        self.guards() || self.dodge > 0.0
    }
}

/// A new foe of a kind standing at (x, y) facing `facing`: its fighter (side Foes, its kind's arms, weight, health,
/// poise, might) and its brain.
#[must_use]
pub fn spawn(kind: Kind, x: f64, y: f64, facing: f64) -> (Fighter, Brain) {
    let numbers = numbers(kind);
    let mut body = movement::standing(x, y);
    body.facing = facing;
    let arms = arms_of(numbers.right, numbers.left, true);
    let mut fighter = combat::fighter(Side::Foes, body, arms, numbers.weight, numbers.health, numbers.poise);
    fighter.aim = facing;
    fighter.might = numbers.might;
    (fighter, Brain::new(kind, facing))
}
