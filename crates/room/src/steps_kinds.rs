//! Each step's run, a tick at a time: a figure walking, a defence's ward and waves, an unseen step's watchers, a race's
//! clock, a puzzle's points used; and what the player is sent of it, and where its mark stands.

use super::{
    ARRIVED, Defence, FIGURE_PACE, FIGURE_TURN, HELD, Lit, MOUNTING, NOTICED, POINT_REACH, RETRY_MOST, RETRY_TICKS,
    Raced, STOPPED_MOST, STOPPED_TICKS, Step, StepSeen, Stepping, WAITING, WALKING, WARD_HEALTH, WATCHED_WITHIN,
    Watched, ahead, along_way, apart, way_length,
};
use crate::foes::Foe;
use crate::garrison::SPREAD;
use crate::quests::foes_of;
use crate::{PlayerId, Room};
use ::foes::{Alertness, Rank, foe_type};
use combat::fighter::{FighterId, Side, Weight};
use core::f64::consts::{PI, TAU};
use gear::quests::{Defend, Goal, GoalDef, Place, Race, Unseen};
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
/// The streams a wave's, an ambush's and an unseen step's watchers' draws come from.
const WAVE_STREAM: u64 = 0x7761_7665;
const AMBUSH_STREAM: u64 = 0x616d_6275;
const WATCH_STREAM: u64 = 0x7761_7463;

/// What came of standing a wave: its foes; no room for it now (the foes' cap, or a mesh not yet baked), so it waits; or
/// no ground the mesh holds round any point it may stand at, so it stands nobody.
enum Stood {
    Foes(Vec<FighterId>),
    Waits,
    Nobody,
}

/// A wait twice as long each time, from `first` to `most`, by how many times it came.
pub(super) fn doubled(first: u64, most: u64, times: u16) -> u64 {
    (first << u32::from(times.saturating_sub(1)).min(8)).min(most)
}

impl Room {
    /// A figure's tick at `pace`: held while its ambush stands (or waits room to stand); walking back after it noticed
    /// the player (a tail), waiting at its way's start until `RETRY_TICKS` after; noticing a player nearer than `far`
    /// as it walks; with the player within `near`, waiting while they are `afoot` (an escort rides only with its
    /// player on their horse), else walking, its ambush standing as it passes halfway, and arriving at its way's end;
    /// else waiting. It turns to face its way at `FIGURE_TURN`, never at once, but turns about as it notices.
    pub(super) fn walk_figure(
        &mut self,
        player: PlayerId,
        goal: &'static GoalDef,
        (pace, near, far, ambushed, afoot): (f64, f64, Option<f64>, bool, bool),
        at: [f64; 2],
    ) {
        let (clock, step) = (self.clock, pace * TICK_SECONDS);
        let (foes, floor) = (&self.foes, &self.floor);
        let Some(Step { kind: Stepping::Figure(figure), .. }) = self.quests.steps.get_mut(&player) else { return };
        let standing = |ids: &Vec<FighterId>| ids.iter().any(|id| foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        let (length, away, before) = (way_length(&figure.way), apart(at, [figure.at[0], figure.at[1]]), figure.state);
        let (mut noticed, mut ambush, mut arrived) = (false, false, false);
        if figure.ambush.as_ref().is_some_and(standing) || figure.state == ARRIVED {
            figure.state = if figure.state == ARRIVED { ARRIVED } else { HELD };
        } else if figure.state == NOTICED {
            figure.along = (figure.along - step).max(0.0);
            if figure.along <= 0.0 && figure.noticed.is_some_and(|tick| clock >= tick + RETRY_TICKS) {
                (figure.state, figure.noticed) = (WAITING, None);
            }
        } else if figure.state == WALKING && far.is_some_and(|far| away < far) {
            (figure.state, figure.noticed, noticed) = (NOTICED, Some(clock), true);
        } else if away <= near && afoot {
            figure.state = MOUNTING;
        } else if away <= near {
            if ambushed && figure.ambush.is_none() && figure.along >= length / 2.0 {
                // It waits halfway, held only once its ambush stands, so the page never shouts one that is not there.
                (figure.state, ambush) = (WAITING, true);
            } else {
                figure.along = (figure.along + step).min(length);
                arrived = figure.along >= length;
                figure.state = if arrived { ARRIVED } else { WALKING };
            }
        } else {
            figure.state = WAITING;
        }
        let ([x, y], bearing) = along_way(&figure.way, figure.along);
        let aim = if figure.state == NOTICED { bearing + PI } else { bearing };
        // A quarry that notices the player, or walks again once back, turns about at once, never walking backwards.
        let about = (figure.state == NOTICED) != (before == NOTICED);
        let turn = if about { PI } else { FIGURE_TURN * TICK_SECONDS };
        let facing = libm::remainder(figure.facing + libm::remainder(aim - figure.facing, TAU).clamp(-turn, turn), TAU);
        let moved = [x, y] != [figure.at[0], figure.at[1]] || figure.state != before || facing != figure.facing;
        figure.at = [x, y, floor.height_at(x, y)];
        figure.facing = facing;
        let standing_at = figure.at;
        if noticed {
            self.failed(player);
        }
        if ambush {
            self.stand_ambush(player, goal, standing_at);
        }
        if arrived {
            self.stepped(player, goal);
        }
        if let Some(found) = self.players.get_mut(&player).filter(|_| moved) {
            found.gear_changed = true;
        }
    }

    /// An escort's ambush, standing round its figure on a mesh baked there, coming at the player, and holding the
    /// figure; it waits a tick while the room has no room for it or a mesh was baked this tick.
    fn stand_ambush(&mut self, player: PlayerId, goal: &'static GoalDef, at: [f64; 3]) {
        let Goal::Escort(escort) = &goal.goal else { return };
        let members = foes_of(escort.ambush.iter());
        if self.living_foes() + members.len() > self.others_most() {
            return;
        }
        let place = Place { name: format!("{} ambush", goal.text), at: [at[0], at[1]], radius: AMBUSH_REACH };
        let Some(ground) = self.ground_of(&place, AMBUSH_REACH + AMBUSH_OUT) else { return };
        let seed = self.world_seed ^ AMBUSH_STREAM ^ u64::from(player);
        let stood = self.stand_arriving(ground, place.at, AMBUSH_REACH, &members, AMBUSH_OUT, seed).unwrap_or_default();
        let target = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]);
        let clock = self.clock;
        for id in &stood {
            if let (Some(found), Some(target)) = (self.foes.get_mut(id), target) {
                found.brain.hunt(player, target, clock);
            }
        }
        // An ambush is its escort's one wave: stood before in this task, before a rejoin or a return, it drops nothing.
        let key = self.quests.steps.get(&player).map(|step| step.key);
        let quest = key.and_then(|key| gear::quests::quests().quests.get(key[0])).map(|quest| quest.id.as_str());
        let fought = self.players.get_mut(&player).zip(quest.zip(key)).is_some_and(|(found, (quest, key))| {
            !stood.is_empty() && found.character.quests.fought_wave(quest, key[2], 0)
        });
        if fought {
            self.quests.spoilless.extend(&stood);
        }
        if let Some(Step { kind: Stepping::Figure(figure), .. }) = self.quests.steps.get_mut(&player) {
            figure.state = if stood.is_empty() { figure.state } else { HELD };
            figure.ambush = Some(stood);
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
    }

    /// A defence's tick: with no ward, one stands at the place's middle as the player comes within its reach (once its
    /// wait is past, and the room has room for it and its first wave), with that wave; its ward fallen, the waves
    /// standing leave, a failure counts and it waits, longer each time; a wave fallen, or one that stood nobody, the
    /// next stands, and the last meets the goal.
    pub(super) fn defend(&mut self, player: PlayerId, goal: &'static GoalDef, defend: &'static Defend, at: [f64; 2]) {
        let Some(place) = self.place_named(&defend.place) else { return };
        let clock = self.clock;
        let Some(Step { fails, kind: Stepping::Defence(defence), .. }) = self.quests.steps.get(&player) else { return };
        let (ward, standing, retry, fails) = (defence.ward, defence.standing.clone(), defence.retry, *fails);
        let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
        let Some(ward) = ward else {
            let first = defend.waves.first().map_or(0, |wave| wave.len());
            let room = self.living_foes() + first <= self.others_most();
            if retry.is_some_and(|tick| clock < tick) || !place.holds(at, 0.0) || !room {
                return;
            }
            let Some(ground) = self.ground_of(&place, WAVE_OUT + WAVE_REACH) else { return };
            let Some(spot) = super::held_near(self.mesh_by(ground), &self.floor, place.at, place.radius) else {
                return;
            };
            let ward = self.stand_ward(spot);
            self.set_defence(player, |defence| *defence = Defence { ward: Some(ward), at: spot, ..Defence::default() });
            self.next_wave(player, goal, defend, &place, None);
            return;
        };
        if fallen(&ward) {
            let gone: Vec<FighterId> = standing.into_iter().chain([ward]).collect();
            self.send_away(&gone);
            let wait = doubled(RETRY_TICKS, RETRY_MOST, fails.saturating_add(1));
            self.set_defence(player, |defence| *defence = Defence { retry: Some(clock + wait), ..Defence::default() });
            self.failed(player);
        } else if standing.is_empty() {
            self.next_wave(player, goal, defend, &place, None);
        } else if standing.iter().all(fallen) {
            self.next_wave(player, goal, defend, &place, Some(ward));
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

    /// A defence's wave stood: the one due, or (the last fallen, `fallen` its ward) the next, or the goal met after
    /// the last. A wave that stands nobody counts as fallen at once; one waiting room stands a tick on.
    fn next_wave(
        &mut self,
        player: PlayerId,
        goal: &'static GoalDef,
        defend: &'static Defend,
        place: &Place,
        fallen: Option<FighterId>,
    ) {
        let Some(Step { kind: Stepping::Defence(defence), .. }) = self.quests.steps.get(&player) else { return };
        let (mut wave, ward) = (defence.wave + usize::from(fallen.is_some()), defence.ward);
        loop {
            if wave >= defend.waves.len() {
                self.send_away(&ward.into_iter().collect::<Vec<_>>());
                self.stepped(player, goal);
                return;
            }
            self.set_defence(player, |defence| (defence.wave, defence.standing) = (wave, Vec::new()));
            match self.stand_wave(player, defend, place) {
                Stood::Foes(stood) => {
                    self.set_defence(player, |defence| defence.standing = stood);
                    return;
                }
                Stood::Waits => return,
                Stood::Nobody => wave += 1,
            }
        }
    }

    /// A ward: a fighter on the players' side, unarmed and never staggered, that thinks nothing, is in no snapshot and
    /// counts against no cap.
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

    /// A defence's wave due, standing `WAVE_OUT` from its ward on the place's mesh and coming at it; after a failure in
    /// the task its foes drop nothing.
    fn stand_wave(&mut self, player: PlayerId, defend: &'static Defend, place: &Place) -> Stood {
        let Some(Step { key, fails, kind: Stepping::Defence(defence), .. }) = self.quests.steps.get(&player) else {
            return Stood::Nobody;
        };
        let (Some(ward), wave, ward_at, fails, key) = (defence.ward, defence.wave, defence.at, *fails, *key) else {
            return Stood::Nobody;
        };
        let Some(members) = defend.waves.get(wave).map(|list| foes_of(list.iter())) else { return Stood::Nobody };
        let mix = (key[0] << 16 | key[1] << 8 | key[2] | wave << 24) as u64 ^ u64::from(player) << 32;
        let seed = self.world_seed ^ WAVE_STREAM ^ mix;
        if self.living_foes() + members.len() > self.others_most() {
            return Stood::Waits;
        }
        let Some(ground) = self.ground_of(place, WAVE_OUT + WAVE_REACH) else { return Stood::Waits };
        let start = crate::garrison::draws_of(seed).draw() * TAU;
        let bearings = (0..WAVE_BEARINGS).map(|turn| start + TAU * f64::from(turn) / f64::from(WAVE_BEARINGS));
        let mut stood = Vec::new();
        for bearing in bearings {
            let centre = ahead([ward_at[0], ward_at[1]], bearing, WAVE_OUT);
            if let Some(ids) = self.stand_arriving(ground, centre, WAVE_REACH, &members, SPREAD, seed) {
                stood = ids;
                break;
            }
        }
        if stood.is_empty() {
            return Stood::Nobody;
        }
        // A wave the character stood before in this task, before a rejoin or a return, drops nothing again.
        let quest = gear::quests::quests().quests.get(key[0]).map(|quest| quest.id.as_str());
        let fought = self.players.get_mut(&player).zip(quest).is_some_and(|(found, quest)| {
            found.gear_changed = true;
            found.character.quests.fought_wave(quest, key[2], wave)
        });
        let clock = self.clock;
        for id in &stood {
            if let Some(found) = self.foes.get_mut(id) {
                found.brain.hunt(ward, ward_at, clock);
            }
            if fails > 0 || fought {
                self.quests.spoilless.insert(*id);
            }
        }
        Stood::Foes(stood)
    }

    /// An unseen step's tick: its watch stands idle on a ring `within` round the place's middle as it begins, each
    /// facing outward; a foe within `WATCHED_WITHIN` of the middle newly alert on the player counts a failure; standing
    /// within `within` of the middle, none alert on them for `RETRY_TICKS` since one last was, meets it.
    pub(super) fn keep_unseen(
        &mut self,
        player: PlayerId,
        goal: &'static GoalDef,
        unseen: &'static Unseen,
        at: [f64; 2],
    ) {
        let Some(place) = self.place_named(&unseen.place) else { return };
        let clock = self.clock;
        let waiting = matches!(
            self.quests.steps.get(&player),
            Some(Step { kind: Stepping::Unseen(Watched { watchers: None, .. }), .. })
        );
        if waiting && !unseen.spawn.is_empty() {
            let members = foes_of(unseen.spawn.iter());
            let Some(ground) = self
                .ground_of(&place, place.radius)
                .filter(|_| self.living_foes() + members.len() <= self.others_most())
            else {
                return;
            };
            let seed = self.world_seed ^ WATCH_STREAM ^ u64::from(player);
            let out = unseen.within;
            let stood = self.stand_arriving(ground, place.at, place.radius, &members, out, seed).unwrap_or_default();
            if let Some(Step { kind: Stepping::Unseen(watched), .. }) = self.quests.steps.get_mut(&player) {
                watched.watchers = Some(stood);
            }
        }
        let alert: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| !foe.fighter.dead() && foe.brain.target() == Some(player))
            .filter(|(_, foe)| foe.brain.alertness() == Alertness::Alert)
            .filter(|(_, foe)| apart([foe.fighter.body.x, foe.fighter.body.y], place.at) <= WATCHED_WITHIN)
            .map(|(id, _)| *id)
            .collect();
        let Some(Step { kind: Stepping::Unseen(watched), .. }) = self.quests.steps.get_mut(&player) else { return };
        let turned = alert.iter().any(|id| !watched.alert.contains(id));
        if !alert.is_empty() {
            watched.seen = Some(clock);
        }
        watched.alert = alert;
        let clear = watched.seen.is_none_or(|tick| clock >= tick + RETRY_TICKS);
        if turned {
            self.failed(player);
        }
        if clear && apart(at, place.at) <= unseen.within {
            self.stepped(player, goal);
        }
    }

    /// A race's tick: its clock run out, a failure counts and it starts again from the first checkpoint; the next
    /// checkpoint reached, and the last meets it. The clock starts as the player leaves the first's reach, or reaches
    /// the second within it.
    pub(super) fn race(&mut self, player: PlayerId, goal: &'static GoalDef, race: &'static Race, at: [f64; 2]) {
        let places: Vec<Place> = race.checkpoints.iter().filter_map(|name| self.place_named(name)).collect();
        if places.len() != race.checkpoints.len() {
            return;
        }
        let clock = self.clock;
        let Some(Step { kind: Stepping::Race(raced), .. }) = self.quests.steps.get_mut(&player) else { return };
        let late = raced.started.is_some_and(|tick| (clock - tick) as f64 * TICK_SECONDS > race.seconds);
        let (before, mut done) = ((raced.next, raced.started), false);
        if late {
            *raced = Raced::default();
        } else {
            if raced.next == 1 && raced.started.is_none() && !places[0].holds(at, 0.0) {
                raced.started = Some(clock);
            }
            if places.get(raced.next).is_some_and(|place| place.holds(at, 0.0)) {
                raced.next += 1;
                if raced.next > 1 {
                    raced.started = raced.started.or(Some(clock));
                }
                done = raced.next == places.len();
            }
        }
        let changed = (raced.next, raced.started) != before;
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

    /// A puzzle's point used (ask 66), within `POINT_REACH` of it: the next in its order (any not lit, where it has
    /// none) lights it, and the last meets the puzzle; any other puts every point out, counts a failure and stops uses
    /// a while, longer each time (`NOT_YET` meanwhile). One lit already, in any order, does nothing. 0 used, else why
    /// not.
    pub(crate) fn use_point(&mut self, player: PlayerId, point: u8) -> u8 {
        let clock = self.clock;
        let Some(at) = self.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]) else {
            return crate::asks::OUT_OF_REACH;
        };
        let Some(Step { goal, kind: Stepping::Puzzle(lit), .. }) = self.quests.steps.get_mut(&player) else {
            return crate::asks::OUT_OF_REACH;
        };
        let goal: &'static GoalDef = goal;
        let Goal::Puzzle(puzzle) = &goal.goal else { return crate::asks::OUT_OF_REACH };
        let point = usize::from(point);
        let Some(spot) = lit.points.get(point) else { return crate::asks::OUT_OF_REACH };
        if apart(at, [spot[0], spot[1]]) > POINT_REACH {
            return crate::asks::OUT_OF_REACH;
        }
        if clock < lit.stopped {
            return crate::asks::NOT_YET;
        }
        let right = match &puzzle.order {
            Some(order) => order.get(lit.lit.len()) == Some(&point),
            None if lit.lit.contains(&point) => return 0,
            None => true,
        };
        let done = right && lit.lit.len() + 1 == lit.points.len();
        if right {
            lit.lit.push(point);
        } else {
            lit.lit.clear();
        }
        if !right {
            self.failed(player);
            if let Some(Step { fails, kind: Stepping::Puzzle(lit), .. }) = self.quests.steps.get_mut(&player) {
                lit.stopped = clock + doubled(STOPPED_TICKS, STOPPED_MOST, *fails);
            }
        }
        if done {
            self.stepped(player, goal);
        }
        if let Some(found) = self.players.get_mut(&player) {
            found.gear_changed = true;
        }
        0
    }

    /// What a player is sent of their step here: a race's seconds left or a wait's (below 0 for none), each goal's
    /// failures this task, the puzzle's points (x, y, 1 lit or 0), their figure (look, x, y, z, facing, state: one that
    /// arrived stays) and their ward (x, y, its health's share).
    #[must_use]
    pub fn step_seen(&self, player: PlayerId) -> StepSeen {
        let counts = self.players.get(&player).map_or(0, |found| found.character.quest_counts().len());
        let mut seen = StepSeen { clock: -1.0, fails: vec![0; counts], ..StepSeen::default() };
        let figure = |figure: &super::Figure| {
            let [x, y, z] = figure.at;
            vec![f64::from(figure.look), x, y, z, figure.facing, f64::from(figure.state)]
        };
        if let Some(arrived) = self.quests.arrived.get(&player) {
            seen.figures = figure(arrived);
        }
        let Some(step) = self.quests.steps.get(&player) else { return seen };
        if let Some(fails) = seen.fails.get_mut(step.key[2]) {
            *fails = step.fails;
        }
        let clock = self.clock;
        let left = |until: u64| until.saturating_sub(clock) as f64 * TICK_SECONDS;
        match &step.kind {
            Stepping::Figure(walking) => {
                seen.figures = figure(walking);
                // A tail that noticed the player starts again once it waited and walked back, whichever is longer.
                let back = walking.along / FIGURE_PACE;
                seen.clock = walking.noticed.map_or(-1.0, |tick| left(tick + RETRY_TICKS).max(back));
            }
            Stepping::Defence(defence) => {
                let ward = defence.ward.and_then(|id| self.foes.get(&id)).filter(|foe| !foe.fighter.dead());
                if let Some(ward) = ward {
                    let share = ward.fighter.health / ward.fighter.health_max.max(1.0);
                    seen.ward = vec![defence.at[0], defence.at[1], share];
                }
                seen.clock = defence.retry.filter(|tick| clock < *tick).map_or(-1.0, left);
            }
            Stepping::Puzzle(Lit { points, lit, .. }) => {
                let shown =
                    |(at, point): (usize, &[f64; 3])| [point[0], point[1], f64::from(u8::from(lit.contains(&at)))];
                seen.points = points.iter().enumerate().flat_map(shown).collect();
            }
            Stepping::Unseen(Watched { seen: seen_at, .. }) => {
                seen.clock =
                    seen_at.filter(|tick| clock < tick + RETRY_TICKS).map_or(-1.0, |tick| left(tick + RETRY_TICKS));
            }
            Stepping::Race(Raced { started, .. }) => {
                let seconds = if let Goal::Race(race) = &step.goal.goal { race.seconds } else { 0.0 };
                seen.clock = started.map_or(-1.0, |tick| (seconds - (clock - tick) as f64 * TICK_SECONDS).max(0.0));
            }
        }
        seen
    }

    /// Where a stepped goal's mark stands for a player here: their figure (and the reach they keep within), the next
    /// checkpoint, the ward, or the place; before the step runs, its figure's first place or the first checkpoint.
    pub(crate) fn step_spot(&self, player: PlayerId, goal_at: usize, goal: &'static GoalDef) -> Option<[f64; 3]> {
        let spot = |name: &str| self.place(name).map(|place| [place.at[0], place.at[1], place.radius]);
        let step =
            self.quests.steps.get(&player).filter(|step| step.key[2] == goal_at && std::ptr::eq(step.goal, goal));
        let kind = step.map(|step| &step.kind);
        let walking = |near: f64| {
            let Some(Stepping::Figure(figure)) = kind else { return None };
            Some([figure.at[0], figure.at[1], near])
        };
        match &goal.goal {
            Goal::Escort(escort) => walking(escort.near).or_else(|| spot(&escort.from)),
            Goal::Tail(tail) => walking(tail.near).or_else(|| spot(&tail.from)),
            Goal::Race(race) => {
                let next = if let Some(Stepping::Race(raced)) = kind { raced.next } else { 0 };
                race.checkpoints.get(next).and_then(|name| spot(name))
            }
            Goal::Defend(defend) => {
                if let Some(Stepping::Defence(Defence { ward: Some(_), at, .. })) = kind {
                    Some([at[0], at[1], spot(&defend.place).map_or(0.0, |place| place[2])])
                } else {
                    spot(&defend.place)
                }
            }
            Goal::Puzzle(puzzle) => spot(&puzzle.place),
            Goal::Unseen(unseen) => spot(&unseen.place).map(|[x, y, _]| [x, y, unseen.within]),
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
}
