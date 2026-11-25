//! Where a garrison's groups stand beyond its posts' first laying: a patrol's foes' sites, the middles of its caverns
//! (a coven's or a cave's area) and of its runs' beats but their end arenas, each standing a group the first time a
//! player comes within SITE_NEAR of it, on a mesh baked round it then (`quests.rs`' `ground_of`), so a room's opening
//! grows no slower; and a half-fallen patrol group made whole again once no player has come near its post for
//! STAND_AGAIN, as a Destiny patrol area resets (the owner's "Whatever destiny does").

use super::{
    BEAT_STREAM, CLEAR_AROUND, FROM_SQUARE, Group, NODE_AROUND, PATROL, POSTS_APART, STAND_AGAIN, draws_of, foe_type,
    gird_of, index, open_points,
};
use crate::Room;
use combat::fighter::FighterId;
use combat::sight::apart;
use naval::random::Mulberry32;
use reach::Section;

/// A foes' site stands its group the first time a player comes this near its middle.
pub(super) const SITE_NEAR: f64 = 150.0;
/// Each site's group is drawn from a stream of its own, by where the site is, so the order sites are named in moves
/// none.
const SITE_STREAM: u64 = 0x7369_7465_5f66_6f65;

/// A group of two to four, each foe drawn from `from`.
pub(super) fn band(draws: &mut Mulberry32, from: &[(u8, ::foes::Rank)]) -> Group {
    let size = 2 + index(draws, 3);
    let members = (0..size).map(|_| from[index(draws, from.len())]).collect();
    Group { members, leads: false, farthest: false, holds: false }
}

/// Tries the open points in turn, each the one `pick` names, until `post` stands a post at one; only that one clears
/// the points within POSTS_APART of it, so a point refused takes no good point near it with it.
pub(super) fn first_post<T>(
    open: &mut Vec<(f64, f64)>,
    draws: &mut Mulberry32,
    pick: impl Fn(&[(f64, f64)], &mut Mulberry32) -> usize,
    mut post: impl FnMut((f64, f64), &mut Mulberry32) -> Option<T>,
) -> Option<T> {
    while !open.is_empty() {
        let point = open.remove(pick(open, draws));
        if let Some(stood) = post(point, draws) {
            open.retain(|&other| apart([other.0, other.1], [point.0, point.1]) >= POSTS_APART);
            return Some(stood);
        }
    }
    None
}

impl Room {
    /// A patrol's foes' sites, as its node's file names them, but those its own square holds, whose ground its
    /// garrison holds already; none stand yet. Any other room's garrison is drawn as one (a mission's or a dungeon's
    /// gives ground as one encounter), so it takes none.
    pub fn set_foe_sites(&mut self, sites: &[[f64; 2]]) {
        let Some(square) = self.own_square().filter(|_| self.place == Some(gear::gate::Place::Patrol)) else { return };
        self.quests.square = Some(square);
        let held = |&[x, y]: &[f64; 2]| {
            (square.min_x..=square.max_x).contains(&x) && (square.min_y..=square.max_y).contains(&y)
        };
        self.foe_sites = sites.iter().filter(|site| !held(site)).map(|&at| (at, false)).collect();
    }

    /// Stands each site's group the first time a player comes within SITE_NEAR of it, none within CLEAR_AROUND, and
    /// the living foes leave it room: drawn as a patrol's other groups are, at the site's middle or the lattice point nearest it within
    /// POSTS_APART that holds it, its beat over the lattice its mesh holds; given up where none does. One mesh is baked
    /// a tick, so a site may wait a tick for its own.
    pub(super) fn stand_sites(&mut self) {
        for site in 0..self.foe_sites.len() {
            let (at, stood) = self.foe_sites[site];
            let within = |reach: f64| {
                self.players.values().any(|player| apart([player.fighter.body.x, player.fighter.body.y], at) <= reach)
            };
            // One within CLEAR_AROUND would see it stand beside them, as a cleared group waits for none to be.
            if stood || !within(SITE_NEAR) || within(CLEAR_AROUND) {
                continue;
            }
            // Mixed by odd numbers so the stream's fold to 32 bits keeps both halves of each of the two.
            let mix = at[0].to_bits().wrapping_mul(0x9e37_79b9_7f4a_7c15)
                ^ at[1].to_bits().wrapping_mul(0xc2b2_ae3d_27d4_eb4f);
            let seed = self.world_seed ^ SITE_STREAM ^ mix;
            let mut draws = draws_of(seed);
            // A site's group is a band, as it was laid and walked: the smaller groups stand by the landing and come by
            // airship (`smaller.rs`).
            let group = band(&mut draws, &PATROL);
            if self.living_foes() + group.members.len() > self.others_most() {
                continue;
            }
            let place = gear::quests::Place { name: format!("foes at {:.1} {:.1}", at[0], at[1]), at, radius: 0.0 };
            if self.ground_of(&place, NODE_AROUND - FROM_SQUARE).is_none() {
                continue;
            }
            self.foe_sites[site].1 = true;
            let Some(section) = self.section.clone() else { return };
            let mesh = self.mesh_index(at);
            let mut lattice = open_points(&section, (at[0], at[1]));
            lattice.retain(|point| self.mesh_index([point.0, point.1]) == mesh);
            let mut beats = draws_of(seed ^ BEAT_STREAM);
            let mut tries: Vec<(f64, f64)> =
                lattice.iter().copied().filter(|&(x, y)| apart([x, y], at) <= POSTS_APART).collect();
            tries.sort_by(|one, two| apart([one.0, one.1], at).total_cmp(&apart([two.0, two.1], at)));
            tries.insert(0, (at[0], at[1]));
            let stood =
                |point, draws: &mut Mulberry32| self.post_at(&group, point, (&section, &lattice), (draws, &mut beats));
            let Some(mut post) = first_post(&mut tries, &mut draws, |_, _| 0, stood) else { continue };
            let (levels, chance) = (self.quests.levels, self.shield_chance());
            post.girds = (0..post.members.len()).map(|nth| gird_of(seed, nth as u32, levels, chance)).collect();
            self.garrison.push(post);
            self.stand_post(self.garrison.len() - 1);
        }
    }

    /// Makes a half-fallen patrol group whole once no player has come within CLEAR_AROUND of its post for
    /// STAND_AGAIN, its living foes are idle, and the living foes leave room for its fallen: they stand at their
    /// places, it is led afresh, defends no more and walks its beat again. One all fallen stands again as any does.
    pub(super) fn make_whole(&mut self, post: usize) {
        let found = &self.garrison[post];
        let patrol = self.place == Some(gear::gate::Place::Patrol);
        if !found.defending || found.arrival || !patrol || found.standing.len() != found.members.len() {
            return;
        }
        let near = self.players.values().any(|player| {
            apart([player.fighter.body.x, player.fighter.body.y], [found.at[0], found.at[1]]) <= CLEAR_AROUND
        });
        let fallen: Vec<usize> = (0..found.standing.len())
            .filter(|&nth| self.foes.get(&found.standing[nth]).is_none_or(|foe| foe.fighter.dead()))
            .collect();
        let Some(&first) = found.standing.first() else { return };
        if near || fallen.len() == found.standing.len() {
            self.unvisited.remove(&first);
            return;
        }
        let idle = |id: &FighterId| {
            self.foes.get(id).is_none_or(|foe| foe.fighter.dead() || foe.brain.alertness() == ::foes::Alertness::Idle)
        };
        let (all_idle, room_for) =
            (found.standing.iter().all(idle), self.living_foes() + fallen.len() <= self.others_most());
        let quiet = *self.unvisited.entry(first).or_insert(self.clock);
        if self.clock < quiet + STAND_AGAIN || !room_for || !all_idle {
            return;
        }
        let mut standing = self.garrison[post].standing.clone();
        let mut brought = Vec::new();
        for nth in fallen {
            if let Some(id) = self.stand_member(post, nth) {
                standing[nth] = id;
                brought.push(id);
            }
        }
        self.renew_post(post, standing);
        // Its fallen are brought back to it by airship.
        self.by_airship(&brought);
    }

    /// Stands the `nth` foe of a post's group at its place, idle, facing as it was posted, leashed to it, at its level
    /// raised by the seas and with its shield whole, if it has one.
    pub(super) fn stand_member(&mut self, post: usize, nth: usize) -> Option<FighterId> {
        let (number, rank, place, facing) = *self.garrison[post].members.get(nth)?;
        let (level, shield) = *self.garrison[post].girds.get(nth)?;
        let id = self.stand_foe(foe_type(number)?, rank, place, facing, None);
        self.gird(id, self.at_seas(level), shield);
        self.foes.get_mut(&id)?.brain.posted_at(place, facing);
        Some(id)
    }
}

/// The open point farthest from the nearest spawn; the first of any as far.
pub(super) fn farthest(open: &[(f64, f64)], section: &Section) -> usize {
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
