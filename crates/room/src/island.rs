//! A sea island's room: its fine ground (`isle`) as the floor, its modules' solids as blocks, its coast out into the
//! shallows as the section, its beach's spawns, and its wrecks, each scavenged once by each player. An isle's guards
//! of its water's holder stand at its landmark, its door and its camp, at its water's levels; a cove holds none. A
//! wreck's salvage is the ship's own law's (`gear::ship::found`), paid into the scavenger's ship materials.

use crate::garrison::{Group, draws_of, gird_of, index};
use crate::{Floor, PlayerId, Room, SEED, Section, Standing};
use ::foes::Rank;
use ::foes::Rank::{Elite, Major, Minor};
use ::foes::factions::PIRATES;
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, REEVE, RUNNER};
use gear::ship::found::{Source, Taken, salvage};
use isle::{Kind, Plan};
use std::collections::BTreeMap;

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

/// The island's own: its seed (which each character's scavenged wrecks are kept by), its kind, its water's levels,
/// its wrecks' heaps and its door, the accounts the sea says have landed on it where the server checks (`land`), and
/// what each scavenge paid in, not yet told.
#[derive(Debug, Default)]
pub struct Isle {
    pub seed: u64,
    pub kind: Option<Kind>,
    pub levels: Option<(u8, u8)>,
    pub wrecks: Vec<[f64; 2]>,
    pub door: [f64; 2],
    /// None where nobody checks (the page's own room); else the accounts whose ships the sea holds at its anchorage,
    /// each with its landing's number.
    pub(crate) landed: Option<BTreeMap<String, u32>>,
    pub hauls: Vec<(PlayerId, u8, Taken)>,
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

/// The navmesh an isle's guards walk: over their posts and `POSTS_AROUND` round them, on the island's ground among the
/// blocks there.
fn posts_navmesh(blocks: &[movement::Block], floor: &Floor, posts: &[[f64; 2]]) -> navmesh::NavMesh {
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
    let near: Vec<movement::Block> = blocks.iter().filter(within).copied().collect();
    navmesh::NavMesh::bake_on(&near, floor, bounds, &navmesh::AGENT)
}

impl Room {
    /// A sea island's room from its plan, its middle at `at` in the world, where every body, block and post of it
    /// stands, as a node's do. An isle's guards are of `guards`' faction (the Grey Tithe's or the pirates') at its
    /// water's `levels`; with none, or on a cove, none stand. Its nodes are of `resource`, the island's whose water it
    /// lies in, all standing, each gathered once by each account while the room is open; with none, none stand.
    #[must_use]
    pub fn island(
        plan: &Plan,
        at: [f64; 2],
        guards: Option<u8>,
        levels: Option<(u8, u8)>,
        resource: Option<u8>,
    ) -> Self {
        let place = |points: &[[f64; 2]]| points.iter().map(|&point| isle::placed(point, at)).collect::<Vec<_>>();
        let section = Section { ring: place(&plan.ring), spawns: place(&plan.sites.spawns), falls_kill: false };
        let floor = Floor::Island(Box::new(plan.ground_at(at)));
        let blocks = plan.blocks_at(at);
        let spawns: Vec<(f64, f64)> = section.spawns.iter().map(|&[x, y]| (x, y)).collect();
        let (guarded, posts) = (guards.filter(|_| plan.kind.is_isle()), place(&plan.sites.guards));
        // Baked once: an isle's over its guards' posts, a cove's as a node's by its beach.
        let nav = if guarded.is_some() {
            posts_navmesh(&blocks, &floor, &posts)
        } else {
            crate::garrison::baked(&floor, &blocks, spawns.first().copied().unwrap_or_default(), Some(&section))
        };
        let mut room = Room::on(floor, blocks, spawns, Some(section), nav);
        room.world_seed = SEED ^ isle::draws::mix(plan.seed, 7);
        room.foes_most = crate::NODE_FOES_MOST;
        room.isle = Some(Isle {
            seed: plan.seed,
            kind: Some(plan.kind),
            levels,
            wrecks: plan.sites.wrecks.iter().map(|wreck| isle::placed(wreck.at, at)).collect(),
            door: isle::placed(plan.sites.door.at, at),
            ..Isle::default()
        });
        if let Some(faction) = guarded {
            room.stand_guards(&posts, faction, levels);
        }
        if let Some(resource) = resource {
            let nodes = place(&plan.sites.nodes).into_iter().map(|[x, y]| crate::ResourceNode { x, y, resource });
            room.resource_nodes = nodes.collect();
        }
        room
    }

    /// Stands each group of an isle's guards at its post in turn, on the navmesh baked over them.
    fn stand_guards(&mut self, posts: &[[f64; 2]], faction: u8, levels: Option<(u8, u8)>) {
        let Some(section) = self.section.clone() else { return };
        let mut draws = draws_of(self.world_seed);
        // An isle's guards hold their posts: with no lattice to draw a beat from, none walks one.
        let mut beats = draws_of(self.world_seed);
        for (group, post) in guards(faction, &mut draws).iter().zip(posts) {
            if let Some(found) = self.post_at(group, (post[0], post[1]), (&section, &[]), (&mut draws, &mut beats)) {
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

    /// Lets the sea's word on landings be checked: from now only the accounts `land` names may scavenge and gather.
    /// Whether this is an island's room.
    pub fn check_landings(&mut self) -> bool {
        let Some(isle) = self.isle.as_mut() else { return false };
        isle.landed.get_or_insert_with(BTreeMap::new);
        true
    }

    /// The sea's word that an account's ship lies at this island's anchorage, by its landing's number: its players may
    /// scavenge and gather. A landing of another number than the one before is a new visit: the nodes the account
    /// gathered stand for it again. Whether this is an island's room.
    pub fn land(&mut self, account: &str, landing: u32) -> bool {
        let Some(isle) = self.isle.as_mut() else { return false };
        let Some(landed) = isle.landed.as_mut() else { return true };
        if landed.insert(account.to_owned(), landing).is_some_and(|before| before != landing) {
            self.gathered.remove(account);
            for found in self.players.values_mut().filter(|found| found.owner.as_deref() == Some(account)) {
                found.spent.clear();
                found.gear_changed = true;
            }
        }
        true
    }

    /// A player scavenges a wreck by its place in the island's list: once each for their character, however often
    /// the island's room opens, alive, within reach of its heap and, where landings are checked, landed. Its salvage,
    /// at the island's water's middle level raised by the room's seas, is paid into their character. Answers 0 and
    /// keeps what was taken to tell them, or why not.
    pub(crate) fn scavenge(&mut self, player: PlayerId, wreck: u8) -> u8 {
        let Some(fighter) = self.fighter(player).copied() else { return crate::asks::OUT_OF_REACH };
        let dice = self.dice(player);
        let Some(found) = self.players.get(&player) else { return crate::asks::OUT_OF_REACH };
        let dead = fighter.dead() || matches!(found.standing, Standing::Dead { .. });
        let Some(isle) = self.isle.as_ref() else { return crate::asks::OUT_OF_REACH };
        let landed =
            isle.landed.as_ref().is_none_or(|landed| found.owner.as_ref().is_some_and(|it| landed.contains_key(it)));
        let Some(&[x, y]) = isle.wrecks.get(usize::from(wreck)) else { return crate::asks::OUT_OF_REACH };
        let far = libm::hypot(fighter.body.x - x, fighter.body.y - y) > WRECK_REACH;
        let spent = found.character.scavenged_on(isle.seed).contains(&wreck);
        if far || dead || spent || !landed {
            return crate::asks::OUT_OF_REACH;
        }
        let seed = isle.seed;
        let level = isle.levels.map_or(1, |(low, high)| low + (high.saturating_sub(low)) / 2);
        let found = salvage(
            Source::Wreckage { isle: isle.kind.is_some_and(Kind::is_isle) },
            self.difficulty.raise(level),
            &dice,
        );
        let Some(scavenger) = self.players.get_mut(&player) else { return crate::asks::OUT_OF_REACH };
        // Spent for them on this island for good: their page offers it no more, nor any room of this island again.
        scavenger.character.scavenge(seed, wreck);
        let taken = scavenger.character.take_salvage(found);
        scavenger.gear_changed = true;
        if let Some(isle) = self.isle.as_mut() {
            isle.hauls.push((player, wreck, taken));
        }
        0
    }

    /// The wrecks a player has scavenged here, by their places in the island's list.
    #[must_use]
    pub fn scavenged(&self, player: PlayerId) -> Vec<u8> {
        let (Some(found), Some(isle)) = (self.players.get(&player), self.isle.as_ref()) else { return Vec::new() };
        found.character.scavenged_on(isle.seed).to_vec()
    }

    /// What each scavenge paid in since last asked, each with its player and wreck.
    pub fn take_hauls(&mut self) -> Vec<(PlayerId, u8, Taken)> {
        self.isle.as_mut().map(|isle| std::mem::take(&mut isle.hauls)).unwrap_or_default()
    }
}

#[cfg(test)]
#[path = "island_tests.rs"]
mod island_tests;
