//! How far a character is through the story, kept with the account so every room can see it: the prologue's end. The
//! houses' roads keep their own place (`crate::quests`).

use crate::asks::{Done, Refusal};
use crate::character::Character;
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

impl Character {
    /// Marks the prologue played; the lore found as it ends is kept as every ask ends (`earn_due`). Asked again, it is
    /// not refused: a page tells each room that has not kept it.
    pub(crate) fn finish_prologue(&mut self) -> Result<Option<Done>, Refusal> {
        self.story.prologue = true;
        Ok(None)
    }
}
