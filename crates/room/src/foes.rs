//! The room's foes: each thinks with its brain over the room as it stands and steps by the same rules a player does.
//! Its blows on players wait for their view, as every blow on a player does; its telegraphed blows land on whoever's
//! feet stand in their shape; its brain is told what it saw. Players ask for foes from the Test Ground's panel.

use crate::judging::{Check, Group, How, Pending};
use crate::{EventKind, Foe, PlayerId, Room};
use combat::fighter::FighterId;
use combat::judge::telegraph_blow;
use combat::shapes::{Shape, Telegraph};
use combat::shots::{loose, shot_numbers};
use combat::{Fighter, Happening, Ranged, Surroundings, step_fighter};
use foes::{Kind, Seen, World, notice, spawn, think};
use movement::Block;
use navmesh::NavMesh;

/// The most foes a room holds; how far before a player one is stood; and the ask that sends every foe away.
pub const FOES_MOST: usize = 12;
const SPAWN_AHEAD: f64 = 5.0;
pub const CLEAR_FOES: u8 = 255;
/// A telegraphed blow is judged against every player within its shape's reach and this much more.
const SHAPE_MARGIN: f64 = 2.0;
/// An aimed shot leaves faster and strikes harder than a plain one.
const AIMED_SPEED: f64 = 1.3;
const AIMED_DAMAGE: f64 = 1.4;

/// Routes across the room's navmesh: the next corner on the way, to the nearest point the mesh reaches when the goal
/// stands off it (a block's top no step reaches), and straight on where the mesh knows no way.
#[derive(Debug)]
struct MeshRoutes<'mesh> {
    mesh: &'mesh NavMesh,
}

impl foes::Routes for MeshRoutes<'_> {
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
    /// Stands each foe the players asked for before them, or sends every foe away.
    pub(crate) fn spawn_asked(&mut self) {
        for (asker, number, level) in std::mem::take(&mut self.spawns) {
            if number == CLEAR_FOES {
                let gone: Vec<FighterId> = self.foes.keys().copied().collect();
                for foe in gone {
                    self.board.forget(foe);
                }
                self.foes.clear();
                self.groups.clear();
                self.pending.retain(|pending| self.players.contains_key(&pending.blow.striker));
                continue;
            }
            let (Some(kind), Some(player)) = (Kind::from_number(number), self.fighter(asker).copied()) else {
                continue;
            };
            if self.foes.len() >= FOES_MOST {
                continue;
            }
            self.stand_foe(kind, &player, asker, level);
        }
    }

    /// Stands a foe before a player, its health its kind's at its level.
    fn stand_foe(&mut self, kind: Kind, player: &Fighter, asker: PlayerId, level: u8) {
        // Along the player's aim, which follows their look: a body standing still keeps the way it last walked.
        let (sin, cos) = (libm::sin(player.aim), libm::cos(player.aim));
        let ahead = [player.body.x + sin * SPAWN_AHEAD, player.body.y - cos * SPAWN_AHEAD, player.body.z];
        let spot = self.nav.nearest_point(ahead).unwrap_or(ahead);
        let facing = combat::sight::bearing([spot[0], spot[1]], [player.body.x, player.body.y]);
        let (mut fighter, brain) = spawn(kind, spot[0], spot[1], facing);
        let times = gear::power::foe_health_times(level);
        fighter.health *= times;
        fighter.health_max *= times;
        let id = self.next_id();
        let struck_by = std::collections::BTreeMap::new();
        self.foes.insert(id, Foe { fighter, kind: kind as u8, brain, level, struck_by });
        self.tell(EventKind::Spawned, None, asker, id, 0.0);
    }

    /// Every foe thinks over the room as it stands, then steps by its intent; what each set off lands as a player's
    /// would.
    pub(crate) fn step_foes(&mut self) {
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
            let world = World {
                tick: self.clock,
                seed: self.world_seed,
                fighters: &noticed,
                blocks: &self.blocks,
                routes: &routes,
            };
            for id in &ids {
                let Some(foe) = self.foes.get(id) else { continue };
                intents.push((*id, think(*id, &foe.brain, &mut self.board, &world)));
            }
        }
        for (id, (brain, intent)) in intents {
            let target = brain.target();
            let target_at = target
                .and_then(|target| fighters.iter().find(|(other, _)| *other == target))
                .map(|(_, other)| other.chest());
            let Some(foe) = self.foes.get_mut(&id) else { continue };
            let fighter = Fighter { target, might: brain.might(), ..foe.fighter };
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
    }

    /// A telegraphed blow's wind-up ends: an aimed shot leaves along its line; any other is judged against every
    /// player near enough to stand in its shape, as each saw it, and found by no one, overreaches its foe.
    pub(crate) fn telegraph_lands(&mut self, id: FighterId, foe: &Fighter, telegraph: &Telegraph) {
        if telegraph.shape == Shape::Aimed {
            // Aimed up for the arrow's fall over the line's length, as a drawn shot is.
            let flight = telegraph.ahead / (shot_numbers(Ranged::Bow).0 * AIMED_SPEED);
            let pitch = libm::atan2(0.5 * combat::shots::FALL * flight * flight, telegraph.ahead.max(0.1));
            let mut shot = loose(id, Ranged::Bow, foe.chest(), telegraph.bearing, pitch, 1.0);
            shot.velocity = shot.velocity.map(|speed| speed * AIMED_SPEED);
            shot.damage = shot_numbers(Ranged::Bow).1 * AIMED_DAMAGE * foe.might;
            self.shots.push((shot, None));
            self.ended_telegraphs.push((id, false, false));
            return;
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
        let entry = Group { foe: id, telegraph: *telegraph, waiting: 0, found: false, perfect: false };
        if near.is_empty() {
            self.telegraph_ended(&entry);
            return;
        }
        self.groups.insert(group, Group { waiting: u32::try_from(near.len()).unwrap_or(u32::MAX), ..entry });
        let blow = telegraph_blow(id, foe, telegraph);
        let how = if telegraph.iron { How::Iron } else { How::Telegraph };
        for defender in near {
            let check = Check::Shape { telegraph: *telegraph, group };
            let blow = self.empower(blow, defender, false);
            self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
        }
    }

    /// Tells each foe's brain what it saw this tick: swings begun before it, blows that reached it and its own that
    /// landed, and how its telegraphed blows ended.
    pub(crate) fn tell_brains(&mut self) {
        let swings = std::mem::take(&mut self.swings);
        let loosed = std::mem::take(&mut self.loosed);
        let verdicts = std::mem::take(&mut self.verdicts);
        let ended = std::mem::take(&mut self.ended_telegraphs);
        let tick = self.clock;
        for (id, foe) in &mut self.foes {
            let mut brain = foe.brain.clone();
            // Only a player's swing or shot is a threat to answer: an ally's would only crowd it out.
            for (by, attack) in swings.iter().filter(|(by, _)| self.players.contains_key(by)) {
                brain = notice(&brain, *id, &Seen::Swung { by: *by, attack: *attack }, tick);
            }
            for by in loosed.iter().filter(|by| self.players.contains_key(*by)) {
                brain = notice(&brain, *id, &Seen::Loosed { by: *by }, tick);
            }
            for (striker, defender, verdict) in &verdicts {
                if defender == id {
                    brain = notice(&brain, *id, &Seen::Struck { by: *striker, verdict: *verdict }, tick);
                } else if striker == id {
                    brain = notice(&brain, *id, &Seen::Landed { on: *defender, verdict: *verdict }, tick);
                }
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
}

/// Open ground a navmesh covers beyond the course's blocks and the spawn, each way.
const GROUND_AROUND: f64 = 30.0;

/// The ground a room's navmesh covers: the course's blocks and the spawn, and open ground around them.
pub(crate) fn ground_around(blocks: &[Block], spawn: (f64, f64)) -> navmesh::Bounds {
    let start = navmesh::Bounds { min_x: spawn.0, min_y: spawn.1, max_x: spawn.0, max_y: spawn.1 };
    let covered = blocks.iter().fold(start, |bounds, block| navmesh::Bounds {
        min_x: bounds.min_x.min(block.min_x),
        min_y: bounds.min_y.min(block.min_y),
        max_x: bounds.max_x.max(block.max_x),
        max_y: bounds.max_y.max(block.max_y),
    });
    navmesh::Bounds {
        min_x: covered.min_x - GROUND_AROUND,
        min_y: covered.min_y - GROUND_AROUND,
        max_x: covered.max_x + GROUND_AROUND,
        max_y: covered.max_y + GROUND_AROUND,
    }
}
