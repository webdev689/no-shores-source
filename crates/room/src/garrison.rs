//! A node's garrison: the Grey Tithe's groups at posts on the navmesh its room bakes by its first spawn, each foe at
//! least SPAWN_CLEAR from every spawn. Each group walks a beat from its post (`beat.rs`), but for a Boss's or a
//! Miniboss's, which holds its post. The room's world seed, mixed from the node's id, draws who stands where, each
//! foe's level from its island's band and its shield, and each beat, so every machine stands the same; the seas raise
//! the levels once the host sets them. A cleared group stands again STAND_AGAIN later (a Miniboss's or a Boss's,
//! GREAT_STAND_AGAIN), once no player is within CLEAR_AROUND of its post and the living foes leave it room.
//! The baked square reaches inland from the spawn rather than round it, so it holds the garrison past the spawn's
//! clear ground without growing: a bake's cost grows far faster than its area.

use crate::{Floor, NODE_FOES_MOST, NodeKind, Room, SEED};
use ::foes::Rank::{Boss, Elite, Major, Miniboss, Minor};
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, ENFORCER, HIGH_ASSESSOR, MARKSMAN, REEVE, RUNNER};
use ::foes::{Rank, foe_type};
use beat::Beat;
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::TAU;
use gear::dice::{Dice, Purpose};
use movement::{Block, Terrain};
use naval::random::Mulberry32;
use navmesh::NavMesh;
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
/// A group with a Miniboss or a Boss stands again only 10 minutes after it fell, so neither is farmed: the owner's.
pub(crate) const GREAT_STAND_AGAIN: u64 = 600 * 60;
pub(crate) const CLEAR_AROUND: f64 = 40.0;
/// Posts are chosen on a lattice this many metres apart, this far inside the section's edge and the baked square's,
/// and this far from each other; a group stands this far round its post.
const LATTICE: f64 = 5.0;
const FROM_EDGE: f64 = 10.0;
const FROM_SQUARE: f64 = 5.0;
const POSTS_APART: f64 = 20.0;
pub(crate) const SPREAD: f64 = 2.5;
/// The beats are drawn from a stream of their own, so drawing them leaves every post where it stood.
const BEAT_STREAM: u64 = 0x6265_6174;

/// A group as the seed draws it: its foes by type and rank.
pub(crate) struct Group {
    pub members: Vec<(u8, Rank)>,
    /// Its first stands in its middle facing the nearest spawn, the rest round it: a Boss's, and an isle's at its landmark.
    pub leads: bool,
    /// It takes the post farthest from the spawns and holds it, walking no beat: a Boss's or a Miniboss's.
    pub farthest: bool,
    /// It holds whatever post it takes, walking no beat: a patrol's sentry or watch (`smaller.rs`).
    pub holds: bool,
}

/// One of a garrison's groups at its post: where the post is, each foe's type, rank, place and facing there, and its
/// level before the seas (0 for none) and its shield's element, if it stands with one; its beat, unless it holds its
/// post; the fighters of it standing now, and the tick the last of them fell. Since it last stood: its leader, whether
/// the leader's fall broke it, and whether it defends its ground. Where it falls back to as its encounter gives ground,
/// and where its places are gathered now, if anywhere but its post and its beat; and whether it came in a wave, when
/// it never stands again.
#[derive(Debug)]
pub(crate) struct Post {
    pub at: [f64; 3],
    pub members: Vec<(u8, Rank, [f64; 3], f64)>,
    pub girds: Vec<(u8, Option<gear::Element>)>,
    pub beat: Option<Beat>,
    pub standing: Vec<FighterId>,
    pub cleared_at: Option<u64>,
    pub leader: Option<FighterId>,
    pub broken: bool,
    pub defending: bool,
    pub fallback: [f64; 3],
    pub anchor: Option<[f64; 3]>,
    pub arrival: bool,
}

/// A garrison foe's level, drawn evenly from its island's band (0 with none), and its shield's element if it stands
/// with one, as `gear::element::Shield::rolled` draws for any foe: at `shield_chance` (one in five but under Ironclad),
/// of an element drawn evenly. Each is the `nth` foe's draw from the node's seed, apart from every other draw of the
/// garrison.
pub(crate) fn gird_of(
    seed: u64,
    nth: u32,
    levels: Option<(u8, u8)>,
    shield_chance: f64,
) -> (u8, Option<gear::Element>) {
    let dice = Dice { seed, tick: 0, player: nth };
    let level = levels.map_or(0, |(low, high)| {
        let band = usize::from(high.saturating_sub(low)) + 1;
        low.saturating_add(u8::try_from(dice.pick(Purpose::Patrol, 0, band)).unwrap_or(0))
    });
    (level, gear::element::Shield::rolled(&dice, 0, 1.0, shield_chance).map(|shield| shield.element))
}

const PATROL: [(u8, Rank); 6] = [
    (RUNNER, Minor),
    (RUNNER, Major),
    (COLLECTOR, Minor),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Minor),
    (CROSSBOWMAN, Major),
];
pub(crate) const DUNGEON: [(u8, Rank); 6] = [
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
pub(crate) fn draws_of(seed: u64) -> Mulberry32 {
    Mulberry32::new((seed ^ (seed >> 32)) as u32)
}

/// An index into `count` things, drawn.
pub(crate) fn index(draws: &mut Mulberry32, count: usize) -> usize {
    ((draws.draw() * count as f64) as usize).min(count.saturating_sub(1))
}

/// Three or four groups of two to four, each foe drawn from `from`.
fn bands(draws: &mut Mulberry32, from: &[(u8, Rank)]) -> Vec<Group> {
    (0..3 + usize::from(draws.draw() < 0.5)).map(|_| stands::band(draws, from)).collect()
}

/// A node's groups by its kind, as its seed draws them: a patrol area's bands of Minors and Majors; a mission's, with
/// an Elite Enforcer and an Elite Reeve; a dungeon's bands of Majors and Elites, and a Reeve as a Miniboss alone at the
/// farthest post; a world boss's High Assessor Corvane with four Majors about him. Social spaces, outposts hold none.
fn groups(kind: NodeKind, draws: &mut Mulberry32) -> Vec<Group> {
    let alone = |members: Vec<(u8, Rank)>| Group { members, leads: true, farthest: true, holds: false };
    match kind {
        NodeKind::Social | NodeKind::Outpost => Vec::new(),
        NodeKind::Patrol => bands(draws, &PATROL),
        NodeKind::Mission => {
            let mut groups = bands(draws, &PATROL);
            let pair = vec![(ENFORCER, Elite), (REEVE, Elite)];
            groups.push(Group { members: pair, leads: false, farthest: false, holds: false });
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

impl Room {
    /// An empty room on a course of blocks on open ground, where players stand at `spawn` (x, y) when they join. Its
    /// navmesh is baked over the course and open ground around it.
    #[must_use]
    pub fn new(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        let nav = baked(&Floor::Flat, &blocks, spawn, None);
        Self::on(Floor::Flat, blocks, vec![spawn], None, nav)
    }

    /// An empty node's room: its floor, the blocks standing on it, and its section, whose spawns players join at in
    /// turn and come back to.
    #[must_use]
    pub fn node(floor: Floor, blocks: Vec<Block>, section: Section) -> Self {
        let spawns: Vec<(f64, f64)> = section.spawns.iter().map(|&[x, y]| (x, y)).collect();
        let nav = baked(&floor, &blocks, spawns.first().copied().unwrap_or((0.0, 0.0)), Some(&section));
        Self::on(floor, blocks, spawns, Some(section), nav)
    }
}

/// A room's navmesh. A node's room bakes it over its land by its first spawn, where its garrison stands, among its
/// layout's boxes inside that square, and never over its whole section, which would cost more time and memory than a
/// room has; a course's room over its blocks and the open ground round them, or over the sea, its blocks' tops alone;
/// a dungeon's over the whole dungeon (`dungeon_room.rs`).
pub(crate) fn baked(floor: &Floor, blocks: &[Block], first: (f64, f64), section: Option<&Section>) -> NavMesh {
    let Some(section) = section else {
        return over(floor, blocks, ground_around(blocks, first, GROUND_AROUND)).finish(floor);
    };
    if let Floor::Dungeon(_) = floor {
        return crate::dungeon_room::baked(floor, blocks, first, section);
    }
    let (bounds, walked) = square_of(blocks, ground_middle(section, first));
    match floor {
        // A deck's mesh covers its ring alone: its planks and the walls round them.
        Floor::Deck(_) => NavMesh::bake_on(&walked, floor, ring_bounds(&section.ring), &navmesh::AGENT),
        _ => over(floor, &walked, bounds).finish(floor),
    }
}

/// A square round a place and its navmesh, baked as a node's own is round its first spawn, a slice at a time.
pub(crate) fn square_baking(floor: &Floor, blocks: &[Block], middle: (f64, f64)) -> (navmesh::Bounds, navmesh::Baking) {
    let (bounds, walked) = square_of(blocks, middle);
    (bounds, over(floor, &walked, bounds))
}

/// The square NODE_AROUND each way round `middle`, and the blocks that reach into it.
pub(crate) fn square_of(blocks: &[Block], middle: (f64, f64)) -> (navmesh::Bounds, Vec<Block>) {
    let bounds = ground_around(&[], middle, NODE_AROUND);
    let inside = |block: &&Block| {
        block.min_x < bounds.max_x
            && block.max_x > bounds.min_x
            && block.min_y < bounds.max_y
            && block.max_y > bounds.min_y
    };
    (bounds, blocks.iter().filter(inside).copied().collect())
}

/// A navmesh's bake over `bounds`: on open ground, over the sea, or on the floor's own ground.
fn over(floor: &Floor, walked: &[Block], bounds: navmesh::Bounds) -> navmesh::Baking {
    match floor {
        Floor::Flat => navmesh::Baking::flat(walked, bounds, &navmesh::AGENT),
        Floor::Sea(_) => navmesh::Baking::over_sea(walked, bounds, &navmesh::AGENT),
        _ => navmesh::Baking::on(walked, bounds, &navmesh::AGENT),
    }
}

/// The bounds of a ring.
fn ring_bounds(ring: &[[f64; 2]]) -> navmesh::Bounds {
    let start = navmesh::Bounds {
        min_x: f64::INFINITY,
        min_y: f64::INFINITY,
        max_x: f64::NEG_INFINITY,
        max_y: f64::NEG_INFINITY,
    };
    ring.iter().fold(start, |bounds, &[x, y]| navmesh::Bounds {
        min_x: bounds.min_x.min(x),
        min_y: bounds.min_y.min(y),
        max_x: bounds.max_x.max(x),
        max_y: bounds.max_y.max(y),
    })
}

/// Open ground a course's navmesh covers beyond its blocks and its spawn, each way.
const GROUND_AROUND: f64 = 30.0;

/// The ground a room's navmesh covers: the blocks and the spawn, and `around` metres of open ground round them.
fn ground_around(blocks: &[Block], spawn: (f64, f64), around: f64) -> navmesh::Bounds {
    let start = navmesh::Bounds { min_x: spawn.0, min_y: spawn.1, max_x: spawn.0, max_y: spawn.1 };
    let covered = blocks.iter().fold(start, |bounds, block| navmesh::Bounds {
        min_x: bounds.min_x.min(block.min_x),
        min_y: bounds.min_y.min(block.min_y),
        max_x: bounds.max_x.max(block.max_x),
        max_y: bounds.max_y.max(block.max_y),
    });
    navmesh::Bounds {
        min_x: covered.min_x - around,
        min_y: covered.min_y - around,
        max_x: covered.max_x + around,
        max_y: covered.max_y + around,
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

/// What the gates know a node of a kind as: an Elite Dungeon's opens after the prologue, a mission's or a boss's by
/// its seas alone.
fn place_of(kind: NodeKind) -> gear::gate::Place {
    match kind {
        NodeKind::Social | NodeKind::Outpost => gear::gate::Place::Social,
        NodeKind::Patrol => gear::gate::Place::Patrol,
        NodeKind::Dungeon => gear::gate::Place::EliteDungeon,
        NodeKind::Mission | NodeKind::Boss => gear::gate::Place::Node,
    }
}

impl Room {
    /// A node's room of its kind, its chances drawn from its id: as it opens, the garrison its kind holds stands in it,
    /// at its island's band of `levels` (none for a node of no island, whose foes fight by combat's own numbers).
    #[must_use]
    pub fn garrisoned(
        floor: Floor,
        blocks: Vec<movement::Block>,
        section: Section,
        kind: NodeKind,
        (id, levels): (&str, Option<(u8, u8)>),
    ) -> Self {
        let mut room = Self::node(floor, blocks, section);
        (room.quests.node, room.quests.levels) = (Some(id.to_owned()), levels);
        let most = if matches!(kind, NodeKind::Patrol) { crate::PATROL_FOES_MOST } else { NODE_FOES_MOST };
        (room.world_seed, room.foes_most) = (node_seed(id), most);
        room.place = Some(place_of(kind));
        room.stand_garrison(kind, levels);
        room.lay_post_checkpoints();
        room
    }

    /// Stands a node's garrison as its room opens: each group in turn at a post drawn from those open (the farthest
    /// from the spawns for one that stands there), every post at least POSTS_APART from the others. A group whose foes
    /// the mesh or the section cannot hold tries the next; when no post is left, the rest stand nowhere.
    pub(crate) fn stand_garrison(&mut self, kind: NodeKind, levels: Option<(u8, u8)>) {
        let Some(section) = self.section.clone() else { return };
        let mut draws = draws_of(self.world_seed);
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        let mut open = open_points(&section, ground_middle(&section, first));
        let lattice = open.clone();
        let mut beats = draws_of(self.world_seed ^ BEAT_STREAM);
        let bands = groups(kind, &mut draws);
        let smaller = smaller::beside_bands(kind, self.world_seed, bands.iter().map(|band| band.members.len()).sum());
        for group in bands.into_iter().chain(smaller) {
            let pick = |open: &[(f64, f64)], draws: &mut Mulberry32| {
                if group.farthest { farthest(open, &section) } else { index(draws, open.len()) }
            };
            let stood =
                |point, draws: &mut Mulberry32| self.post_at(&group, point, (&section, &lattice), (draws, &mut beats));
            if let Some(post) = stands::first_post(&mut open, &mut draws, pick, stood) {
                self.garrison.push(post);
            }
        }
        self.gird_and_stand(levels);
        if matches!(kind, NodeKind::Mission | NodeKind::Dungeon) {
            self.encounter = self.encounter_of(&section, kind == NodeKind::Mission, levels);
        }
        self.clearing = crate::clears::clearing_of(kind);
    }

    /// Draws each posted foe's level from its island's band and its shield, in the order the posts were laid, and
    /// stands every post.
    pub(crate) fn gird_and_stand(&mut self, levels: Option<(u8, u8)>) {
        let (seed, mut nth, shield_chance) = (self.world_seed, 0_u32, self.shield_chance());
        for post in &mut self.garrison {
            for &(_, rank, _, _) in &post.members {
                let (level, shield) = gird_of(seed, nth, levels, shield_chance);
                // A Boss or a Miniboss never stands shielded, at the owner's word; the draw is still made, so every
                // other foe's stays as it was.
                post.girds.push((level, shield.filter(|_| !matches!(rank, Rank::Miniboss | Rank::Boss))));
                nth += 1;
            }
        }
        for post in 0..self.garrison.len() {
            self.stand_post(post);
        }
    }

    /// A group's post at a point, each foe placed on the navmesh: a group that holds its post with a leader in the
    /// middle facing the nearest spawn and the rest round it facing outward; one that walks a beat drawn from the
    /// `lattice` in its places at the beat's first point. None when the mesh does not reach the point, or a place falls
    /// outside the section or within SPAWN_CLEAR of a spawn.
    pub(crate) fn post_at(
        &self,
        group: &Group,
        (x, y): (f64, f64),
        (section, lattice): (&Section, &[(f64, f64)]),
        (draws, beats): (&mut Mulberry32, &mut Mulberry32),
    ) -> Option<Post> {
        let mesh = self.mesh_at([x, y, 0.0]);
        let at = mesh.nearest_point([x, y, self.floor.height_at(x, y)])?;
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
            members.push((number, rank, mesh.nearest_point(place)?, outward));
        }
        // A Boss's or a Miniboss's group, at the farthest post, holds it: the one fight a player seeks out there.
        let walks = !group.farthest && !group.holds;
        let beat = walks.then(|| Beat::drawn((mesh, &self.floor), at, lattice, section, beats)).flatten();
        if let Some(beat) = &beat {
            let places = beat.places((mesh, &self.floor), members.len(), false);
            for (member, (place, facing)) in members.iter_mut().zip(places) {
                (member.2, member.3) = (place, facing);
            }
        }
        let clear = |place: &[f64; 3]| {
            inside(&section.ring, place[0], place[1])
                && section.spawns.iter().all(|&[sx, sy]| apart([place[0], place[1]], [sx, sy]) >= SPAWN_CLEAR)
        };
        members.iter().all(|(_, _, place, _)| clear(place)).then_some(Post {
            at,
            members,
            girds: Vec::new(),
            beat,
            standing: Vec::new(),
            cleared_at: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: at,
            anchor: None,
            arrival: false,
        })
    }

    /// Stands every foe of a post's group at its place, idle, facing as it was posted, leashed to it, at its level
    /// raised by the seas and with its shield whole, if it has one.
    pub(crate) fn stand_post(&mut self, post: usize) {
        let standing = (0..self.garrison[post].members.len()).filter_map(|nth| self.stand_member(post, nth)).collect();
        self.renew_post(post, standing);
    }

    /// A post's group as it stands anew, `standing`: led afresh, unbroken, not defending, its beat begun again.
    fn renew_post(&mut self, post: usize, standing: Vec<FighterId>) {
        if let Some(first) = self.garrison[post].standing.first() {
            self.unvisited.remove(first);
        }
        self.garrison[post].leader = leader_of(self, &standing);
        (self.garrison[post].standing, self.garrison[post].cleared_at) = (standing, None);
        (self.garrison[post].broken, self.garrison[post].defending) = (false, false);
        self.renew_last_stand();
        let clock = self.clock;
        if let Some(beat) = self.garrison[post].beat.as_mut() {
            beat.restart(clock);
        }
    }

    /// A garrison level raised by the room's seas, or the week's run's own level whatever the seas; 0, none, stays
    /// none.
    pub(crate) fn at_seas(&self, level: u8) -> u8 {
        let fixed = self.run.as_ref().and_then(|run| run.foes_at);
        if level == 0 { 0 } else { fixed.unwrap_or_else(|| self.difficulty.raise(level)) }
    }

    /// Raises every garrison foe standing to its level at the room's seas, which a host sets once the room has opened:
    /// its health and its shield grow by the levels it gained, as standing at them would have made them.
    pub(crate) fn raise_garrison(&mut self) {
        for post in 0..self.garrison.len() {
            let found = &self.garrison[post];
            let raised: Vec<(FighterId, u8)> =
                found.standing.iter().zip(&found.girds).map(|(id, &(level, _))| (*id, self.at_seas(level))).collect();
            for (id, level) in raised {
                let Some(foe) = self.foes.get_mut(&id) else { continue };
                let times = gear::power::foe_health_times(level) / gear::power::foe_health_times(foe.level);
                foe.level = level;
                foe.grow(times);
                if let Some(shield) = foe.shield.as_mut() {
                    shield.left *= times;
                    shield.most *= times;
                }
            }
        }
    }

    /// Each tick a patrol's foes' sites a player has come near stand their groups, each group walks its beat, and a
    /// half-fallen patrol group left alone is made whole (`stands.rs`); a group whose last foe has fallen is cleared
    /// from that tick, and stands again once STAND_AGAIN has passed, no player stands within CLEAR_AROUND of its post,
    /// and the living foes leave room for it.
    pub(crate) fn keep_garrison(&mut self) {
        self.stand_sites();
        self.lift_sites();
        self.lead_groups();
        self.walk_beats();
        // A wave that has fallen is gone: it never stands again.
        let foes = &self.foes;
        let fallen = |id: &FighterId| foes.get(id).is_none_or(|foe| foe.fighter.dead());
        self.garrison.retain(|post| !post.arrival || !post.standing.iter().all(fallen));
        for post in 0..self.garrison.len() {
            self.make_whole(post);
            let found = &self.garrison[post];
            let fallen = |id: &FighterId| self.foes.get(id).is_none_or(|foe| foe.fighter.dead());
            let Some(cleared) = found.cleared_at else {
                if found.standing.iter().all(fallen) && !self.held_back(post) {
                    self.garrison[post].cleared_at = Some(self.clock);
                }
                continue;
            };
            let near = self.players.values().any(|player| {
                apart([player.fighter.body.x, player.fighter.body.y], [found.at[0], found.at[1]]) <= CLEAR_AROUND
            });
            let room_for = self.living_foes() + found.members.len() <= self.others_most();
            let great = found.members.iter().any(|(_, rank, _, _)| matches!(rank, Rank::Miniboss | Rank::Boss));
            let again = if great { GREAT_STAND_AGAIN } else { STAND_AGAIN };
            if self.clock >= cleared + again && !near && room_for && self.stands_again(post) {
                self.stand_group_again(post);
            }
        }
        self.pay_garrison_clear();
    }
}

#[path = "beat.rs"]
mod beat;

#[path = "stands.rs"]
mod stands;
use stands::farthest;

#[path = "smaller.rs"]
mod smaller;

pub(crate) use stands::Site;

#[path = "groups.rs"]
mod groups;
pub(crate) use groups::{Encounter, leader_of};

#[cfg(test)]
#[path = "groups_tests.rs"]
mod groups_tests;

#[cfg(test)]
#[path = "garrison_tests.rs"]
pub(crate) mod garrison_tests;

#[cfg(test)]
#[path = "gird_tests.rs"]
mod gird_tests;

#[cfg(test)]
#[path = "leash_tests.rs"]
mod leash_tests;

#[cfg(test)]
#[path = "crowd_tests.rs"]
mod crowd_tests;

#[cfg(test)]
#[path = "beat_tests.rs"]
mod beat_tests;

#[cfg(test)]
#[path = "stands_tests.rs"]
mod stands_tests;

#[cfg(test)]
#[path = "clears_tests.rs"]
mod clears_tests;
