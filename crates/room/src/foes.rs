//! The room's foes: each thinks with its brain over the room as it stands and steps by the same rules a player does.
//! Foes of different factions fight each other as they fight players: blows on a foe are judged at once, blows on
//! players wait for their view; its telegraphed blows land on whoever's feet stand in their shape; its brain is told
//! what it saw, the noises fighters of other sides made, and its allies' shouts. Players ask for foes from the Test
//! Ground's panel, a node's garrison stands as its room opens, and a Boss calls the foes its phase names, who fall
//! with it.

use crate::judging::{Check, Group, How, Pending};
use crate::spells::feet_of;
use crate::{EventKind, Room, SpawnAsk};
use ::foes::noises::{Noise, landed, running, shot, swing};
use ::foes::{Brain, Call, FoeType, Place, Rank, Seen, aimed_shot, foe_type, notice, spawn};
use combat::fighter::{Action, FighterId, Side};
use combat::judge::telegraph_blow;
use combat::shapes::{Shape, Telegraph};
use combat::shots::shot_numbers;
use combat::{Fighter, Happening, Ranged, Surroundings, Verdict, judge, step_fighter};
use core::cell::{Cell, RefCell};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::blocks::ground_at;
use movement::{Block, TICK_SECONDS, TUNING, Terrain};
use navmesh::{NavMesh, Way};
use std::collections::BTreeMap;

/// The most foes a course's room holds, and a node's, its garrison and every foe its Bosses call counted; how far
/// before a player one is stood; how far apart called foes stand either side of their caller, and how far behind it
/// for those called behind; and the ask that sends every foe away.
pub const FOES_MOST: usize = 12;
pub const NODE_FOES_MOST: usize = 24;
/// An ask for a foe on the wire names its role in its low four bits, and in the bits above them the element of a
/// shield it stands with, 0 for none.
pub const SHIELD_SHIFT: u8 = 4;
const SPAWN_AHEAD: f64 = 5.0;
const CREW_BESIDE: f64 = 1.5;
const CALLED_BEHIND: f64 = 3.0;
pub const CLEAR_FOES: u8 = 255;
/// A body this near the navmesh's nearest point to it, across, stands on the mesh: the margin its erosion trims by a
/// wall.
const ON_MESH: f64 = 1.5;
/// A telegraphed blow is judged against every player within its shape's reach and this much more.
const SHAPE_MARGIN: f64 = 2.0;
/// An aimed shot strikes harder than a plain one.
const AIMED_DAMAGE: f64 = 1.4;

/// A foe as the room keeps it: its fighter, its brain, which holds its type, rank and phase, the Boss that called it,
/// if one did; its level (0 for none: it fights by combat's own numbers), the players whose blows landed on it, with
/// the tick and hand of each one's last, and its shield, if it stands with one: blows take it down before its health.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Foe {
    pub fighter: Fighter,
    pub brain: Brain,
    pub caller: Option<FighterId>,
    pub level: u8,
    pub struck_by: BTreeMap<crate::PlayerId, (u64, gear::Slot)>,
    pub shield: Option<gear::element::Shield>,
}

impl Foe {
    /// Its health and its most `times` what they were, as a level makes them, its hurt counted afresh from there.
    pub(crate) fn grow(&mut self, times: f64) {
        self.fighter.health *= times;
        self.fighter.health_max *= times;
        self.brain.heal_window(self.fighter.health);
    }
}

/// A foe as the room last stepped it: its number, its role's, its type's, its rank's, its faction's, its phase and how
/// alert it is (0 idle, 1 suspicious, 2 alert, 3 searching), its fighter, its level and its shield; the companion it
/// is, if one, whose faction is the players' (0); and the name it stands under in place of its type's (empty for none).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FoeSeen {
    pub foe: FighterId,
    pub kind: u8,
    pub foe_type: u8,
    pub rank: u8,
    pub faction: u8,
    pub phase: u8,
    pub alert: u8,
    pub fighter: Fighter,
    pub level: u8,
    pub shield: Option<gear::element::Shield>,
    pub name: &'static str,
    pub companion: Option<crate::Companion>,
}

/// A corner nearer a foe's feet than a tick's run is as good as reached, in metres.
const CORNER_REACHED: f64 = TUNING.run * TICK_SECONDS;

/// A goal off the mesh, and the nearest point the mesh has to it.
type Placed = ([f64; 3], Option<[f64; 3]>);

/// Routes across the room's navmesh: the next corner on the way, to the nearest point the mesh reaches when the goal
/// stands off it (a block's top no walk or link reaches, or the ground beneath one too high for any floor near it),
/// and straight on where the mesh knows no way; at a link's start, square along it. Each foe's way is kept for the
/// next tick, and a goal off the mesh is placed on it once a tick, however many foes walk for it.
#[derive(Debug)]
pub(crate) struct MeshRoutes<'mesh> {
    mesh: &'mesh NavMesh,
    floor: &'mesh crate::Floor,
    blocks: &'mesh [Block],
    /// The foe thinking now, whose way is walked.
    pub asking: Cell<FighterId>,
    pub ways: RefCell<BTreeMap<FighterId, Way>>,
    /// The goals off the mesh this tick, each with the nearest point the mesh has to it.
    placed: RefCell<Vec<Placed>>,
}

impl<'mesh> MeshRoutes<'mesh> {
    pub(crate) fn new(
        mesh: &'mesh NavMesh,
        floor: &'mesh crate::Floor,
        blocks: &'mesh [Block],
        ways: BTreeMap<FighterId, Way>,
    ) -> Self {
        Self { mesh, floor, blocks, asking: Cell::new(0), ways: RefCell::new(ways), placed: RefCell::default() }
    }

    /// The point to walk for along a path: a metre on square along the link the way crosses from `from`, if it stands
    /// at one's start, else the corner ahead.
    fn onward(&self, way: &Way, points: &[[f64; 3]], from: [f64; 3], to: [f64; 3]) -> [f64; 3] {
        self.mesh.crossing(way, from).map_or_else(|| ahead(points, from, to), |link| link.ahead_of(from))
    }

    fn placed(&self, goal: [f64; 3]) -> Option<[f64; 3]> {
        let mut placed = self.placed.borrow_mut();
        let same = |(other, _): &&Placed| other.map(f64::to_bits) == goal.map(f64::to_bits);
        if let Some(&(_, near)) = placed.iter().find(same) {
            return near;
        }
        // A goal high on a block whose top no step reaches has no floor near its level: the ground beneath it does.
        let beneath = || self.mesh.nearest_point([goal[0], goal[1], self.floor.height_at(goal[0], goal[1])]);
        let near = self.mesh.nearest_point(goal).or_else(beneath);
        placed.push((goal, near));
        near
    }
}

impl ::foes::Routes for MeshRoutes<'_> {
    fn next_point(&self, from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        let mut ways = self.ways.borrow_mut();
        let way = ways.entry(self.asking.get()).or_default();
        if let Some(points) = self.mesh.find_path_kept(way, from, to) {
            return Some(self.onward(way, &points, from, to));
        }
        let Some(reachable) = self.placed(to) else { return Some(to) };
        // Standing as near the goal as the mesh reaches, or nearer, the foe walks on to it straight, off the mesh:
        // turned back to the mesh's edge each time it stepped past it, it would shake there out of its target's reach.
        let apart = |point: [f64; 3]| combat::sight::apart([point[0], point[1]], [to[0], to[1]]);
        if apart(from) <= apart(reachable) + CORNER_REACHED {
            return Some(to);
        }
        let path = self.mesh.find_path_kept(way, from, reachable);
        Some(path.map_or(to, |points| self.onward(way, &points, from, to)))
    }

    fn drops(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        ground_at(self.blocks, self.floor, to[0], to[1], from[2]) < from[2] - TUNING.step
    }

    fn crossing(&self, from: [f64; 3]) -> Option<::foes::Crossing> {
        let link = self.mesh.crossing(self.ways.borrow().get(&self.asking.get())?, from)?;
        Some(::foes::Crossing { bearing: link.bearing, jump: link.jump })
    }

    fn length(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        self.mesh.path_length(from, to)
    }

    fn walkable(&self, from: [f64; 3], point: [f64; 3]) -> bool {
        // Placed on the part of the mesh `from` stands on: a joined mesh walks no way between its parts.
        let near = self.mesh.nearest_point_from(from, point);
        near.is_some_and(|near| combat::sight::apart([near[0], near[1]], [point[0], point[1]]) <= ON_MESH)
    }
}

/// The corner to walk for: the first past the start farther than a tick's run, so a corner underfoot never holds a
/// foe against a block's corner heading for a goal behind it; the path's end when every corner is that near.
fn ahead(points: &[[f64; 3]], from: [f64; 3], to: [f64; 3]) -> [f64; 3] {
    let rest = points.get(1..).unwrap_or_default();
    let far = |point: &&[f64; 3]| combat::sight::apart([from[0], from[1]], [point[0], point[1]]) > CORNER_REACHED;
    rest.iter().find(far).or(rest.last()).copied().unwrap_or(to)
}

/// The firing spots baked with the room's navmesh.
#[derive(Debug)]
pub(crate) struct MeshSpots<'mesh> {
    pub mesh: &'mesh NavMesh,
}

impl foes::Spots for MeshSpots<'_> {
    fn near(&self, point: [f64; 3], radius: f64) -> Vec<foes::Spot> {
        let near = self.mesh.spots_near(point, radius);
        near.map(|spot| foes::Spot { point: spot.point, cover: spot.cover, lanes: spot.lanes }).collect()
    }
}

/// How far a telegraphed blow's shape reaches from its foe's feet.
fn shape_reach(telegraph: &Telegraph) -> f64 {
    let shape = combat::shapes::numbers(telegraph.shape);
    match telegraph.shape {
        Shape::Leap => telegraph.ahead + shape.width,
        Shape::Slam => shape.length + shape.width,
        Shape::Aimed => telegraph.ahead,
        _ => shape.length.max(shape.width),
    }
}

/// The Grey Tithe's type in a role, a Major or at its first rank if it comes in none.
#[cfg(test)]
pub(crate) fn hostile_in(role: ::foes::Role) -> Option<(&'static FoeType, Rank)> {
    let found = ::foes::in_role(::foes::factions::GREY_TITHE, role)?;
    Some((found, found.rank_or_first(Some(Rank::Major))))
}

impl Room {
    /// The places over the room's course a shooter may fire from.
    #[cfg(test)]
    pub(crate) fn spots(&self) -> impl foes::Spots + '_ {
        MeshSpots { mesh: &self.nav }
    }

    /// Takes players' asks for foes from now on, as a course's room does: a node's room run in a page playing alone,
    /// where the page asks for foes to fight on the node's land. A server's node room never takes them.
    pub fn take_foe_asks(&mut self) {
        self.takes_foe_asks = true;
    }

    /// Stands each foe the players asked for before them, at the level and with the shield asked for, or sends every
    /// foe away.
    pub(crate) fn spawn_asked(&mut self) {
        for (asker, ask, level) in std::mem::take(&mut self.spawns) {
            let SpawnAsk::Foe { foe_type: number, rank, shield } = ask else {
                self.send_foes_away();
                continue;
            };
            let (Some(foe_type), Some(player)) = (foe_type(number), self.fighter(asker).copied()) else {
                continue;
            };
            if self.foes.len().saturating_sub(self.ashore.standing.len()) >= self.foes_most {
                continue;
            }
            let rank = foe_type.rank_or_first(Rank::from_number(rank));
            // Along the player's aim, which follows their look: a body standing still keeps the way it last walked.
            let (sin, cos) = (libm::sin(player.aim), libm::cos(player.aim));
            let ahead = [player.body.x + sin * SPAWN_AHEAD, player.body.y - cos * SPAWN_AHEAD, player.body.z];
            let spot = self.mesh_at(ahead).nearest_point(ahead).unwrap_or(ahead);
            let facing = combat::sight::bearing([spot[0], spot[1]], [player.body.x, player.body.y]);
            let id = self.stand_foe(foe_type, rank, spot, facing, Some(asker));
            self.gird(id, level, gear::Element::from_number(shield));
        }
    }

    /// Sends every foe but the companions away at once, and with them every blow a foe struck that has not landed:
    /// only players' blows still wait.
    pub(crate) fn send_foes_away(&mut self) {
        // Companions are no one's to send away.
        let gone: Vec<FighterId> = self.foes.keys().copied().filter(|id| !self.is_companion(*id)).collect();
        for foe in &gone {
            self.board.forget(*foe);
            self.foes.remove(foe);
            self.quiet.remove(foe);
        }
        self.groups.clear();
        self.pending.retain(|pending| self.players.contains_key(&pending.blow.striker));
        // Its garrison sent away, not beaten: no wave comes for it until it stands again.
        self.no_waves();
    }

    /// Raises a foe just stood to its level, its health its kind's at that level, and gives it a whole shield of
    /// `element`, if one.
    pub(crate) fn gird(&mut self, id: FighterId, level: u8, element: Option<gear::Element>) {
        let Some(foe) = self.foes.get_mut(&id) else { return };
        foe.grow(gear::power::foe_health_times(level));
        foe.level = level;
        foe.shield = element.map(|element| gear::element::Shield::whole(element, foe.fighter.health_max));
    }

    /// A new foe of a type at a rank standing at a place found on the navmesh, facing `facing`, and its arrival told as
    /// `by`'s doing (its own, for none). It stands on the surface its place was found on: a block's top within a step
    /// of it, else the ground there.
    pub(crate) fn stand_foe(
        &mut self,
        foe_type: &'static FoeType,
        rank: Rank,
        at: [f64; 3],
        facing: f64,
        by: Option<FighterId>,
    ) -> FighterId {
        let (mut fighter, brain) = spawn(foe_type, rank, at[0], at[1], facing);
        fighter.body.z = ground_at(&self.blocks, &self.floor, at[0], at[1], at[2]);
        let id = self.next_id();
        let struck_by = BTreeMap::new();
        self.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by, shield: None });
        self.tell(EventKind::Spawned, None, by.unwrap_or(id), id, 0.0);
        id
    }

    /// The foes standing alive: a garrison stands again and a Boss calls only while these leave room under the limit,
    /// so the fallen, lying their ten seconds, never hold them back. Companions and wards are not foes.
    pub(crate) fn living_foes(&self) -> usize {
        let counted = |id: &FighterId| !self.is_companion(*id) && !self.quests.wards.contains(id);
        self.foes.iter().filter(|(id, foe)| !foe.fighter.dead() && counted(id)).count()
    }

    /// The foes a caller's phase names, called to it while the room has room for them, each alert to where the
    /// caller's foe stands: in pairs, one either side of it, or behind it and either side, each pair farther out.
    pub(crate) fn call(&mut self, caller: FighterId, call: Call) {
        // A caller killed in the same step calls no one, nor one a page stood itself.
        if self.quiet.contains(&caller) {
            return;
        }
        let caller_alive = self.fighter(caller).copied().filter(|at| !at.dead());
        let (Some(at), Some(called_type)) = (caller_alive, foe_type(call.foe_type)) else { return };
        let foe = self.foes.get(&caller).and_then(|found| found.brain.target()).and_then(|foe| self.fighter(foe));
        let called = foe.map(|foe| Seen::Shouted { from: feet_of(&at), at: feet_of(foe) });
        let (back_sin, back_cos) = (libm::sin(at.aim + PI), libm::cos(at.aim + PI));
        let behind = if call.place == Place::Behind { CALLED_BEHIND } else { 0.0 };
        let (from_x, from_y) = (at.body.x + back_sin * behind, at.body.y - back_cos * behind);
        for index in 0..call.count {
            if self.living_foes() >= self.others_most() {
                return;
            }
            let side = if index % 2 == 0 { -1.0 } else { 1.0 };
            let out = CREW_BESIDE * f64::from(index / 2 + 1);
            let bearing = at.aim + side * FRAC_PI_2;
            let (sin, cos) = (libm::sin(bearing), libm::cos(bearing));
            let beside = [from_x + sin * out, from_y - cos * out, at.body.z];
            let spot = self.mesh_at(beside).nearest_point(beside).unwrap_or(beside);
            let id = self.stand_foe(called_type, call.rank, spot, at.aim, Some(caller));
            // A called foe fights at its caller's level, and stands with no shield.
            self.gird(id, self.foes.get(&caller).map_or(0, |found| found.level), None);
            // The calls of a fight after its caller leashed drop nothing: pulling it again pays no more.
            if self.foes.get(&caller).is_some_and(|found| found.brain.has_leashed()) {
                self.quests.spoilless.insert(id);
            }
            let Some(found) = self.foes.get_mut(&id) else { continue };
            found.caller = Some(caller);
            if let Some(called) = called {
                notice(&mut found.brain, id, &called, self.clock);
            }
        }
    }

    /// The foes a Boss called fall with it, in the tick it falls or turns to walk home to its post, as any foe falls:
    /// each fight with it starts clean.
    pub(crate) fn fall_with_callers(&mut self) {
        let fallen = |caller: &FighterId| {
            self.foes.get(caller).is_none_or(|found| found.fighter.dead() || found.brain.returning())
        };
        let falling: Vec<(FighterId, FighterId)> = self
            .foes
            .iter()
            .filter(|(_, found)| !found.fighter.dead())
            .filter_map(|(id, found)| found.caller.filter(fallen).map(|caller| (*id, caller)))
            .collect();
        for (id, caller) in falling {
            if let Some(found) = self.foes.get_mut(&id) {
                found.fighter.health = 0.0;
                found.fighter.action = Action::Dead { elapsed: 0 };
            }
            self.board.forget(id);
            self.tell(EventKind::Killed, None, caller, id, 0.0);
        }
    }

    /// The fight's heat eases a tick; every foe thinks over the room as it stands, then steps by its intent; what each
    /// set off lands as a player's would. A foe roaring into a new phase has its poise refilled, one walking back to
    /// its post heals, and the foes a foe calls come once every foe has stepped.
    pub(crate) fn step_foes(&mut self) {
        self.director.step();
        let fighters = self.fighters();
        self.leave_landings();
        // A player the section killed lies dead though their fighter keeps its health: the foes let them go.
        let fallen = |id: &FighterId| self.players.get(id).is_some_and(|found| !found.living());
        let noticed: Vec<(FighterId, Fighter)> =
            fighters.iter().filter(|(id, _)| !self.left_be(*id) && !fallen(id)).copied().collect();
        let intents = self.think_foes(&noticed);
        let (mut crews, mut shouts) = (Vec::new(), Vec::new());
        for (id, (mut brain, intent)) in intents {
            let target = brain.target();
            let target_at = target
                .and_then(|target| fighters.iter().find(|(other, _)| *other == target))
                .map(|(_, other)| other.chest());
            let calls = brain.take_calls();
            let Some(foe) = self.foes.get_mut(&id) else { continue };
            let mut fighter = Fighter { target, might: brain.might(), ..foe.fighter };
            if calls.refill_poise {
                fighter.poise = 0.0;
            }
            if calls.cleanse {
                fighter = combat::status::cleansed(&fighter);
            }
            if calls.heal > 0.0 {
                fighter.health = (fighter.health + calls.heal).min(fighter.health_max);
            }
            if let Some(call) = calls.crew {
                crews.push((id, call));
            }
            if let Some(at) = calls.shout {
                shouts.push((id, feet_of(&fighter), at));
            }
            let (next, happening) = step_fighter(
                &fighter,
                &intent,
                &Surroundings { blocks: &self.blocks, terrain: &self.floor, target_at },
            );
            foe.fighter = next;
            foe.brain = brain;
            if next.dead() {
                self.board.forget(id);
            }
            match happening {
                Some(Happening::Landed(telegraph)) => self.telegraph_lands(id, &next, &telegraph),
                other => self.happened(id, &next, other, &fighters),
            }
        }
        for (shouter, from, at) in shouts {
            self.shout(shouter, from, at);
        }
        for (caller, call) in crews {
            self.call(caller, call);
        }
    }

    /// A foe's shout as it turns alert, told to every ally: each that stands near enough and is not yet alert turns
    /// alert toward the place.
    fn shout(&mut self, shouter: FighterId, from: [f64; 3], at: [f64; 3]) {
        let Some(side) = self.fighter(shouter).map(|fighter| fighter.side) else { return };
        let (shouted, tick) = (Seen::Shouted { from, at }, self.clock);
        for (id, foe) in &mut self.foes {
            if *id != shouter && foe.fighter.side == side {
                notice(&mut foe.brain, *id, &shouted, tick);
            }
        }
    }

    /// A telegraphed blow's wind-up ends: an aimed shot leaves along its line from the foe's own weapon; any other is
    /// judged at once against every foe of another side standing in its shape, and against every player of another
    /// side near enough to stand in it, as each saw it. Found by no one, it overreaches its foe.
    pub(crate) fn telegraph_lands(&mut self, id: FighterId, foe: &Fighter, telegraph: &Telegraph) {
        if telegraph.shape == Shape::Aimed {
            self.aimed_shot(id, foe, telegraph);
            return;
        }
        let blow = telegraph_blow(id, foe, telegraph);
        let how = if telegraph.iron { How::Iron } else { How::Telegraph };
        let caught: Vec<(FighterId, Fighter)> = self
            .foes
            .iter()
            .filter(|(_, other)| other.fighter.side != foe.side && !other.fighter.dead())
            .filter(|(_, other)| {
                let body = other.fighter.body;
                telegraph.strikes([body.x, body.y, body.z], &self.blocks, &self.floor)
            })
            .map(|(other, found)| (*other, found.fighter))
            .collect();
        let (mut found, mut perfect) = (false, false);
        for (defender, then) in caught {
            // As gear's power has it between a companion and a foe; between two foes, as it stands.
            let blow = self.empower(blow, defender);
            let verdict = judge(&blow, &then);
            self.settle(&blow, how, defender, verdict, None);
            match verdict {
                Verdict::Dodged { perfect: dodged } => perfect |= dodged,
                _ => found = true,
            }
        }
        let reach = shape_reach(telegraph) + SHAPE_MARGIN;
        // A companion's blow waits on no player: it harms none.
        let near: Vec<FighterId> = self
            .players
            .iter()
            .filter(|(_, player)| player.fighter.side != foe.side && !player.fighter.dead())
            .filter(|(_, player)| {
                combat::sight::apart(
                    [player.fighter.body.x, player.fighter.body.y],
                    [telegraph.origin[0], telegraph.origin[1]],
                ) <= reach
            })
            .map(|(player, _)| *player)
            .collect();
        let group = self.next_group;
        self.next_group += 1;
        let entry = Group { foe: id, telegraph: *telegraph, waiting: 0, found, perfect };
        if near.is_empty() {
            self.telegraph_ended(&entry);
            return;
        }
        self.groups.insert(group, Group { waiting: u32::try_from(near.len()).unwrap_or(u32::MAX), ..entry });
        for defender in near {
            let check = Check::Shape { telegraph: *telegraph, group };
            let blow = self.empower(blow, defender);
            self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
        }
    }

    /// An aimed shot leaves along its line from the foe's own weapon, faster and harder than a plain one: an arrow or
    /// a bolt aimed up for its fall over the line's length, as a drawn shot is; a ball straight.
    fn aimed_shot(&mut self, id: FighterId, foe: &Fighter, telegraph: &Telegraph) {
        let ranged = foe.arms.ranged.unwrap_or(Ranged::Bow);
        let mut shot = aimed_shot(id, foe, telegraph.bearing, telegraph.ahead);
        shot.damage = shot_numbers(ranged).1 * AIMED_DAMAGE * foe.might;
        self.shots.push((shot, None));
        // Loosed like any shot: heard, and seen coming by the foes of other sides it may strike.
        self.loosed.push(id);
        self.ended_telegraphs.push((id, false, false));
    }

    /// Tells each foe's brain what it saw this tick: swings begun and shots loosed by fighters of another side, blows
    /// that reached it and its own that landed, how its telegraphed blows ended, and every noise made.
    pub(crate) fn tell_brains(&mut self) {
        let (swings, loosed) = (std::mem::take(&mut self.swings), std::mem::take(&mut self.loosed));
        let noises = self.noises(&swings, &loosed);
        let side = |id: &FighterId| self.fighter(*id).map(|fighter| fighter.side);
        let swings: Vec<(FighterId, combat::fighter::Attack, Option<Fighter>)> =
            swings.into_iter().map(|(by, attack)| (by, attack, self.fighter(by).copied())).collect();
        // Each shot's speed as it flies, the newest of its shooter's: a ball that reaches its mark at once flies none.
        let speed = |by: FighterId| {
            let shot = self.shots.iter().rev().map(|(shot, _)| shot).find(|shot| shot.owner == by);
            shot.map_or(0.0, |shot| libm::sqrt(shot.velocity.iter().map(|part| part * part).sum()))
        };
        let loosed: Vec<(FighterId, Option<Side>, f64)> =
            loosed.into_iter().map(|by| (by, side(&by), speed(by))).collect();
        let verdicts = std::mem::take(&mut self.verdicts);
        let ended = std::mem::take(&mut self.ended_telegraphs);
        let tick = self.clock;
        for (id, Foe { fighter, brain, .. }) in &mut self.foes {
            // Only a blow from another side is a threat to answer: an ally's would only crowd it out, and so would a
            // swing begun at another, which is not a swing begun at it.
            let hostile = |by: &Option<Side>| by.is_some_and(|by| by != fighter.side);
            let at = [fighter.body.x, fighter.body.y];
            let swung_at = |striker: &Option<Fighter>| {
                striker.is_some_and(|striker| striker.side != fighter.side && ::foes::swung_at(&striker, *id, at))
            };
            for (by, attack, _) in swings.iter().filter(|(_, _, striker)| swung_at(striker)) {
                notice(brain, *id, &Seen::Swung { by: *by, attack: *attack }, tick);
            }
            for (by, _, speed) in loosed.iter().filter(|(_, by, _)| hostile(by)) {
                notice(brain, *id, &Seen::Loosed { by: *by, speed: *speed }, tick);
            }
            for (striker, defender, verdict) in &verdicts {
                if defender == id {
                    notice(brain, *id, &Seen::Struck { by: *striker, verdict: *verdict }, tick);
                } else if striker == id {
                    notice(brain, *id, &Seen::Landed { on: *defender, verdict: *verdict }, tick);
                }
            }
            for noise in &noises {
                notice(brain, *id, &Seen::Heard(*noise), tick);
            }
            for (_, missed, perfectly_dodged) in ended.iter().filter(|(foe, _, _)| foe == id) {
                let seen = Seen::TelegraphEnded { missed: *missed, perfectly_dodged: *perfectly_dodged };
                notice(brain, *id, &seen, tick);
            }
        }
    }

    /// The noises made this tick: swings begun, shots loosed, blows landed, and runners' feet, but for a player's
    /// still in their grace.
    fn noises(&self, swings: &[(FighterId, combat::fighter::Attack)], loosed: &[FighterId]) -> Vec<Noise> {
        let swung = swings.iter().filter_map(|(id, _)| self.fighter(*id).map(swing));
        let shots = loosed.iter().filter_map(|id| self.fighter(*id).and_then(|by| Some(shot(by, by.arms.ranged?))));
        let blows = self
            .verdicts
            .iter()
            .filter_map(|(striker, defender, _)| Some(landed(self.fighter(*striker)?, self.fighter(*defender)?)));
        let fighters = self.fighters().into_iter().filter(|(id, _)| !self.left_be(*id));
        let runners = fighters.filter_map(|(_, by)| running(&by, self.clock));
        swung.chain(shots).chain(blows).chain(runners).collect()
    }

    /// Every foe as the room last stepped it, in the order of their numbers.
    pub fn foes_seen(&self) -> impl Iterator<Item = FoeSeen> + '_ {
        // A ward is its player's alone, sent them with their gear (`steps.rs`).
        let shown = self.foes.iter().filter(|(foe, _)| !self.quests.wards.contains(foe));
        shown.map(|(&foe, found)| {
            let brain = &found.brain;
            FoeSeen {
                foe,
                kind: brain.role() as u8,
                foe_type: brain.foe_type.number,
                rank: brain.rank as u8,
                faction: found.fighter.side.number(),
                phase: brain.phase(),
                alert: brain.alertness() as u8,
                fighter: found.fighter,
                level: found.level,
                shield: found.shield,
                name: self.names.get(&foe).copied().unwrap_or_default(),
                companion: self.companion(foe),
            }
        })
    }
}
