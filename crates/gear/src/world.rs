//! How strong the world is where a player stands: each island's band of foe levels, rising from Overlook's island to
//! the ninth, and the difficulty a voyage sets out at, which raises its foes and what they pay. A player's level runs
//! 1 to 30, so the bands climb with them as Destiny 1's worlds did, Earth to Mars.

use serde::{Deserialize, Serialize};

/// Each island by its continent's id, and the lowest and highest level of its foes.
pub const ISLANDS: [(&str, u8, u8); 9] = [
    ("continent-1", 1, 4),
    ("continent-2", 4, 7),
    ("continent-3", 7, 10),
    ("continent-4", 10, 13),
    ("continent-5", 13, 16),
    ("continent-6", 16, 19),
    ("continent-7", 19, 22),
    ("continent-8", 22, 26),
    ("continent-9", 26, 30),
];

/// The highest a foe's level goes, difficulty and all: two above the highest player, as Destiny 1's hardest raid
/// stood two above its players.
pub const FOE_LEVEL_MOST: u8 = 32;

/// An island's band of foe levels; none for a continent with no band.
#[must_use]
pub fn island_levels(continent: &str) -> Option<(u8, u8)> {
    ISLANDS.iter().find(|(id, ..)| *id == continent).map(|&(_, low, high)| (low, high))
}

/// The difficulty a voyage sets out at: Normal, Elite or Abyss. Elite here is a voyage's tier, not a foe's rank.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    #[default]
    Normal,
    Elite,
    Abyss,
}

impl Difficulty {
    pub const ALL: [Difficulty; 3] = [Difficulty::Normal, Difficulty::Elite, Difficulty::Abyss];

    /// A difficulty by its name, as a room's name carries it.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|difficulty| difficulty.name() == name)
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Difficulty::Normal => "normal",
            Difficulty::Elite => "elite",
            Difficulty::Abyss => "abyss",
        }
    }

    /// The levels it adds to every foe: at most three, so a player at the top of an island's band still strikes the
    /// foes at its top, four levels being the gap that makes a foe immune.
    #[must_use]
    pub fn levels(self) -> u8 {
        match self {
            Difficulty::Normal => 0,
            Difficulty::Elite => 2,
            Difficulty::Abyss => 3,
        }
    }

    /// What it multiplies a kill's XP, Aurem and chance of a Vestige by.
    #[must_use]
    pub fn reward(self) -> f64 {
        match self {
            Difficulty::Normal => 1.0,
            Difficulty::Elite => 1.5,
            Difficulty::Abyss => 2.0,
        }
    }

    /// A foe level at this difficulty: the level it would have, raised, and never past the highest.
    #[must_use]
    pub fn raise(self, level: u8) -> u8 {
        level.saturating_add(self.levels()).min(FOE_LEVEL_MOST)
    }
}
