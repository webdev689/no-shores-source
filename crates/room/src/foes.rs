//! The room's foes: each thinks with its brain over the room as it stands and steps by the same rules a player does.
//! Foes of different factions fight each other as they fight players: blows on a foe are judged at once, blows on
//! players wait for their view; its telegraphed blows land on whoever's feet stand in their shape; its brain is told
//! what it saw, the noises fighters of other sides made, and its allies' shouts. Players ask for foes from the Test
//! Ground's panel, and a Boss calls its crew.

use crate::judging::{Check, Group, How, Pending};
use crate::{EventKind, PlayerId, Room, SpawnAsk};
use ::foes::noises::{Noise, landed, running, shot, swing};
use ::foes::roster::CREW;
use ::foes::{Brain, FoeType, Rank, Seen, World, foe_type, notice, spawn, think};
use combat::fighter::{FighterId, Side};
use combat::judge::telegraph_blow;
use combat::shapes::{Shape, Telegraph};
use combat::shots::{FALL, by_foe, foe_speed, loose, shot_numbers};
use combat::{Fighter, Happening, Ranged, Surroundings, Verdict, judge, step_fighter};
use core::f64::consts::FRAC_PI_2;
use navmesh::NavMesh;

/// The most foes a room holds; how far before a player one is stood, and how far either side of a Boss its crew; and
/// the ask that sends every foe away.
pub const FOES_MOST: usize = 12;
const SPAWN_AHEAD: f64 = 5.0;
const CREW_BESIDE: f64 = 1.5;
pub const CLEAR_FOES: u8 = 255;
/// A telegraphed blow is judged against every player within its shape's reach and this much more.
const SHAPE_MARGIN: f64 = 2.0;
/// An aimed shot leaves faster and strikes harder than a plain one.
const AIMED_SPEED: f64 = 1.3;
const AIMED_DAMAGE: f64 = 1.4;

/// A foe as the room keeps it: its fighter and its brain, which holds its type, rank and phase.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Foe {
    pub fighter: Fighter,
    pub brain: Brain,
}

/// A foe as the room last stepped it: its number, its role's, its type's, its rank's, its faction's, its phase and how
/// alert it is (0 idle, 1 suspicious, 2 alert, 3 searching), and its fighter.
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
}

/// Routes across the room's navmesh: the next corner on the way, to the nearest point the mesh reaches when the goal
/// stands off it (a block's top no step reaches), and straight on where the mesh knows no way.
#[derive(Debug)]
struct MeshRoutes<'mesh> {
    mesh: &'mesh NavMesh,
}

impl ::foes::Routes for MeshRoutes<'_> {
    fn next_point(&self, from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        let path = self.mesh.find_path(from, to).or_else(|| {
            let reachable = self.mesh.nearest_point(to)?;
            self.mesh.find_path(from, reachable)
        });
        match path {
            Some(points) => points.get(1).copied().or(Some(to)),
            None => Some(to),
        }
    }
}

/// The firing spots baked with the room's navmesh.
#[derive(Debug)]
struct MeshSpots<'mesh> {
    mesh: &'mesh NavMesh,
}

impl foes::Spots for MeshSpots<'_> {
    fn near(&self, point: [f64; 3], radius: f64) -> Vec<foes::Spot> {
        let near = self.mesh.spots_near(point, radius);
        near.map(|spot| foes::Spot { point: spot.point, cover: spot.cover, lanes: spot.lanes }).collect()
    }
}

fn feet(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
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

impl Room {
    /// The places over the room's course a shooter may fire from.
    #[must_use]
    pub fn spots(&self) -> impl foes::Spots + '_ {
        MeshSpots { mesh: &self.nav }
    }

    /// Stands each foe the players asked for before them, or sends every foe away.
    pub(crate) fn spawn_asked(&mut self) {
        for (asker, ask) in std::mem::take(&mut self.spawns) {
            let SpawnAsk::Foe { foe_type: number, rank } = ask else {
                let gone: Vec<FighterId> = self.foes.keys().copied().collect();
                for foe in gone {
                    self.board.forget(foe);
                }
                self.foes.clear();
                self.groups.clear();
                self.pending.retain(|pending| self.players.contains_key(&pending.blow.striker));
                continue;
            };
            let (Some(foe_type), Some(player)) = (foe_type(number), self.fighter(asker).copied()) else {
                continue;
            };
            if self.foes.len() >= FOES_MOST {
                continue;
            }
            self.stand_foe(foe_type, foe_type.rank_or_first(Rank::from_number(rank)), &player, asker);
        }
    }

    fn stand_foe(&mut self, foe_type: &'static FoeType, rank: Rank, player: &Fighter, asker: PlayerId) {
        // Along the player's aim, which follows their look: a body standing still keeps the way it last walked.
        let (sin, cos) = (libm::sin(player.aim), libm::cos(player.aim));
        let ahead = [player.body.x + sin * SPAWN_AHEAD, player.body.y - cos * SPAWN_AHEAD, player.body.z];
        let spot = self.nav.nearest_point(ahead).unwrap_or(ahead);
        let facing = combat::sight::bearing([spot[0], spot[1]], [player.body.x, player.body.y]);
        let (fighter, brain) = spawn(foe_type, rank, spot[0], spot[1], facing);
        let id = self.next_id();
        self.foes.insert(id, Foe { fighter, brain });
        self.tell(EventKind::Spawned, None, asker, id, 0.0);
    }

    /// A Boss's crew called to its side: two Minor Deckhands, one either side of it, while the room has room for them,
    /// each alert to where the Boss's foe stands.
    fn call_crew(&mut self, boss: FighterId) {
        let (Some(at), Some(crew)) = (self.fighter(boss).copied(), foe_type(CREW)) else { return };
        let foe = self.foes.get(&boss).and_then(|found| found.brain.target()).and_then(|foe| self.fighter(foe));
        let called = foe.map(|foe| Seen::Shouted { from: feet(&at), at: feet(foe) });
        for side in [-1.0, 1.0] {
            if self.foes.len() >= FOES_MOST {
                return;
            }
            let bearing = at.aim + side * FRAC_PI_2;
            let (sin, cos) = (libm::sin(bearing), libm::cos(bearing));
            let beside = [at.body.x + sin * CREW_BESIDE, at.body.y - cos * CREW_BESIDE, at.body.z];
            let spot = self.nav.nearest_point(beside).unwrap_or(beside);
            let (fighter, mut brain) = spawn(crew, Rank::Minor, spot[0], spot[1], at.aim);
            let id = self.next_id();
            if let Some(called) = called {
                brain = notice(&brain, id, &called, self.clock);
            }
            self.foes.insert(id, Foe { fighter, brain });
            self.tell(EventKind::Spawned, None, boss, id, 0.0);
        }
    }

    /// The fight's heat eases a tick; every foe thinks over the room as it stands, then steps by its intent; what each
    /// set off lands as a player's would. A foe roaring into a new phase has its poise refilled, and a Boss's crew comes
    /// once every foe has stepped.
    pub(crate) fn step_foes(&mut self) {
        self.director.step();
        let fighters = self.fighters();
        // A player just stood again is left be until their grace ends or they strike.
        let clock = self.clock;
        let noticed: Vec<(FighterId, Fighter)> = fighters
            .iter()
            .filter(|(id, _)| self.players.get(id).is_none_or(|found| found.graced <= clock))
            .copied()
            .collect();
        let ids: Vec<FighterId> = self.foes.keys().copied().collect();
        let mut intents = Vec::with_capacity(ids.len());
        {
            let routes = MeshRoutes { mesh: &self.nav };
            let spots = MeshSpots { mesh: &self.nav };
            let world = World {
                tick: self.clock,
                seed: self.seed,
                fighters: &noticed,
                blocks: &self.blocks,
                routes: &routes,
                spots: &spots,
                director: self.director,
            };
            for id in &ids {
                let Some(foe) = self.foes.get(id) else { continue };
                intents.push((*id, think(*id, &foe.brain, &mut self.board, &world)));
            }
        }
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
            if calls.crew {
                crews.push(id);
            }
            if let Some(at) = calls.shout {
                shouts.push((id, feet(&fighter), at));
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
        for boss in crews {
            self.call_crew(boss);
        }
    }

    /// A foe's shout as it turns alert, told to every ally: each that stands near enough and is not yet alert turns
    /// alert toward the place.
    fn shout(&mut self, shouter: FighterId, from: [f64; 3], at: [f64; 3]) {
        let Some(side) = self.fighter(shouter).map(|fighter| fighter.side) else { return };
        let (shouted, tick) = (Seen::Shouted { from, at }, self.clock);
        for (id, foe) in &mut self.foes {
            if *id != shouter && foe.fighter.side == side {
                foe.brain = notice(&foe.brain, *id, &shouted, tick);
            }
        }
    }

    /// A telegraphed blow's wind-up ends: an aimed shot leaves along its line from the foe's own weapon; any other is
    /// judged at once against every foe of another side standing in its shape, and against every player near enough
    /// to stand in it, as each saw it. Found by no one, it overreaches its foe.
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
                telegraph.strikes([body.x, body.y, body.z], &self.blocks)
            })
            .map(|(other, found)| (*other, found.fighter))
            .collect();
        let (mut found, mut perfect) = (false, false);
        for (defender, then) in caught {
            let verdict = judge(&blow, &then);
            self.settle(&blow, how, defender, verdict);
            match verdict {
                Verdict::Dodged { perfect: dodged } => perfect |= dodged,
                _ => found = true,
            }
        }
        let reach = shape_reach(telegraph) + SHAPE_MARGIN;
        let near: Vec<FighterId> = self
            .players
            .iter()
            .filter(|(_, player)| !player.fighter.dead())
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
            self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
        }
    }

    /// An aimed shot leaves along its line from the foe's own weapon, faster and harder than a plain one: an arrow or
    /// a bolt aimed up for its fall over the line's length, as a drawn shot is; a ball straight.
    fn aimed_shot(&mut self, id: FighterId, foe: &Fighter, telegraph: &Telegraph) {
        let ranged = foe.arms.ranged.unwrap_or(Ranged::Bow);
        let falls = shot_numbers(ranged).0 > 0.0;
        let flight = telegraph.ahead / (foe_speed(ranged) * AIMED_SPEED);
        let rise = if falls { 0.5 * FALL * flight * flight } else { 0.0 };
        let pitch = libm::atan2(rise, telegraph.ahead.max(0.1));
        let mut shot = by_foe(&loose(id, ranged, foe.chest(), telegraph.bearing, pitch, 1.0));
        shot.velocity = shot.velocity.map(|speed| speed * AIMED_SPEED);
        shot.damage = shot_numbers(ranged).1 * AIMED_DAMAGE * foe.might;
        self.shots.push(shot);
        self.ended_telegraphs.push((id, false, false));
    }

    /// Tells each foe's brain what it saw this tick: swings begun and shots loosed by fighters of another side, blows
    /// that reached it and its own that landed, how its telegraphed blows ended, and every noise made.
    pub(crate) fn tell_brains(&mut self) {
        let (swings, loosed) = (std::mem::take(&mut self.swings), std::mem::take(&mut self.loosed));
        let noises = self.noises(&swings, &loosed);
        let side = |id: &FighterId| self.fighter(*id).map(|fighter| fighter.side);
        let swings: Vec<(FighterId, combat::fighter::Attack, Option<Side>)> =
            swings.into_iter().map(|(by, attack)| (by, attack, side(&by))).collect();
        let loosed: Vec<(FighterId, Option<Side>)> = loosed.into_iter().map(|by| (by, side(&by))).collect();
        let verdicts = std::mem::take(&mut self.verdicts);
        let ended = std::mem::take(&mut self.ended_telegraphs);
        let tick = self.clock;
        for (id, foe) in &mut self.foes {
            let mut brain = foe.brain.clone();
            // Only a blow from another side is a threat to answer: an ally's would only crowd it out.
            let hostile = |by: &Option<Side>| by.is_some_and(|by| by != foe.fighter.side);
            for (by, attack, _) in swings.iter().filter(|(_, _, by)| hostile(by)) {
                brain = notice(&brain, *id, &Seen::Swung { by: *by, attack: *attack }, tick);
            }
            for (by, _) in loosed.iter().filter(|(_, by)| hostile(by)) {
                brain = notice(&brain, *id, &Seen::Loosed { by: *by }, tick);
            }
            for (striker, defender, verdict) in &verdicts {
                if defender == id {
                    brain = notice(&brain, *id, &Seen::Struck { by: *striker, verdict: *verdict }, tick);
                } else if striker == id {
                    brain = notice(&brain, *id, &Seen::Landed { on: *defender, verdict: *verdict }, tick);
                }
            }
            for noise in &noises {
                brain = notice(&brain, *id, &Seen::Heard(*noise), tick);
            }
            for (foe_id, missed, perfectly_dodged) in &ended {
                if foe_id == id {
                    brain = notice(
                        &brain,
                        *id,
                        &Seen::TelegraphEnded { missed: *missed, perfectly_dodged: *perfectly_dodged },
                        tick,
                    );
                }
            }
            foe.brain = brain;
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
        let graced = |id: &FighterId| self.players.get(id).is_some_and(|found| found.graced > self.clock);
        let fighters = self.fighters().into_iter().filter(|(id, _)| !graced(id));
        let runners = fighters.filter_map(|(_, by)| running(&by, self.clock));
        swung.chain(shots).chain(blows).chain(runners).collect()
    }

    /// Every foe as the room last stepped it, in the order of their numbers.
    pub fn foes_seen(&self) -> impl Iterator<Item = FoeSeen> + '_ {
        self.foes.iter().map(|(&foe, found)| {
            let brain = &found.brain;
            FoeSeen {
                foe,
                kind: brain.role() as u8,
                foe_type: brain.foe_type.number,
                rank: brain.rank as u8,
                faction: brain.foe_type.faction,
                phase: brain.phase(),
                alert: brain.alertness() as u8,
                fighter: found.fighter,
            }
        })
    }
}
