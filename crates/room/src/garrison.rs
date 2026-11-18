//! A node's garrison. The Grey Tithe holds the land: every node but a social space, on every continent, stands its
//! garrison as its room opens, in groups at posts on the navmesh its room bakes by its first spawn, inside its
//! section, each foe at least SPAWN_CLEAR from every spawn, idle and facing outward. The room's seed, mixed from the
//! node's id, draws who stands where, so every machine stands the same. A group whose last foe fell stands again
//! STAND_AGAIN later, once no player is within CLEAR_AROUND of its post and the living foes leave it room.
//! The baked square reaches inland from the spawn rather than round it, so it holds the garrison past the spawn's
//! clear ground without growing: a bake's cost grows far faster than its area.

use crate::{Floor, NODE_FOES_MOST, NodeKind, Room, SEED};
use ::foes::Rank::{Boss, Elite, Major, Miniboss, Minor};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, HIGH_ASSESSOR, MARKSMAN, REEVE, RUNNER};
use ::foes::{Rank, foe_type};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::TAU;
use movement::Terrain;
use naval::random::Mulberry32;
use reach::{Section, distance_to_ring, inside, respawn_point};

/// How far a node's room bakes its navmesh each way from the square's middle, and how far inside the square's edge its
/// first spawn stands, toward the middle of its section's ring.
pub(crate) const NODE_AROUND: f64 = 35.0;
const SPAWN_INSET: f64 = 15.0;
/// No garrison foe stands nearer a player's spawn than this.
pub(crate) const SPAWN_CLEAR: f64 = 25.0;
/// A cleared group stands again this many ticks (120 s) after its last foe fell, once no player stands within
/// CLEAR_AROUND metres of its post.
pub(crate) const STAND_AGAIN: u64 = 120 * 60;
pub(crate) const CLEAR_AROUND: f64 = 40.0;
/// Posts are chosen on a lattice this many metres apart, this far inside the section's edge and the baked square's,
/// and this far from each other; a group stands this far round its post.
const LATTICE: f64 = 5.0;
const FROM_EDGE: f64 = 10.0;
const FROM_SQUARE: f64 = 5.0;
const POSTS_APART: f64 = 20.0;
const SPREAD: f64 = 2.5;

/// A group as the seed draws it: its foes by type and rank, the first standing in its middle when it leads, and
/// whether its post is the one farthest from the spawns.
struct Group {
    members: Vec<(u8, Rank)>,
    leads: bool,
    farthest: bool,
}

/// One of a garrison's groups at its post: where the post is, each foe's type, rank, place and facing, the fighters of
/// it standing now, and the tick the last of them fell.
#[derive(Debug)]
pub(crate) struct Post {
    pub at: [f64; 3],
    pub members: Vec<(u8, Rank, [f64; 3], f64)>,
    pub standing: Vec<FighterId>,
    pub cleared_at: Option<u64>,
}

const PATROL: [(u8, Rank); 6] = [
    (RUNNER, Minor),
    (RUNNER, Major),
    (COLLECTOR, Minor),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Minor),
    (CROSSBOWMAN, Major),
];
const DUNGEON: [(u8, Rank); 6] = [
    (RUNNER, Major),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Major),
    (ENFORCER, Major),
    (ENFORCER, Elite),
    (MARKSMAN, Elite),
];
const ESCORT: [(u8, Rank); 4] = [(RUNNER, Major), (COLLECTOR, Major), (CROSSBOWMAN, Major), (ENFORCER, Major)];

/// The room's seed for a node: the course's mixed with the node's id (FNV-1a), the same on every machine.
#[must_use]
pub(crate) fn node_seed(id: &str) -> u64 {
    let hashed = id
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3));
    SEED ^ hashed
}

/// The stream a garrison is drawn from: the room's seed folded to the stream's 32 bits.
fn draws_of(seed: u64) -> Mulberry32 {
    Mulberry32::new((seed ^ (seed >> 32)) as u32)
}

/// An index into `count` things, drawn.
fn index(draws: &mut Mulberry32, count: usize) -> usize {
    ((draws.draw() * count as f64) as usize).min(count.saturating_sub(1))
}

/// Three or four groups of two to four, each foe drawn from `from`.
fn bands(draws: &mut Mulberry32, from: &[(u8, Rank)]) -> Vec<Group> {
    let mut groups = Vec::new();
    for _ in 0..3 + usize::from(draws.draw() < 0.5) {
        let size = 2 + index(draws, 3);
        let members = (0..size).map(|_| from[index(draws, from.len())]).collect();
        groups.push(Group { members, leads: false, farthest: false });
    }
    groups
}

/// A node's groups by its kind, as its seed draws them: a patrol area's bands of Minors and Majors; a mission's, with
/// an Elite Enforcer and an Elite Reeve; a dungeon's bands of Majors and Elites, and a Reeve as a Miniboss alone at the
/// farthest post; a world boss's High Assessor Corvane with four Majors about him there. A social space holds none.
fn groups(kind: NodeKind, draws: &mut Mulberry32) -> Vec<Group> {
    let alone = |members: Vec<(u8, Rank)>| Group { members, leads: true, farthest: true };
    match kind {
        NodeKind::Social => Vec::new(),
        NodeKind::Patrol => bands(draws, &PATROL),
        NodeKind::Mission => {
            let mut groups = bands(draws, &PATROL);
            groups.push(Group { members: vec![(ENFORCER, Elite), (REEVE, Elite)], leads: false, farthest: false });
            groups
        }
        NodeKind::Dungeon => {
            let mut groups = vec![alone(vec![(REEVE, Miniboss)])];
            groups.extend(bands(draws, &DUNGEON));
            groups
        }
        NodeKind::Boss => {
            let escort = (0..4).map(|_| ESCORT[index(draws, ESCORT.len())]);
            vec![alone(core::iter::once((HIGH_ASSESSOR, Boss)).chain(escort).collect())]
        }
    }
}

/// The middle of the square a node's room bakes: SPAWN_INSET inside its edge from the first spawn, toward the middle of
/// the section's ring (its corners' average); the spawn itself where the two meet.
pub(crate) fn ground_middle(section: &Section, first: (f64, f64)) -> (f64, f64) {
    let corners = section.ring.len().max(1) as f64;
    let (sum_x, sum_y) = section.ring.iter().fold((0.0, 0.0), |(x, y), &[east, south]| (x + east, y + south));
    let (toward_x, toward_y) = (sum_x / corners - first.0, sum_y / corners - first.1);
    let length = libm::sqrt(toward_x * toward_x + toward_y * toward_y);
    if length <= 0.0 {
        return first;
    }
    let shift = NODE_AROUND - SPAWN_INSET;
    (first.0 + toward_x / length * shift, first.1 + toward_y / length * shift)
}

/// The points a post may stand at, on a lattice over the baked square round `middle`, rows from the north, each from
/// the west: inside the section and FROM_EDGE inside its edge, and far enough from every spawn for a group round it.
fn open_points(section: &Section, middle: (f64, f64)) -> Vec<(f64, f64)> {
    let reach = NODE_AROUND - FROM_SQUARE;
    let steps = (2.0 * reach / LATTICE) as u32;
    let clear = |x: f64, y: f64| section.spawns.iter().all(|&[sx, sy]| apart([x, y], [sx, sy]) >= SPAWN_CLEAR + SPREAD);
    let mut open = Vec::new();
    for row in 0..=steps {
        for column in 0..=steps {
            let (x, y) = (middle.0 - reach + f64::from(column) * LATTICE, middle.1 - reach + f64::from(row) * LATTICE);
            if inside(&section.ring, x, y) && distance_to_ring(&section.ring, x, y) >= FROM_EDGE && clear(x, y) {
                open.push((x, y));
            }
        }
    }
    open
}

impl Room {
    /// A node's room of its kind, its chances drawn from its id: as it opens, the garrison its kind holds stands in it.
    #[must_use]
    pub fn garrisoned(floor: Floor, blocks: Vec<movement::Block>, section: Section, kind: NodeKind, id: &str) -> Self {
        let mut room = Self::node(floor, blocks, section);
        room.seed = node_seed(id);
        room.foes_most = NODE_FOES_MOST;
        room.stand_garrison(kind);
        room
    }

    /// Stands a node's garrison as its room opens: each group in turn at a post drawn from those open (the farthest
    /// from the spawns for one that stands there), every post at least POSTS_APART from the others. A group whose foes
    /// the mesh or the section cannot hold tries the next; when no post is left, the rest stand nowhere.
    pub(crate) fn stand_garrison(&mut self, kind: NodeKind) {
        let Some(section) = self.section.clone() else { return };
        let mut draws = draws_of(self.seed);
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        let mut open = open_points(&section, ground_middle(&section, first));
        for group in groups(kind, &mut draws) {
            while !open.is_empty() {
                let pick = if group.farthest { farthest(&open, &section) } else { index(&mut draws, open.len()) };
                let point = open.remove(pick);
                open.retain(|&other| apart([other.0, other.1], [point.0, point.1]) >= POSTS_APART);
                if let Some(post) = self.post_at(&group, point, &section, &mut draws) {
                    self.garrison.push(post);
                    break;
                }
            }
        }
        for post in 0..self.garrison.len() {
            self.stand_post(post);
        }
    }

    /// A group's post at a point, each foe placed on the navmesh: a leader in the middle facing the nearest spawn, the
    /// rest round it facing outward. None when the mesh does not reach the point, or a place falls outside the section
    /// or within SPAWN_CLEAR of a spawn.
    fn post_at(&self, group: &Group, (x, y): (f64, f64), section: &Section, draws: &mut Mulberry32) -> Option<Post> {
        let at = self.nav.nearest_point([x, y, self.floor.height_at(x, y)])?;
        let round = &group.members[usize::from(group.leads)..];
        let start = draws.draw() * TAU;
        let mut members = Vec::new();
        if group.leads {
            let [near_x, near_y] = respawn_point(section, at[0], at[1])?;
            let (number, rank) = group.members[0];
            members.push((number, rank, at, bearing([at[0], at[1]], [near_x, near_y])));
        }
        for (turn, &(number, rank)) in round.iter().enumerate() {
            let outward = start + TAU * turn as f64 / round.len() as f64;
            let place = [at[0] + libm::sin(outward) * SPREAD, at[1] - libm::cos(outward) * SPREAD, at[2]];
            members.push((number, rank, self.nav.nearest_point(place)?, outward));
        }
        let clear = |place: &[f64; 3]| {
            inside(&section.ring, place[0], place[1])
                && section.spawns.iter().all(|&[sx, sy]| apart([place[0], place[1]], [sx, sy]) >= SPAWN_CLEAR)
        };
        members.iter().all(|(_, _, place, _)| clear(place)).then_some(Post {
            at,
            members,
            standing: Vec::new(),
            cleared_at: None,
        })
    }

    /// Stands every foe of a post's group at its place, idle, facing as it was posted.
    fn stand_post(&mut self, post: usize) {
        let members = self.garrison[post].members.clone();
        let standing = members
            .iter()
            .filter_map(|&(number, rank, place, facing)| {
                Some(self.stand_foe(foe_type(number)?, rank, place, facing, None))
            })
            .collect();
        self.garrison[post].standing = standing;
        self.garrison[post].cleared_at = None;
    }

    /// Each tick: a group whose last foe has fallen is cleared from that tick, and stands again once STAND_AGAIN has
    /// passed, no player stands within CLEAR_AROUND of its post, and the living foes leave room for it.
    pub(crate) fn keep_garrison(&mut self) {
        for post in 0..self.garrison.len() {
            let found = &self.garrison[post];
            let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
            let Some(cleared) = found.cleared_at else {
                if found.standing.iter().all(fallen) {
                    self.garrison[post].cleared_at = Some(self.clock);
                }
                continue;
            };
            let near = self.players.values().any(|player| {
                apart([player.fighter.body.x, player.fighter.body.y], [found.at[0], found.at[1]]) <= CLEAR_AROUND
            });
            let room_for = self.living_foes() + found.members.len() <= self.foes_most;
            if self.clock >= cleared + STAND_AGAIN && !near && room_for {
                self.stand_post(post);
            }
        }
    }
}

/// The open point farthest from the nearest spawn; the first of any as far.
fn farthest(open: &[(f64, f64)], section: &Section) -> usize {
    let from_spawns = |&(x, y): &(f64, f64)| {
        section.spawns.iter().map(|&[sx, sy]| apart([x, y], [sx, sy])).fold(f64::INFINITY, f64::min)
    };
    let mut best = 0;
    for (at, point) in open.iter().enumerate() {
        if from_spawns(point) > from_spawns(&open[best]) {
            best = at;
        }
    }
    best
}

#[cfg(test)]
#[path = "garrison_tests.rs"]
mod garrison_tests;
