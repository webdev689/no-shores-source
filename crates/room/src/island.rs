//! A sea island's room: its fine ground (`isle`) as the floor, its modules' solids as blocks, its coast out into the
//! shallows as the section, its beach's spawns, and its wrecks, each scavenged once by each player. An isle's guards
//! of its water's holder stand at its landmark, its door and its camp, at its water's levels; a cove holds none.

use crate::garrison::{Group, draws_of, gird_of, index};
use crate::{Floor, PlayerId, Room, SEED, Section, Standing};
use ::foes::Rank;
use ::foes::Rank::{Elite, Major, Minor};
use ::foes::factions::PIRATES;
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, REEVE, RUNNER};
use gear::dice::{Dice, Purpose};
use isle::{Kind, Plan};
use std::collections::{BTreeMap, BTreeSet};

/// How near a wreck's heap a player must stand to scavenge it, metres: a little past where the browser offers it.
pub const WRECK_REACH: f64 = 4.0;
/// How far round the guards' posts their navmesh is baked, metres.
const POSTS_AROUND: f64 = 16.0;

/// The pirates' own on foot, by their numbers in the roster: Skirmisher, Swordsman, Brute, Archer and Captain.
const SKIRMISHER: u8 = 13;
const SWORDSMAN: u8 = 14;
const BRUTE: u8 = 15;
const ARCHER: u8 = 16;
const CAPTAIN: u8 = 17;

/// What a wreck gives the player who scavenges it: ship materials, and now and then a module of a ship's.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Haul {
    pub timber: u16,
    pub canvas: u16,
    pub iron: u16,
    pub rare: u16,
    pub module: bool,
}

/// The island's own: its kind, its wrecks' heaps and its door, which wrecks each player has scavenged (by their
/// account where they have one, so leaving and coming back finds them as left), and the hauls not yet told.
#[derive(Debug, Default)]
pub struct Isle {
    pub kind: Option<Kind>,
    pub wrecks: Vec<[f64; 2]>,
    pub door: [f64; 2],
    scavenged: BTreeMap<String, BTreeSet<u8>>,
    pub hauls: Vec<(PlayerId, u8, Haul)>,
}

/// A wreck's haul as the dice draw it: more of each on an isle's shore, and one wreck in twelve holds a module (one in
/// six on an isle).
#[must_use]
pub fn haul(dice: &Dice, kind: Kind) -> Haul {
    let isle = u16::from(kind.is_isle());
    let some = |nth: u32, least: u16, more: u16| {
        least + isle + u16::try_from(dice.pick(Purpose::Wreck, nth, usize::from(more) + 1)).unwrap_or(0)
    };
    let module = dice.pick(Purpose::Wreck, 4, if kind.is_isle() { 6 } else { 12 }) == 0;
    Haul {
        timber: some(0, 2, 4),
        canvas: some(1, 1, 3),
        iron: some(2, 1, 2),
        rare: u16::from(dice.pick(Purpose::Wreck, 3, 10) == 0),
        module,
    }
}

/// A group's foes by type and rank.
type Band<const COUNT: usize> = [(u8, Rank); COUNT];

/// The groups an isle's guards stand in, by the faction that holds its water: one led at the landmark, one at the
/// door and one at the camp.
fn guards(faction: u8, draws: &mut naval::random::Mulberry32) -> [Group; 3] {
    let (leader, band, camp): (Band<4>, Band<3>, Band<4>) = if faction == PIRATES {
        (
            [(CAPTAIN, Elite), (BRUTE, Major), (ARCHER, Major), (SWORDSMAN, Major)],
            [(SWORDSMAN, Major), (SKIRMISHER, Major), (ARCHER, Minor)],
            [(SKIRMISHER, Minor), (SWORDSMAN, Minor), (ARCHER, Minor), (BRUTE, Major)],
        )
    } else {
        (
            [(REEVE, Elite), (ENFORCER, Major), (CROSSBOWMAN, Major), (COLLECTOR, Major)],
            [(COLLECTOR, Major), (RUNNER, Major), (CROSSBOWMAN, Minor)],
            [(RUNNER, Minor), (COLLECTOR, Minor), (CROSSBOWMAN, Minor), (ENFORCER, Major)],
        )
    };
    let at_camp = 2 + index(draws, 3);
    [
        Group { members: leader.to_vec(), leads: true, farthest: false },
        Group { members: band.to_vec(), leads: false, farthest: false },
        Group { members: camp[..at_camp].to_vec(), leads: false, farthest: false },
    ]
}

impl Room {
    /// A sea island's room from its plan. An isle's guards are of `guards`' faction (the Grey Tithe's or the pirates')
    /// at its water's `levels`; with none, or on a cove, none stand.
    #[must_use]
    pub fn island(plan: &Plan, guards: Option<u8>, levels: Option<(u8, u8)>) -> Self {
        let section = Section { ring: plan.ring.clone(), spawns: plan.sites.spawns.clone() };
        let floor = Floor::Island(Box::new(plan.ground.clone()));
        let mut room = Room::node(floor, plan.blocks.clone(), section);
        room.world_seed = SEED ^ isle::draws::mix(plan.seed, 7);
        room.foes_most = crate::NODE_FOES_MOST;
        room.isle = Some(Isle {
            kind: Some(plan.kind),
            wrecks: plan.sites.wrecks.iter().map(|wreck| wreck.at).collect(),
            door: plan.sites.door.at,
            ..Isle::default()
        });
        if let Some(faction) = guards.filter(|_| plan.kind.is_isle()) {
            room.stand_guards(plan, faction, levels);
        }
        room
    }

    /// Bakes the navmesh over the guards' posts, then stands each group at its post in turn.
    fn stand_guards(&mut self, plan: &Plan, faction: u8, levels: Option<(u8, u8)>) {
        let posts = &plan.sites.guards;
        let fold =
            |pick: fn(f64, f64) -> f64, axis: usize, start: f64| posts.iter().map(|post| post[axis]).fold(start, pick);
        let bounds = navmesh::Bounds {
            min_x: fold(f64::min, 0, f64::INFINITY) - POSTS_AROUND,
            min_y: fold(f64::min, 1, f64::INFINITY) - POSTS_AROUND,
            max_x: fold(f64::max, 0, f64::NEG_INFINITY) + POSTS_AROUND,
            max_y: fold(f64::max, 1, f64::NEG_INFINITY) + POSTS_AROUND,
        };
        let within = |block: &&movement::Block| {
            block.max_x >= bounds.min_x
                && block.min_x <= bounds.max_x
                && block.max_y >= bounds.min_y
                && block.min_y <= bounds.max_y
        };
        let blocks: Vec<movement::Block> = self.blocks.iter().filter(within).copied().collect();
        self.nav = navmesh::NavMesh::bake_on(&blocks, &self.floor, bounds, &navmesh::AGENT);
        let Some(section) = self.section.clone() else { return };
        let mut draws = draws_of(self.world_seed);
        for (group, post) in guards(faction, &mut draws).iter().zip(posts.iter().chain(posts.iter().rev())) {
            if let Some(found) = self.post_at(group, (post[0], post[1]), &section, &mut draws) {
                self.garrison.push(found);
            }
        }
        let (seed, mut nth) = (self.world_seed, 0_u32);
        for post in &mut self.garrison {
            for _ in &post.members {
                post.girds.push(gird_of(seed, nth, levels));
                nth += 1;
            }
        }
        for post in 0..self.garrison.len() {
            self.stand_post(post);
        }
    }

    /// A player scavenges a wreck by its place in the island's list: once each, alive and within reach of its heap.
    /// Answers 0 and keeps the haul to tell them, or why not.
    pub(crate) fn scavenge(&mut self, player: PlayerId, wreck: u8) -> u8 {
        let Some(fighter) = self.fighter(player).copied() else { return crate::asks::OUT_OF_REACH };
        let dice = self.dice(player);
        let Some(found) = self.players.get(&player) else { return crate::asks::OUT_OF_REACH };
        let holder = found.owner.clone().unwrap_or_else(|| format!("player {player}"));
        let dead = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
        let Some(isle) = self.isle.as_mut() else { return crate::asks::OUT_OF_REACH };
        let Some(&[x, y]) = isle.wrecks.get(usize::from(wreck)) else { return crate::asks::OUT_OF_REACH };
        let far = libm::hypot(fighter.body.x - x, fighter.body.y - y) > WRECK_REACH;
        let spent = isle.scavenged.get(&holder).is_some_and(|wrecks| wrecks.contains(&wreck));
        if far || dead || spent {
            return crate::asks::OUT_OF_REACH;
        }
        isle.scavenged.entry(holder).or_default().insert(wreck);
        isle.hauls.push((player, wreck, haul(&dice, isle.kind.unwrap_or(Kind::Cove))));
        0
    }

    /// The wrecks a player has scavenged here, by their places in the island's list.
    #[must_use]
    pub fn scavenged(&self, player: PlayerId) -> Vec<u8> {
        let Some(found) = self.players.get(&player) else { return Vec::new() };
        let holder = found.owner.clone().unwrap_or_else(|| format!("player {player}"));
        let isle = self.isle.as_ref();
        isle.and_then(|isle| isle.scavenged.get(&holder))
            .map(|wrecks| wrecks.iter().copied().collect())
            .unwrap_or_default()
    }

    /// The hauls scavenged since last asked, each with its player and wreck.
    pub fn take_hauls(&mut self) -> Vec<(PlayerId, u8, Haul)> {
        self.isle.as_mut().map(|isle| std::mem::take(&mut isle.hauls)).unwrap_or_default()
    }
}

#[cfg(test)]
#[path = "island_tests.rs"]
mod island_tests;
