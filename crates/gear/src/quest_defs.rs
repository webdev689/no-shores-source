//! What `content/quests/quests.json` says, built into the rules so the rooms and every browser read one file: each
//! quest and task by its id (a task's old ids beside it), the quests each comes after, each task's goals
//! (`quest_goals.rs`) and reward, checked whole as it is read; and the cast's speakers in their file's order, by which
//! a figure's look is numbered on the wire.

use crate::arts::arts;
use crate::factions::factions;
use crate::kinds::Slot;
use crate::quest_goals::{Defend, Escort, Goal, GoalDef, Puzzle, Race, Slay, Tail};
use serde::Deserialize;
use serde::de::{Deserializer, IgnoredAny, MapAccess, Visitor};
use std::sync::OnceLock;

/// The ranks a goal names, lowest first: a foe's rank by its number (the foes crate's, 1 to 5) is its place plus one.
pub const RANKS: [&str; 5] = ["Minor", "Major", "Elite", "Miniboss", "Boss"];
/// The keepers spoken with that are not a house's, by the number ask 64 sends; a house's is its faction's number.
pub const KEEPERS: [(u8, &str); 9] = [
    (10, "mage"),
    (11, "vault"),
    (12, "armorsmith"),
    (13, "weaponsmith"),
    (14, "tailor"),
    (15, "tack"),
    (16, "harbourmaster"),
    (17, "mail"),
    (STRANGER, "stranger"),
];
/// The stranger's number in ask 64: she keeps no counter, and is heard anywhere in a social space.
pub const STRANGER: u8 = 18;
/// How far each way from its middle a place's navmesh square reaches, metres: the room's own (its test holds them
/// equal), within which a puzzle's points stand.
pub const PLACE_SQUARE: f64 = 35.0;
const ISLANDS: [&str; 2] = ["cove", "isle"];
const SIDES: [&str; 1] = ["tithe"];
const HOWS: [&str; 3] = ["sink", "strike", "board"];

/// What a task gives as it is done: Aurem, its house's Art, a Tenet (1 or 2, 0 none), fragments to choose, and the
/// first horse (`FIRST_HORSE`, the Bay).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RewardDef {
    pub aurem: u32,
    pub art: bool,
    pub tenet: u8,
    pub fragments: u8,
    pub horse: bool,
}

/// One task: its id and the ids it had before (a save of one is read as this), the tracker's words, the scenes played
/// as it begins and as it is done, its goals and its reward.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskDef {
    pub id: String,
    #[serde(default)]
    pub was: Vec<String>,
    pub task: String,
    pub start: Option<String>,
    pub end: Option<String>,
    pub goals: Vec<GoalDef>,
    #[serde(default)]
    pub reward: RewardDef,
}

/// One quest: its id, name, faction (0 the opening), the quests done before it is walked (by id), the scene played as
/// it is first walked, its tasks, and the task a character kept before it held any place in it reads at (`kept`, its
/// first when left out).
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestDef {
    pub id: String,
    pub name: String,
    pub faction: u8,
    #[serde(default)]
    pub after: Vec<String>,
    pub begin: String,
    pub tasks: Vec<TaskDef>,
    #[serde(default)]
    pub kept: Option<String>,
}

/// Everything in `content/quests/quests.json` the rules read.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct QuestsDef {
    pub quests: Vec<QuestDef>,
}

/// A keeper's key, by the number ask 64 sends: a house's by its faction's number, else one of `KEEPERS`.
#[must_use]
pub fn keeper_key(keeper: u8) -> Option<&'static str> {
    let house = factions().faction(keeper).map(|faction| faction.key.as_str());
    house.or_else(|| KEEPERS.iter().find(|(number, _)| *number == keeper).map(|(_, key)| *key))
}

/// Whether ids are each present and none another's.
fn unique<'id>(ids: impl Iterator<Item = &'id String>) -> bool {
    let ids: Vec<&String> = ids.collect();
    ids.iter().enumerate().all(|(at, id)| !id.is_empty() && !ids[..at].contains(id))
}

impl QuestsDef {
    /// What in the file the rules cannot keep, each said in a line; none when all is well.
    #[must_use]
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        if !unique(self.quests.iter().map(|quest| &quest.id)) {
            problems.push("a quest's id is empty or another's".to_owned());
        }
        for quest in &self.quests {
            if quest.faction != 0 && factions().faction(quest.faction).is_none() {
                problems.push(format!("{}'s faction {} is none", quest.id, quest.faction));
            }
            if quest.tasks.is_empty() || quest.tasks.len() > usize::from(u8::MAX) {
                problems.push(format!("{} has {} tasks", quest.id, quest.tasks.len()));
            }
            let ids = quest.tasks.iter().flat_map(|task| core::iter::once(&task.id).chain(&task.was));
            if !unique(ids) {
                problems.push(format!("{}: a task's id or old id is empty or another's", quest.id));
            }
            if quest.kept.as_ref().is_some_and(|kept| !quest.tasks.iter().any(|task| task.id == *kept)) {
                problems.push(format!("{}: kept names no task of its own", quest.id));
            }
            if let Some(after) = quest.after.iter().find(|after| !self.quests.iter().any(|it| it.id == **after)) {
                problems.push(format!("{}: after names {after}, no quest", quest.id));
            }
            for task in &quest.tasks {
                let reward = task.reward;
                if (reward.art || reward.tenet > 0 || reward.fragments > 0) && quest.faction == 0 || reward.tenet > 2 {
                    problems.push(format!("{}: {} gives what its quest has not", quest.id, task.task));
                }
                if task.goals.is_empty() || task.goals.iter().filter(|goal| goal.kind().stepped()).count() > 1 {
                    problems.push(format!("{}: {} has no goal, or more than one step", quest.id, task.task));
                }
                problems.extend(task.goals.iter().filter_map(GoalDef::problem).map(|said| {
                    let task = &task.task;
                    format!("{}: {task}: {said}", quest.id)
                }));
            }
        }
        problems.extend(self.cycles());
        for faction in core::iter::once(0).chain(factions().factions.iter().map(|faction| faction.id)) {
            if !self.quests.iter().any(|quest| quest.faction == faction) {
                problems.push(format!("faction {faction} has no quest"));
            }
            problems.extend(self.house_problems(faction));
        }
        problems
    }

    /// Each quest that comes after itself, by way of those it comes after.
    fn cycles(&self) -> Vec<String> {
        let at = |id: &str| self.quests.iter().position(|quest| quest.id == id);
        let quests = self.quests.iter().enumerate();
        quests
            .filter_map(|(start, quest)| {
                let mut seen = vec![start];
                let mut open: Vec<usize> = quest.after.iter().filter_map(|id| at(id)).collect();
                while let Some(next) = open.pop() {
                    if next == start {
                        return Some(format!("{} comes after itself", quest.id));
                    }
                    if !seen.contains(&next) {
                        seen.push(next);
                        open.extend(self.quests[next].after.iter().filter_map(|id| at(id)));
                    }
                }
                None
            })
            .collect()
    }

    /// A house's quests, their tasks in the file's order: its Art given before its first Tenet, that before its second,
    /// each once; and every spell a task asks cast its Art's, earned before that task (the Anima with the Art, each
    /// Tenet its own).
    fn house_problems(&self, faction: u8) -> Vec<String> {
        let tasks: Vec<&crate::quest_defs::TaskDef> =
            self.quests.iter().filter(|quest| quest.faction == faction).flat_map(|quest| &quest.tasks).collect();
        let given = |gives: &dyn Fn(&RewardDef) -> bool| tasks.iter().position(|task| gives(&task.reward));
        let once = |gives: &dyn Fn(&RewardDef) -> bool| tasks.iter().filter(|task| gives(&task.reward)).count() <= 1;
        let (art, one, two) = (given(&|it| it.art), given(&|it| it.tenet == 1), given(&|it| it.tenet == 2));
        let mut problems = Vec::new();
        let ordered = |earlier: Option<usize>, later: Option<usize>| {
            later.is_none_or(|later| earlier.is_some_and(|it| it < later))
        };
        let gives_once = once(&|it| it.art) && once(&|it| it.tenet == 1) && once(&|it| it.tenet == 2);
        if !gives_once || !ordered(art, one) || !ordered(one, two) {
            problems.push(format!("faction {faction}: its Art, first Tenet and second come once each, in that order"));
        }
        let spells = factions().faction(faction).and_then(|house| arts().art(house.art));
        for (at, task) in tasks.iter().enumerate() {
            for goal in &task.goals {
                let Goal::Cast(cast) = &goal.goal else { continue };
                let ability = spells.and_then(|art| {
                    [&art.anima, &art.tenets[0], &art.tenets[1]].iter().position(|it| it.name == cast.spell)
                });
                let earned = match ability {
                    Some(0) => art,
                    Some(1) => one,
                    Some(_) => two,
                    None => None,
                };
                if earned.is_none_or(|earned| earned >= at) {
                    problems.push(format!("{}: spell {} is none its house has earned by then", task.task, cast.spell));
                }
            }
        }
        problems
    }
}

/// Whether a value is none, or one of those named.
fn among(value: Option<&str>, names: &[&str]) -> bool {
    value.is_none_or(|value| names.contains(&value))
}

/// Whether a speaker of the cast has this key.
fn speaks(who: Option<&str>) -> bool {
    who.is_none_or(|who| speaker_place(who).is_some())
}

impl GoalDef {
    /// What is wrong with the goal, naming the field: a value none of its own, a count other than 1 on a step.
    #[must_use]
    pub fn problem(&self) -> Option<String> {
        let text = &self.text;
        let ranks = self.goal.foes().all(|(_, rank)| RANKS.contains(&rank.as_str()));
        let wrong = match &self.goal {
            Goal::Talk(talk) => {
                (!(1..=u8::MAX).any(|keeper| keeper_key(keeper) == Some(talk.to.as_str()))).then_some("to")
            }
            Goal::Pledge(_) | Goal::Reach(_) | Goal::Gather(_) | Goal::Scavenge(_) | Goal::Enter(_) => None,
            // Only a weapon's or armour's slot is ever told of a piece bought or worn (`QuestLog::tell_held`).
            Goal::Buy(goal) | Goal::Wear(goal) => (!Slot::VESTIGE.contains(&goal.slot)).then_some("slot"),
            Goal::Kill(slay) => slain(slay),
            Goal::Cast(cast) => {
                let spells = arts().arts.iter().flat_map(|art| [&art.anima, &art.tenets[0], &art.tenets[1]]);
                (!spells.clone().any(|spell| spell.name == cast.spell)).then_some("spell")
            }
            Goal::Sea(sea) => {
                if !among(Some(&sea.side), &SIDES) {
                    Some("side")
                } else {
                    (!among(sea.how.as_deref(), &HOWS)).then_some("how")
                }
            }
            Goal::Land(land) => (!among(Some(&land.island), &ISLANDS)).then_some("island"),
            Goal::Escort(escort) => escorted(escort),
            Goal::Tail(tail) => tailed(tail),
            Goal::Defend(defend) => defended(defend),
            Goal::Puzzle(puzzle) => puzzled(puzzle),
            Goal::Unseen(unseen) => (!(unseen.within > 0.0 && unseen.within <= PLACE_SQUARE)).then_some("within"),
            Goal::Race(race) => raced(race),
        };
        // A piece held is told again on every ask (`tell_held`), so one piece would meet a count above one.
        let once = self.kind().stepped() || matches!(self.goal, Goal::Buy(_) | Goal::Wear(_));
        if let Some(field) = wrong.or((!ranks).then_some("rank")) {
            Some(format!("{text}: {field} holds a value none of its own"))
        } else if self.count == 0 || once && self.count != 1 {
            Some(format!("{text}: count must be 1 on a step or a piece bought or worn, and 1 or more on any goal"))
        } else {
            None
        }
    }
}

fn slain(slay: &Slay) -> Option<&'static str> {
    if !among(slay.rank.as_deref(), &RANKS) {
        Some("rank")
    } else if !among(slay.island.as_deref(), &ISLANDS) {
        Some("island")
    } else if slay.place.is_some() && slay.node.is_none() {
        Some("node")
    } else {
        (!slay.spawn.is_empty() && slay.place.is_none()).then_some("place")
    }
}

fn escorted(escort: &Escort) -> Option<&'static str> {
    if !speaks(Some(&escort.who)) { Some("who") } else { (escort.near <= 0.0).then_some("near") }
}

fn tailed(tail: &Tail) -> Option<&'static str> {
    if tail.who.is_some() == tail.foe.is_some() || !speaks(tail.who.as_deref()) {
        Some("who")
    } else if tail.far <= 0.0 {
        Some("far")
    } else {
        (tail.near <= tail.far).then_some("near")
    }
}

fn defended(defend: &Defend) -> Option<&'static str> {
    if defend.ward.is_some() == defend.who.is_some() || !speaks(defend.who.as_deref()) {
        Some("ward")
    } else {
        (defend.waves.is_empty() || defend.waves.iter().any(Vec::is_empty)).then_some("waves")
    }
}

fn puzzled(puzzle: &Puzzle) -> Option<&'static str> {
    let within = |point: &crate::quest_goals::PointDef| {
        let turn = point.bearing.to_radians();
        point.at > 0.0 && point.at * libm::fabs(libm::sin(turn)).max(libm::fabs(libm::cos(turn))) <= PLACE_SQUARE
    };
    if puzzle.points.is_empty() || !puzzle.points.iter().all(within) {
        return Some("points");
    }
    let mut order = puzzle.order.clone().unwrap_or_default();
    order.sort_unstable();
    (puzzle.order.is_some() && !order.iter().copied().eq(0..puzzle.points.len())).then_some("order")
}

fn raced(race: &Race) -> Option<&'static str> {
    if race.checkpoints.len() < 2 {
        Some("checkpoints")
    } else {
        (race.seconds <= 0.0 || !race.seconds.is_finite()).then_some("seconds")
    }
}

/// The quests' file built into the rules, read once.
///
/// # Panics
///
/// Never for the file in the repository, which `the_quests_file_reads_whole` reads.
#[must_use]
pub fn quests() -> &'static QuestsDef {
    static READ: OnceLock<QuestsDef> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/quests/quests.json"))
            .expect("content/quests reads: its test says so")
    })
}

/// A JSON object's keys in the order its text writes them, its values passed over.
struct KeysInOrder(Vec<String>);

impl<'de> Deserialize<'de> for KeysInOrder {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Keys;
        impl<'de> Visitor<'de> for Keys {
            type Value = KeysInOrder;
            fn expecting(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                formatter.write_str("an object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<KeysInOrder, A::Error> {
                let mut keys = Vec::new();
                while let Some((key, IgnoredAny)) = map.next_entry::<String, IgnoredAny>()? {
                    keys.push(key);
                }
                Ok(KeysInOrder(keys))
            }
        }
        deserializer.deserialize_map(Keys)
    }
}

/// The cast's speakers, as `content/story/cast.json` writes them.
#[derive(Deserialize)]
struct Cast {
    speakers: KeysInOrder,
}

/// A speaker's place among the cast's speakers, in its file's order (the page's order too), by its key.
///
/// # Panics
///
/// Never for the file in the repository, which `the_quests_file_reads_whole` reads.
#[must_use]
pub fn speaker_place(key: &str) -> Option<usize> {
    static READ: OnceLock<Vec<String>> = OnceLock::new();
    let speakers = READ.get_or_init(|| {
        let cast: Cast = serde_json::from_str(include_str!("../../../content/story/cast.json"))
            .expect("content/story/cast.json reads: its test says so");
        cast.speakers.0
    });
    speakers.iter().position(|speaker| speaker == key)
}
