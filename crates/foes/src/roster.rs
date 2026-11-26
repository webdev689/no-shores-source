//! The fighters the rules drive, every faction's and the Brig's crew's: each a number the wire carries, its faction,
//! the name over its bar, where it is met (on land or on a deck), the role it fights in, the forge layers in its hands
//! (so the client dresses it alike), the ranks it comes in, what it changes of its role's numbers, and a Boss's own
//! phases. And a new foe of a type, at a rank.

use crate::brain::Brain;
use crate::factions::{CREW, GREY_TITHE, LATTICE, faction};
use crate::ranks::{CORVANE, Phase, Rank, SCRIVENER_PHASES, STEWARD_PHASES, THULE, phase, phases, ranked};
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
/// first its plainest), how many times a plain shooter's distance it stands off at, and the phases it fights in as a
/// Boss (none for a type that is never one).
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
    pub boss_phases: &'static [Phase],
}

const LOW: &[Rank] = &[Rank::Minor, Rank::Major];
const HEAVY: &[Rank] = &[Rank::Major, Rank::Elite];
const LEADER: &[Rank] = &[Rank::Elite, Rank::Miniboss];
/// The Tithe-Mate leads at sea as an Elite or a Miniboss, and boards the prologue's wreck as a Major, the story having
/// no Elite but its boss. Its Elite is first, so a Tithe-Mate asked for with no rank leads at sea.
const MATE: &[Rank] = &[Rank::Elite, Rank::Miniboss, Rank::Major];

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
    FoeType { number, faction, name, domain, role, right, left, ranks, standoff: 1.0, boss_phases: &[] }
}

/// An Elite Dungeon's Boss: a land Captain of the dungeon garrison's own faction, the Reeve's, at Boss rank, fighting
/// in the High Assessor's three phases under a name of its own.
const fn warden(number: u8, name: &'static str, right: &'static str, left: &'static str) -> FoeType {
    FoeType { boss_phases: &CORVANE, ..row(number, GREY_TITHE, Land, name, Captain, right, left, &[Rank::Boss]) }
}

/// The numbers of the types the rules name elsewhere: in a garrison, or called by a Boss.
pub const RUNNER: u8 = 1;
pub const COLLECTOR: u8 = 2;
pub const CROSSBOWMAN: u8 = 3;
pub const ENFORCER: u8 = 4;
pub const MARKSMAN: u8 = 5;
pub const REEVE: u8 = 6;
pub const DECKHAND: u8 = 7;
pub const HOOKMAN: u8 = 8;
pub const PISTOLEER: u8 = 9;
pub const BOSUN: u8 = 10;
pub const TITHE_MATE: u8 = 11;
pub const HIGH_ASSESSOR: u8 = 18;
/// The Lattice's types, numbered from 39 so they keep clear of the Bosses' 21 to 38, and the Grey Tithe's tithe-taker.
pub const HUSK: u8 = 39;
pub const FLICKER: u8 = 40;
pub const IDOL: u8 = 41;
pub const RAVAGER: u8 = 42;
pub const BULWARK: u8 = 43;
pub const HEART: u8 = 44;
pub const TITHE_TAKER: u8 = 45;
/// The Drowned Vale's own: a crystal bell (never moving or striking, the room keeps it), the Scrivener and the Steward.
pub const BELL: u8 = 46;
pub const SCRIVENER: u8 = 47;
pub const STEWARD: u8 = 48;
/// Every type. The marksman stands off half as far again as an archer; each Boss fights in its own phases. The Brig's
/// crew fight by a swordsman's and a skirmisher's numbers, as the boarders they fight do. Types 21 to 38 are the Elite
/// Dungeons' Bosses, one each, in `gear::activities`' order. The Lattice fight by their roles' numbers in arms of the
/// same reach; the Heart is a Boss with no phases of its own yet, the Scrivener and the Steward each have theirs.
pub const ROSTER: [FoeType; 48] = [
    row(RUNNER, GREY_TITHE, Land, "Runner", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(COLLECTOR, GREY_TITHE, Land, "Collector", Swordsman, "sword_iron", "shield_kite_iron", LOW),
    row(CROSSBOWMAN, GREY_TITHE, Land, "Crossbowman", Archer, "crossbow_iron", "", LOW),
    row(ENFORCER, GREY_TITHE, Land, "Enforcer", Brute, "warhammer_iron", "", HEAVY),
    FoeType { standoff: 1.5, ..row(MARKSMAN, GREY_TITHE, Land, "Marksman", Archer, "thunderlock", "", &[Rank::Elite]) },
    row(REEVE, GREY_TITHE, Land, "Reeve", Captain, "mace_iron", "shield_kite_iron", LEADER),
    row(DECKHAND, GREY_TITHE, Deck, "Deckhand", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(HOOKMAN, GREY_TITHE, Deck, "Hookman", Swordsman, "axe_iron", "", LOW),
    row(PISTOLEER, GREY_TITHE, Deck, "Pistoleer", Archer, "pistolet", "", LOW),
    row(BOSUN, GREY_TITHE, Deck, "Bosun", Brute, "warhammer_iron", "", HEAVY),
    row(TITHE_MATE, GREY_TITHE, Deck, "Tithe-Mate", Captain, "sword_steel", "", MATE),
    FoeType {
        boss_phases: &THULE,
        ..row(12, GREY_TITHE, Deck, "Captain Brannoc Thule", Captain, "sword_ebony", "", &[Rank::Boss])
    },
    row(13, CREW, Deck, "Skirmisher", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(14, CREW, Deck, "Swordsman", Swordsman, "sword_steel", "shield_kite_steel", LOW),
    row(15, CREW, Deck, "Brute", Brute, "warhammer_iron", "", HEAVY),
    row(16, CREW, Deck, "Archer", Archer, "bow_short_iron", "", LOW),
    row(17, CREW, Deck, "Captain", Captain, "sword_ebony", "", LEADER),
    FoeType {
        boss_phases: &CORVANE,
        ..row(
            HIGH_ASSESSOR,
            GREY_TITHE,
            Land,
            "High Assessor Corvane",
            Captain,
            "flail_iron",
            "shield_kite_iron",
            &[Rank::Boss],
        )
    },
    row(19, CREW, Deck, "Crew", Swordsman, "sword_iron", "", LOW),
    row(20, CREW, Deck, "Crew", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    warden(21, "Wreck-Reeve Oswin Tarr", "sword_steel", ""),
    warden(22, "Pearl-Keeper Isolde Varne", "mace_iron", "shield_kite_iron"),
    warden(23, "Forgemaster Garrick Soot", "warhammer_iron", ""),
    warden(24, "Tithe-Warden Mabry Hollis", "mace_iron", "shield_kite_iron"),
    warden(25, "Wrecker Dunstan Black", "axe_iron", ""),
    warden(26, "Sister-Assessor Aldith", "flail_iron", "shield_kite_iron"),
    warden(27, "Cistern-Steward Corwin Vey", "sword_steel", "shield_kite_steel"),
    warden(28, "Vaultwarden Hesk Amaro", "warhammer_iron", ""),
    warden(29, "Gaoler Renna Crake", "sword_iron", "shield_kite_iron"),
    warden(30, "Barrow-Reeve Tobin Silt", "mace_iron", ""),
    warden(31, "Treasurer Lucan Deeps", "sword_ebony", ""),
    warden(32, "Factor Odile Coralle", "flail_iron", ""),
    warden(33, "Lord-Assessor Edric Barrow", "sword_ebony", "shield_kite_steel"),
    warden(34, "Digmaster Ulf Hargreave", "axe_iron", ""),
    warden(35, "Bog-Reeve Hester Mire", "mace_iron", "shield_kite_iron"),
    warden(36, "Sluice-Warden Abel Rook", "sword_steel", ""),
    warden(37, "Abbess Ylva Frost", "flail_iron", "shield_kite_steel"),
    warden(38, "Catacomb-Reeve Silas Brine", "warhammer_iron", ""),
    row(HUSK, LATTICE, Land, "Husk", Swordsman, "sword_iron", "", LOW),
    row(FLICKER, LATTICE, Land, "Flicker", Skirmisher, "dagger_iron", "dagger_iron_l", LOW),
    row(IDOL, LATTICE, Land, "Idol", Archer, "bow_short_iron", "", HEAVY),
    row(RAVAGER, LATTICE, Land, "Ravager", Brute, "warhammer_iron", "", HEAVY),
    row(BULWARK, LATTICE, Land, "Bulwark", Brute, "mace_iron", "shield_kite_iron", LEADER),
    row(HEART, LATTICE, Land, "Heart", Captain, "flail_iron", "", &[Rank::Boss]),
    row(TITHE_TAKER, GREY_TITHE, Land, "Tithe-Taker", Captain, "mace_iron", "", &[Rank::Elite]),
    row(BELL, LATTICE, Land, "Bell", Brute, "", "", &[Rank::Minor]),
    FoeType {
        standoff: 1.5,
        boss_phases: &SCRIVENER_PHASES,
        ..row(SCRIVENER, LATTICE, Land, "The Scrivener", Archer, "bow_short_iron", "", &[Rank::Boss])
    },
    FoeType {
        boss_phases: &STEWARD_PHASES,
        ..row(STEWARD, LATTICE, Land, "The Steward", Captain, "flail_iron", "", &[Rank::Boss])
    },
];

/// The type a number names, or none.
#[must_use]
pub fn foe_type(number: u8) -> Option<&'static FoeType> {
    ROSTER.iter().find(|foe_type| foe_type.number == number)
}

/// A faction's first type in a role, or none.
#[must_use]
pub fn in_role(faction: u8, role: Role) -> Option<&'static FoeType> {
    ROSTER.iter().find(|foe_type| foe_type.faction == faction && foe_type.role == role)
}

impl FoeType {
    /// The rank asked for if the type comes in it, else its first.
    #[must_use]
    pub fn rank_or_first(&self, rank: Option<Rank>) -> Rank {
        rank.filter(|rank| self.ranks.contains(rank)).or_else(|| self.ranks.first().copied()).unwrap_or(Rank::Major)
    }

    /// The side it fights on: its faction's, or the players' for the crew.
    #[must_use]
    pub fn side(&self) -> Side {
        faction(self.faction).map_or(Side::from_number(self.faction), |faction| faction.side())
    }

    /// Its numbers as a Major: its role's, in its hands, with its own changes. A brute that bears a shield (the
    /// Bulwark) raises it as a swordsman does, where its role never guards.
    #[must_use]
    pub fn base(&self) -> Numbers {
        let role = numbers(self.role);
        let shielded = role.block == 0.0 && self.left.starts_with("shield");
        let block = if shielded { numbers(Swordsman).block } else { role.block };
        Numbers { right: self.right, left: self.left, standoff: self.standoff, block, ..role }
    }

    /// Its numbers at a rank, in phase `phase_number` (1 and up).
    #[must_use]
    pub fn numbers(&self, rank: Rank, phase_number: u8) -> Numbers {
        ranked(&self.base(), rank, self.boss_phases, phase_number)
    }

    /// The phases it fights in at a rank, the first at full health.
    #[must_use]
    pub fn phases(&self, rank: Rank) -> &'static [Phase] {
        phases(self.boss_phases, rank)
    }

    /// Its phase `number` (1 and up) at a rank; past its last, its last.
    #[must_use]
    pub fn phase(&self, rank: Rank, number: u8) -> Phase {
        phase(self.boss_phases, rank, number)
    }
}

/// A new foe of a type at a rank (its first, if it does not come in that one) standing at (x, y) facing `facing`: its
/// fighter (its type's side, its type's arms, weight, health, poise and might at that rank, an ally on the players'
/// side) and its brain.
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
    fighter.ally = fighter.side.is_players();
    (fighter, Brain::new(foe_type, rank, facing))
}

/// A foe's numbers as it stands now: its type's at its rank and phase, but a Bulwark that has changed (its second
/// phase, or at half its health, as the page draws its shield dropped for its maul) blocks no more.
#[must_use]
pub fn standing(brain: &Brain, fighter: &Fighter) -> Numbers {
    let numbers = brain.numbers();
    let changed = brain.tells.phase >= 2 || fighter.health <= fighter.health_max / 2.0;
    if brain.foe_type.number == BULWARK && changed { Numbers { block: 0.0, ..numbers } } else { numbers }
}
