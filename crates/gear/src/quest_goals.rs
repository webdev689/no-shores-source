//! A road's goals, each kind with the fields it reads and no others: read from `content/quests/quests.json` with the
//! words the tracker shows, how many times it is met, the scene said and the reward given as it is, a field missing or
//! left over named as the file is read; what meets each; and what of each the rooms read.

use crate::kinds::Slot;
use crate::quest_defs::RewardDef;
use crate::quests::{Event, Kill};
use serde::de::{Deserializer, Error as _};
use serde::{Deserialize, Serialize};

/// How far past a place's reach a foe's fall there still counts for a kill goal, metres.
pub const KILL_PAST: f64 = 40.0;
/// How near a kill goal's place a player on it stands its group there, metres.
pub const SPAWN_NEAR: f64 = 150.0;

/// What meets a goal, by kind alone: as an event names a step met.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
    Buy,
    Wear,
}

impl GoalKind {
    /// Whether the room runs the goal as a step of its own, a player at a time, rather than counting what they did.
    #[must_use]
    pub fn stepped(self) -> bool {
        match self {
            Self::Escort | Self::Tail | Self::Defend | Self::Puzzle | Self::Unseen | Self::Race => true,
            Self::Talk
            | Self::Pledge
            | Self::Reach
            | Self::Kill
            | Self::Gather
            | Self::Cast
            | Self::Sea
            | Self::Land
            | Self::Scavenge
            | Self::Enter
            | Self::Buy
            | Self::Wear => false,
        }
    }
}

/// Foes as a goal names them: each the roster's name and a rank it comes in.
pub type Foes = Vec<(String, String)>;

/// A goal with nothing to name.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Plain {}

/// Speaking with a keeper, by their counter's key.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Talk {
    pub to: String,
}

/// A smith's ware bought, or a piece worn, in a slot.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InSlot {
    pub slot: Slot,
}

/// Standing within a place's reach in a node.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reach {
    pub node: String,
    pub place: String,
}

/// Foes falling that the player struck: where, of which types, of what rank or higher, on what kind of island, each
/// only where it is named; and a group stood at its place.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Slay {
    pub node: Option<String>,
    pub place: Option<String>,
    #[serde(default)]
    pub types: Vec<String>,
    pub rank: Option<String>,
    pub island: Option<String>,
    #[serde(default)]
    pub spawn: Foes,
}

/// A spell cast, by its name.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Spell {
    pub spell: String,
}

/// A hostile ship beaten: its side, and how, where it is named.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Beaten {
    pub side: String,
    pub how: Option<String>,
}

/// Landing on a sea island of a kind.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Landing {
    pub island: String,
}

/// Arriving in a node.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Arrival {
    pub node: String,
}

/// A figure met at a place and walked to another while the player keeps within `near`: who, the scene said as they
/// meet (`greet`), an ambush stood halfway and its bark.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Escort {
    pub node: String,
    pub from: String,
    pub to: String,
    pub who: String,
    pub near: f64,
    pub greet: Option<String>,
    #[serde(default)]
    pub ambush: Foes,
    pub shout: Option<String>,
}

/// A figure followed from place to place, never nearer than `far` nor past `near`: a speaker's look or a roster
/// type's, the scene said as they meet, and the line it says noticing the player.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tail {
    pub node: String,
    pub from: String,
    pub to: String,
    pub who: Option<String>,
    pub foe: Option<String>,
    pub far: f64,
    pub near: f64,
    pub greet: Option<String>,
    pub noticed: Option<String>,
}

/// A ward held at a place through its waves: named, or a speaker's figure, and the line said as it falls.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Defend {
    pub node: String,
    pub place: String,
    pub ward: Option<String>,
    pub who: Option<String>,
    pub waves: Vec<Foes>,
    pub lost: Option<String>,
}

/// One of a puzzle's points: its name, and where it stands from the place's middle: a bearing in degrees from north
/// and metres out.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PointDef {
    pub name: String,
    pub bearing: f64,
    pub at: f64,
}

/// Points round a place used in an order (any, where none is given), and the line said at a wrong one.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Puzzle {
    pub node: String,
    pub place: String,
    pub points: Vec<PointDef>,
    pub order: Option<Vec<usize>>,
    pub wrong: Option<String>,
}

/// A place's middle reached, within `within` metres, with no foe alert on the player: the line said as one turns, and
/// its watch, stood idle on a ring `within` round the middle, each facing outward.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Unseen {
    pub node: String,
    pub place: String,
    pub seen: Option<String>,
    #[serde(default)]
    pub spawn: Foes,
    #[serde(default = "unseen_within")]
    pub within: f64,
}

/// How near a place's middle an unseen step is met where its goal gives no `within`, metres.
pub const UNSEEN_WITHIN: f64 = 8.0;

fn unseen_within() -> f64 {
    UNSEEN_WITHIN
}

/// Checkpoints passed in order within a clock, and the line said late.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Race {
    pub node: String,
    pub checkpoints: Vec<String>,
    pub seconds: f64,
    pub late: Option<String>,
}

/// What meets a goal, and the fields its kind reads.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Goal {
    Talk(Talk),
    Pledge(Plain),
    Reach(Reach),
    Kill(Slay),
    Gather(Plain),
    Cast(Spell),
    Sea(Beaten),
    Land(Landing),
    Scavenge(Plain),
    Enter(Arrival),
    Escort(Escort),
    Tail(Tail),
    Defend(Defend),
    Puzzle(Puzzle),
    Unseen(Unseen),
    Race(Race),
    Buy(InSlot),
    Wear(InSlot),
}

/// One goal: the tracker's words, how many times it is met (1 when left out), the scene said as it is met, what it
/// gives as it is met (Aurem or the first horse; nothing when left out), and what meets it.
#[derive(Clone, Debug, PartialEq)]
pub struct GoalDef {
    pub text: String,
    pub count: u16,
    pub scene: Option<String>,
    pub reward: RewardDef,
    pub goal: Goal,
}

impl<'de> Deserialize<'de> for GoalDef {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        fn take<T: serde::de::DeserializeOwned, E: serde::de::Error>(
            fields: &mut serde_json::Map<String, serde_json::Value>,
            key: &str,
        ) -> Result<Option<T>, E> {
            let value = fields.remove(key).map(serde_json::from_value).transpose();
            value.map_err(|error| E::custom(format!("{key}: {error}")))
        }
        let mut fields = serde_json::Map::deserialize(deserializer)?;
        let text: String = take(&mut fields, "text")?.ok_or_else(|| D::Error::missing_field("text"))?;
        let named = |error: D::Error| D::Error::custom(format!("{text}: {error}"));
        let count: u16 = take(&mut fields, "count").map_err(named)?.unwrap_or(1);
        let scene = take(&mut fields, "scene").map_err(named)?;
        let reward = take(&mut fields, "reward").map_err(named)?.unwrap_or_default();
        let goal = Goal::deserialize(serde_json::Value::Object(fields))
            .map_err(|error| D::Error::custom(format!("{text}: {error}")))?;
        Ok(GoalDef { text, count, scene, reward, goal })
    }
}

impl Goal {
    /// The kind it is.
    #[must_use]
    pub fn kind(&self) -> GoalKind {
        match self {
            Goal::Talk(_) => GoalKind::Talk,
            Goal::Pledge(_) => GoalKind::Pledge,
            Goal::Reach(_) => GoalKind::Reach,
            Goal::Kill(_) => GoalKind::Kill,
            Goal::Gather(_) => GoalKind::Gather,
            Goal::Cast(_) => GoalKind::Cast,
            Goal::Sea(_) => GoalKind::Sea,
            Goal::Land(_) => GoalKind::Land,
            Goal::Scavenge(_) => GoalKind::Scavenge,
            Goal::Enter(_) => GoalKind::Enter,
            Goal::Escort(_) => GoalKind::Escort,
            Goal::Tail(_) => GoalKind::Tail,
            Goal::Defend(_) => GoalKind::Defend,
            Goal::Puzzle(_) => GoalKind::Puzzle,
            Goal::Unseen(_) => GoalKind::Unseen,
            Goal::Race(_) => GoalKind::Race,
            Goal::Buy(_) => GoalKind::Buy,
            Goal::Wear(_) => GoalKind::Wear,
        }
    }

    /// The node it is met in, where it names one.
    #[must_use]
    pub fn node(&self) -> Option<&str> {
        match self {
            Goal::Reach(Reach { node, .. })
            | Goal::Enter(Arrival { node })
            | Goal::Escort(Escort { node, .. })
            | Goal::Tail(Tail { node, .. })
            | Goal::Defend(Defend { node, .. })
            | Goal::Puzzle(Puzzle { node, .. })
            | Goal::Unseen(Unseen { node, .. })
            | Goal::Race(Race { node, .. }) => Some(node),
            Goal::Kill(slay) => slay.node.as_deref(),
            Goal::Talk(_)
            | Goal::Pledge(_)
            | Goal::Gather(_)
            | Goal::Cast(_)
            | Goal::Sea(_)
            | Goal::Land(_)
            | Goal::Scavenge(_)
            | Goal::Buy(_)
            | Goal::Wear(_) => None,
        }
    }

    /// The place of its node it stands at, where it names one; a figure's or a race's are their own.
    #[must_use]
    pub fn place(&self) -> Option<&str> {
        match self {
            Goal::Reach(Reach { place, .. })
            | Goal::Defend(Defend { place, .. })
            | Goal::Puzzle(Puzzle { place, .. })
            | Goal::Unseen(Unseen { place, .. }) => Some(place),
            Goal::Kill(slay) => slay.place.as_deref(),
            Goal::Talk(_)
            | Goal::Pledge(_)
            | Goal::Gather(_)
            | Goal::Cast(_)
            | Goal::Sea(_)
            | Goal::Land(_)
            | Goal::Scavenge(_)
            | Goal::Enter(_)
            | Goal::Escort(_)
            | Goal::Tail(_)
            | Goal::Race(_)
            | Goal::Buy(_)
            | Goal::Wear(_) => None,
        }
    }

    /// The place a step's goal is met at: an escort's or a tail's end, a race's last checkpoint, any other's place.
    #[must_use]
    pub fn anchor(&self) -> Option<&str> {
        match self {
            Goal::Escort(Escort { to, .. }) | Goal::Tail(Tail { to, .. }) => Some(to),
            Goal::Race(race) => race.checkpoints.last().map(String::as_str),
            Goal::Defend(Defend { place, .. })
            | Goal::Puzzle(Puzzle { place, .. })
            | Goal::Unseen(Unseen { place, .. }) => Some(place),
            Goal::Talk(_)
            | Goal::Pledge(_)
            | Goal::Reach(_)
            | Goal::Kill(_)
            | Goal::Gather(_)
            | Goal::Cast(_)
            | Goal::Sea(_)
            | Goal::Land(_)
            | Goal::Scavenge(_)
            | Goal::Enter(_)
            | Goal::Buy(_)
            | Goal::Wear(_) => None,
        }
    }

    /// Every group of foes it stands, each by the roster's name and a rank.
    pub fn foes(&self) -> Box<dyn Iterator<Item = &(String, String)> + '_> {
        match self {
            Goal::Kill(Slay { spawn, .. })
            | Goal::Unseen(Unseen { spawn, .. })
            | Goal::Escort(Escort { ambush: spawn, .. }) => Box::new(spawn.iter()),
            Goal::Defend(defend) => Box::new(defend.waves.iter().flatten()),
            Goal::Talk(_)
            | Goal::Pledge(_)
            | Goal::Reach(_)
            | Goal::Gather(_)
            | Goal::Cast(_)
            | Goal::Sea(_)
            | Goal::Land(_)
            | Goal::Scavenge(_)
            | Goal::Enter(_)
            | Goal::Tail(_)
            | Goal::Puzzle(_)
            | Goal::Race(_)
            | Goal::Buy(_)
            | Goal::Wear(_) => Box::new(core::iter::empty()),
        }
    }

    /// The scenes it says beside its goal's own: a figure's greeting and its line, a step's failing line.
    #[must_use]
    pub fn lines(&self) -> Vec<&str> {
        let lines: Vec<&Option<String>> = match self {
            Goal::Escort(escort) => vec![&escort.greet, &escort.shout],
            Goal::Tail(tail) => vec![&tail.greet, &tail.noticed],
            Goal::Defend(defend) => vec![&defend.lost],
            Goal::Puzzle(puzzle) => vec![&puzzle.wrong],
            Goal::Unseen(unseen) => vec![&unseen.seen],
            Goal::Race(race) => vec![&race.late],
            Goal::Talk(_)
            | Goal::Pledge(_)
            | Goal::Reach(_)
            | Goal::Kill(_)
            | Goal::Gather(_)
            | Goal::Cast(_)
            | Goal::Sea(_)
            | Goal::Land(_)
            | Goal::Scavenge(_)
            | Goal::Enter(_)
            | Goal::Buy(_)
            | Goal::Wear(_) => Vec::new(),
        };
        lines.into_iter().filter_map(Option::as_deref).collect()
    }

    /// Whether an event meets it.
    #[must_use]
    pub fn met_by(&self, event: &Event<'_>) -> bool {
        let stepped = |kind: GoalKind| match event {
            Event::Stepped { kind: done, node, anchor } => {
                *done == kind && self.node() == Some(*node) && self.anchor() == Some(*anchor)
            }
            _ => false,
        };
        match self {
            Goal::Talk(talk) => matches!(event, Event::Talk(to) if *to == talk.to),
            Goal::Pledge(_) => matches!(event, Event::Pledge),
            Goal::Reach(reach) => {
                matches!(event, Event::Reach { node, place } if *node == reach.node && *place == reach.place)
            }
            Goal::Kill(slay) => matches!(event, Event::Kill(kill) if slay.killed(kill)),
            Goal::Gather(_) => matches!(event, Event::Gather),
            Goal::Cast(cast) => matches!(event, Event::Cast(spell) if *spell == cast.spell),
            Goal::Sea(sea) => matches!(
                event,
                Event::Sea { side, how } if *side == sea.side && sea.how.as_deref().is_none_or(|it| it == *how)
            ),
            Goal::Land(land) => matches!(event, Event::Land(island) if *island == land.island),
            Goal::Scavenge(_) => matches!(event, Event::Scavenge),
            Goal::Enter(enter) => matches!(event, Event::Enter(node) if *node == enter.node),
            Goal::Escort(_) => stepped(GoalKind::Escort),
            Goal::Tail(_) => stepped(GoalKind::Tail),
            Goal::Defend(_) => stepped(GoalKind::Defend),
            Goal::Puzzle(_) => stepped(GoalKind::Puzzle),
            Goal::Unseen(_) => stepped(GoalKind::Unseen),
            Goal::Race(_) => stepped(GoalKind::Race),
            Goal::Buy(buy) => matches!(event, Event::Bought(slot) if *slot == buy.slot),
            Goal::Wear(wear) => matches!(event, Event::Worn(slot) if *slot == wear.slot),
        }
    }
}

impl Slay {
    /// Whether a foe's fall meets it: in its node, within its place's reach and `KILL_PAST` beyond, one of its types,
    /// of its rank or higher, on its kind of island; each only where it names it.
    fn killed(&self, kill: &Kill<'_>) -> bool {
        let node = self.node.as_ref().is_none_or(|node| kill.node == Some(node.as_str()));
        let place = self
            .place
            .as_ref()
            .is_none_or(|name| kill.places.iter().any(|place| place.name == *name && place.holds(kill.at, KILL_PAST)));
        let types = self.types.is_empty() || self.types.iter().any(|name| name == kill.foe);
        let ranks = crate::quest_defs::RANKS;
        let rank = self
            .rank
            .as_deref()
            .is_none_or(|rank| ranks.iter().position(|it| *it == rank) < Some(usize::from(kill.rank)));
        let island = self.island.as_ref().is_none_or(|island| kill.island == Some(island.as_str()));
        node && place && types && rank && island
    }
}

impl GoalDef {
    /// The kind it is.
    #[must_use]
    pub fn kind(&self) -> GoalKind {
        self.goal.kind()
    }

    /// Whether an event meets it.
    #[must_use]
    pub fn met_by(&self, event: &Event<'_>) -> bool {
        self.goal.met_by(event)
    }
}
