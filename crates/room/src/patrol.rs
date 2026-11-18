//! A patrol's land: its island's resource at spots laid out from the node's own name, the same every time, a third of
//! them holding a node at once and the next third after a while, so a player can plan a route through them. Each
//! player may gather each node once while it stands. Its fights are its garrison's (`garrison.rs`).

use crate::{ResourceNode, Room};
use gear::Difficulty;
use gear::dice::{Dice, Purpose};
use std::collections::BTreeMap;

/// A patrol's resource spots, how many groups of them take turns, and how long each group stands (three minutes).
pub const SPOTS: usize = 12;
pub const GROUPS: usize = 3;
pub const ROTATE_TICKS: u64 = 60 * 180;
/// How far apart the spots stand, and from the spawns.
const SPOTS_APART_M: f64 = 60.0;
const SPOTS_FROM_SPAWNS_M: f64 = 25.0;

/// A patrol: the nodes each account's character gathered this turn, kept past a player's leaving.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Patrol {
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
    /// Makes this node's room a patrol: `resource`'s nodes at places laid out from the node's name.
    pub fn start_patrol(&mut self, node: &str, resource: u8) {
        let Some(section) = &self.section else { return };
        let spots = Dice { seed: named(node), tick: 0, player: 0 };
        let nodes = places(&section.ring, &section.spawns, &spots, SPOTS, [SPOTS_APART_M, SPOTS_FROM_SPAWNS_M]);
        self.resource_nodes = nodes.into_iter().map(|[x, y]| ResourceNode { x, y, resource }).collect();
        self.patrol = Some(Patrol::default());
    }

    /// Sets the difficulty the room's voyage set out at, and raises the garrison standing to it.
    pub fn set_difficulty(&mut self, difficulty: Difficulty) {
        self.difficulty = difficulty;
        self.raise_garrison();
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
    /// nodes now standing.
    pub(crate) fn keep_patrol(&mut self) {
        let Some(patrol) = self.patrol.as_mut() else { return };
        if self.clock.is_multiple_of(ROTATE_TICKS) {
            for found in self.players.values_mut() {
                found.spent.clear();
                found.gear_changed = true;
            }
            patrol.gathered.clear();
        }
    }
}
