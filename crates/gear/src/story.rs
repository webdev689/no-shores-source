//! How far a character is through the story, kept with the account so every room can see it: the prologue's end. The
//! houses' roads keep their own place (`crate::quests`). The prologue lends its own items and the Storm, which its end
//! takes back, and dresses the player in plain clothes in their place.

use crate::arts::STORM;
use crate::asks::{Done, Refusal};
use crate::character::Character;
use crate::{At, Item, Kind, Rarity};
use serde::{Deserialize, Serialize};

/// A character's progress through the story.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Story {
    /// Whether they have finished the prologue.
    pub prologue: bool,
    /// What a later build kept here, kept as it was through a rollback.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

impl Story {
    /// One kept before the story was: past the prologue, so no one who played before it is shut out of the patrols.
    #[must_use]
    pub fn kept_before() -> Self {
        Self { prologue: true, ..Self::default() }
    }

    /// Every step either story has taken: the story only moves forward, whichever side heard of a step first.
    #[must_use]
    pub fn merged(self, other: &Self) -> Self {
        Self { prologue: self.prologue || other.prologue, ..self }
    }
}

/// The prologue's own item of `kind`, numbered `id`: Normal, of level 1, worn in its kind's slot and marked the story's.
#[must_use]
pub fn story_item(id: u32, kind: Kind) -> Item {
    Item { story: true, ..Item::new(id, kind, Rarity::Normal, 1, kind.slot()) }
}

/// The plain clothes the prologue's end dresses a player in, by kind: a shirt, and breeches and boots.
pub const PLAIN_CLOTHES: [Kind; 2] = [Kind::Torso, Kind::Legs];

/// Plain clothes of `kind`, numbered `id`: Normal, worn in its kind's slot, with no stats and no nodes.
#[must_use]
pub fn plain_item(id: u32, kind: Kind) -> Item {
    Item { plain: true, ..Item::new(id, kind, Rarity::Normal, 1, kind.slot()) }
}

impl Character {
    /// Marks the prologue played, taking back what it lent: every story item wherever it lies, and the Storm, unearned
    /// and unworn; and dresses the player in plain clothes wherever their torso and legs are bare. One that finished
    /// it before keeps what it has. The lore found as it ends is kept as every ask ends (`earn_due`). Asked again, it
    /// is not refused: a page tells each room that has not kept it.
    pub(crate) fn finish_prologue(&mut self) -> Result<Option<Done>, Refusal> {
        if !self.story.prologue {
            self.items.retain(|_, (item, _)| !item.story);
            for kind in PLAIN_CLOTHES {
                if self.worn(kind.slot()).is_none() {
                    let id = self.take_id();
                    self.items.insert(id, (plain_item(id, kind), At::Worn(kind.slot())));
                }
            }
            if let Some(bits) = self.arts.earned.as_mut().and_then(|earned| earned.get_mut(usize::from(STORM) - 1)) {
                *bits = 0;
            }
            if self.arts.worn == STORM {
                self.arts.worn = 0;
            }
            // Nothing it grew in the prologue stays with it: its level, its XP and its Core as a new player's.
            let at = usize::from(STORM) - 1;
            if let Some(level) = self.arts.levels.get_mut(at) {
                *level = 1;
            }
            if let Some(xp) = self.arts.xp.get_mut(at) {
                *xp = 0;
            }
            if let Some(core) = self.arts.cores.get_mut(at) {
                *core = Default::default();
            }
        }
        self.story.prologue = true;
        Ok(None)
    }
}

#[cfg(test)]
#[path = "story_tests.rs"]
mod story_tests;
