//! What an item is and where it is worn: the kinds of weapon, the shield, the four armour pieces and the cloak; the
//! slots a player wears them in; which hand a weapon takes; and which materials it is made and unmade with.

use serde::Deserialize;

/// What an item is. Each weapon kind is one type, its handling the combat rules' own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Dagger = 1,
    Sword = 2,
    Mace = 3,
    Flail = 4,
    Axe = 5,
    Warhammer = 6,
    Staff = 7,
    Bow = 8,
    Crossbow = 9,
    Pistolet = 10,
    Thunderlock = 11,
    Shield = 12,
    Head = 13,
    Torso = 14,
    Arms = 15,
    Legs = 16,
    Cloak = 17,
}

/// Where a player wears an item.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Slot {
    MainHand = 0,
    OffHand = 1,
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
    pub const ALL: [Self; 17] = [
        Self::Dagger,
        Self::Sword,
        Self::Mace,
        Self::Flail,
        Self::Axe,
        Self::Warhammer,
        Self::Staff,
        Self::Bow,
        Self::Crossbow,
        Self::Pistolet,
        Self::Thunderlock,
        Self::Shield,
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

    /// A weapon: it carries Attack.
    #[must_use]
    pub fn weapon(self) -> bool {
        (self as u8) <= Self::Thunderlock as u8
    }

    /// A weapon that shoots.
    #[must_use]
    pub fn ranged(self) -> bool {
        matches!(self, Self::Bow | Self::Crossbow | Self::Pistolet | Self::Thunderlock)
    }

    /// A weapon that takes both hands, so the off hand is emptied: combat's two-handed weapons, and a bow, a
    /// crossbow or a long gun.
    #[must_use]
    pub fn two_handed(self) -> bool {
        matches!(self, Self::Axe | Self::Warhammer | Self::Staff | Self::Bow | Self::Crossbow | Self::Thunderlock)
    }

    /// Armour that carries Defense and, from level 20, Prestige: head, torso, arms or legs.
    #[must_use]
    pub fn armour(self) -> bool {
        matches!(self, Self::Head | Self::Torso | Self::Arms | Self::Legs)
    }

    /// Whether it carries Defense: armour and a shield.
    #[must_use]
    pub fn defends(self) -> bool {
        self.armour() || self == Self::Shield
    }

    /// Whether it may be worn in a slot: any weapon in the main hand; a shield, or a blade or mace held in one hand,
    /// in the off hand; each armour piece and the cloak in its own.
    #[must_use]
    pub fn fits(self, slot: Slot) -> bool {
        match slot {
            Slot::MainHand => self.weapon(),
            Slot::OffHand => matches!(self, Self::Shield | Self::Dagger | Self::Sword | Self::Mace | Self::Flail),
            Slot::Head => self == Self::Head,
            Slot::Torso => self == Self::Torso,
            Slot::Arms => self == Self::Arms,
            Slot::Legs => self == Self::Legs,
            Slot::Cloak => self == Self::Cloak,
        }
    }

    /// The materials it is upgraded and dismantled with: a weapon's are Weapon Fragments and Weapon Essence; armour's,
    /// a shield's and a cloak's, Armor.
    #[must_use]
    pub fn stock(self) -> Stock {
        if self.weapon() { Stock::Weapon } else { Stock::Armor }
    }

    /// Its share of a full set's Defense: Destiny 1's raid armour at its most (helm 372, gauntlets 304, chest 406, legs
    /// 270) in those shares; a shield's on top of the four.
    #[must_use]
    pub fn defense_share(self) -> f64 {
        match self {
            Self::Head => 0.275,
            Self::Torso => 0.30,
            Self::Arms => 0.225,
            Self::Legs => 0.20,
            Self::Shield => 0.15,
            _ => 0.0,
        }
    }
}

impl Slot {
    pub const ALL: [Self; 7] =
        [Self::MainHand, Self::OffHand, Self::Head, Self::Torso, Self::Arms, Self::Legs, Self::Cloak];

    /// The slots a Vestige may hold an item for: every one but the cloak's.
    pub const VESTIGE: [Self; 6] = [Self::MainHand, Self::OffHand, Self::Head, Self::Torso, Self::Arms, Self::Legs];

    /// The slot a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|slot| *slot as u8 == number)
    }

    /// The kinds that fit it.
    pub fn kinds(self) -> impl Iterator<Item = Kind> {
        Kind::ALL.into_iter().filter(move |kind| kind.fits(self))
    }
}
