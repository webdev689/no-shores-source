//! The roads' steps a room runs a player at a time (`gear::quests::GoalKind::stepped`): a figure met at a place and
//! walked to another, the player keeping up with it (an escort, with an ambush halfway) or following it unseen (a
//! tail); a ward held through waves of foes; a puzzle's points used in order, or in any (ask 66); a place reached
//! unseen, its watchers standing; and a race between checkpoints against the clock. A figure, a ward and a puzzle's
//! points are the player's own, sent to them alone; a ward is a fighter on the players' side that thinks nothing and
//! fights no one, kept out of every snapshot, which the waves' foes come at. What met counts on the player's quest log;
//! what failed counts in the room, for the page to say its line.

use crate::quests::{held_near, reached_near};
use crate::{PlayerId, Room};
use combat::fighter::FighterId;
use gear::quests::{Escort, Event, Goal, GoalDef, Place, Tail, speaker_place};
use movement::Terrain;
use std::collections::BTreeSet;

/// A figure's walking pace, metres a second: the game's own walk.
pub const FIGURE_PACE: f64 = movement::TUNING.walk;
/// How long a failed step waits before it is tried again, in ticks: a defence the first time (then twice as long each
/// time, to `RETRY_MOST`), a tail noticed, an unseen step seen.
pub const RETRY_TICKS: u64 = 600;
pub const RETRY_MOST: u64 = 2_400;
/// How long a puzzle takes no use after a wrong one, in ticks: twice as long each time, to `STOPPED_MOST`.
pub const STOPPED_TICKS: u64 = 120;
pub const STOPPED_MOST: u64 = 480;
/// How near a puzzle's point a player uses it, metres (ask 66).
pub const POINT_REACH: f64 = 3.0;
/// A ward's health, a share of a player's being 100: it lasts a wave unopposed a while, not two (its tests say how).
pub const WARD_HEALTH: f64 = 700.0;
/// How far from an unseen step's place a foe alert on the player counts as seeing them, metres.
pub const WATCHED_WITHIN: f64 = 60.0;
/// How far round where a puzzle's point is meant to stand ground a walk reaches from its place is looked for, metres,
/// when a box or a bank stands there: this at the least, and as far as the place's middle if that lies further.
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
    Puzzle(Lit),
    Unseen(Watched),
    Race(Raced),
}

/// A walking figure: its look on the wire, its way and how far along it, where it stands and faces, its state, the
/// tick it noticed the player (a tail), and its ambush's foes (none before it stands, empty once it fell).
#[derive(Clone, Debug)]
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

/// A puzzle: its points on the ground, those lit in the order they were, and the tick it takes a use again from.
#[derive(Debug, Default)]
pub(crate) struct Lit {
    pub points: Vec<[f64; 3]>,
    pub lit: Vec<usize>,
    pub stopped: u64,
}

/// An unseen step: the tick a foe was last alert on the player near its place, those alert on them now, and its
/// watchers once they stood.
#[derive(Debug, Default)]
pub(crate) struct Watched {
    pub seen: Option<u64>,
    pub alert: Vec<FighterId>,
    pub watchers: Option<Vec<FighterId>>,
}

/// A race: the next checkpoint, and the tick its clock started, as the player left the first checkpoint's reach.
#[derive(Debug, Default)]
pub(crate) struct Raced {
    pub next: usize,
    pub started: Option<u64>,
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
pub(crate) fn ahead(at: [f64; 2], bearing: f64, out: f64) -> [f64; 2] {
    [at[0] + libm::sin(bearing) * out, at[1] - libm::cos(bearing) * out]
}

pub(crate) fn apart(one: [f64; 2], two: [f64; 2]) -> f64 {
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

/// The point and bearing `along` a way: past its end, its end, facing as its last leg does.
#[must_use]
pub fn along_way(way: &[[f64; 2]], along: f64) -> ([f64; 2], f64) {
    let mut left = along.max(0.0);
    let legs: Vec<&[[f64; 2]]> = way.windows(2).filter(|leg| apart(leg[0], leg[1]) > 0.0).collect();
    for (at, leg) in legs.iter().enumerate() {
        let length = apart(leg[0], leg[1]);
        let bearing = libm::atan2(leg[1][0] - leg[0][0], leg[0][1] - leg[1][1]);
        if left <= length || at + 1 == legs.len() {
            let share = (left / length).min(1.0);
            return (
                [leg[0][0] + (leg[1][0] - leg[0][0]) * share, leg[0][1] + (leg[1][1] - leg[0][1]) * share],
                bearing,
            );
        }
        left -= length;
    }
    (way.first().copied().unwrap_or_default(), 0.0)
}

#[must_use]
pub fn way_length(way: &[[f64; 2]]) -> f64 {
    way.windows(2).map(|leg| apart(leg[0], leg[1])).sum()
}

/// A figure's look on the wire: a speaker's place in the cast plus 1, or a roster type's number plus 100.
fn look_of(who: Option<&str>, foe: Option<&str>) -> u16 {
    let speaker = who.and_then(speaker_place).map(|at| at + 1);
    let roster =
        foe.and_then(|foe| ::foes::ROSTER.iter().find(|it| it.name == foe)).map(|it| 100 + usize::from(it.number));
    u16::try_from(speaker.or(roster).unwrap_or(0)).unwrap_or(0)
}

impl Room {
    /// The paths of the node this room is, as its layout lays them, that a figure walks.
    pub fn set_paths(&mut self, paths: Vec<Vec<[f64; 2]>>) {
        self.lay_near(&paths);
        self.quests.paths = paths;
    }

    /// A place of this room by its name.
    #[must_use]
    pub fn place(&self, name: &str) -> Option<&Place> {
        self.quests.places.iter().find(|place| place.name == name)
    }

    pub(crate) fn place_named(&self, name: &str) -> Option<Place> {
        self.place(name).cloned()
    }

    /// The way between two places of this room, found once and kept.
    fn way(&mut self, from: &Place, to: &Place) -> Vec<[f64; 2]> {
        let key = (from.name.clone(), to.name.clone());
        if let Some(way) = self.quests.ways.get(&key) {
            return way.clone();
        }
        let way = way_between(&self.quests.paths, from, to);
        self.quests.ways.insert(key, way.clone());
        way
    }

    /// The step a player's task waits on in this node, if any: its goal's quest, task and place in the task.
    fn step_wanted(&self, player: PlayerId) -> Option<([usize; 3], &'static GoalDef)> {
        let node = self.quests.node.as_deref()?;
        let character = &self.players.get(&player)?.character;
        let (quest, task) = character.quest_now()?;
        let (goal, def) =
            character.goals_unmet().find(|(_, goal)| goal.kind().stepped() && goal.goal.node() == Some(node))?;
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
            if running != Some(key) && !self.begin_step(player, key, goal) {
                continue;
            }
            let goal = self.quests.steps.get(&player).map_or(goal, |step| step.goal);
            self.run_step(player, goal);
        }
    }

    /// A step begun: a figure at its way's start, a defence waiting for the player, a puzzle's points on the ground,
    /// an unseen step's watchers to stand. Whether it began: a puzzle waits a tick for its place's mesh.
    fn begin_step(&mut self, player: PlayerId, key: [usize; 3], goal: &'static GoalDef) -> bool {
        let kind = match &goal.goal {
            Goal::Escort(Escort { from, to, who, .. }) => {
                let Some(figure) = self.figure_at(from, to, Some(who), None) else { return false };
                Stepping::Figure(figure)
            }
            Goal::Tail(Tail { from, to, who, foe, .. }) => {
                let Some(figure) = self.figure_at(from, to, who.as_deref(), foe.as_deref()) else { return false };
                Stepping::Figure(figure)
            }
            Goal::Defend(_) => Stepping::Defence(Defence::default()),
            Goal::Puzzle(puzzle) => {
                let Some(middle) = self.place_named(&puzzle.place) else { return false };
                let reach = puzzle.points.iter().map(|point| point.at + POINT_NUDGE).fold(0.0, f64::max);
                let Some(ground) = self.ground_of(&middle, reach) else { return false };
                let mesh = self.mesh_by(ground);
                let from = held_near(mesh, &self.floor, middle.at, middle.radius);
                let points = puzzle.points.iter().map(|point| {
                    let [x, y] = ahead(middle.at, point.bearing.to_radians(), point.at);
                    // As far out as its place's middle, near where the walk starts.
                    let reach = POINT_NUDGE.max(point.at);
                    let reached = from.and_then(|from| reached_near(mesh, &self.floor, from, [x, y], reach));
                    // A place whose middle the mesh does not hold still puts its points on the mesh near them.
                    let held = reached.or_else(|| held_near(mesh, &self.floor, [x, y], POINT_NUDGE));
                    held.unwrap_or([x, y, self.floor.height_at(x, y)])
                });
                Stepping::Puzzle(Lit { points: points.collect(), ..Lit::default() })
            }
            Goal::Unseen(_) => Stepping::Unseen(Watched::default()),
            Goal::Race(_) => Stepping::Race(Raced::default()),
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
            | Goal::Wear(_) => return false,
        };
        if matches!(kind, Stepping::Figure(_)) {
            self.quests.arrived.remove(&player);
        }
        self.quests.steps.insert(player, Step { key, goal, fails: 0, kind });
        true
    }

    /// A figure waiting at the start of its way between two places of this room.
    fn figure_at(&mut self, from: &str, to: &str, who: Option<&str>, foe: Option<&str>) -> Option<Figure> {
        let (from, to) = (self.place_named(from)?, self.place_named(to)?);
        let way = self.way(&from, &to);
        let ([x, y], facing) = along_way(&way, 0.0);
        let at = [x, y, self.floor.height_at(x, y)];
        let look = look_of(who, foe);
        Some(Figure { look, way, along: 0.0, at, facing, state: WAITING, noticed: None, ambush: None })
    }

    /// A step ended, its task done or left: its ward, its waves, its ambush and its watchers leave with it; a figure
    /// that arrived stays standing for its player while they are here.
    pub(crate) fn end_step(&mut self, player: PlayerId) {
        let Some(step) = self.quests.steps.remove(&player) else { return };
        let gone = match step.kind {
            Stepping::Defence(defence) => defence.ward.into_iter().chain(defence.standing).collect(),
            Stepping::Figure(figure) => {
                let ambush = figure.ambush.clone().unwrap_or_default();
                if figure.state == ARRIVED {
                    self.quests.arrived.insert(player, figure);
                }
                ambush
            }
            Stepping::Unseen(watched) => watched.watchers.unwrap_or_default(),
            Stepping::Puzzle(_) | Stepping::Race(_) => Vec::new(),
        };
        self.send_away(&gone);
    }

    /// A player leaving the room: their step ends, and the figure they saw arrive goes.
    pub(crate) fn steps_left(&mut self, player: PlayerId) {
        self.end_step(player);
        self.quests.arrived.remove(&player);
    }

    /// Foes sent away at once: a ward or a wave leaving.
    pub(crate) fn send_away(&mut self, gone: &[FighterId]) {
        for id in gone {
            self.foes.remove(id);
            self.board.forget(*id);
            self.quiet.remove(id);
            self.ways.remove(id);
            self.quests.wards.remove(id);
            self.quests.spoilless.remove(id);
        }
    }

    /// Counts a failure of the player's step.
    pub(crate) fn failed(&mut self, player: PlayerId) {
        if let Some(step) = self.quests.steps.get_mut(&player) {
            step.fails = step.fails.saturating_add(1);
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
    }

    /// The player's step met: their quest log is told.
    pub(crate) fn stepped(&mut self, player: PlayerId, goal: &'static GoalDef) {
        let (Some(node), Some(anchor)) = (goal.goal.node(), goal.goal.anchor()) else { return };
        self.tell_quest(player, &Event::Stepped { kind: goal.kind(), node, anchor });
    }

    fn run_step(&mut self, player: PlayerId, goal: &'static GoalDef) {
        let Some(at) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]) else { return };
        match &goal.goal {
            Goal::Escort(escort) => self.walk_figure(player, goal, (escort.near, None, !escort.ambush.is_empty()), at),
            Goal::Tail(tail) => self.walk_figure(player, goal, (tail.near, Some(tail.far), false), at),
            Goal::Defend(defend) => self.defend(player, goal, defend, at),
            Goal::Unseen(unseen) => self.keep_unseen(player, goal, unseen, at),
            Goal::Race(race) => self.race(player, goal, race, at),
            Goal::Puzzle(_)
            | Goal::Talk(_)
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
            | Goal::Wear(_) => {}
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

#[cfg(test)]
#[path = "step_play_tests.rs"]
mod step_play_tests;
