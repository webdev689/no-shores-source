//! The houses' roads and the opening that leads to them, as `content/quests/quests.json` has them (`quest_defs.rs`);
//! each player's place in every quest, kept in their character by the quest's id and the task's; the quest they walk,
//! the events the rooms tell it, each goal met by them, and the rewards its tasks give: the house's Art worn at once,
//! its Tenets, and fragments to choose.

use crate::arts::{EARNED_ART, EARNED_TENET_ONE, EARNED_TENET_TWO, FRAGMENTS, arts};
use crate::asks::{Done, Here, Refusal};
use crate::character::{Character, UnknownKeys};
use crate::factions::factions;
pub use crate::quest_defs::{
    GoalDef, GoalKind, KEEPERS, KILL_PAST, PointDef, QuestDef, QuestsDef, RANKS, RewardDef, SPAWN_NEAR, TaskDef,
    keeper_key, quests, speaker_place,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A place of a node, as its file names it: an area or a run of its layout, its middle and its reach, metres.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
pub struct Place {
    pub name: String,
    pub at: [f64; 2],
    pub radius: f64,
}

impl Place {
    /// Whether a point stands within its reach and `past` beyond.
    #[must_use]
    pub fn holds(&self, at: [f64; 2], past: f64) -> bool {
        libm::hypot(at[0] - self.at[0], at[1] - self.at[1]) <= self.radius + past
    }
}

/// A foe's fall that a player struck, as its room tells it: its node, where it fell, the node's places, its type's
/// name in the roster, its rank's number (1 Minor to 5 Boss), and the sea island's kind (`cove` or `isle`) it fell on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Kill<'told> {
    pub node: Option<&'told str>,
    pub at: [f64; 2],
    pub places: &'told [Place],
    pub foe: &'told str,
    pub rank: u8,
    pub island: Option<&'told str>,
}

/// Something a player did, as a room tells their quest log of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Event<'told> {
    /// A keeper spoken with at their counter, by their key.
    Talk(&'told str),
    Pledge,
    Reach {
        node: &'told str,
        place: &'told str,
    },
    Kill(Kill<'told>),
    Gather,
    /// A spell cast, by its name.
    Cast(&'told str),
    /// A hostile ship beaten: its side (`tithe` or `pirates`) and how (`sink`, `strike` or `board`).
    Sea {
        side: &'told str,
        how: &'told str,
    },
    /// Landed on a sea island of a kind.
    Land(&'told str),
    Scavenge,
    /// Arrived in a node, by its id.
    Enter(&'told str),
    /// A step the room ran met, of a kind, in a node, at its goal's anchor (`GoalDef::anchor`).
    Stepped {
        kind: GoalKind,
        node: &'told str,
        anchor: &'told str,
    },
}

/// A player's place in one quest: the task reached, by its id, that task's goals' counts, and whether the quest is
/// done.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Road {
    pub task: String,
    pub counts: Vec<u16>,
    pub done: bool,
    /// Keys this room does not know, from a later room's save, written back as read.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

/// A player's place in every quest, by the quest's id (one the file no longer holds kept as read), and each Art's
/// fragment choices waiting, by the Art's number less one.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct QuestLog {
    pub roads: BTreeMap<String, Road>,
    pub choices: Vec<u8>,
    /// Keys this room does not know, from a later room's save, written back as read.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl QuestLog {
    /// As kept, made whole: a place in every quest (unbegun for one never walked), its task one of its quest's (the
    /// first for a task the file no longer holds), a count for each of that task's goals within the goal's own, and a
    /// choice count for every Art.
    #[must_use]
    pub fn kept(mut self) -> Self {
        for quest in &quests().quests {
            let road = self.roads.entry(quest.id.clone()).or_default();
            if !quest.tasks.iter().any(|task| task.id == road.task) {
                road.task = quest.tasks.first().map(|task| task.id.clone()).unwrap_or_default();
                road.counts.clear();
            }
            let task = quest.tasks.iter().find(|task| task.id == road.task);
            let goals = task.map_or(&[][..], |task| task.goals.as_slice());
            road.counts.resize(goals.len(), 0);
            road.counts.iter_mut().zip(goals).for_each(|(count, goal)| *count = (*count).min(goal.count));
        }
        self.choices.resize(arts().arts.len(), 0);
        self
    }

    /// Sets a quest's place at one of its tasks, by their places in the file, its counts at nothing.
    pub fn set_task(&mut self, quest: usize, task: usize) {
        let Some(def) = quests().quests.get(quest) else { return };
        let Some(at) = def.tasks.get(task) else { return };
        let road = self.roads.entry(def.id.clone()).or_default();
        (road.task, road.counts, road.done) = (at.id.clone(), vec![0; at.goals.len()], false);
    }

    /// A quest's place, by the quest's place in the file.
    #[must_use]
    pub fn road(&self, quest: usize) -> Option<&Road> {
        self.roads.get(&quests().quests.get(quest)?.id)
    }

    fn road_mut(&mut self, quest: usize) -> Option<&mut Road> {
        self.roads.get_mut(&quests().quests.get(quest)?.id)
    }
}

impl Character {
    /// The quest the player walks, by its place in the file: pledged to no house the opening, pledged the house's
    /// road; none once that one is done.
    #[must_use]
    pub fn quest_walked(&self) -> Option<usize> {
        let faction = self.allegiance.pledge;
        let at = quests().quests.iter().position(|quest| quest.faction == faction)?;
        (!self.quests.road(at).is_some_and(|road| road.done)).then_some(at)
    }

    /// The quest walked and the task the player is on in it, by their places.
    #[must_use]
    pub fn quest_now(&self) -> Option<(usize, usize)> {
        let quest = self.quest_walked()?;
        let tasks = &quests().quests[quest].tasks;
        let task = self.quests.road(quest).and_then(|road| tasks.iter().position(|task| task.id == road.task));
        Some((quest, task.unwrap_or(0)))
    }

    /// The counts of the task the player is on, one for each of its goals.
    #[must_use]
    pub fn quest_counts(&self) -> Vec<u16> {
        let Some((quest, task)) = self.quest_now() else { return Vec::new() };
        let goals = quests().quests[quest].tasks.get(task).map_or(0, |task| task.goals.len());
        let road = self.quests.road(quest).map_or(&[][..], |road| road.counts.as_slice());
        (0..goals).map(|goal| road.get(goal).copied().unwrap_or(0)).collect()
    }

    /// The goals of the task the player is on not yet met, each with its place in the task.
    pub fn goals_unmet(&self) -> impl Iterator<Item = (usize, &'static GoalDef)> {
        let counts = self.quest_counts();
        let now = self.quest_now().and_then(|(quest, task)| quests().quests[quest].tasks.get(task));
        let goals = now.map_or(&[][..], |task| task.goals.as_slice());
        goals.iter().enumerate().filter(move |(at, goal)| counts.get(*at).is_some_and(|count| *count < goal.count))
    }

    /// Tells the quest walked of something the player did: each goal of its task not yet met that the event meets
    /// counts once more; every goal met, the task's reward is given and the next begins at once, its counts at
    /// nothing, or the quest is done. Whether anything counted.
    pub fn tell(&mut self, event: &Event<'_>) -> bool {
        let Some((quest, task)) = self.quest_now() else { return false };
        let def = &quests().quests[quest];
        let Some(goals) = def.tasks.get(task).map(|task| &task.goals) else { return false };
        self.quests = std::mem::take(&mut self.quests).kept();
        let Some(road) = self.quests.road_mut(quest) else { return false };
        let mut counted = false;
        for (count, goal) in road.counts.iter_mut().zip(goals) {
            if *count < goal.count && goal.met_by(event) {
                *count += 1;
                counted = true;
            }
        }
        // A task whose goals were all met as it was read (a count lowered since) is done at the next event.
        if road.counts.iter().zip(goals).any(|(count, goal)| *count < goal.count) {
            return counted;
        }
        match def.tasks.get(task + 1) {
            Some(next) => (road.task, road.counts) = (next.id.clone(), vec![0; next.goals.len()]),
            None => road.done = true,
        }
        self.reward(def.faction, def.tasks[task].reward);
        true
    }

    /// A task's reward, of its house's Art: the Art earned and worn at once, a Tenet earned, fragments to choose. A
    /// fragment beyond those the Art has left unowned and unchosen is its price at the counter in Aurem instead.
    fn reward(&mut self, faction: u8, reward: RewardDef) {
        let Some(art) = factions().faction(faction).map(|found| found.art) else { return };
        let Some(at) = arts().arts.iter().position(|found| found.id == art) else { return };
        self.arts = std::mem::take(&mut self.arts).kept();
        let earned = self.arts.earned.get_or_insert_with(Vec::new);
        let tenet = match reward.tenet {
            1 => EARNED_TENET_ONE,
            2 => EARNED_TENET_TWO,
            _ => 0,
        };
        if let Some(held) = earned.get_mut(at) {
            *held |= if reward.art { EARNED_ART } else { 0 } | tenet;
        }
        if reward.art {
            self.arts.worn = art;
        }
        let places = 0..u8::try_from(FRAGMENTS).unwrap_or(u8::MAX);
        let unowned = places.filter(|place| !self.owns_fragment(art, *place)).count();
        for _ in 0..reward.fragments {
            match self.quests.choices.get_mut(at) {
                Some(choices) if usize::from(*choices) < unowned => *choices += 1,
                _ => self.materials.add_aurem(factions().fragment_aurem),
            }
        }
    }

    /// Speaks with a keeper at their counter, by the number ask 64 sends, when a goal of the task the player is on
    /// asks it.
    pub(crate) fn speak(&mut self, keeper: u8, here: Here) -> Result<Option<Done>, Refusal> {
        let key = keeper_key(keeper).ok_or(Refusal::NoSuchKeeper)?;
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if !self.goals_unmet().any(|(_, goal)| goal.kind == GoalKind::Talk && goal.to.as_deref() == Some(key)) {
            return Err(Refusal::NothingToSay);
        }
        self.tell(&Event::Talk(key));
        Ok(None)
    }

    /// Owns one of an Art's fragments by its place, spending one of the choices its road gave: anywhere.
    pub(crate) fn choose_fragment(&mut self, art: u8, fragment: u8) -> Result<Option<Done>, Refusal> {
        let at = arts().arts.iter().position(|found| found.id == art).ok_or(Refusal::NoSuchFaction)?;
        if self.quests.choices.get(at).copied().unwrap_or(0) == 0 {
            return Err(Refusal::NoChoice);
        }
        self.fragment_free(art, fragment)?;
        self.arts = std::mem::take(&mut self.arts).kept();
        self.own_fragment(at, fragment);
        self.quests.choices[at] -= 1;
        Ok(None)
    }

    /// Each quest done, in the file's order.
    #[must_use]
    pub fn quests_done(&self) -> Vec<bool> {
        let done = |at: usize| self.quests.road(at).is_some_and(|road| road.done);
        (0..quests().quests.len()).map(done).collect()
    }

    /// An Art's fragment choices waiting, by the Art's number.
    #[must_use]
    pub fn fragment_choices(&self, art: u8) -> u8 {
        let at = arts().arts.iter().position(|found| found.id == art);
        at.and_then(|at| self.quests.choices.get(at)).copied().unwrap_or(0)
    }
}
