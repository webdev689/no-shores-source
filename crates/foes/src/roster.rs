//! The enemy types, every faction's: each a number the wire carries, its faction, the name over its bar, where it is
//! met (on land or on a deck), the role it fights in, the forge layers in its hands (so the client dresses it alike),
//! the ranks it comes in, and what it changes of its role's numbers. And a new foe of a type, at a rank.

use crate::brain::Brain;
use crate::factions::{GREY_TITHE, PIRATES, faction};
use crate::ranks::{Rank, ranked};
use crate::roles::{Numbers, Role, numbers};
use Domain::{Deck, Land};
use Role::{Archer, Brute, Captain, Skirmisher, Swordsman};
use combat::fighter::Side;
use combat::{Fighter, arms_of};

/// Where a type is met: on land, or on a ship's deck.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Domain {
    Land,
    Deck,
}

impl Domain {
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Domain::Land => "land",
            Domain::Deck => "deck",
        }
    }
}

/// An enemy type: its number, faction, name, domain, role, right and left forge layers, the ranks it comes in (the
/// first its plainest), what its role's health and poise are multiplied by, and how many times a plain shooter's
/// distance it stands off at.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FoeType {
    pub number: u8,
    pub faction: u8,
    pub name: &'static str,
    pub domain: Domain,
    pub role: Role,
    pub right: &'static str,
    pub left: &'static str,
    pub ranks: &'static [Rank],
    pub standoff: f64,
}

const LOW: &[Rank] = &[Rank::Minor, Rank::Major];
const HEAVY: &[Rank] = &[Rank::Major, Rank::Elite];
const LEADER: &[Rank] = &[Rank::Elite, Rank::Miniboss];

#[expect(clippy::too_many_arguments, reason = "one row of the roster's table")]
const fn row(
    number: u8,
    faction: u8,
    domain: Domain,
    name: &'static str,
    role: Role,
    right: &'static str,
    left: &'static str,
    ranks: &'static [Rank],
) -> FoeType {
    FoeType { number, faction, name, domain, role, right, left, ranks, standoff: 1.0 }
}

/// Every type. The marksman stands off half as far again as an archer.
pub const ROSTER: [FoeType; 17] = [
    row(1, GREY_TITHE, Land, "Runner", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(2, GREY_TITHE, Land, "Collector", Swordsman, "sword_iron", "shield_kite_iron", LOW),
    row(3, GREY_TITHE, Land, "Crossbowman", Archer, "crossbow_iron", "", LOW),
    row(4, GREY_TITHE, Land, "Enforcer", Brute, "warhammer_iron", "", HEAVY),
    FoeType { standoff: 1.5, ..row(5, GREY_TITHE, Land, "Marksman", Archer, "thunderlock", "", &[Rank::Elite]) },
    row(6, GREY_TITHE, Land, "Reeve", Captain, "mace_iron", "shield_kite_iron", LEADER),
    row(7, GREY_TITHE, Deck, "Deckhand", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(8, GREY_TITHE, Deck, "Hookman", Swordsman, "axe_iron", "", LOW),
    row(9, GREY_TITHE, Deck, "Pistoleer", Archer, "pistolet", "", LOW),
    row(10, GREY_TITHE, Deck, "Bosun", Brute, "warhammer_iron", "", HEAVY),
    row(11, GREY_TITHE, Deck, "Tithe-Mate", Captain, "sword_steel", "", LEADER),
    row(12, GREY_TITHE, Deck, "Captain Brannoc Thule", Captain, "sword_ebony", "", &[Rank::Boss]),
    row(13, PIRATES, Deck, "Skirmisher", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(14, PIRATES, Deck, "Swordsman", Swordsman, "sword_steel", "shield_kite_steel", LOW),
    row(15, PIRATES, Deck, "Brute", Brute, "warhammer_iron", "", HEAVY),
    row(16, PIRATES, Deck, "Archer", Archer, "bow_short_iron", "", LOW),
    row(17, PIRATES, Deck, "Captain", Captain, "sword_ebony", "", LEADER),
];

/// The type the Boss calls to its side in its last stand.
pub const CREW: u8 = 7;

/// The type a number names, or none.
#[must_use]
pub fn foe_type(number: u8) -> Option<&'static FoeType> {
    ROSTER.iter().find(|foe_type| foe_type.number == number)
}

impl FoeType {
    /// The rank asked for if the type comes in it, else its first.
    #[must_use]
    pub fn rank_or_first(&self, rank: Option<Rank>) -> Rank {
        rank.filter(|rank| self.ranks.contains(rank)).or_else(|| self.ranks.first().copied()).unwrap_or(Rank::Major)
    }

    /// The side its foes fight on: its faction's.
    #[must_use]
    pub fn side(&self) -> Side {
        faction(self.faction).map_or(Side::Faction(self.faction), |faction| faction.side())
    }

    /// Its numbers as a Major: its role's, in its hands, with its own changes.
    #[must_use]
    pub fn base(&self) -> Numbers {
        let role = numbers(self.role);
        Numbers { right: self.right, left: self.left, standoff: self.standoff, ..role }
    }

    /// Its numbers at a rank, in phase `phase_number` (1 and up).
    #[must_use]
    pub fn numbers(&self, rank: Rank, phase_number: u8) -> Numbers {
        ranked(&self.base(), rank, phase_number)
    }
}

/// A new foe of a type at a rank (its first, if it does not come in that one) standing at (x, y) facing `facing`: its
/// fighter (its faction's side, its type's arms, weight, health, poise and might at that rank) and its brain.
#[must_use]
pub fn spawn(foe_type: &'static FoeType, rank: Rank, x: f64, y: f64, facing: f64) -> (Fighter, Brain) {
    let rank = foe_type.rank_or_first(Some(rank));
    let numbers = foe_type.numbers(rank, 1);
    let mut body = movement::standing(x, y);
    body.facing = facing;
    let arms = arms_of(numbers.right, numbers.left, true);
    let mut fighter = combat::fighter(foe_type.side(), body, arms, numbers.weight, numbers.health, numbers.poise);
    fighter.aim = facing;
    fighter.might = numbers.might;
    (fighter, Brain::new(foe_type, rank, facing))
}
