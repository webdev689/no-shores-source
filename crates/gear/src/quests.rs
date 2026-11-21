//! The houses' roads and the opening that leads to them, as `content/quests/quests.json` has them, built into the
//! rules so the rooms and every browser read one file; each player's place in every quest, kept in their character;
//! the quest they walk, the events the rooms tell it, each goal met by them, and the rewards its tasks give: the
//! house's Art worn at once, its Tenets, and fragments to choose.

use crate::arts::{EARNED_ART, EARNED_TENET_ONE, EARNED_TENET_TWO, FRAGMENTS, arts};
use crate::asks::{Done, Here, Refusal};
use crate::character::{Character, UnknownKeys};
use crate::factions::factions;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// How far past a place's reach a foe's fall there still counts for a kill goal, metres.
pub const KILL_PAST: f64 = 40.0;
/// How near a kill goal's place a player on it stands its group there, metres.
pub const SPAWN_NEAR: f64 = 150.0;
/// The ranks a goal names, lowest first: a foe's rank by its number (the foes crate's, 1 to 5) is its place plus one.
pub const RANKS: [&str; 5] = ["Minor", "Major", "Elite", "Miniboss", "Boss"];
/// The keepers spoken with that are not a house's, by the number ask 64 sends; a house's is its faction's number.
pub const KEEPERS: [(u8, &str); 7] = [
    (10, "mage"),
    (11, "vault"),
    (12, "armorsmith"),
    (13, "weaponsmith"),
    (14, "tailor"),
    (15, "tack"),
    (16, "harbourmaster"),
];
const ISLANDS: [&str; 2] = ["cove", "isle"];
const SIDES: [&str; 2] = ["tithe", "pirates"];
const HOWS: [&str; 3] = ["sink", "strike", "board"];

/// What meets a goal.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GoalKind {
    Talk,
    Pledge,
    Reach,
    Kill,
    Gather,
    Cast,
    Sea,
    Land,
    Scavenge,
    Enter,
}

/// One goal: its kind, the tracker's words, how many times it is met (1 when left out), and the fields its kind reads.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalDef {
    pub kind: GoalKind,
    pub text: String,
    #[serde(default = "one")]
    pub count: u16,
    pub to: Option<String>,
    pub scene: Option<String>,
    pub node: Option<String>,
    pub place: Option<String>,
    #[serde(default)]
    pub types: Vec<String>,
    pub rank: Option<String>,
    pub island: Option<String>,
    #[serde(default)]
    pub spawn: Vec<(String, String)>,
    pub spell: Option<String>,
    pub side: Option<String>,
    pub how: Option<String>,
}

fn one() -> u16 {
    1
}

/// What a task gives as it is done: its house's Art, a Tenet (1 or 2, 0 none), and fragments to choose.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RewardDef {
    pub art: bool,
    pub tenet: u8,
    pub fragments: u8,
}

/// One task: the tracker's words, the scenes played as it begins and as it is done, its goals and its reward.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskDef {
    pub task: String,
    pub start: Option<String>,
    pub end: Option<String>,
    pub goals: Vec<GoalDef>,
    #[serde(default)]
    pub reward: RewardDef,
}

/// One quest: its id, name, faction (0 the opening), the scene played as it is first walked, and its tasks.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestDef {
    pub id: String,
    pub name: String,
    pub faction: u8,
    pub begin: String,
    pub tasks: Vec<TaskDef>,
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

impl QuestsDef {
    /// What in the file the rules cannot keep, each said in a line; none when all is well.
    #[must_use]
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        for quest in &self.quests {
            if quest.faction != 0 && factions().faction(quest.faction).is_none() {
                problems.push(format!("{}'s faction {} is none", quest.id, quest.faction));
            }
            if quest.tasks.is_empty() || quest.tasks.len() > usize::from(u8::MAX) {
                problems.push(format!("{} has {} tasks", quest.id, quest.tasks.len()));
            }
            for task in &quest.tasks {
                let reward = task.reward;
                if (reward.art || reward.tenet > 0 || reward.fragments > 0) && quest.faction == 0 || reward.tenet > 2 {
                    problems.push(format!("{}: {} gives what its quest has not", quest.id, task.task));
                }
                if task.goals.is_empty() {
                    problems.push(format!("{}: {} has no goal", quest.id, task.task));
                }
                problems.extend(task.goals.iter().filter_map(|goal| goal.problem()).map(|said| {
                    let task = &task.task;
                    format!("{}: {task}: {said}", quest.id)
                }));
            }
        }
        for faction in core::iter::once(0).chain(factions().factions.iter().map(|faction| faction.id)) {
            if self.quests.iter().filter(|quest| quest.faction == faction).count() != 1 {
                problems.push(format!("faction {faction} has not one quest"));
            }
        }
        problems
    }
}

impl GoalDef {
    /// What is wrong with the goal: a field its kind needs left out, one it does not read, or a value none of its own.
    fn problem(&self) -> Option<String> {
        use GoalKind::{Cast, Enter, Gather, Kill, Land, Pledge, Reach, Scavenge, Sea, Talk};
        let has = [
            ("to", self.to.is_some()),
            ("scene", self.scene.is_some()),
            ("node", self.node.is_some()),
            ("place", self.place.is_some()),
            ("types", !self.types.is_empty()),
            ("rank", self.rank.is_some()),
            ("island", self.island.is_some()),
            ("spawn", !self.spawn.is_empty()),
            ("spell", self.spell.is_some()),
            ("side", self.side.is_some()),
            ("how", self.how.is_some()),
        ];
        let (needs, may): (&[&str], &[&str]) = match self.kind {
            Talk => (&["to"], &["scene"]),
            Pledge | Gather | Scavenge => (&[], &[]),
            Reach => (&["node", "place"], &[]),
            Kill => (&[], &["node", "place", "types", "rank", "island", "spawn"]),
            Cast => (&["spell"], &[]),
            Sea => (&["side"], &["how"]),
            Land => (&["island"], &[]),
            Enter => (&["node"], &[]),
        };
        let text = &self.text;
        if let Some((name, _)) =
            has.iter().find(|(name, present)| needs.contains(name) != *present && !may.contains(name))
        {
            return Some(format!("{text} has {name} wrong for its kind"));
        }
        let is = |value: &Option<String>, among: &[&str]| value.as_deref().is_none_or(|value| among.contains(&value));
        let spells = arts().arts.iter().flat_map(|art| [&art.anima, &art.tenets[0], &art.tenets[1]]);
        let spell = self.spell.as_ref().is_none_or(|name| spells.clone().any(|spell| spell.name == *name));
        let keeper = self.to.as_deref().is_none_or(|to| (1..=u8::MAX).any(|keeper| keeper_key(keeper) == Some(to)));
        let ranks = self.spawn.iter().map(|(_, rank)| Some(rank.clone())).chain([self.rank.clone()]);
        let placed = (self.place.is_none() && self.spawn.is_empty()) || self.node.is_some() && self.place.is_some();
        let fine = self.count >= 1
            && keeper
            && spell
            && placed
            && is(&self.island, &ISLANDS)
            && is(&self.side, &SIDES)
            && is(&self.how, &HOWS)
            && ranks.into_iter().all(|rank| is(&rank, &RANKS));
        (!fine).then(|| format!("{text} is not well formed"))
    }

    /// Whether an event meets the goal.
    #[must_use]
    pub fn met_by(&self, event: &Event<'_>) -> bool {
        let same = |field: &Option<String>, value: &str| field.as_deref() == Some(value);
        match (self.kind, event) {
            (GoalKind::Talk, Event::Talk(to)) => same(&self.to, to),
            (GoalKind::Reach, Event::Reach { node, place }) => same(&self.node, node) && same(&self.place, place),
            (GoalKind::Kill, Event::Kill(kill)) => self.killed(kill),
            (GoalKind::Cast, Event::Cast(spell)) => same(&self.spell, spell),
            (GoalKind::Sea, Event::Sea { side, how }) => {
                same(&self.side, side) && self.how.as_ref().is_none_or(|it| it == how)
            }
            (GoalKind::Land, Event::Land(island)) => same(&self.island, island),
            (GoalKind::Enter, Event::Enter(node)) => same(&self.node, node),
            (GoalKind::Pledge, Event::Pledge)
            | (GoalKind::Gather, Event::Gather)
            | (GoalKind::Scavenge, Event::Scavenge) => true,
            _ => false,
        }
    }

    /// Whether a foe's fall meets a kill goal: in its node, within its place's reach and `KILL_PAST` beyond, one of
    /// its types, of its rank or higher, on its kind of island; each only where the goal names it.
    fn killed(&self, kill: &Kill<'_>) -> bool {
        let node = self.node.as_ref().is_none_or(|node| kill.node == Some(node.as_str()));
        let place = self
            .place
            .as_ref()
            .is_none_or(|name| kill.places.iter().any(|place| place.name == *name && place.holds(kill.at, KILL_PAST)));
        let types = self.types.is_empty() || self.types.iter().any(|name| name == kill.foe);
        let rank = self
            .rank
            .as_deref()
            .is_none_or(|rank| RANKS.iter().position(|it| *it == rank) < Some(usize::from(kill.rank)));
        let island = self.island.as_ref().is_none_or(|island| kill.island == Some(island.as_str()));
        node && place && types && rank && island
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
}

/// A player's place in one quest: the task reached, that task's goals' counts, and whether the quest is done.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Road {
    pub task: u8,
    pub counts: Vec<u16>,
    pub done: bool,
    /// Keys this room does not know, from a later room's save, written back as read.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

/// A player's place in every quest, in the file's order, and each Art's fragment choices waiting, by the Art's number
/// less one.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct QuestLog {
    pub roads: Vec<Road>,
    pub choices: Vec<u8>,
    /// Keys this room does not know, from a later room's save, written back as read.
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl QuestLog {
    /// As kept, made whole: a place in every quest (unbegun for one never walked), its task one of its quest's, a count
    /// for each of that task's goals within the goal's own, and a choice count for every Art.
    #[must_use]
    pub fn kept(mut self) -> Self {
        let defs = &quests().quests;
        self.roads.resize_with(defs.len(), Road::default);
        for (road, quest) in self.roads.iter_mut().zip(defs) {
            let last = quest.tasks.len().saturating_sub(1);
            road.task = road.task.min(u8::try_from(last).unwrap_or(u8::MAX));
            let goals = quest.tasks.get(usize::from(road.task)).map_or(&[][..], |task| task.goals.as_slice());
            road.counts.resize(goals.len(), 0);
            road.counts.iter_mut().zip(goals).for_each(|(count, goal)| *count = (*count).min(goal.count));
        }
        self.choices.resize(arts().arts.len(), 0);
        self
    }
}

impl Character {
    /// The quest the player walks, by its place in the file: pledged to no house the opening, pledged the house's
    /// road; none once that one is done.
    #[must_use]
    pub fn quest_walked(&self) -> Option<usize> {
        let faction = self.allegiance.pledge;
        let at = quests().quests.iter().position(|quest| quest.faction == faction)?;
        (!self.quests.roads.get(at).is_some_and(|road| road.done)).then_some(at)
    }

    /// The quest walked and the task the player is on in it, by their places.
    #[must_use]
    pub fn quest_now(&self) -> Option<(usize, usize)> {
        let quest = self.quest_walked()?;
        Some((quest, self.quests.roads.get(quest).map_or(0, |road| usize::from(road.task))))
    }

    /// The counts of the task the player is on, one for each of its goals.
    #[must_use]
    pub fn quest_counts(&self) -> Vec<u16> {
        let Some((quest, task)) = self.quest_now() else { return Vec::new() };
        let goals = quests().quests[quest].tasks.get(task).map_or(0, |task| task.goals.len());
        let road = self.quests.roads.get(quest).map_or(&[][..], |road| road.counts.as_slice());
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
        let road = &mut self.quests.roads[quest];
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
            Some(next) => {
                road.task += 1;
                road.counts = vec![0; next.goals.len()];
            }
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
        let done = |at: usize| self.quests.roads.get(at).is_some_and(|road| road.done);
        (0..quests().quests.len()).map(done).collect()
    }

    /// An Art's fragment choices waiting, by the Art's number.
    #[must_use]
    pub fn fragment_choices(&self, art: u8) -> u8 {
        let at = arts().arts.iter().position(|found| found.id == art);
        at.and_then(|at| self.quests.choices.get(at)).copied().unwrap_or(0)
    }
}
