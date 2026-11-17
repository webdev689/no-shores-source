//! A patrol's life: foes kept up across its section at its island's levels, raised by the voyage's difficulty, each
//! stood well away from the players and the spawns; and its island's resource, at spots laid out the same every time
//! from the node's own name, a third of them holding a node at once and the next third after a while, so a farm has
//! its routes. Each player may gather each node once while it stands.

use crate::{Foe, ResourceNode, Room};
use ::foes::{Kind, spawn};
use gear::Difficulty;
use gear::dice::{Dice, Purpose};
use std::collections::BTreeMap;

/// How many foes a patrol keeps up, and how often it stands another while it has fewer (ticks: three seconds).
pub const PATROL_FOES: usize = 8;
const STAND_EVERY: u64 = 180;
/// How far a foe is stood from every player, and from every spawn: never on someone, never at an arrival.
const CLEAR_OF_PLAYERS_M: f64 = 25.0;
const CLEAR_OF_SPAWNS_M: f64 = 30.0;
/// Spots tried for a foe before the patrol waits for its next time.
const TRIES: u32 = 12;
/// The kinds a patrol is made of, by weight: skirmishers, swordsmen and archers, and now and then a brute.
const KINDS: [(Kind, u32); 4] = [(Kind::Skirmisher, 3), (Kind::Swordsman, 3), (Kind::Archer, 2), (Kind::Brute, 1)];
/// A patrol's resource spots, how many groups of them take turns, and how long each group stands (three minutes).
pub const SPOTS: usize = 12;
pub const GROUPS: usize = 3;
pub const ROTATE_TICKS: u64 = 60 * 180;
/// How far apart the spots stand, and from the spawns.
const SPOTS_APART_M: f64 = 60.0;
const SPOTS_FROM_SPAWNS_M: f64 = 25.0;

/// A patrol: its island's band of foe levels, before the difficulty, and when it next stands a foe.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Patrol {
    pub low: u8,
    pub high: u8,
    next_stand: u64,
}

/// A number for a name, the same every time: FNV-1a.
fn named(name: &str) -> u64 {
    name.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

impl Room {
    /// Makes this node's room a patrol: foes of `levels` (an island's band), and `resource`'s nodes at spots laid out
    /// from the node's name.
    pub fn start_patrol(&mut self, node: &str, levels: (u8, u8), resource: u8) {
        self.patrol = Some(Patrol { low: levels.0, high: levels.1.max(levels.0), next_stand: 0 });
        let Some(section) = &self.section else { return };
        let (ring, spawns) = (section.ring.clone(), section.spawns.clone());
        let dice = Dice { seed: named(node), tick: 0, player: 0 };
        let (west, east) =
            ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[0]), hi.max(point[0])));
        let (north, south) =
            ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[1]), hi.max(point[1])));
        let mut spots: Vec<ResourceNode> = Vec::with_capacity(SPOTS);
        for nth in 0..400 {
            if spots.len() == SPOTS {
                break;
            }
            let x = west + dice.roll(Purpose::Patrol, nth * 2) * (east - west);
            let y = north + dice.roll(Purpose::Patrol, nth * 2 + 1) * (south - north);
            let clear = reach::inside(&ring, x, y)
                && spawns.iter().all(|spawn| libm::hypot(spawn[0] - x, spawn[1] - y) >= SPOTS_FROM_SPAWNS_M)
                && spots.iter().all(|spot| libm::hypot(spot.x - x, spot.y - y) >= SPOTS_APART_M);
            if clear {
                spots.push(ResourceNode { x, y, resource });
            }
        }
        self.resource_nodes = spots;
    }

    /// Sets the difficulty the room's voyage set out at.
    pub fn set_difficulty(&mut self, difficulty: Difficulty) {
        self.difficulty = difficulty;
    }

    /// Whether a resource node stands now: in a patrol, only its group's turn; elsewhere, always.
    #[must_use]
    pub fn node_standing(&self, index: usize) -> bool {
        self.patrol.is_none() || (self.clock / ROTATE_TICKS) as usize % GROUPS == index % GROUPS
    }

    /// The resource nodes standing that a player may still gather, each with its number.
    pub fn nodes_for(&self, player: crate::PlayerId) -> impl Iterator<Item = (u8, &ResourceNode)> + '_ {
        let spent = self.players.get(&player).map(|found| found.spent.as_slice()).unwrap_or_default();
        self.resource_nodes.iter().enumerate().filter_map(move |(index, node)| {
            let number = u8::try_from(index).ok()?;
            (self.node_standing(index) && !spent.contains(&number)).then_some((number, node))
        })
    }

    /// Keeps a patrol going for a tick: when the nodes' turn passes, every player may gather again and is sent the
    /// nodes now standing; and while it has fewer foes than it keeps, it stands another now and then.
    pub(crate) fn keep_patrol(&mut self) {
        let Some(patrol) = self.patrol else { return };
        if self.clock.is_multiple_of(ROTATE_TICKS) {
            for found in self.players.values_mut() {
                found.spent.clear();
                found.gear_changed = true;
            }
        }
        if self.players.is_empty() || self.foes.len() >= PATROL_FOES || self.clock < patrol.next_stand {
            return;
        }
        if let Some(found) = &mut self.patrol {
            found.next_stand = self.clock + STAND_EVERY;
        }
        let Some(section) = &self.section else { return };
        let (ring, spawns) = (&section.ring, &section.spawns);
        let dice = Dice { seed: self.seed, tick: self.clock, player: 0 };
        let bodies: Vec<[f64; 2]> =
            self.players.values().map(|found| [found.fighter.body.x, found.fighter.body.y]).collect();
        let (west, east) =
            ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[0]), hi.max(point[0])));
        let (north, south) =
            ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[1]), hi.max(point[1])));
        for tried in 0..TRIES {
            let x = west + dice.roll(Purpose::Patrol, tried * 4) * (east - west);
            let y = north + dice.roll(Purpose::Patrol, tried * 4 + 1) * (south - north);
            let clear = reach::inside(ring, x, y)
                && bodies.iter().all(|body| libm::hypot(body[0] - x, body[1] - y) >= CLEAR_OF_PLAYERS_M)
                && spawns.iter().all(|spawn| libm::hypot(spawn[0] - x, spawn[1] - y) >= CLEAR_OF_SPAWNS_M);
            if !clear {
                continue;
            }
            let weights = KINDS.map(|(_, weight)| weight);
            let kind = KINDS[dice.weighted(Purpose::Patrol, tried * 4 + 2, &weights)].0;
            let band = usize::from(patrol.high - patrol.low) + 1;
            let level = patrol.low + u8::try_from(dice.pick(Purpose::Patrol, tried * 4 + 3, band)).unwrap_or(0);
            let facing = dice.roll(Purpose::Patrol, tried * 4 + 4) * core::f64::consts::TAU;
            self.stand_patrol_foe(kind, [x, y], facing, self.difficulty.raise(level));
            return;
        }
    }

    fn stand_patrol_foe(&mut self, kind: Kind, at: [f64; 2], facing: f64, level: u8) {
        let (mut fighter, brain) = spawn(kind, at[0], at[1], facing);
        fighter.body = crate::standing_on(&self.floor, &self.blocks, at[0], at[1]);
        fighter.body.facing = facing;
        let times = gear::power::foe_health_times(level);
        fighter.health *= times;
        fighter.health_max *= times;
        let id = self.next_id();
        self.foes.insert(id, Foe { fighter, kind: kind as u8, brain, level, struck_by: BTreeMap::new() });
        self.tell(crate::judging::EventKind::Spawned, None, 0, id, 0.0);
    }
}
