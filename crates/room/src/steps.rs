//! The roads' steps a room runs a player at a time (`gear::quests::GoalKind::stepped`): a figure met at a place and
//! walked to another, the player keeping up with it (an escort, with an ambush halfway) or following it unseen (a
//! tail); a ward held through waves of foes; a puzzle's points used in order (ask 66); a place reached unseen; and a
//! race between checkpoints against the clock. A figure, a ward and a puzzle's points are the player's own, sent to
//! them alone; a ward is a fighter on the players' side that thinks nothing and fights no one, kept out of every
//! snapshot, which the waves' foes come at. What met counts on the player's quest log; what failed counts in the
//! room, for the page to say its line.

use crate::quests::held_near;
use crate::{PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::ROSTER;
use combat::fighter::FighterId;
use gear::quests::{Event, GoalDef, GoalKind, Place, RANKS, speaker_place};
use movement::Terrain;
use std::collections::BTreeSet;

/// A figure's walking pace, metres a second: the game's own walk.
pub const FIGURE_PACE: f64 = movement::TUNING.walk;
/// How long a failed step waits before it is tried again, in ticks: a defence, a tail noticed, an unseen step seen.
pub const RETRY_TICKS: u64 = 600;
/// How near a puzzle's point a player uses it, metres (ask 66).
pub const POINT_REACH: f64 = 3.0;
/// A ward's health, a share of a player's being 100: it lasts a wave unopposed a while, not two (its tests say how).
pub const WARD_HEALTH: f64 = 700.0;
/// How far a puzzle's point is looked for round where it is meant to stand when a box stands there, metres.
const POINT_NUDGE: f64 = 6.0;
/// How near one path's point another's is for a figure to walk from one to the other, metres.
const JOIN: f64 = 6.0;
/// The figures' states on the wire.
pub const WAITING: u8 = 0;
pub const WALKING: u8 = 1;
pub const NOTICED: u8 = 2;
pub const ARRIVED: u8 = 3;
pub const HELD: u8 = 4;

/// A player's step running in this room: its goal, by its quest, task and place in the task, its failures this task,
/// and how it stands.
#[derive(Debug)]
pub(crate) struct Step {
    pub key: [usize; 3],
    pub goal: &'static GoalDef,
    pub fails: u16,
    pub kind: Stepping,
}

/// How a step stands.
#[derive(Debug)]
pub(crate) enum Stepping {
    Figure(Figure),
    Defence(Defence),
    /// Its points on the ground, and how many are lit in order.
    Puzzle(Vec<[f64; 3]>, usize),
    /// The tick a foe was last alert on the player, and the foes alert on them now.
    Unseen(Option<u64>, Vec<FighterId>),
    /// The next checkpoint, and the tick the clock started at.
    Race(usize, Option<u64>),
}

/// A walking figure: its look on the wire, its way and how far along it, where it stands and faces, its state, the
/// tick it noticed the player (a tail), and its ambush's foes (none before it stands, empty once it fell).
#[derive(Debug)]
pub(crate) struct Figure {
    pub look: u16,
    pub way: Vec<[f64; 2]>,
    pub along: f64,
    pub at: [f64; 3],
    pub facing: f64,
    pub state: u8,
    pub noticed: Option<u64>,
    pub ambush: Option<Vec<FighterId>>,
}

/// A defence: its ward while it stands, where it stands, the wave standing and its foes, and when it may be tried again.
#[derive(Debug, Default)]
pub(crate) struct Defence {
    pub ward: Option<FighterId>,
    pub at: [f64; 3],
    pub wave: usize,
    pub standing: Vec<FighterId>,
    pub retry: Option<u64>,
}

/// What a player is sent of their step: the clock, each goal's failures, the puzzle's points, the figure and the ward.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StepSeen {
    pub clock: f64,
    pub fails: Vec<u16>,
    pub points: Vec<f64>,
    pub figures: Vec<f64>,
    pub ward: Vec<f64>,
}

/// A point `out` metres from another at a bearing (radians from north, clockwise).
fn ahead(at: [f64; 2], bearing: f64, out: f64) -> [f64; 2] {
    [at[0] + libm::sin(bearing) * out, at[1] - libm::cos(bearing) * out]
}

fn apart(one: [f64; 2], two: [f64; 2]) -> f64 {
    libm::hypot(one[0] - two[0], one[1] - two[1])
}

/// The way a figure walks from one place to another: from the first's middle onto the nearest point of a path within
/// its reach, along the paths (a point of one within `JOIN` of another's joins them), off at the point nearest the
/// second's middle within its reach, to its middle; straight where no path joins them.
#[must_use]
pub fn way_between(paths: &[Vec<[f64; 2]>], from: &Place, to: &Place) -> Vec<[f64; 2]> {
    let points: Vec<[f64; 2]> = paths.iter().flatten().copied().collect();
    let mut joins: Vec<Vec<usize>> = vec![Vec::new(); points.len()];
    let mut first = 0;
    for path in paths {
        for at in first + 1..first + path.len() {
            joins[at - 1].push(at);
            joins[at].push(at - 1);
        }
        first += path.len();
    }
    for one in 0..points.len() {
        for two in one + 1..points.len() {
            if apart(points[one], points[two]) <= JOIN && !joins[one].contains(&two) {
                joins[one].push(two);
                joins[two].push(one);
            }
        }
    }
    let nearest = |place: &Place| {
        let near = points.iter().enumerate().filter(|(_, point)| apart(**point, place.at) <= place.radius);
        near.min_by(|one, two| apart(*one.1, place.at).total_cmp(&apart(*two.1, place.at))).map(|(at, _)| at)
    };
    let straight = vec![from.at, to.at];
    let (Some(start), Some(goal)) = (nearest(from), nearest(to)) else { return straight };
    let mut cost = vec![f64::INFINITY; points.len()];
    let mut came = vec![usize::MAX; points.len()];
    let mut open = BTreeSet::new();
    cost[start] = 0.0;
    open.insert((0_u64, start));
    while let Some((_, at)) = open.pop_first() {
        if at == goal {
            break;
        }
        for &next in &joins[at] {
            let through = cost[at] + apart(points[at], points[next]);
            if through < cost[next] {
                open.remove(&(cost[next].to_bits(), next));
                (cost[next], came[next]) = (through, at);
                open.insert((through.to_bits(), next));
            }
        }
    }
    if cost[goal].is_infinite() {
        return straight;
    }
    let mut way = vec![to.at];
    let mut at = goal;
    while at != usize::MAX {
        way.push(points[at]);
        at = came[at];
    }
    way.push(from.at);
    way.reverse();
    way
}

/// A way's length, and the point and bearing `along` it.
fn along_way(way: &[[f64; 2]], along: f64) -> ([f64; 2], f64) {
    let mut left = along.max(0.0);
    for leg in way.windows(2) {
        let length = apart(leg[0], leg[1]);
        let bearing = libm::atan2(leg[1][0] - leg[0][0], leg[0][1] - leg[1][1]);
        if left <= length {
            let share = if length > 0.0 { left / length } else { 0.0 };
            return (
                [leg[0][0] + (leg[1][0] - leg[0][0]) * share, leg[0][1] + (leg[1][1] - leg[0][1]) * share],
                bearing,
            );
        }
        left -= length;
    }
    (way.last().copied().unwrap_or_default(), 0.0)
}

#[must_use]
pub fn way_length(way: &[[f64; 2]]) -> f64 {
    way.windows(2).map(|leg| apart(leg[0], leg[1])).sum()
}

/// The roster's types and ranks a goal's list names.
fn foes_of(list: &[(String, String)]) -> Vec<(u8, Rank)> {
    let named = |(name, rank): &(String, String)| {
        let foe = ROSTER.iter().find(|foe| foe.name == *name)?;
        let number = RANKS.iter().position(|it| it == rank)?;
        Some((foe.number, Rank::from_number(u8::try_from(number + 1).ok()?)?))
    };
    list.iter().filter_map(named).collect()
}

impl Room {
    /// The paths of the node this room is, as its layout lays them, that a figure walks.
    pub fn set_paths(&mut self, paths: Vec<Vec<[f64; 2]>>) {
        self.quests.paths = paths;
    }

    /// A place of this room by its name.
    fn place_named(&self, name: &str) -> Option<Place> {
        self.place(name).cloned()
    }

    /// A place of this room by its name.
    #[must_use]
    pub fn place(&self, name: &str) -> Option<&Place> {
        self.quests.places.iter().find(|place| place.name == name)
    }

    /// The step a player's task waits on in this node, if any: its goal's quest, task and place in the task.
    fn step_wanted(&self, player: PlayerId) -> Option<([usize; 3], &'static GoalDef)> {
        let node = self.quests.node.as_deref()?;
        let character = &self.players.get(&player)?.character;
        let (quest, task) = character.quest_now()?;
        let (goal, def) =
            character.goals_unmet().find(|(_, goal)| goal.kind.stepped() && goal.node.as_deref() == Some(node))?;
        Some(([quest, task, goal], def))
    }

    /// Each tick, every player's step: begun as their task comes to it here, ended as it leaves it, and run.
    pub(crate) fn keep_steps(&mut self) {
        if self.quests.node.is_none() {
            return;
        }
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        for player in players {
            let wanted = self.step_wanted(player);
            let running = self.quests.steps.get(&player).map(|step| step.key);
            if running.is_some() && running != wanted.map(|(key, _)| key) {
                self.end_step(player);
            }
            let Some((key, goal)) = wanted else { continue };
            if running != Some(key) {
                self.begin_step(player, key, goal);
            }
            self.run_step(player, goal);
        }
    }

    /// A step begun: a figure at its way's start, a defence waiting for the player, a puzzle's points on the ground.
    fn begin_step(&mut self, player: PlayerId, key: [usize; 3], goal: &'static GoalDef) {
        let place = |name: &Option<String>| name.as_deref().and_then(|name| self.place_named(name));
        let kind = match goal.kind {
            GoalKind::Escort | GoalKind::Tail => {
                let (Some(from), Some(to)) = (place(&goal.from), place(&goal.to)) else { return };
                let way = way_between(&self.quests.paths, &from, &to);
                let look = match (&goal.who, &goal.foe) {
                    (Some(who), _) => speaker_place(who).map_or(0, |at| at + 1),
                    (None, Some(foe)) => {
                        ROSTER.iter().find(|it| it.name == *foe).map_or(0, |it| 100 + usize::from(it.number))
                    }
                    (None, None) => 0,
                };
                let ([x, y], facing) = along_way(&way, 0.0);
                let at = [x, y, self.floor.height_at(x, y)];
                let look = u16::try_from(look).unwrap_or(0);
                Stepping::Figure(Figure {
                    look,
                    way,
                    along: 0.0,
                    at,
                    facing,
                    state: WAITING,
                    noticed: None,
                    ambush: None,
                })
            }
            GoalKind::Defend => Stepping::Defence(Defence::default()),
            GoalKind::Puzzle => {
                let Some(middle) = place(&goal.place) else { return };
                let ground = self.ground_of(&middle);
                let mesh = &self.quests.grounds[ground].2;
                let points = goal.points.iter().map(|point| {
                    let [x, y] = ahead(middle.at, point.bearing.to_radians(), point.at);
                    held_near(mesh, &self.floor, [x, y], POINT_NUDGE).unwrap_or([x, y, self.floor.height_at(x, y)])
                });
                Stepping::Puzzle(points.collect(), 0)
            }
            GoalKind::Unseen => Stepping::Unseen(None, Vec::new()),
            _ => Stepping::Race(0, None),
        };
        self.quests.steps.insert(player, Step { key, goal, fails: 0, kind });
    }

    /// A step ended, its task done or left: its ward, its waves and its ambush leave with it.
    pub(crate) fn end_step(&mut self, player: PlayerId) {
        let Some(step) = self.quests.steps.remove(&player) else { return };
        let gone = match step.kind {
            Stepping::Defence(defence) => defence.ward.into_iter().chain(defence.standing).collect(),
            Stepping::Figure(figure) => figure.ambush.unwrap_or_default(),
            _ => Vec::new(),
        };
        self.send_away(&gone);
    }

    /// Foes sent away at once: a ward or a wave leaving.
    fn send_away(&mut self, gone: &[FighterId]) {
        for id in gone {
            self.foes.remove(id);
            self.board.forget(*id);
            self.quiet.remove(id);
            self.ways.remove(id);
            self.quests.wards.remove(id);
        }
    }

    /// Counts a failure of the player's step.
    fn failed(&mut self, player: PlayerId) {
        if let Some(step) = self.quests.steps.get_mut(&player) {
            step.fails = step.fails.saturating_add(1);
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
    }

    /// The player's step met: their quest log is told.
    fn stepped(&mut self, player: PlayerId, goal: &'static GoalDef) {
        let (Some(node), Some(anchor)) = (goal.node.as_deref(), goal.anchor()) else { return };
        self.tell_quest(player, &Event::Stepped { kind: goal.kind, node, anchor });
    }

    fn run_step(&mut self, player: PlayerId, goal: &'static GoalDef) {
        let Some(at) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]) else { return };
        match goal.kind {
            GoalKind::Escort | GoalKind::Tail => self.walk_figure(player, goal, at),
            GoalKind::Defend => self.defend(player, goal, at),
            GoalKind::Unseen => self.keep_unseen(player, goal, at),
            GoalKind::Race => self.race(player, goal, at),
            _ => {}
        }
    }
}

#[path = "steps_kinds.rs"]
mod kinds;

#[cfg(test)]
#[path = "steps_tests.rs"]
mod steps_tests;

#[cfg(test)]
#[path = "step_grounds_tests.rs"]
mod step_grounds_tests;
