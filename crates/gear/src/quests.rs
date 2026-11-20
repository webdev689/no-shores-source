//! The quests, the story's missions and the side quests, written as data (`content/gear/quests.json`): each is named
//! steps counted in turn, each step an objective (`crate::objectives`). One count is kept with the character across
//! the steps until it is finished, so the step it stands at is read from it; it pays its XP and Aurem once.

use crate::character::Character;
use crate::objectives::Objective;
use serde::Deserialize;
use std::sync::OnceLock;

/// The most characters a card shows whole: a quest's name and a step's name on one line, its tale on two.
pub const NAME_MOST: usize = 32;
pub const TALE_MOST: usize = 80;
pub const STEP_NAME_MOST: usize = 32;

/// What a quest is, which its card's banner shows: a story mission or a side quest. Read from the content, never kept.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuestKind {
    Story,
    Side,
}

/// A step of a quest: its name, what it asks in words, what it counts and how many.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub name: String,
    pub words: String,
    pub objective: Objective,
    pub target: u32,
}

/// A quest: its id, its kind, its name and a line of its tale as its card shows them, its steps, and what it pays
/// when finished.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Quest {
    pub id: String,
    pub kind: QuestKind,
    pub name: String,
    /// One line of its tale, as its card shows it.
    pub tale: String,
    /// The banner its card wears, by the page's key; none wears its kind's.
    #[serde(default)]
    pub banner: Option<String>,
    pub steps: Vec<Step>,
    pub xp: u32,
    pub aurem: u32,
}

impl Quest {
    /// Every step's target together: the count that finishes it.
    #[must_use]
    pub fn total(&self) -> u32 {
        self.steps.iter().fold(0, |sum, step| sum.saturating_add(step.target))
    }

    /// The step a count so far stands at, by its place from 0, and whether every step is done (then the last).
    #[must_use]
    pub fn step_at(&self, count: u32) -> (usize, bool) {
        let mut reached = 0u32;
        for (place, step) in self.steps.iter().enumerate() {
            reached = reached.saturating_add(step.target);
            if reached > count {
                return (place, false);
            }
        }
        (self.steps.len().saturating_sub(1), true)
    }
}

/// A quest a character holds, as its card shows it: its id, the step its count stands at, and whether all are done.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeldQuest<'written> {
    pub id: &'written str,
    pub step: usize,
    pub done: bool,
}

/// Every quest written.
#[derive(Debug, Deserialize)]
pub struct Quests {
    pub quests: Vec<Quest>,
}

/// The quests as the missions write them (`content/gear/quests.json`), read once.
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
    /// The quests held that the content still has, in the order written, each at the step its count stands at.
    #[must_use]
    pub fn quests_held<'written>(&self, written: &'written [Quest]) -> Vec<HeldQuest<'written>> {
        written
            .iter()
            .filter_map(|quest| {
                let (step, done) = quest.step_at(*self.story.quests.get(&quest.id)?);
                Some(HeldQuest { id: &quest.id, step, done })
            })
            .collect()
    }

    /// Takes up a quest at a count of 0: false when it is held or finished already.
    pub fn take_quest(&mut self, quest: &Quest) -> bool {
        if self.story.quests.contains_key(&quest.id) || self.story.finished.contains(&quest.id) {
            return false;
        }
        self.story.quests.insert(quest.id.clone(), 0);
        true
    }

    /// Finishes a held quest whose every step is done, paying its XP and Aurem once.
    pub fn finish_quest(&mut self, quest: &Quest) -> bool {
        if self.story.quests.get(&quest.id).is_none_or(|count| *count < quest.total()) {
            return false;
        }
        self.story.quests.remove(&quest.id);
        self.story.finished.insert(quest.id.clone());
        self.earn_xp(quest.xp, None);
        self.materials.add_aurem(quest.aurem);
        true
    }
}
