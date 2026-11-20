//! One named officer: the post they were trained to, their grade (Able, Seasoned or Veteran, as a module's Magic, Rare
//! or Legendary), their name, experience and nodes, and their duty: aboard, holding their post, or ashore beside the
//! player. Their grid is armour's of their grade's rarity (`grid.rs`): perk columns to choose among and upgrades that
//! carry them past level 20, as Prestige carries a player.

use crate::grid::{Column, column_xp, columns, node_offsets};
use crate::item::NONE_CHOSEN;
use crate::power;
use crate::rarity::Rarity;
use serde::{Deserialize, Serialize};

/// The posts aboard, each changing how she plays. The numbers are the wire's.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Post {
    /// Keeps her men's nerve and leads the boarders.
    FirstMate = 0,
    /// Fires the broadside the player is not laying, when it bears and is loaded.
    Gunner = 1,
    /// Trims her sails: she keeps more way turning and with torn canvas.
    Bosun = 2,
    /// Patches her hull in a fight, giving back part of what each ball took once it has struck.
    Carpenter = 3,
    /// Sights ships farther off and reads their level as they come into sight.
    Lookout = 4,
}

impl Post {
    pub const ALL: [Self; 5] = [Self::FirstMate, Self::Gunner, Self::Bosun, Self::Carpenter, Self::Lookout];

    /// The post a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|post| *post as u8 == number)
    }

    /// The key its traits fit by in the catalogue.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Self::FirstMate => "first_mate",
            Self::Gunner => "gunner",
            Self::Bosun => "bosun",
            Self::Carpenter => "carpenter",
            Self::Lookout => "lookout",
        }
    }
}

/// Where an officer is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Duty {
    /// Aboard with no post: they earn at sea, and change nothing.
    Aboard,
    /// Holding their post aboard.
    Posted,
    /// Ashore at the player's side.
    Ashore,
}

/// The grades an officer comes in, lowest first, as the rarity their grid is laid out by.
pub const GRADES: [Rarity; 3] = [Rarity::Magic, Rarity::Rare, Rarity::Legendary];

/// One officer.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Officer {
    pub id: u32,
    pub post: Post,
    pub grade: Rarity,
    /// Their given and family names, by their places in `content/gear/crew.json`.
    pub given: u8,
    pub family: u8,
    /// Their experience, which raises their level to 20.
    pub xp: u32,
    /// The experience earned in the player's service, which opens their grid's columns as an item's XP does.
    pub trained: u32,
    /// The traits each perk column offers, in order.
    pub layout: Vec<Vec<String>>,
    pub bought: u32,
    pub chosen: Vec<u8>,
    pub duty: Duty,
}

impl Officer {
    /// A new officer of a post and grade, at the experience of `level`, with nothing bought.
    #[must_use]
    pub fn new(id: u32, post: Post, grade: Rarity, level: u8) -> Self {
        let grade = if GRADES.contains(&grade) { grade } else { Rarity::Magic };
        let xp = u32::try_from(power::xp_for_level(level)).unwrap_or(u32::MAX);
        let chosen = vec![NONE_CHOSEN; columns(grade, false).len()];
        let duty = Duty::Aboard;
        Self { id, post, grade, given: 0, family: 0, xp, trained: 0, layout: Vec::new(), bought: 0, chosen, duty }
    }

    /// The officer as a kept character should hold them: their number its key's, a grade one comes in, their
    /// choices naming only nodes bought.
    #[must_use]
    pub fn kept(mut self, id: u32) -> Self {
        self.id = id;
        if !GRADES.contains(&self.grade) {
            self.grade = Rarity::Magic;
        }
        self.xp = self.xp.min(u32::try_from(power::xp_for_level(power::XP_LEVEL_MOST)).unwrap_or(u32::MAX));
        self.trained = self.trained.min(self.trained_most());
        let (_, nodes) = node_offsets(self.columns());
        self.bought &= (1_u32 << nodes) - 1;
        self.chosen.resize(self.columns().len(), NONE_CHOSEN);
        for column in 0..self.columns().len() {
            let node = self.chosen[column];
            if node != NONE_CHOSEN && !self.has(column, node) {
                self.chosen[column] = NONE_CHOSEN;
            }
        }
        self
    }

    /// Their grid's columns: armour's of their grade.
    #[must_use]
    pub fn columns(&self) -> &'static [Column] {
        columns(self.grade, false)
    }

    /// Whether the experience earned in service has reached a column.
    #[must_use]
    pub fn unlocked(&self, column: usize) -> bool {
        column < self.columns().len() && self.trained >= column_xp(self.grade, column)
    }

    /// The service that opens their last column; they train no further.
    #[must_use]
    pub fn trained_most(&self) -> u32 {
        self.columns().len().checked_sub(1).map_or(0, |last| column_xp(self.grade, last))
    }

    /// The bit a node keeps in `bought`, if the column holds it.
    #[must_use]
    pub fn node_bit(&self, column: usize, node: u8) -> Option<u32> {
        let layout = self.columns();
        let kind = layout.get(column)?;
        (node < kind.nodes()).then(|| 1 << (node_offsets(layout).0[column] + node))
    }

    #[must_use]
    pub fn has(&self, column: usize, node: u8) -> bool {
        self.node_bit(column, node).is_some_and(|bit| self.bought & bit != 0)
    }

    /// The traits a column offers: none for an upgrade.
    #[must_use]
    pub fn traits_of(&self, column: usize) -> &[String] {
        let layout = self.columns();
        if !layout.get(column).is_some_and(|kind| kind.traits()) {
            return &[];
        }
        let place = layout[..column].iter().filter(|kind| kind.traits()).count();
        self.layout.get(place).map_or(&[], Vec::as_slice)
    }

    /// The traits they give: the one chosen in each perk column, if bought.
    pub fn active_traits(&self) -> impl Iterator<Item = &str> {
        self.chosen.iter().enumerate().filter_map(move |(column, &node)| {
            (node != NONE_CHOSEN && self.has(column, node))
                .then(|| self.traits_of(column).get(usize::from(node)).map(String::as_str))
                .flatten()
        })
    }

    /// Adds experience, a sixth more with Old Salt: to their level's, up to level 20's, and to their service, up to
    /// their last column's.
    pub fn earn(&mut self, xp: u32) {
        let xp = if self.active_traits().any(|id| id == "old_salt") { xp.saturating_add(xp / 6) } else { xp };
        let most = u32::try_from(power::xp_for_level(power::XP_LEVEL_MOST)).unwrap_or(u32::MAX);
        self.xp = self.xp.saturating_add(xp).min(most);
        self.trained = self.trained.saturating_add(xp).min(self.trained_most());
    }

    /// The upgrades bought.
    #[must_use]
    pub fn upgrades(&self) -> u8 {
        let upgrades = self.columns().iter().enumerate().filter(|(_, column)| **column == Column::Upgrade);
        upgrades.filter(|(index, _)| self.has(*index, 0)).count() as u8
    }

    /// Their level: their experience's to 20; then each upgrade bought carries them further, one level for an Able
    /// officer's, two for a Seasoned's, three for a Veteran's, up to 29.
    #[must_use]
    pub fn level(&self) -> u8 {
        let by_xp = power::xp_level(u64::from(self.xp));
        if by_xp < power::XP_LEVEL_MOST {
            return by_xp;
        }
        let each = match self.grade {
            Rarity::Legendary => 3,
            Rarity::Rare => 2,
            _ => 1,
        };
        by_xp + each * self.upgrades()
    }

    /// How well they hold their post, 0.5 at level 1 rising evenly to 1 at level 29: what their post's own work is
    /// times.
    #[must_use]
    pub fn strength(&self) -> f64 {
        0.5 + 0.5 * f64::from(self.level().saturating_sub(1)) / 28.0
    }
}
