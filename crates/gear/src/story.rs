//! How far a character is through the story, kept with the account so every room can see it: the prologue's end now,
//! and each mission and side quest as they come.

use crate::asks::{Done, Refusal};
use crate::character::Character;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// A character's progress through the story.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Story {
    /// Whether they have finished the prologue.
    pub prologue: bool,
    /// Each side quest taken up and not finished, by its id, with its count so far.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub quests: BTreeMap<String, u32>,
    /// The side quests finished, by id.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub finished: BTreeSet<String>,
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

    /// Every step either story has taken: the story only moves forward, whichever side heard of a step first. Its side
    /// quests are this story's, since only a kept character takes one up.
    #[must_use]
    pub fn merged(self, other: &Self) -> Self {
        Self { prologue: self.prologue || other.prologue, ..self }
    }
}

impl Character {
    /// Marks the prologue played. Asked again, it is not refused: a page tells each room that has not kept it.
    pub(crate) fn finish_prologue(&mut self) -> Result<Option<Done>, Refusal> {
        self.story.prologue = true;
        Ok(None)
    }
}
