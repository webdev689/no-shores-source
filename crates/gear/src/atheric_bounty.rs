//! The Atheric bounties, after Destiny 1's exotic bounties: an Atheric that no Vestige or Shape gives, earned by a
//! find of its own and then a run of steps, each counted to its number. Each is data (`content/gear/
//! atheric_bounties.json`): the item, the island whose passages it is found in, the find's name and words, the level a
//! character needs to find it, where it drops and how often, and the steps. The find goes into the dive's haul, so a
//! death loses it; kept at a lamp, its bounty is held from its first step. The last step done, the item is kept as
//! found.

use crate::character::{Character, UnknownKeys};
use crate::dice::{Dice, Purpose};
use crate::kinds::Kind;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

/// Where a find drops: from the cache of a lamp's zone, by the lamp's number, or of any deal's zone past a depth;
/// and its chance there.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Drop {
    #[serde(default)]
    pub lamp: Option<u8>,
    #[serde(default)]
    pub past: Option<u8>,
    pub chance: f64,
}

/// What a step counts: a lamp lit on the bounty's island (that lamp alone, if it names one), a Kindle mission
/// finished there, or a foe brought down in its passages (with a weapon of that kind, if it names one).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepKind {
    Lamp,
    Kindle,
    Fell,
}

/// One step of a bounty.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Step {
    pub kind: StepKind,
    pub count: u32,
    #[serde(default)]
    pub lamp: Option<u8>,
    #[serde(default)]
    pub weapon: Option<Kind>,
    pub words: String,
}

/// An Atheric bounty.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Bounty {
    pub id: String,
    /// The Atheric it gives, by its id in the catalogue.
    pub item: String,
    /// The island, by its continent's id, whose passages the find drops in and the steps count in.
    pub island: String,
    /// The find's name and its words.
    pub find: String,
    pub words: String,
    /// The least level a character finds it at.
    pub level: u8,
    /// Where it drops, the first that fits a cache taken.
    pub drops: Vec<Drop>,
    pub steps: Vec<Step>,
}

/// Every Atheric bounty.
#[must_use]
pub fn bounties() -> &'static [Bounty] {
    static READ: OnceLock<Vec<Bounty>> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/gear/atheric_bounties.json"))
            .expect("content/gear/atheric_bounties.json reads: its test says so")
    })
}

/// Whether a named item is an Atheric bounty's, which comes from its bounty alone.
#[must_use]
pub fn is_bounty_item(id: &str) -> bool {
    bounties().iter().any(|bounty| bounty.item == id)
}

/// A character's Atheric bounties: each held by its id with its step and the count toward it, and those finished.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Bounties {
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub held: BTreeMap<String, (u8, u32)>,
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub finished: BTreeSet<String>,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl Bounties {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.held.is_empty() && self.finished.is_empty() && self.unknown.is_empty()
    }
}

/// What a room saw that a step may count: a lamp lit, a Kindle finished, or a foe brought down in an island's
/// passages, with the kind of the weapon whose blow last landed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Toward<'a> {
    Lamp { island: &'a str, lamp: u8 },
    Kindled { island: &'a str },
    Felled { island: &'a str, weapon: Option<Kind> },
}

impl Step {
    fn counts(&self, island: &str, toward: Toward<'_>) -> bool {
        match (self.kind, toward) {
            (StepKind::Lamp, Toward::Lamp { island: on, lamp }) => {
                on == island && self.lamp.is_none_or(|want| want == lamp)
            }
            (StepKind::Kindle, Toward::Kindled { island: on }) => on == island,
            (StepKind::Fell, Toward::Felled { island: on, weapon }) => {
                on == island && self.weapon.is_none_or(|want| weapon == Some(want))
            }
            _ => false,
        }
    }
}

impl Character {
    /// Rolls for a find in a cache of an island's passages at `depth` (its lamp's number in a lamp's zone): for a
    /// character of its level who holds none, has not finished its bounty and holds none in the haul, at the first of
    /// its drops that fits; found, it goes into the haul. Whether one was found.
    pub fn roll_find(&mut self, island: &str, depth: u8, lamp: Option<u8>, dice: &Dice) -> bool {
        let level = self.level();
        let Some(dive) = self.passage.as_mut().filter(|dive| dive.here && dive.haul.lantern.is_none()) else {
            return false;
        };
        let held = &self.atheric_bounties;
        for (nth, bounty) in (0..).zip(bounties()) {
            let free = !held.held.contains_key(&bounty.id) && !held.finished.contains(&bounty.id);
            if bounty.island != island || level < bounty.level || !free {
                continue;
            }
            let fits = |drop: &&Drop| {
                drop.lamp.map_or_else(|| drop.past.is_some_and(|past| depth > past), |want| lamp == Some(want))
            };
            let Some(drop) = bounty.drops.iter().find(fits) else { continue };
            if dice.roll(Purpose::Passage, 1 + nth) < drop.chance {
                dive.haul.lantern = Some(bounty.id.clone());
                return true;
            }
        }
        false
    }

    /// Holds the bounty of a find kept at a lamp, from its first step.
    pub(crate) fn hold_bounty(&mut self, id: &str) {
        if !self.atheric_bounties.finished.contains(id) {
            self.atheric_bounties.held.entry(id.to_owned()).or_insert((0, 0));
        }
    }

    /// Counts what a room saw toward each held bounty's step, one step at a time; the last step done, the bounty is
    /// finished and its Atheric kept as found, outside any haul. Whether any count moved.
    pub fn toward_bounties(&mut self, toward: Toward<'_>) -> bool {
        let mut moved = false;
        let mut done = Vec::new();
        for bounty in bounties() {
            let Some((step, count)) = self.atheric_bounties.held.get_mut(&bounty.id) else { continue };
            let Some(wanted) = bounty.steps.get(usize::from(*step)) else { continue };
            if !wanted.counts(&bounty.island, toward) {
                continue;
            }
            moved = true;
            *count += 1;
            if *count >= wanted.count {
                (*step, *count) = (*step + 1, 0);
                if usize::from(*step) >= bounty.steps.len() {
                    done.push(bounty);
                }
            }
        }
        for bounty in done {
            self.atheric_bounties.held.remove(&bounty.id);
            self.atheric_bounties.finished.insert(bounty.id.clone());
            let Some(named) = crate::catalogue::catalogue().named(&bounty.item) else { continue };
            let item = crate::vestige::named_item(0, named, named.kind.slot());
            // Kept as found, never into a haul: the bounty is done.
            let dive = self.passage.take();
            if let Some(vestige) = self.keep_found(item, crate::item::NAMED_LEVEL) {
                self.keep_paid(vestige);
            }
            self.passage = dive;
        }
        moved
    }
}

/// What in the Atheric bounties the rules cannot keep, each said in a line.
#[must_use]
pub fn problems() -> Vec<String> {
    let mut problems = Vec::new();
    for bounty in bounties() {
        let named = crate::catalogue::catalogue().named(&bounty.item);
        if named.is_none_or(|named| named.rarity != crate::Rarity::Atheric) {
            problems.push(format!("bounty {}: {} is no Atheric of the catalogue", bounty.id, bounty.item));
        }
        if bounty.steps.is_empty() || bounty.steps.iter().any(|step| step.count == 0) {
            problems.push(format!("bounty {}: every step counts to one or more", bounty.id));
        }
        if bounty
            .drops
            .iter()
            .any(|drop| drop.lamp.is_some() == drop.past.is_some() || !(0.0..=1.0).contains(&drop.chance))
        {
            problems.push(format!("bounty {}: each drop names a lamp or a depth, and a chance", bounty.id));
        }
    }
    problems
}

#[cfg(test)]
#[path = "atheric_bounty_tests.rs"]
mod atheric_bounty_tests;
