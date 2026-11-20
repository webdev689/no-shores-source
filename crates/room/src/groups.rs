//! A garrison's groups as Bungie leads them. Each group has a leader, its highest rank: when it falls the others
//! break, one of them raging. Half a group fallen, it defends its ground at its post. A Grey Tithe group fights
//! behind a shield front, its leader screened by its followers until they are gone. A mission's or a dungeon's
//! garrison is one encounter that gives ground as it falls, Halo's territory, fallback and last stand: more than
//! three quarters of it standing, each group holds its own post; more than half, each falls back halfway to the post
//! farthest from the spawns; less, all gather there to defend it, and the fall of the highest rank there breaks them.
//! A mission's reserve comes in a wave as it falls back and another as it makes its last stand.

use super::{PATROL, Post, SPAWN_CLEAR, SPREAD, draws_of, gird_of, ground_middle, index, open_points};
use crate::Room;
use ::foes::roles::Role;
use ::foes::{Alertness, Mood, Orders, Rank, Seen, faction, foe_type, notice};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::TAU;
use movement::Terrain;
use reach::{Section, inside};

/// The waves are drawn from a stream of their own, apart from the garrison's and the beats'.
const WAVE_STREAM: u64 = 0x7761_7665;

/// How far a mission's or a dungeon's garrison has given ground.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Stage {
    Territory,
    Fallback,
    LastStand,
}

/// A mission's or a dungeon's garrison as one encounter: how far it has given ground, the post its last stand
/// gathers at, the last stand's leader and whether its fall broke it, whether waves come (a mission's), how many have
/// come since it last held its territory, and the island's band of levels they stand at.
#[derive(Debug)]
pub(crate) struct Encounter {
    pub stage: Stage,
    pub last_stand: [f64; 3],
    pub leader: Option<FighterId>,
    pub broken: bool,
    pub waves: Option<u8>,
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
            levels,
        })
    }

    /// The point halfway along the navmesh's way from one post to another, on the mesh, inside the section and clear of
    /// every spawn; none where there is no such way or point.
    fn halfway(&self, from: [f64; 3], to: [f64; 3], section: &Section) -> Option<[f64; 3]> {
        let path = self.nav.find_path(from, to)?;
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
        let point = self.nav.nearest_point(point)?;
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
            let anchor = self.anchor_of(post, stage);
            self.keep_anchor(post, anchor, stage);
            self.give_orders(post, stage);
        }
        self.break_last_stand(stage);
    }

    /// The encounter's stage by the share of its garrison standing (its waves not counted): more than three quarters,
    /// its territory; more than half, its fallback; else its last stand. Giving ground, a mission calls a wave; its
    /// last stand begun, the highest rank standing leads it; holding its territory again, all of that begins anew.
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
        if stage == was {
            return Some(stage);
        }
        let everyone: Vec<FighterId> = (0..self.garrison.len()).flat_map(|post| self.living(post)).collect();
        let leader = (stage == Stage::LastStand).then(|| leader_of(self, &everyone)).flatten();
        let encounter = self.encounter.as_mut()?;
        encounter.stage = stage;
        match stage {
            Stage::Territory => {
                (encounter.leader, encounter.broken) = (None, false);
                encounter.waves = encounter.waves.map(|_| 0);
            }
            Stage::LastStand => (encounter.leader, encounter.broken) = (leader, false),
            Stage::Fallback => {}
        }
        let waves = encounter.waves;
        // A wave for each stage the mission gives up, however many at once, one at a time.
        if stage > was
            && let Some(came) = waves
            && came < stage as u8
        {
            self.arrive(came);
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

    /// The last stand's leader fallen, every foe of the garrison standing breaks, once.
    fn break_last_stand(&mut self, stage: Option<Stage>) {
        let Some(encounter) = self.encounter.as_ref() else { return };
        if stage != Some(Stage::LastStand) || encounter.broken || encounter.leader.is_none_or(|id| self.alive(id)) {
            return;
        }
        if let Some(encounter) = self.encounter.as_mut() {
            encounter.broken = true;
        }
        let everyone: Vec<FighterId> = (0..self.garrison.len()).flat_map(|post| self.living(post)).collect();
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
        let candidates = ids.iter().filter_map(|id| {
            let foe = self.foes.get(id)?;
            let order = rage_order(foe.brain.role())?;
            let body = foe.fighter.body;
            let target = foe.brain.fights().and_then(|target| self.fighter(target));
            let near = target.map_or(f64::INFINITY, |other| apart([body.x, body.y], [other.body.x, other.body.y]));
            Some((order, near, *id))
        });
        candidates
            .min_by(|one, two| one.0.cmp(&two.0).then(one.1.total_cmp(&two.1)).then(one.2.cmp(&two.2)))
            .map(|(_, _, id)| id)
    }

    /// Half the foes a group stood fallen, it defends its ground from then until it stands again.
    fn defend_at_half(&mut self, post: usize) {
        let stood = self.garrison[post].standing.len();
        let living = self.living(post).len();
        if stood > 1 && living > 0 && (stood - living) * 2 >= stood {
            self.garrison[post].defending = true;
        }
    }

    /// Where a group's places are gathered: round its post once it defends, at its fallback as the encounter falls back,
    /// at the last stand's post for its last stand; else its post and its beat as ever. A wave keeps its own.
    fn anchor_of(&self, post: usize, stage: Option<Stage>) -> Option<[f64; 3]> {
        let found = &self.garrison[post];
        let encounter = self.encounter.as_ref();
        match stage {
            _ if found.arrival => found.defending.then_some(found.at),
            Some(Stage::LastStand) => encounter.map(|encounter| encounter.last_stand),
            Some(Stage::Fallback) => Some(found.fallback),
            _ => found.defending.then_some(found.at),
        }
    }

    /// Gives a group's foes their places round its anchor, each tick, and those fighting fall back to them as it moves;
    /// with none, a group holding its post goes back to its places there, and one on a beat walks it again.
    fn keep_anchor(&mut self, post: usize, anchor: Option<[f64; 3]>, stage: Option<Stage>) {
        let was = core::mem::replace(&mut self.garrison[post].anchor, anchor);
        let living = self.living(post);
        let places = match anchor {
            Some(point) if point != self.garrison[post].at || stage == Some(Stage::LastStand) => {
                self.round(post, point, living.len(), stage)
            }
            Some(_) => self.stood_places(post, &living),
            None if was.is_some() && self.garrison[post].beat.is_none() => self.stood_places(post, &living),
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

    /// `count` places round a point, facing out from it: SPREAD round a fallback; at the last stand, the last stand's
    /// own group at its places there and every other gathered twice as far out.
    fn round(&self, post: usize, point: [f64; 3], count: usize, stage: Option<Stage>) -> Vec<([f64; 3], f64)> {
        if stage == Some(Stage::LastStand) && self.garrison[post].at == point {
            let living = self.living(post);
            return self.stood_places(post, &living);
        }
        let out = if stage == Some(Stage::LastStand) { 2.0 * SPREAD } else { SPREAD };
        // Each group starts its ring at its own turn, so two gathered at one place do not stand on each other.
        let start = TAU * post as f64 / self.garrison.len().max(1) as f64 / count.max(1) as f64;
        self.round_at(point, count, out, start)
    }

    /// What each foe of a group is asked: to defend its ground while its group does or makes its last stand; and, for
    /// the leader of a group of a faction that fights behind a shield front, to wait behind its followers while one
    /// that is not broken fights hand to hand at its target, and to go in at once once none of them stands unbroken.
    fn give_orders(&mut self, post: usize, stage: Option<Stage>) {
        let tick = self.clock;
        let found = &self.garrison[post];
        let defend = found.defending || (stage == Some(Stage::LastStand) && !found.arrival);
        let living = self.living(post);
        let leader = found.leader.filter(|id| living.contains(id));
        let fights = leader.and_then(|id| self.foes[&id].brain.fights());
        let fronted = leader
            .is_some_and(|id| faction(self.foes[&id].brain.foe_type.faction).is_some_and(|faction| faction.screens));
        let melee = |id: &FighterId| {
            Some(*id) != leader
                && self
                    .foes
                    .get(id)
                    .is_some_and(|foe| foe.brain.role() != Role::Archer && foe.brain.mood(tick) != Mood::Broken)
        };
        let screen = living.iter().filter(|id| melee(id));
        let screened = fronted && fights.is_some() && screen.clone().any(|id| self.foes[id].brain.fights() == fights);
        let stood_melee = found
            .members
            .iter()
            .filter(|(number, ..)| foe_type(*number).is_some_and(|foe_type| foe_type.role != Role::Archer));
        let had_screen =
            stood_melee.count() > usize::from(leader.is_some_and(|id| self.foes[&id].brain.role() != Role::Archer));
        let push = fronted && fights.is_some() && had_screen && screen.count() == 0;
        for id in living {
            let is_leader = Some(id) == leader;
            let orders = Orders { screened: is_leader && screened, push: is_leader && push, defend };
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.order(orders);
            }
        }
    }

    /// A mission's wave: a band drawn as its bands are, standing at the open post farthest from every player and at
    /// least SPAWN_CLEAR from each, alert toward the nearest player, its places at the last stand; none while the
    /// room's living foes leave it no room, or no post is that far from every player.
    fn arrive(&mut self, wave: u8) {
        let (Some(section), Some(encounter)) = (self.section.clone(), self.encounter.as_ref()) else { return };
        let (last_stand, levels) = (encounter.last_stand, encounter.levels);
        let mut draws = draws_of(self.world_seed ^ WAVE_STREAM ^ u64::from(wave));
        let size = 2 + index(&mut draws, 3);
        let members: Vec<(u8, Rank)> = (0..size).map(|_| PATROL[index(&mut draws, PATROL.len())]).collect();
        if self.living_foes() + members.len() > self.foes_most {
            return;
        }
        let players: Vec<[f64; 2]> =
            self.players.values().map(|player| [player.fighter.body.x, player.fighter.body.y]).collect();
        let nearest =
            |point: [f64; 2]| players.iter().map(|player| apart(point, *player)).fold(f64::INFINITY, f64::min);
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        let open = open_points(&section, ground_middle(&section, first));
        let far = open.into_iter().map(|(x, y)| [x, y]).filter(|point| nearest(*point) >= SPAWN_CLEAR);
        let Some(from) = far.max_by(|one, two| nearest(*one).total_cmp(&nearest(*two))) else { return };
        let Some(at) = self.nav.nearest_point([from[0], from[1], self.floor.height_at(from[0], from[1])]) else {
            return;
        };
        let toward = self.players.values().map(|player| player.fighter).min_by(|one, two| {
            let distance = |fighter: &combat::Fighter| apart([at[0], at[1]], [fighter.body.x, fighter.body.y]);
            distance(one).total_cmp(&distance(two))
        });
        let mut post = Post {
            at: last_stand,
            members: Vec::new(),
            girds: Vec::new(),
            beat: None,
            standing: Vec::new(),
            cleared_at: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: last_stand,
            anchor: None,
            arrival: true,
        };
        // Each wave starts its ring a radian on from the last's, so two waves' places do not fall together.
        let homes = self.round_at(last_stand, members.len(), 2.0 * SPREAD, f64::from(wave));
        let stands = self.round_at(at, members.len(), SPREAD, 0.0);
        for (nth, (&(number, rank), ((home, facing), (place, _)))) in
            members.iter().zip(homes.into_iter().zip(stands)).enumerate()
        {
            let Some(foe_type) = foe_type(number) else { continue };
            let toward_last = bearing([place[0], place[1]], [last_stand[0], last_stand[1]]);
            let id = self.stand_foe(foe_type, rank, place, toward_last, None);
            let (level, shield) = gird_of(self.world_seed ^ WAVE_STREAM, u32::from(wave) * 16 + nth as u32, levels);
            let level = self.at_seas(level);
            self.gird(id, level, shield);
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.brain.posted_at(home, facing);
                if let Some(player) = toward {
                    let seen = Seen::Shouted { from: place, at: [player.body.x, player.body.y, player.body.z] };
                    notice(&mut foe.brain, id, &seen, self.clock);
                }
            }
            post.members.push((number, rank, home, facing));
            post.girds.push((level, shield));
            post.standing.push(id);
        }
        post.leader = leader_of(self, &post.standing);
        self.garrison.push(post);
    }

    /// `count` places `out` round a point, facing out from it, the first at `start` (radians, a turn's share).
    fn round_at(&self, point: [f64; 3], count: usize, out: f64, start: f64) -> Vec<([f64; 3], f64)> {
        (0..count)
            .map(|nth| {
                let facing = start + TAU * nth as f64 / count.max(1) as f64;
                let (x, y) = (point[0] + libm::sin(facing) * out, point[1] - libm::cos(facing) * out);
                (self.nav.nearest_point([x, y, self.floor.height_at(x, y)]).unwrap_or(point), facing)
            })
            .collect()
    }
}
