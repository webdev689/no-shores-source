//! A garrison's groups as Bungie leads them. Each group has a leader, its highest rank: when it falls the others
//! break, one of them raging. Half a group fallen, it defends its ground at its post. A Grey Tithe leader is screened
//! by its lower ranks until they are gone, standing behind a shield-bearer of them. A mission's or a dungeon's
//! garrison is one encounter that gives ground as it falls, Halo's territory, fallback and last stand: more than
//! three quarters of it standing, each group holds its own post; more than half, each falls back halfway to the post
//! farthest from the spawns; less, all gather there to defend it, and the fall of the highest rank there breaks them.
//! A mission's reserve comes in a wave as it falls back and another as it makes its last stand, hunting the players.

use super::{PATROL, POSTS_APART, Post, SPAWN_CLEAR, SPREAD, draws_of, gird_of, ground_middle, index, open_points};
use crate::Room;
use ::foes::roles::Role;
use ::foes::tuning::{DEFEND, ENGAGE_RANGE};
use ::foes::{Alertness, Mood, Orders, Rank, faction, foe_type};
use combat::Status;
use combat::arms::OffHand;
use combat::fighter::FighterId;
use combat::sight::apart;
use core::f64::consts::TAU;
use movement::Terrain;
use reach::{Section, inside};
use std::collections::BTreeMap;

/// The waves are drawn from a stream of their own, apart from the garrison's and the beats'; a wave stands this far
/// from every foe standing; and no two places a group gathers at stand nearer than a body's room.
const WAVE_STREAM: u64 = 0x7761_7665;
const WAVE_CLEAR: f64 = 4.0 * SPREAD;
const ROOM: f64 = 1.0;

/// How far a mission's or a dungeon's garrison has given ground.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Stage {
    Territory,
    Fallback,
    LastStand,
}

/// A mission's or a dungeon's garrison as one encounter: how far it has given ground, the post its last stand
/// gathers at, the last stand's leader and whether its fall broke it, whether waves come (a mission's) and how many
/// have come since it last held its territory, how many ever have (each drawn apart), and the island's band of levels
/// they stand at.
#[derive(Debug)]
pub(crate) struct Encounter {
    pub stage: Stage,
    pub last_stand: [f64; 3],
    pub leader: Option<FighterId>,
    pub broken: bool,
    pub waves: Option<u8>,
    pub called: u32,
    pub levels: Option<(u8, u8)>,
}

/// What makes a leader: rank, and a Captain first among equals.
fn standing_of(rank: Rank, role: Role) -> (Rank, bool) {
    (rank, role == Role::Captain)
}

/// A group's leader among the foes of `ids`: its highest rank, a Captain first among equals, else the first of them.
pub(crate) fn leader_of(room: &Room, ids: &[FighterId]) -> Option<FighterId> {
    let mut best: Option<(FighterId, (Rank, bool))> = None;
    for id in ids {
        let Some(foe) = room.foes.get(id) else { continue };
        let standing = standing_of(foe.brain.rank, foe.brain.role());
        if best.is_none_or(|(_, held)| standing > held) {
            best = Some((*id, standing));
        }
    }
    best.map(|(id, _)| id)
}

/// The order a broken group's raging foe is chosen in: a brute, then a skirmisher, then a swordsman; never a shooter
/// nor a captain.
fn rage_order(role: Role) -> Option<u8> {
    match role {
        Role::Brute => Some(0),
        Role::Skirmisher => Some(1),
        Role::Swordsman => Some(2),
        Role::Archer | Role::Captain => None,
    }
}

impl Room {
    /// The living foes of a post's group, in the order they stood.
    fn living(&self, post: usize) -> Vec<FighterId> {
        let alive = |id: &&FighterId| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead());
        self.garrison[post].standing.iter().filter(alive).copied().collect()
    }

    /// The garrison's own living foes, its waves left out: all gathered at its last stand once it makes it.
    fn gathered(&self) -> Vec<FighterId> {
        let own = (0..self.garrison.len()).filter(|post| !self.garrison[*post].arrival);
        own.flat_map(|post| self.living(post)).collect()
    }

    fn alive(&self, id: FighterId) -> bool {
        self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead())
    }

    /// An encounter for a garrison just stood: its last stand at the post farthest from the spawns, each group's place
    /// to fall back to halfway along the navmesh's way there.
    pub(crate) fn encounter_of(
        &mut self,
        section: &Section,
        mission: bool,
        levels: Option<(u8, u8)>,
    ) -> Option<Encounter> {
        let from_spawns = |at: [f64; 3]| {
            section.spawns.iter().map(|&[x, y]| apart([at[0], at[1]], [x, y])).fold(f64::INFINITY, f64::min)
        };
        let last_stand = self
            .garrison
            .iter()
            .map(|post| post.at)
            .reduce(|best, at| if from_spawns(at) > from_spawns(best) { at } else { best })?;
        for post in 0..self.garrison.len() {
            let from = self.garrison[post].at;
            self.garrison[post].fallback = self.halfway(from, last_stand, section).unwrap_or(from);
        }
        Some(Encounter {
            stage: Stage::Territory,
            last_stand,
            leader: None,
            broken: false,
            waves: mission.then_some(0),
            called: 0,
            levels,
        })
    }

    /// The point halfway along the navmesh's way from one post to another, on the mesh, inside the section and clear of
    /// every spawn; none where there is no such way or point.
    fn halfway(&self, from: [f64; 3], to: [f64; 3], section: &Section) -> Option<[f64; 3]> {
        let path = self.mesh_at(from).find_path(from, to)?;
        let legs: Vec<f64> = path.windows(2).map(|leg| apart([leg[0][0], leg[0][1]], [leg[1][0], leg[1][1]])).collect();
        let mut left = legs.iter().sum::<f64>() / 2.0;
        let mut point = from;
        for (leg, length) in path.windows(2).zip(&legs) {
            if left <= *length {
                let share = if *length > 0.0 { left / length } else { 0.0 };
                point = core::array::from_fn(|axis| leg[0][axis] + (leg[1][axis] - leg[0][axis]) * share);
                break;
            }
            left -= length;
        }
        let point = self.mesh_at(point).nearest_point(point)?;
        let clear = section.spawns.iter().all(|&[x, y]| apart([point[0], point[1]], [x, y]) >= SPAWN_CLEAR);
        (clear && inside(&section.ring, point[0], point[1])).then_some(point)
    }

    /// Each tick: the encounter's ground, then each group's leader, its breaking point, its places and its orders, and
    /// the last stand's leader.
    pub(crate) fn lead_groups(&mut self) {
        let stage = self.give_ground();
        for post in 0..self.garrison.len() {
            self.break_on_fall(post);
            self.defend_at_half(post);
        }
        let anchors: Vec<Option<[f64; 3]>> = (0..self.garrison.len()).map(|post| self.anchor_of(post, stage)).collect();
        let placing = self.placing(stage, &anchors);
        for (post, anchor) in anchors.into_iter().enumerate() {
            self.keep_anchor(post, anchor, &placing);
            self.give_orders(post, stage);
        }
        self.break_last_stand(stage);
    }

    /// The encounter's stage by the share of its garrison standing (its waves not counted): more than three quarters,
    /// its territory; more than half, its fallback; else its last stand. Giving ground, a mission calls a wave; its
    /// last stand begun, or begun again by groups standing again, the highest rank standing there leads it; holding its
    /// territory again, all of that begins anew, its waves once none of the last stands.
    fn give_ground(&mut self) -> Option<Stage> {
        let encounter = self.encounter.as_ref()?;
        let was = encounter.stage;
        let (mut stood, mut living) = (0, 0);
        for post in (0..self.garrison.len()).filter(|post| !self.garrison[*post].arrival) {
            stood += self.garrison[post].standing.len();
            living += self.living(post).len();
        }
        let stage = if living * 4 > stood * 3 {
            Stage::Territory
        } else if living * 2 > stood {
            Stage::Fallback
        } else {
            Stage::LastStand
        };
        let leaderless = encounter.leader.is_none() && !encounter.broken;
        let waves_stand =
            (0..self.garrison.len()).any(|post| self.garrison[post].arrival && !self.living(post).is_empty());
        if stage == Stage::Territory && !waves_stand {
            // Holding its territory with no wave of before standing, its waves may come again.
            let encounter = self.encounter.as_mut()?;
            encounter.waves = encounter.waves.map(|_| 0);
        }
        if stage == was && !(stage == Stage::LastStand && leaderless) {
            return Some(stage);
        }
        let everyone = self.gathered();
        let leader = (stage == Stage::LastStand).then(|| leader_of(self, &everyone)).flatten();
        let encounter = self.encounter.as_mut()?;
        encounter.stage = stage;
        match stage {
            Stage::Territory => (encounter.leader, encounter.broken) = (None, false),
            Stage::LastStand => (encounter.leader, encounter.broken) = (leader, false),
            Stage::Fallback => {}
        }
        let waves = encounter.waves;
        // A wave for each stage the mission gives up, however many at once.
        if stage > was
            && let Some(came) = waves
            && came < stage as u8
        {
            for _ in came..stage as u8 {
                self.arrive();
            }
            if let Some(encounter) = self.encounter.as_mut() {
                encounter.waves = Some(stage as u8);
            }
        }
        Some(stage)
    }

    /// A group whose leader has fallen breaks, once a standing: each of the rest that is stirred breaks.
    fn break_on_fall(&mut self, post: usize) {
        let found = &self.garrison[post];
        if found.broken || found.leader.is_none_or(|leader| self.alive(leader)) {
            return;
        }
        self.garrison[post].broken = true;
        let followers = self.living(post);
        self.break_foes(&followers);
    }

    /// A group standing again at the last stand takes the last stand's leader afresh, as the next tick picks one.
    pub(crate) fn renew_last_stand(&mut self) {
        if let Some(encounter) = self.encounter.as_mut()
            && encounter.stage == Stage::LastStand
        {
            (encounter.leader, encounter.broken) = (None, false);
        }
    }

    /// No wave comes for the encounter until its garrison holds its territory again.
    pub(crate) fn no_waves(&mut self) {
        if let Some(encounter) = self.encounter.as_mut() {
            encounter.waves = encounter.waves.map(|_| Stage::LastStand as u8);
        }
    }

    /// The last stand's leader fallen, every foe of the garrison standing there breaks, once.
    fn break_last_stand(&mut self, stage: Option<Stage>) {
        let Some(encounter) = self.encounter.as_ref() else { return };
        if stage != Some(Stage::LastStand) || encounter.broken || encounter.leader.is_none_or(|id| self.alive(id)) {
            return;
        }
        if let Some(encounter) = self.encounter.as_mut() {
            encounter.broken = true;
        }
        let everyone = self.gathered();
        self.break_foes(&everyone);
    }

    /// Breaks the foes of `ids` that are stirred and not walking home: one rages, a brute first, then a skirmisher,
    /// then a swordsman, the one nearest its target (none if one of them already rages); the rest break by their role.
    fn break_foes(&mut self, ids: &[FighterId]) {
        let tick = self.clock;
        let stirred = |id: &&FighterId| {
            self.foes.get(id).is_some_and(|foe| {
                !foe.fighter.dead() && !foe.brain.returning() && foe.brain.alertness() != Alertness::Idle
            })
        };
        let breaking: Vec<FighterId> = ids.iter().filter(stirred).copied().collect();
        let rages = breaking.iter().any(|id| self.foes[id].brain.mood(tick) == Mood::Raging);
        let rager = if rages { None } else { self.rager_of(&breaking) };
        for id in breaking {
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.breaks(tick, Some(id) == rager);
            }
        }
    }

    fn rager_of(&self, ids: &[FighterId]) -> Option<FighterId> {
        // Only a foe that fights may rage: a rage lasts as long as its fight.
        let candidates = ids.iter().filter_map(|id| {
            let foe = self.foes.get(id)?;
            let order = rage_order(foe.brain.role())?;
            let body = foe.fighter.body;
            let target = Some(foe.brain.fights()?).and_then(|target| self.fighter(target));
            let near = target.map_or(f64::INFINITY, |other| apart([body.x, body.y], [other.body.x, other.body.y]));
            Some((order, near, *id))
        });
        candidates
            .min_by(|one, two| one.0.cmp(&two.0).then(one.1.total_cmp(&two.1)).then(one.2.cmp(&two.2)))
            .map(|(_, _, id)| id)
    }

    /// Half the foes a group stood fallen, it defends its ground from then until it stands again.
    fn defend_at_half(&mut self, post: usize) {
        // A wave comes on, whatever it loses.
        if self.garrison[post].arrival {
            return;
        }
        let stood = self.garrison[post].standing.len();
        let living = self.living(post).len();
        if stood > 1 && living > 0 && (stood - living) * 2 >= stood {
            self.garrison[post].defending = true;
        }
    }

    /// Where a group's places are gathered: round its post once it defends, at its fallback as the encounter falls back,
    /// at the last stand's post for its last stand; else its post and its beat as ever. A wave holds where it came.
    fn anchor_of(&self, post: usize, stage: Option<Stage>) -> Option<[f64; 3]> {
        let found = &self.garrison[post];
        let encounter = self.encounter.as_ref();
        match stage {
            _ if found.arrival => None,
            Some(Stage::LastStand) => encounter.map(|encounter| encounter.last_stand),
            Some(Stage::Fallback) => Some(found.fallback),
            _ => found.defending.then_some(found.at),
        }
    }

    /// Gives a group's foes their places round its anchor, each tick, and those fighting fall back to them as it moves:
    /// at the last stand, its own places there or its place in the `gathering`. With none, a group holding its post
    /// goes back to its places there, and one on a beat walks it again.
    fn keep_anchor(&mut self, post: usize, anchor: Option<[f64; 3]>, placing: &BTreeMap<FighterId, ([f64; 3], f64)>) {
        let was = core::mem::replace(&mut self.garrison[post].anchor, anchor);
        let living = self.living(post);
        let stood = self.stood_places(post, &living);
        let places: Vec<([f64; 3], f64)> = match anchor {
            Some(_) => living.iter().zip(stood).map(|(id, own)| placing.get(id).copied().unwrap_or(own)).collect(),
            None if was.is_some() && self.garrison[post].beat.is_none() => stood,
            None => return,
        };
        let moved = anchor.is_some() && was != anchor;
        for (id, (place, facing)) in living.iter().zip(places) {
            let Some(foe) = self.foes.get_mut(id) else { continue };
            foe.brain.keep_to(place, facing, false);
            if moved {
                foe.brain.fall_back();
            }
        }
    }

    /// Each living foe's own place at its post, as it stood.
    fn stood_places(&self, post: usize, living: &[FighterId]) -> Vec<([f64; 3], f64)> {
        let found = &self.garrison[post];
        let place = |id: &FighterId| {
            let at = found.standing.iter().position(|stood| stood == id)?;
            found.members.get(at).map(|&(_, _, place, facing)| (place, facing))
        };
        living.iter().map(|id| place(id).unwrap_or((found.at, 0.0))).collect()
    }

    /// The places of every foe its group gathers on a ring, each its own and kept as others fall: round its fallback
    /// point, a slot for each foe its group stood; at the last stand, one ring round it, a slot for each foe of the
    /// gathered groups. A place within a body's room of one laid before it, a ring's or a group's at its own post or
    /// its wave's, moves on round its ring, then out a ring.
    fn placing(&self, stage: Option<Stage>, anchors: &[Option<[f64; 3]>]) -> BTreeMap<FighterId, ([f64; 3], f64)> {
        let mut laid: Vec<[f64; 3]> = Vec::new();
        let mut placing = BTreeMap::new();
        let last = self.encounter.as_ref().map(|encounter| encounter.last_stand);
        let gathered = |post: usize| stage == Some(Stage::LastStand) && !self.garrison[post].arrival;
        let ringed = |post: usize| {
            let at = self.garrison[post].at;
            anchors[post].is_some_and(|point| point != at) && !(gathered(post) && Some(at) == last)
        };
        // Places a group keeps where it stood, at its own post or where its wave came, are laid first.
        let kept = |post: usize| (anchors[post].is_some() || self.garrison[post].arrival) && !ringed(post);
        for post in (0..self.garrison.len()).filter(|post| kept(*post)) {
            let living = self.living(post);
            laid.extend(self.stood_places(post, &living).into_iter().map(|(place, _)| place));
        }
        let alive = |id: &FighterId| self.alive(*id);
        if let Some(last) = last.filter(|_| stage == Some(Stage::LastStand)) {
            let come = (0..self.garrison.len()).filter(|post| gathered(*post) && self.garrison[*post].at != last);
            let slots: Vec<FighterId> = come.flat_map(|post| self.garrison[post].standing.clone()).collect();
            let count = slots.len().max(1) as f64;
            for (slot, id) in slots.iter().enumerate().filter(|(_, id)| alive(id)) {
                let place = self.spaced(last, 2.0 * SPREAD, TAU * slot as f64 / count, &mut laid);
                placing.insert(*id, place);
            }
        }
        for post in (0..self.garrison.len()).filter(|post| ringed(*post) && !gathered(*post)) {
            let Some(point) = anchors[post] else { continue };
            let standing = &self.garrison[post].standing;
            let count = standing.len().max(1) as f64;
            // Each group starts its ring at its own turn, so two falling back near each other do not meet.
            let start = TAU * post as f64 / self.garrison.len().max(1) as f64 / count;
            for (slot, id) in standing.iter().enumerate().filter(|(_, id)| alive(id)) {
                let place = self.spaced(point, SPREAD, start + TAU * slot as f64 / count, &mut laid);
                placing.insert(*id, place);
            }
        }
        placing
    }

    /// A place `out` round a point at `turn`, facing out from it, on the navmesh and a body's room from every place
    /// `laid`: tried round its ring by twelfths of a turn, then a ring farther out; laid itself once found.
    fn spaced(&self, point: [f64; 3], out: f64, turn: f64, laid: &mut Vec<[f64; 3]>) -> ([f64; 3], f64) {
        let at = |out: f64, facing: f64| {
            let (x, y) = (point[0] + libm::sin(facing) * out, point[1] - libm::cos(facing) * out);
            self.mesh_at(point).nearest_point([x, y, self.floor.height_at(x, y)]).unwrap_or(point)
        };
        let clear =
            |place: [f64; 3]| laid.iter().all(|other| apart([place[0], place[1]], [other[0], other[1]]) >= ROOM);
        let tries = (0..3).flat_map(|ring| {
            (0..12).map(move |step| (out + f64::from(ring) * SPREAD, turn + TAU * f64::from(step) / 12.0))
        });
        let found = tries.map(|(out, facing)| (at(out, facing), facing)).find(|(place, _)| clear(*place));
        let (place, facing) = found.unwrap_or_else(|| (at(out, turn), turn));
        laid.push(place);
        (place, facing)
    }

    /// What each foe of a group is asked: to defend its ground while its group does or makes its last stand (not a
    /// wave, which comes on); and, for the leader of a group of a faction whose leaders fight screened, to wait behind
    /// its followers of lower rank while one that is not broken fights hand to hand at its target, behind the nearest
    /// shield-bearer of them, and to go in at once once none of them stands unbroken.
    fn give_orders(&mut self, post: usize, stage: Option<Stage>) {
        let tick = self.clock;
        let found = &self.garrison[post];
        let defend = found.defending || (stage == Some(Stage::LastStand) && !found.arrival);
        let living = self.living(post);
        let leader = found.leader.filter(|id| living.contains(id));
        let fights = leader.and_then(|id| self.foes[&id].brain.fights());
        // A Miniboss or a Boss fights from its first phase, its escort screening nothing.
        let fronted = leader.is_some_and(|id| {
            let brain = &self.foes[&id].brain;
            // A shooter leads from where it shoots, behind no screen.
            brain.rank < Rank::Miniboss
                && brain.role() != Role::Archer
                && faction(brain.foe_type.faction).is_some_and(|faction| faction.screens)
        });
        let rank = leader.map(|id| self.foes[&id].brain.rank);
        let below = |number: u8, of: Rank| {
            rank.is_some_and(|rank| of < rank) && foe_type(number).is_some_and(|foe_type| foe_type.role != Role::Archer)
        };
        let screens = |id: &&FighterId| {
            let brain = &self.foes[*id].brain;
            below(brain.foe_type.number, brain.rank) && brain.mood(tick) != Mood::Broken
        };
        let screen: Vec<FighterId> = living.iter().filter(screens).copied().collect();
        // A follower screens it only while it fights there: at its target within its range, neither falling back nor
        // holding ground away from it.
        let target = fights.and_then(|target| self.fighter(target)).map(|target| [target.body.x, target.body.y]);
        let engaged = |id: &FighterId| {
            let foe = &self.foes[id];
            let body = [foe.fighter.body.x, foe.fighter.body.y];
            let held = foe.brain.orders().defend
                && foe.brain.home().zip(target).is_some_and(|(home, at)| apart([home.at[0], home.at[1]], at) > DEFEND);
            foe.brain.fights() == fights
                && target.is_some_and(|at| apart(body, at) <= ENGAGE_RANGE)
                && !foe.brain.falling_back()
                && !held
        };
        let at_target: Vec<FighterId> = screen.iter().copied().filter(engaged).collect();
        let screened = fronted && fights.is_some() && !at_target.is_empty();
        let shields = at_target.iter().filter(|id| self.foes[*id].fighter.arms.off_hand == OffHand::Shield);
        let behind = leader.filter(|_| screened).and_then(|leader| {
            let at = self.foes[&leader].fighter.body;
            let from = |id: &&FighterId| {
                let body = self.foes[*id].fighter.body;
                apart([at.x, at.y], [body.x, body.y])
            };
            shields.min_by(|one, two| from(one).total_cmp(&from(two))).copied()
        });
        let had_screen = found.members.iter().any(|&(number, of, ..)| below(number, of));
        let push = fronted && fights.is_some() && had_screen && screen.is_empty();
        for id in living {
            let is_leader = Some(id) == leader;
            let orders = Orders {
                screened: is_leader && screened,
                behind: behind.filter(|_| is_leader),
                push: is_leader && push,
                defend,
            };
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.order(orders);
            }
        }
    }

    /// A mission's wave: a band drawn as its bands are, apart from every other wave, standing at the open point of the
    /// post lattice nearest the players that is at least SPAWN_CLEAR from each of them and POSTS_APART from every wave
    /// standing, holding there, and hunting the nearest player; none while the room's living foes leave it no room, or
    /// no point is that far from every player.
    fn arrive(&mut self) {
        let (Some(section), Some(encounter)) = (self.section.clone(), self.encounter.as_ref()) else { return };
        let (called, levels) = (encounter.called, encounter.levels);
        let mut draws = draws_of(self.world_seed ^ WAVE_STREAM ^ u64::from(called));
        let size = 2 + index(&mut draws, 3);
        let members: Vec<(u8, Rank)> = (0..size).map(|_| PATROL[index(&mut draws, PATROL.len())]).collect();
        if self.living_foes() + members.len() > self.others_most() {
            return;
        }
        // Only a player standing and seen is hunted, or counted: with none, no wave comes.
        let hunts = |fighter: &combat::Fighter| !fighter.dead() && !fighter.statuses.has(Status::Veiled);
        let players: Vec<combat::Fighter> =
            self.players.values().map(|player| player.fighter).filter(|fighter| hunts(fighter)).collect();
        if players.is_empty() {
            return;
        }
        let nearest = |point: [f64; 2]| {
            let apart_from = |fighter: &combat::Fighter| apart(point, [fighter.body.x, fighter.body.y]);
            players.iter().map(apart_from).fold(f64::INFINITY, f64::min)
        };
        let waves: Vec<[f64; 3]> = self.garrison.iter().filter(|post| post.arrival).map(|post| post.at).collect();
        // Clear of every foe standing, where it stands and where its group means it to be.
        let foes: Vec<[f64; 2]> = self
            .foes
            .values()
            .filter(|foe| !foe.fighter.dead())
            .flat_map(|foe| {
                let home = foe.brain.home().map(|home| [home.at[0], home.at[1]]);
                core::iter::once([foe.fighter.body.x, foe.fighter.body.y]).chain(home)
            })
            .collect();
        let clear = |point: &[f64; 2]| {
            nearest(*point) >= SPAWN_CLEAR
                && waves.iter().all(|at| apart(*point, [at[0], at[1]]) >= POSTS_APART)
                && foes.iter().all(|foe| apart(*point, *foe) >= WAVE_CLEAR)
        };
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        let open = open_points(&section, ground_middle(&section, first));
        let near = open.into_iter().map(|(x, y)| [x, y]).filter(clear);
        let Some(from) = near.min_by(|one, two| nearest(*one).total_cmp(&nearest(*two))) else { return };
        let ground = [from[0], from[1], self.floor.height_at(from[0], from[1])];
        let Some(at) = self.mesh_at(ground).nearest_point(ground) else {
            return;
        };
        let hunted =
            self.players.iter().map(|(id, player)| (*id, player.fighter)).filter(|(_, fighter)| hunts(fighter)).min_by(
                |one, two| {
                    let distance = |fighter: &combat::Fighter| apart([at[0], at[1]], [fighter.body.x, fighter.body.y]);
                    distance(&one.1).total_cmp(&distance(&two.1)).then(one.0.cmp(&two.0))
                },
            );
        let mut post = Post {
            at,
            members: Vec::new(),
            girds: Vec::new(),
            beat: None,
            standing: Vec::new(),
            cleared_at: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: at,
            anchor: None,
            arrival: true,
        };
        for (nth, (&(number, rank), (place, facing))) in
            members.iter().zip(self.round_at(at, members.len(), SPREAD, 0.0)).enumerate()
        {
            let Some(foe_type) = foe_type(number) else { continue };
            let id = self.stand_foe(foe_type, rank, place, facing, None);
            let (level, shield) =
                gird_of(self.world_seed ^ WAVE_STREAM, called * 16 + nth as u32, levels, self.shield_chance());
            self.gird(id, self.at_seas(level), shield);
            let clock = self.clock;
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.posted_at(place, facing);
                if let Some((player, fighter)) = hunted {
                    foe.brain.hunt(player, [fighter.body.x, fighter.body.y, fighter.body.z], clock);
                }
            }
            post.members.push((number, rank, place, facing));
            post.girds.push((level, shield));
            post.standing.push(id);
        }
        post.leader = leader_of(self, &post.standing);
        self.garrison.push(post);
        if let Some(encounter) = self.encounter.as_mut() {
            encounter.called += 1;
        }
    }

    /// `count` places `out` round a point, facing out from it, the first at `start` (radians, a turn's share).
    fn round_at(&self, point: [f64; 3], count: usize, out: f64, start: f64) -> Vec<([f64; 3], f64)> {
        (0..count)
            .map(|nth| {
                let facing = start + TAU * nth as f64 / count.max(1) as f64;
                let (x, y) = (point[0] + libm::sin(facing) * out, point[1] - libm::cos(facing) * out);
                (self.mesh_at(point).nearest_point([x, y, self.floor.height_at(x, y)]).unwrap_or(point), facing)
            })
            .collect()
    }
}
