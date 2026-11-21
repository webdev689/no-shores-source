//! What `content/quests/quests.json` says, built into the rules so the rooms and every browser read one file: each
//! quest and task by its id, each goal's kind and the fields that kind reads, checked whole as it is read; and the
//! cast's speakers in their file's order, by which a figure's look is numbered on the wire.

use crate::arts::arts;
use crate::factions::factions;
use crate::quests::{Event, Kill};
use serde::Deserialize;
use serde::de::{Deserializer, IgnoredAny, MapAccess, Visitor};
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
    Escort,
    Tail,
    Defend,
    Puzzle,
    Unseen,
    Race,
}

impl GoalKind {
    /// Whether the room runs the goal as a step of its own, a player at a time, rather than counting what they did.
    #[must_use]
    pub fn stepped(self) -> bool {
        matches!(self, Self::Escort | Self::Tail | Self::Defend | Self::Puzzle | Self::Unseen | Self::Race)
    }
}

/// One of a puzzle's points: its name, and where it stands from the place's middle: a bearing in degrees from north
/// and metres out.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PointDef {
    pub name: String,
    pub bearing: f64,
    pub at: f64,
}

/// One goal: its kind, the tracker's words, how many times it is met (1 when left out), and the fields its kind reads
/// (`fields_of`).
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
    pub from: Option<String>,
    pub who: Option<String>,
    pub foe: Option<String>,
    pub near: Option<f64>,
    pub far: Option<f64>,
    #[serde(default)]
    pub ambush: Vec<(String, String)>,
    pub shout: Option<String>,
    pub noticed: Option<String>,
    pub ward: Option<String>,
    #[serde(default)]
    pub waves: Vec<Vec<(String, String)>>,
    pub lost: Option<String>,
    #[serde(default)]
    pub points: Vec<PointDef>,
    #[serde(default)]
    pub order: Vec<usize>,
    pub wrong: Option<String>,
    pub seen: Option<String>,
    #[serde(default)]
    pub checkpoints: Vec<String>,
    pub seconds: Option<f64>,
    pub late: Option<String>,
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

/// One task: its id, the tracker's words, the scenes played as it begins and as it is done, its goals and its reward.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskDef {
    pub id: String,
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
        let unique = |ids: &mut dyn Iterator<Item = &String>| {
            let ids: Vec<&String> = ids.collect();
            ids.iter().enumerate().all(|(at, id)| !id.is_empty() && !ids[..at].contains(id))
        };
        if !unique(&mut self.quests.iter().map(|quest| &quest.id)) {
            problems.push("a quest's id is empty or another's".to_owned());
        }
        for quest in &self.quests {
            if quest.faction != 0 && factions().faction(quest.faction).is_none() {
                problems.push(format!("{}'s faction {} is none", quest.id, quest.faction));
            }
            if quest.tasks.is_empty() || quest.tasks.len() > usize::from(u8::MAX) {
                problems.push(format!("{} has {} tasks", quest.id, quest.tasks.len()));
            }
            if !unique(&mut quest.tasks.iter().map(|task| &task.id)) {
                problems.push(format!("{}: a task's id is empty or another's", quest.id));
            }
            for task in &quest.tasks {
                let reward = task.reward;
                if (reward.art || reward.tenet > 0 || reward.fragments > 0) && quest.faction == 0 || reward.tenet > 2 {
                    problems.push(format!("{}: {} gives what its quest has not", quest.id, task.task));
                }
                if task.goals.is_empty() || task.goals.iter().filter(|goal| goal.kind.stepped()).count() > 1 {
                    problems.push(format!("{}: {} has no goal, or more than one step", quest.id, task.task));
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

/// The fields of a goal each kind needs, and those it may have.
fn fields_of(kind: GoalKind) -> (&'static [&'static str], &'static [&'static str]) {
    use GoalKind::{Cast, Defend, Enter, Escort, Gather, Kill, Land, Pledge, Puzzle, Race, Reach, Scavenge, Sea};
    use GoalKind::{Tail, Talk, Unseen};
    match kind {
        Talk => (&["to"], &["scene"]),
        Pledge | Gather | Scavenge => (&[], &[]),
        Reach => (&["node", "place"], &[]),
        Kill => (&[], &["node", "place", "types", "rank", "island", "spawn"]),
        Cast => (&["spell"], &[]),
        Sea => (&["side"], &["how"]),
        Land => (&["island"], &[]),
        Enter => (&["node"], &[]),
        Escort => (&["node", "from", "to", "who", "near"], &["ambush", "shout"]),
        Tail => (&["node", "from", "to", "far", "near"], &["who", "foe", "noticed"]),
        Defend => (&["node", "place", "waves"], &["ward", "who", "lost"]),
        Puzzle => (&["node", "place", "points", "order"], &["wrong"]),
        Unseen => (&["node", "place"], &["seen"]),
        Race => (&["node", "checkpoints", "seconds"], &["late"]),
    }
}

impl GoalDef {
    /// What is wrong with the goal: a field its kind needs left out, one it does not read, or a value none of its own.
    fn problem(&self) -> Option<String> {
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
            ("from", self.from.is_some()),
            ("who", self.who.is_some()),
            ("foe", self.foe.is_some()),
            ("near", self.near.is_some()),
            ("far", self.far.is_some()),
            ("ambush", !self.ambush.is_empty()),
            ("shout", self.shout.is_some()),
            ("noticed", self.noticed.is_some()),
            ("ward", self.ward.is_some()),
            ("waves", !self.waves.is_empty()),
            ("lost", self.lost.is_some()),
            ("points", !self.points.is_empty()),
            ("order", !self.order.is_empty()),
            ("wrong", self.wrong.is_some()),
            ("seen", self.seen.is_some()),
            ("checkpoints", !self.checkpoints.is_empty()),
            ("seconds", self.seconds.is_some()),
            ("late", self.late.is_some()),
        ];
        let (needs, may) = fields_of(self.kind);
        let text = &self.text;
        if let Some((name, _)) =
            has.iter().find(|(name, present)| needs.contains(name) != *present && !may.contains(name))
        {
            return Some(format!("{text} has {name} wrong for its kind"));
        }
        let (fine, stepped) = (self.counted_fine(), self.stepped_fine());
        (!fine || !stepped).then(|| format!("{text} is not well formed"))
    }

    /// Whether the fields every counted kind reads hold values of their own.
    fn counted_fine(&self) -> bool {
        let is = |value: &Option<String>, among: &[&str]| value.as_deref().is_none_or(|value| among.contains(&value));
        let spells = arts().arts.iter().flat_map(|art| [&art.anima, &art.tenets[0], &art.tenets[1]]);
        let spell = self.spell.as_ref().is_none_or(|name| spells.clone().any(|spell| spell.name == *name));
        let keeper = |to: &str| (1..=u8::MAX).any(|keeper| keeper_key(keeper) == Some(to));
        let keeper = self.kind != GoalKind::Talk || self.to.as_deref().is_some_and(keeper);
        let groups = self.waves.iter().flatten().chain(&self.spawn).chain(&self.ambush);
        let ranks = groups.map(|(_, rank)| Some(rank.clone())).chain([self.rank.clone()]);
        let placed = (self.place.is_none() && self.spawn.is_empty()) || self.node.is_some() && self.place.is_some();
        self.count >= 1
            && keeper
            && spell
            && placed
            && is(&self.island, &ISLANDS)
            && is(&self.side, &SIDES)
            && is(&self.how, &HOWS)
            && ranks.into_iter().all(|rank| is(&rank, &RANKS))
    }

    /// Whether a step's fields hold values of their own: a speaker of the cast, reaches above nothing, a tail's
    /// nearest short of its farthest, a look or a ward named once, waves each with a foe, an order that uses every
    /// point once, a clock that runs.
    fn stepped_fine(&self) -> bool {
        let speaker = self.who.as_deref().is_none_or(|who| speaker_place(who).is_some());
        let near = self.near.is_none_or(|near| near > 0.0) && self.far.is_none_or(|far| far > 0.0);
        let between = self.far.zip(self.near).is_none_or(|(far, near)| far < near);
        let one_of = |one: bool, other: bool| one != other;
        let look = self.kind != GoalKind::Tail || one_of(self.who.is_some(), self.foe.is_some());
        let ward = self.kind != GoalKind::Defend || one_of(self.ward.is_some(), self.who.is_some());
        let waves = self.waves.iter().all(|wave| !wave.is_empty());
        let mut order = self.order.clone();
        order.sort_unstable();
        let ordered = order.iter().copied().eq(0..self.points.len()) || self.points.is_empty();
        let points = self.points.iter().all(|point| point.at > 0.0 && point.bearing.is_finite());
        let clock = self.seconds.is_none_or(|seconds| seconds > 0.0);
        speaker && near && between && look && ward && waves && ordered && points && clock
    }

    /// The place a step's goal is met at: an escort's or a tail's end, a race's last checkpoint, any other's place.
    #[must_use]
    pub fn anchor(&self) -> Option<&str> {
        match self.kind {
            GoalKind::Escort | GoalKind::Tail => self.to.as_deref(),
            GoalKind::Race => self.checkpoints.last().map(String::as_str),
            _ => self.place.as_deref(),
        }
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
            (kind, Event::Stepped { kind: done, node, anchor }) => {
                kind == *done && same(&self.node, node) && self.anchor() == Some(*anchor)
            }
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
