//! A patrol's life: its island's foes in camps at places laid out from the node's own name, the same every time, each
//! camp of two or three foes of its island's levels raised by the voyage's difficulty, and standing again a while after
//! it is cleared, once no player is near; and its island's resource at spots laid out the same way, a third of them
//! holding a node at once and the next third after a while. So a patrol has its fights and its farm at known places,
//! and a player can plan a route through them. Each player may gather each node once while it stands.

use crate::{Foe, ResourceNode, Room};
use ::foes::{Kind, spawn};
use gear::Difficulty;
use gear::dice::{Dice, Purpose};
use std::collections::BTreeMap;

/// A patrol's camps, how many foes each holds at least and at most, how far from its middle they stand, and the most
/// foes a patrol keeps in all: every camp whole at once.
pub const CAMPS: usize = 6;
const CAMP_FOES: [usize; 2] = [2, 3];
const CAMP_REACH_M: f64 = 8.0;
pub const PATROL_FOES: usize = CAMPS * CAMP_FOES[1];
/// How long a cleared camp waits before it stands again (45 seconds of ticks), and how near a player keeps it empty.
pub const REFILL_TICKS: u64 = 60 * 45;
pub const CAMP_CLEAR_M: f64 = 40.0;
/// How far apart the camps stand, and from the spawns.
const CAMPS_APART_M: f64 = 150.0;
const CAMPS_FROM_SPAWNS_M: f64 = 80.0;
/// The kinds a camp is made of, by weight: skirmishers, swordsmen and archers, and now and then a brute.
const KINDS: [(Kind, u32); 4] = [(Kind::Skirmisher, 3), (Kind::Swordsman, 3), (Kind::Archer, 2), (Kind::Brute, 1)];
/// A patrol's resource spots, how many groups of them take turns, and how long each group stands (three minutes).
pub const SPOTS: usize = 12;
pub const GROUPS: usize = 3;
pub const ROTATE_TICKS: u64 = 60 * 180;
/// How far apart the spots stand, and from the spawns.
const SPOTS_APART_M: f64 = 60.0;
const SPOTS_FROM_SPAWNS_M: f64 = 25.0;

/// A camp: its middle, how many foes it holds, those standing now, and when it may stand again once cleared.
#[derive(Clone, Debug, PartialEq)]
pub struct Camp {
    pub at: [f64; 2],
    pub size: usize,
    pub foes: Vec<crate::FighterId>,
    pub refill_at: u64,
}

/// A patrol: its island's band of foe levels, before the difficulty, and its camps.
#[derive(Clone, Debug, PartialEq)]
pub struct Patrol {
    pub low: u8,
    pub high: u8,
    pub camps: Vec<Camp>,
    /// The nodes each account's character gathered this turn, kept past a player's leaving.
    pub gathered: BTreeMap<String, Vec<u8>>,
}

/// A number for a name, the same every time: FNV-1a.
fn named(name: &str) -> u64 {
    name.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

/// Up to `count` places inside a ring, each `apart` from the others and `from_spawns` from every spawn, by `dice`.
fn places(ring: &[[f64; 2]], spawns: &[[f64; 2]], dice: &Dice, count: usize, apart: [f64; 2]) -> Vec<[f64; 2]> {
    let (west, east) = ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[0]), hi.max(point[0])));
    let (north, south) = ring.iter().fold((f64::MAX, f64::MIN), |(lo, hi), point| (lo.min(point[1]), hi.max(point[1])));
    let [from_others, from_spawns] = apart;
    let mut found: Vec<[f64; 2]> = Vec::with_capacity(count);
    for nth in 0..400 {
        if found.len() == count {
            break;
        }
        let x = west + dice.roll(Purpose::Patrol, nth * 2) * (east - west);
        let y = north + dice.roll(Purpose::Patrol, nth * 2 + 1) * (south - north);
        let clear = reach::inside(ring, x, y)
            && spawns.iter().all(|spawn| libm::hypot(spawn[0] - x, spawn[1] - y) >= from_spawns)
            && found.iter().all(|place| libm::hypot(place[0] - x, place[1] - y) >= from_others);
        if clear {
            found.push([x, y]);
        }
    }
    found
}

impl Room {
    /// Makes this node's room a patrol: camps of foes of `levels` (an island's band), and `resource`'s nodes, each at
    /// places laid out from the node's name.
    pub fn start_patrol(&mut self, node: &str, levels: (u8, u8), resource: u8) {
        let Some(section) = &self.section else { return };
        let (ring, spawns) = (&section.ring, &section.spawns);
        let seed = named(node);
        let spots = Dice { seed, tick: 0, player: 0 };
        let nodes = places(ring, spawns, &spots, SPOTS, [SPOTS_APART_M, SPOTS_FROM_SPAWNS_M]);
        let at_camps = Dice { seed, tick: 1, player: 0 };
        let spread = CAMP_FOES[1] - CAMP_FOES[0] + 1;
        let camps = places(ring, spawns, &at_camps, CAMPS, [CAMPS_APART_M, CAMPS_FROM_SPAWNS_M])
            .into_iter()
            .zip(0_u32..)
            .map(|(at, nth)| {
                let size = CAMP_FOES[0] + at_camps.pick(Purpose::Which, nth, spread);
                Camp { at, size, foes: Vec::new(), refill_at: 0 }
            })
            .collect();
        self.resource_nodes = nodes.into_iter().map(|[x, y]| ResourceNode { x, y, resource }).collect();
        self.patrol = Some(Patrol { low: levels.0, high: levels.1.max(levels.0), camps, gathered: BTreeMap::new() });
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
    /// nodes now standing; a camp whose foes have all fallen waits, then stands whole again once no player is near.
    pub(crate) fn keep_patrol(&mut self) {
        let Some(mut patrol) = self.patrol.take() else { return };
        if self.clock.is_multiple_of(ROTATE_TICKS) {
            for found in self.players.values_mut() {
                found.spent.clear();
                found.gear_changed = true;
            }
            patrol.gathered.clear();
        }
        let bodies: Vec<[f64; 2]> =
            self.players.values().map(|found| [found.fighter.body.x, found.fighter.body.y]).collect();
        for (camp, nth) in patrol.camps.iter_mut().zip(0_u32..) {
            let held = camp.foes.len();
            camp.foes.retain(|id| self.foes.contains_key(id));
            if held > 0 && camp.foes.is_empty() {
                // Its last foe fell `FOE_GONE` ago, when its body was taken away: the wait counts from the fall.
                camp.refill_at = self.clock + REFILL_TICKS.saturating_sub(u64::from(combat::tuning::FOE_GONE));
            }
            let [x, y] = camp.at;
            let watched = bodies.iter().any(|body| libm::hypot(body[0] - x, body[1] - y) < CAMP_CLEAR_M);
            let waiting = !camp.foes.is_empty() || self.clock < camp.refill_at || watched || bodies.is_empty();
            if waiting || self.foes.len() + camp.size > PATROL_FOES {
                continue;
            }
            let dice = Dice { seed: self.world_seed, tick: self.clock, player: nth };
            for one in (0_u32..).take(camp.size) {
                let rolled = |offset: u32| dice.roll(Purpose::Patrol, one * 5 + offset);
                let (angle, out) = (rolled(0) * core::f64::consts::TAU, CAMP_REACH_M * libm::sqrt(rolled(1)));
                let at = [x + libm::sin(angle) * out, y - libm::cos(angle) * out];
                let weights = KINDS.map(|(_, weight)| weight);
                let kind = KINDS[dice.weighted(Purpose::Patrol, one * 5 + 2, &weights)].0;
                let band = usize::from(patrol.high - patrol.low) + 1;
                let level = patrol.low + u8::try_from(dice.pick(Purpose::Patrol, one * 5 + 3, band)).unwrap_or(0);
                let facing = rolled(4) * core::f64::consts::TAU;
                camp.foes.push(self.stand_patrol_foe(kind, at, facing, self.difficulty.raise(level)));
            }
        }
        self.patrol = Some(patrol);
    }

    fn stand_patrol_foe(&mut self, kind: Kind, at: [f64; 2], facing: f64, level: u8) -> crate::FighterId {
        let (mut fighter, brain) = spawn(kind, at[0], at[1], facing);
        fighter.body = crate::standing_on(&self.floor, &self.blocks, at[0], at[1]);
        fighter.body.facing = facing;
        let times = gear::power::foe_health_times(level);
        fighter.health *= times;
        fighter.health_max *= times;
        let id = self.next_id();
        self.foes.insert(id, Foe { fighter, kind: kind as u8, brain, level, struck_by: BTreeMap::new() });
        self.tell(crate::judging::EventKind::Spawned, None, 0, id, 0.0);
        id
    }
}
