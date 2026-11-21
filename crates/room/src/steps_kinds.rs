//! Each step's run, a tick at a time: a figure walking, a defence's ward and waves, an unseen step's watchers, a race's
//! clock, a puzzle's points used; and what the player is sent of it.

use super::{
    ARRIVED, Defence, FIGURE_PACE, HELD, NOTICED, POINT_REACH, RETRY_TICKS, Step, StepSeen, Stepping, WAITING, WALKING,
    WARD_HEALTH, ahead, along_way, apart, foes_of, way_length,
};
use crate::foes::Foe;
use crate::{PlayerId, Room};
use ::foes::{Alertness, Rank, foe_type};
use combat::fighter::{FighterId, Side, Weight};
use core::f64::consts::{PI, TAU};
use gear::quests::{GoalDef, GoalKind};
use movement::{TICK_SECONDS, Terrain};
use std::collections::BTreeMap;

/// How far from its ward a wave stands, metres, give or take its reach to the mesh; and the bearings tried for it.
const WAVE_OUT: f64 = 27.5;
const WAVE_REACH: f64 = 2.5;
const WAVE_BEARINGS: u32 = 12;
/// How far round its figure an ambush stands, and the reach of the mesh it is baked round, metres.
const AMBUSH_OUT: f64 = 6.0;
const AMBUSH_REACH: f64 = 30.0;
/// A ward never staggers: its poise is past any blow's.
const WARD_POISE: f64 = 1.0e9;
/// The streams a wave's and an ambush's draws come from.
const WAVE_STREAM: u64 = 0x7761_7665;
const AMBUSH_STREAM: u64 = 0x616d_6275;

impl Room {
    /// A figure's tick: held while its ambush stands; walking back after it noticed the player (a tail), waiting at
    /// its way's start until `RETRY_TICKS` after; noticing a player nearer than `far` as it walks; walking while the
    /// player is within `near`, its ambush standing as it passes halfway, and arriving at its way's end; else waiting.
    pub(super) fn walk_figure(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 2]) {
        let (clock, near, step) = (self.clock, goal.near.unwrap_or(0.0), FIGURE_PACE * TICK_SECONDS);
        let (foes, floor) = (&self.foes, &self.floor);
        let Some(Step { kind: Stepping::Figure(figure), .. }) = self.quests.steps.get_mut(&player) else { return };
        let standing = |ids: &Vec<FighterId>| ids.iter().any(|id| foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        let (length, away, before) = (way_length(&figure.way), apart(at, [figure.at[0], figure.at[1]]), figure.state);
        let (mut noticed, mut ambushed, mut arrived) = (false, false, false);
        if figure.ambush.as_ref().is_some_and(standing) {
            figure.state = HELD;
        } else if figure.state == NOTICED {
            figure.along = (figure.along - step).max(0.0);
            if figure.along <= 0.0 && figure.noticed.is_some_and(|tick| clock >= tick + RETRY_TICKS) {
                (figure.state, figure.noticed) = (WAITING, None);
            }
        } else if figure.state == WALKING && goal.far.is_some_and(|far| away < far) {
            (figure.state, figure.noticed, noticed) = (NOTICED, Some(clock), true);
        } else if figure.state != ARRIVED && away <= near {
            if !goal.ambush.is_empty() && figure.ambush.is_none() && figure.along >= length / 2.0 {
                (figure.state, ambushed) = (HELD, true);
            } else {
                figure.along = (figure.along + step).min(length);
                arrived = figure.along >= length;
                figure.state = if arrived { ARRIVED } else { WALKING };
            }
        } else if figure.state != ARRIVED {
            figure.state = WAITING;
        }
        let ([x, y], bearing) = along_way(&figure.way, figure.along);
        let moved = [x, y] != [figure.at[0], figure.at[1]] || figure.state != before;
        figure.at = [x, y, floor.height_at(x, y)];
        figure.facing = if figure.state == NOTICED { bearing + PI } else { bearing };
        let standing_at = figure.at;
        if noticed {
            self.failed(player);
        }
        if ambushed {
            self.stand_ambush(player, goal, standing_at);
        }
        if arrived {
            self.stepped(player, goal);
        }
        if let Some(found) = self.players.get_mut(&player).filter(|_| moved) {
            found.gear_changed = true;
        }
    }

    /// An escort's ambush, standing round its figure on a mesh baked there, and coming at the player.
    fn stand_ambush(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 3]) {
        let name = format!("{} ambush", goal.text);
        let place = gear::quests::Place { name, at: [at[0], at[1]], radius: AMBUSH_REACH };
        let ground = self.ground_of(&place);
        let seed = self.world_seed ^ AMBUSH_STREAM;
        let members = foes_of(&goal.ambush);
        let stood = self.stand_arriving(ground, place.at, AMBUSH_REACH, &members, AMBUSH_OUT, seed).unwrap_or_default();
        let target = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]);
        self.hunt(&stood, player, target);
        if let Some(Step { kind: Stepping::Figure(figure), .. }) = self.quests.steps.get_mut(&player) {
            figure.ambush = Some(stood);
        }
    }

    /// Foes just stood come at a fighter where it stands.
    fn hunt(&mut self, foes: &[FighterId], target: PlayerId, at: Option<[f64; 3]>) {
        let (Some(at), clock) = (at, self.clock) else { return };
        for id in foes {
            if let Some(found) = self.foes.get_mut(id) {
                found.brain.hunt(target, at, clock);
            }
        }
    }

    /// A defence's tick: with no ward, one stands at the place's middle as the player comes within its reach (once its
    /// wait is past), with its first wave; its ward fallen, the waves standing leave, a failure counts and it waits;
    /// a wave fallen, the next stands, and the last fallen meets the goal.
    pub(super) fn defend(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 2]) {
        let Some(place) = goal.place.as_deref().and_then(|name| self.place_named(name)) else { return };
        let clock = self.clock;
        let Some(Step { kind: Stepping::Defence(defence), .. }) = self.quests.steps.get(&player) else { return };
        let (ward, wave, standing, retry) = (defence.ward, defence.wave, defence.standing.clone(), defence.retry);
        let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
        let Some(ward) = ward else {
            if retry.is_some_and(|tick| clock < tick) || !place.holds(at, 0.0) {
                return;
            }
            let ground = self.ground_of(&place);
            let mesh = &self.quests.grounds[ground].2;
            let Some(spot) = super::held_near(mesh, &self.floor, place.at, place.radius) else { return };
            let ward = self.stand_ward(spot);
            self.set_defence(player, |defence| *defence = Defence { ward: Some(ward), at: spot, ..Defence::default() });
            self.stand_wave(player, goal, &place);
            return;
        };
        if fallen(&ward) {
            let gone: Vec<FighterId> = standing.into_iter().chain([ward]).collect();
            self.send_away(&gone);
            self.set_defence(player, |defence| {
                *defence = Defence { retry: Some(clock + RETRY_TICKS), ..Defence::default() };
            });
            self.failed(player);
        } else if standing.is_empty() {
            self.stand_wave(player, goal, &place);
        } else if standing.iter().all(fallen) {
            if wave + 1 >= goal.waves.len() {
                self.send_away(&[ward]);
                self.stepped(player, goal);
            } else {
                self.set_defence(player, |defence| (defence.wave, defence.standing) = (wave + 1, Vec::new()));
                self.stand_wave(player, goal, &place);
            }
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
    }

    fn set_defence(&mut self, player: PlayerId, change: impl FnOnce(&mut Defence)) {
        if let Some(Step { kind: Stepping::Defence(defence), .. }) = self.quests.steps.get_mut(&player) {
            change(defence);
        }
    }

    /// A ward: a fighter on the players' side, unarmed and never staggered, that thinks nothing and is in no
    /// snapshot.
    fn stand_ward(&mut self, at: [f64; 3]) -> FighterId {
        let body = movement::blocks::ground_at(&self.blocks, &self.floor, at[0], at[1], at[2]);
        let mut fighter = combat::fighter(
            Side::Players,
            movement::Body { z: body, ..movement::standing(at[0], at[1]) },
            combat::arms::BARE_HANDS,
            Weight::Massive,
            WARD_HEALTH,
            WARD_POISE,
        );
        fighter.ally = true;
        let id = self.next_id();
        let brain = foe_type(::foes::roster::COLLECTOR).map(|it| ::foes::spawn(it, Rank::Major, at[0], at[1], 0.0).1);
        if let Some(brain) = brain {
            let struck_by = BTreeMap::new();
            self.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by, shield: None });
            self.quests.wards.insert(id);
        }
        id
    }

    /// A defence's next wave, standing `WAVE_OUT` from its ward on the place's mesh and coming at it.
    fn stand_wave(&mut self, player: PlayerId, goal: &'static GoalDef, place: &gear::quests::Place) {
        let Some(Step { key, kind: Stepping::Defence(defence), .. }) = self.quests.steps.get(&player) else { return };
        let (Some(ward), wave, ward_at) = (defence.ward, defence.wave, defence.at) else { return };
        let Some(members) = goal.waves.get(wave).map(|list| foes_of(list)) else { return };
        let seed = self.world_seed ^ WAVE_STREAM ^ (key[0] << 16 | key[1] << 8 | key[2] | wave << 24) as u64;
        let ground = self.ground_of(place);
        let start = crate::garrison::draws_of(seed).draw() * TAU;
        let bearings = (0..WAVE_BEARINGS).map(|turn| start + TAU * f64::from(turn) / f64::from(WAVE_BEARINGS));
        let mut stood = Vec::new();
        for bearing in bearings {
            let centre = ahead([ward_at[0], ward_at[1]], bearing, WAVE_OUT);
            if let Some(ids) = self.stand_arriving(ground, centre, WAVE_REACH, &members, crate::garrison::SPREAD, seed)
            {
                stood = ids;
                break;
            }
        }
        let clock = self.clock;
        for id in &stood {
            if let Some(found) = self.foes.get_mut(id) {
                found.brain.hunt(ward, ward_at, clock);
            }
        }
        self.set_defence(player, |defence| defence.standing = stood);
    }

    /// An unseen step's tick: a foe newly alert on the player counts a failure; standing within the place's reach with
    /// none alert on them for `RETRY_TICKS` meets it.
    pub(super) fn keep_unseen(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 2]) {
        let Some(place) = goal.place.as_deref().and_then(|name| self.place_named(name)) else { return };
        let clock = self.clock;
        let alert: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| !foe.fighter.dead() && foe.brain.target() == Some(player))
            .filter(|(_, foe)| foe.brain.alertness() == Alertness::Alert)
            .map(|(id, _)| *id)
            .collect();
        let Some(Step { kind: Stepping::Unseen(seen, before), .. }) = self.quests.steps.get_mut(&player) else {
            return;
        };
        let turned = alert.iter().any(|id| !before.contains(id));
        if !alert.is_empty() {
            *seen = Some(clock);
        }
        *before = alert;
        let clear = seen.is_none_or(|tick| clock >= tick + RETRY_TICKS);
        if turned {
            self.failed(player);
        }
        if clear && place.holds(at, 0.0) {
            self.stepped(player, goal);
        }
    }

    /// A race's tick: its clock run out, a failure counts and it starts again from the first checkpoint; the next
    /// checkpoint reached, the clock starts at the first, and the last meets it.
    pub(super) fn race(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 2]) {
        let places: Vec<_> = goal.checkpoints.iter().filter_map(|name| self.place_named(name)).collect();
        let (clock, seconds) = (self.clock, goal.seconds.unwrap_or(0.0));
        if places.len() != goal.checkpoints.len() {
            return;
        }
        let Some(Step { kind: Stepping::Race(next, started), .. }) = self.quests.steps.get_mut(&player) else { return };
        let late = started.is_some_and(|tick| clock as f64 > tick as f64 + seconds / TICK_SECONDS);
        let (before, mut done) = (*next, false);
        if late {
            (*next, *started) = (0, None);
        } else if places.get(*next).is_some_and(|place| place.holds(at, 0.0)) {
            if *next == 0 {
                *started = Some(clock);
            }
            *next += 1;
            done = *next == places.len();
        }
        let changed = *next != before;
        if late {
            self.failed(player);
        }
        if done {
            self.stepped(player, goal);
        }
        if let Some(found) = self.players.get_mut(&player).filter(|_| changed) {
            found.gear_changed = true;
        }
    }

    /// A puzzle's point used (ask 66), within `POINT_REACH` of it: the next in its order lights it, and the last meets
    /// the puzzle; any other puts every point out and counts a failure. 0 used, else why not.
    pub(crate) fn use_point(&mut self, player: PlayerId, point: u8) -> u8 {
        let Some(at) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]) else {
            return crate::asks::OUT_OF_REACH;
        };
        let Some(Step { goal, kind: Stepping::Puzzle(points, lit), .. }) = self.quests.steps.get_mut(&player) else {
            return crate::asks::OUT_OF_REACH;
        };
        let goal: &'static GoalDef = goal;
        let Some(spot) = points.get(usize::from(point)) else { return crate::asks::OUT_OF_REACH };
        if apart(at, [spot[0], spot[1]]) > POINT_REACH {
            return crate::asks::OUT_OF_REACH;
        }
        let right = goal.order.get(*lit) == Some(&usize::from(point));
        *lit = if right { *lit + 1 } else { 0 };
        let done = right && *lit == points.len();
        if !right {
            self.failed(player);
        }
        if done {
            self.stepped(player, goal);
        }
        0
    }

    /// What a player is sent of their step here: a race's seconds left or a wait's (below 0 for none), each goal's
    /// failures this task, the puzzle's points (x, y, 1 lit or 0), their figure (look, x, y, z, facing, state) and
    /// their ward (x, y, its health's share).
    #[must_use]
    pub fn step_seen(&self, player: PlayerId) -> StepSeen {
        let counts = self.players.get(&player).map_or(0, |found| found.character.quest_counts().len());
        let mut seen = StepSeen { clock: -1.0, fails: vec![0; counts], ..StepSeen::default() };
        let Some(step) = self.quests.steps.get(&player) else { return seen };
        if let Some(fails) = seen.fails.get_mut(step.key[2]) {
            *fails = step.fails;
        }
        let clock = self.clock;
        let left = |until: u64| until.saturating_sub(clock) as f64 * TICK_SECONDS;
        match &step.kind {
            Stepping::Figure(figure) => {
                let [x, y, z] = figure.at;
                seen.figures = vec![f64::from(figure.look), x, y, z, figure.facing, f64::from(figure.state)];
                seen.clock = figure.noticed.map_or(-1.0, |tick| left(tick + RETRY_TICKS));
            }
            Stepping::Defence(defence) => {
                let ward = defence.ward.and_then(|id| self.foes.get(&id)).filter(|foe| !foe.fighter.dead());
                if let Some(ward) = ward {
                    let share = ward.fighter.health / ward.fighter.health_max.max(1.0);
                    seen.ward = vec![defence.at[0], defence.at[1], share];
                }
                seen.clock = defence.retry.filter(|tick| clock < *tick).map_or(-1.0, left);
            }
            Stepping::Puzzle(points, lit) => {
                let order = &step.goal.order[..(*lit).min(step.goal.order.len())];
                let lit = |at: usize| f64::from(u8::from(order.contains(&at)));
                seen.points = points.iter().enumerate().flat_map(|(at, point)| [point[0], point[1], lit(at)]).collect();
            }
            Stepping::Unseen(seen_at, _) => {
                seen.clock =
                    seen_at.filter(|tick| clock < tick + RETRY_TICKS).map_or(-1.0, |tick| left(tick + RETRY_TICKS));
            }
            Stepping::Race(_, started) => {
                let seconds = step.goal.seconds.unwrap_or(0.0);
                seen.clock = started.map_or(-1.0, |tick| (seconds - (clock - tick) as f64 * TICK_SECONDS).max(0.0));
            }
        }
        seen
    }

    /// Where a stepped goal's mark stands for a player here: their figure (and the reach they keep within), the next
    /// checkpoint, the ward, or the place; before the step runs, its figure's first place or the first checkpoint.
    pub(crate) fn step_spot(&self, player: PlayerId, goal_at: usize, goal: &'static GoalDef) -> Option<[f64; 3]> {
        let spot = |name: &str| self.place_named(name).map(|place| [place.at[0], place.at[1], place.radius]);
        let step =
            self.quests.steps.get(&player).filter(|step| step.key[2] == goal_at && std::ptr::eq(step.goal, goal));
        match (step.map(|step| &step.kind), goal.kind) {
            (Some(Stepping::Figure(figure)), _) => Some([figure.at[0], figure.at[1], goal.near.unwrap_or(0.0)]),
            (Some(Stepping::Race(next, _)), _) => goal.checkpoints.get(*next).and_then(|name| spot(name)),
            (Some(Stepping::Defence(defence)), _) if defence.ward.is_some() => {
                let reach = goal.place.as_deref().and_then(spot).map_or(0.0, |place| place[2]);
                Some([defence.at[0], defence.at[1], reach])
            }
            (_, GoalKind::Escort | GoalKind::Tail) => goal.from.as_deref().and_then(spot),
            (_, GoalKind::Race) => goal.checkpoints.first().and_then(|name| spot(name)),
            _ => goal.place.as_deref().and_then(spot),
        }
    }
}
