//! The five rarities, lowest first, and what each sets of an item: how near its level's most its power reaches, and
//! how much XP each of its columns of nodes waits on.

use serde::{Deserialize, Serialize};

/// How rare an item is: Normal (white), Magic (green), Rare (yellow), Legendary (red) or Atheric (cyan blue).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Rarity {
    Normal = 0,
    Magic = 1,
    Rare = 2,
    Legendary = 3,
    Atheric = 4,
}

impl Rarity {
    pub const ALL: [Self; 5] = [Self::Normal, Self::Magic, Self::Rare, Self::Legendary, Self::Atheric];

    /// The rarity a number names (0 to 4), or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|rarity| *rarity as u8 == number)
    }

    /// The share of its level's most an item of this rarity reaches fully upgraded: a lesser item stays under a
    /// Legendary of the same level, as Destiny 1's did.
    #[must_use]
    pub fn share(self) -> f64 {
        match self {
            Self::Normal => 0.80,
            Self::Magic => 0.88,
            Self::Rare => 0.94,
            Self::Legendary | Self::Atheric => 1.0,
        }
    }

    /// The XP each column of its nodes waits on: the second column unlocks at twice this, and so on.
    #[must_use]
    pub fn column_xp(self) -> u32 {
        match self {
            Self::Normal => 1_000,
            Self::Magic => 1_500,
            Self::Rare => 3_000,
            Self::Legendary => 10_000,
            Self::Atheric => 15_000,
        }
    }
}
