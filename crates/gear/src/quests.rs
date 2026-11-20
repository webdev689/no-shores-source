//! The side quests, written with the story's missions as data (`content/gear/quests.json`): each counts one
//! objective (`crate::objectives`), is kept with the character until finished, and pays its XP and Aurem once.

use crate::character::Character;
use crate::objectives::Objective;
use serde::Deserialize;
use std::sync::OnceLock;

/// A side quest: its id, its words, what it counts and how many, and what it pays when finished.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Quest {
    pub id: String,
    pub words: String,
    pub objective: Objective,
    pub target: u32,
    pub xp: u32,
    pub aurem: u32,
}

/// Every side quest written.
#[derive(Debug, Deserialize)]
pub struct Quests {
    pub quests: Vec<Quest>,
}

/// The side quests as the missions write them (`content/gear/quests.json`), read once.
///
/// # Panics
///
/// Never for the content in the repository, which its test reads.
#[must_use]
pub fn quests() -> &'static Quests {
    static READ: OnceLock<Quests> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/gear/quests.json"))
            .expect("content/gear/quests.json reads: its test says so")
    })
}

impl Character {
    /// Takes up a side quest at a count of 0: false when it is held or finished already.
    pub fn take_quest(&mut self, quest: &Quest) -> bool {
        if self.story.quests.contains_key(&quest.id) || self.story.finished.contains(&quest.id) {
            return false;
        }
        self.story.quests.insert(quest.id.clone(), 0);
        true
    }

    /// Finishes a held quest whose count reached its target, paying its XP and Aurem once.
    pub fn finish_quest(&mut self, quest: &Quest) -> bool {
        if self.story.quests.get(&quest.id).is_none_or(|count| *count < quest.target) {
            return false;
        }
        self.story.quests.remove(&quest.id);
        self.story.finished.insert(quest.id.clone());
        self.earn_xp(quest.xp, None);
        self.materials.add_aurem(quest.aurem);
        true
    }
}
