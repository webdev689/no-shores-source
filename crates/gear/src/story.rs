//! How far a character is through the story, kept with the account so every room can see it: the prologue's end now,
//! and each mission and side quest as they come.

use serde::{Deserialize, Serialize};

/// A character's progress through the story.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Story {
    /// Whether they have finished the prologue.
    pub prologue: bool,
}

impl Story {
    /// One kept before the story was: past the prologue, so no one who played before it is shut out of the patrols.
    #[must_use]
    pub fn kept_before() -> Self {
        Self { prologue: true }
    }
}
