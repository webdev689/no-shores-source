//! What an item is and where it is worn: the Melee and Ranged loadouts, the four armour pieces and the cloak; the slot
//! each is worn in; which hold a shield or leave a hand free; and which materials it is made and unmade with.

use serde::{Deserialize, Serialize};

/// What an item is: a Melee or a Ranged loadout, each one item however many hands it fills, an armour piece or the
/// cloak. The numbers are the wire's; a kind kept from before the loadouts keeps its number where it lives on as one
/// (a lone dagger became Double Daggers, an axe a Great axe), so what others were shown still reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    DoubleDaggers = 1,
    Sword = 2,
    Mace = 3,
    Flail = 4,
    GreatAxe = 5,
    Warhammer = 6,
    Staff = 7,
    Bow = 8,
    Crossbow = 9,
    Pistolet = 10,
    Thunderlock = 11,
    SwordAndShield = 12,
    Head = 13,
    Torso = 14,
    Arms = 15,
    Legs = 16,
    Cloak = 17,
    DaggerAndShield = 18,
    DoubleSwords = 19,
    DoubleMace = 20,
    MaceAndShield = 21,
    Greatsword = 22,
    DoublePistolet = 23,
}

/// Where a player wears an item: a loadout, an armour piece or the cloak.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Slot {
    Melee = 0,
    Ranged = 1,
    Head = 2,
    Torso = 3,
    Arms = 4,
    Legs = 5,
    Cloak = 6,
}

/// Which pair of materials an item is upgraded and dismantled with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stock {
    Weapon,
    Armor,
}

impl Kind {
    /// Every kind: the Melee loadouts, the Ranged, the armour and the cloak.
    pub const ALL: [Self; 23] = [
        Self::SwordAndShield,
        Self::DaggerAndShield,
        Self::DoubleDaggers,
        Self::Sword,
        Self::DoubleSwords,
        Self::Staff,
        Self::Mace,
        Self::DoubleMace,
        Self::MaceAndShield,
        Self::GreatAxe,
        Self::Greatsword,
        Self::Flail,
        Self::Warhammer,
        Self::Bow,
        Self::Crossbow,
        Self::Pistolet,
        Self::DoublePistolet,
        Self::Thunderlock,
        Self::Head,
        Self::Torso,
        Self::Arms,
        Self::Legs,
        Self::Cloak,
    ];

    /// The kind a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| *kind as u8 == number)
    }

    /// A weapon: a loadout, which carries Attack.
    #[must_use]
    pub fn weapon(self) -> bool {
        !matches!(self, Self::Head | Self::Torso | Self::Arms | Self::Legs | Self::Cloak)
    }

    /// A Ranged loadout: a weapon that shoots.
    #[must_use]
    pub fn ranged(self) -> bool {
        matches!(self, Self::Bow | Self::Crossbow | Self::Pistolet | Self::DoublePistolet | Self::Thunderlock)
    }

    /// A loadout held with a shield, which blocks.
    #[must_use]
    pub fn shielded(self) -> bool {
        matches!(self, Self::SwordAndShield | Self::DaggerAndShield | Self::MaceAndShield)
    }

    /// A loadout that leaves the left hand free, for a torch: a sword, a mace, a flail or a pistolet held alone.
    #[must_use]
    pub fn left_hand_free(self) -> bool {
        matches!(self, Self::Sword | Self::Mace | Self::Flail | Self::Pistolet)
    }

    /// Armour that carries Defense and, from level 20, Prestige: head, torso, arms or legs.
    #[must_use]
    pub fn armour(self) -> bool {
        matches!(self, Self::Head | Self::Torso | Self::Arms | Self::Legs)
    }

    /// The one slot it is worn in: its loadout's, or its own.
    #[must_use]
    pub fn slot(self) -> Slot {
        match self {
            Self::Head => Slot::Head,
            Self::Torso => Slot::Torso,
            Self::Arms => Slot::Arms,
            Self::Legs => Slot::Legs,
            Self::Cloak => Slot::Cloak,
            ranged if ranged.ranged() => Slot::Ranged,
            _ => Slot::Melee,
        }
    }

    /// Whether it may be worn in a slot: its own alone.
    #[must_use]
    pub fn fits(self, slot: Slot) -> bool {
        self.slot() == slot
    }

    /// The materials it is upgraded and dismantled with: a weapon's are Weapon Fragments and Weapon Essence; armour's
    /// and a cloak's, Armor.
    #[must_use]
    pub fn stock(self) -> Stock {
        if self.weapon() { Stock::Weapon } else { Stock::Armor }
    }

    /// Its share of a full set's Defense: Destiny 1's raid armour at its most (helm 372, gauntlets 304, chest 406, legs
    /// 270) in those shares, each with an even part of the 0.15 a shield carried before the loadouts.
    #[must_use]
    pub fn defense_share(self) -> f64 {
        match self {
            Self::Head => 0.3125,
            Self::Torso => 0.3375,
            Self::Arms => 0.2625,
            Self::Legs => 0.2375,
            _ => 0.0,
        }
    }
}

impl Slot {
    pub const ALL: [Self; 7] =
        [Self::Melee, Self::Ranged, Self::Head, Self::Torso, Self::Arms, Self::Legs, Self::Cloak];

    /// The slots a Vestige may hold an item for: every one but the cloak's.
    pub const VESTIGE: [Self; 6] = [Self::Melee, Self::Ranged, Self::Head, Self::Torso, Self::Arms, Self::Legs];

    /// The slot a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|slot| *slot as u8 == number)
    }

    /// The kinds that fit it.
    pub fn kinds(self) -> impl Iterator<Item = Kind> {
        Kind::ALL.into_iter().filter(move |kind| kind.fits(self))
    }

    /// A loadout's slot, Melee or Ranged.
    #[must_use]
    pub fn loadout(self) -> bool {
        matches!(self, Self::Melee | Self::Ranged)
    }
}
