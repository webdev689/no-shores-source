//! Where a garrison's groups stand beyond its posts' first laying: a patrol's territories, every foes' site its layout
//! lays (each area but a landing, a gate, an entrance, a hamlet, a wilds, a Breach's hollow and a guild's plot, and
//! its runs' beats), each standing a group the first time a player comes within SITE_NEAR of it, on a mesh baked
//! round it then (`quests.rs`' `ground_of`), so a room's opening grows no slower; one no player has come near for a
//! while, out of sight, let go to stand afresh when one does, so the zone's foes are where its players are within the
//! room's limit; and a half-fallen patrol group made whole again once no player has come near its post for
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
/// None stands within this of the edge of a public event's ground, which the event's own foes hold.
pub(crate) const EVENT_CLEAR: f64 = 60.0;
/// A site's group that no player has come within LIFT_FAR of for LIFT_AFTER, its foes all idle, is let go.
pub(crate) const LIFT_FAR: f64 = 220.0;
pub(crate) const LIFT_AFTER: u64 = 90 * 60;

/// A foes' site as a patrol's room keeps it: where it is; whether it has stood its group since it was last let go
/// (or given it up, finding nowhere for it); where that group's post stands; and the last tick a player came within
/// LIFT_FAR of it.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Site {
    pub at: [f64; 2],
    pub stood: bool,
    pub post: Option<[f64; 3]>,
    pub near: u64,
}
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
        let kept = sites.iter().filter(|site| !held(site));
        self.foe_sites = kept.map(|&at| Site { at, stood: false, post: None, near: 0 }).collect();
    }

    /// The middle and radius of each of the zone's public events' grounds, running or not.
    pub(crate) fn event_grounds(&self) -> Vec<([f64; 2], f64)> {
        let Some(public) = self.public.as_ref() else { return Vec::new() };
        let fissure = public.grounds.fissure.as_ref().map(|ground| (ground.at, ground.radius));
        let raid = public.grounds.raid.as_ref().map(|ground| (ground.at, ground.radius));
        fissure.into_iter().chain(raid).collect()
    }

    /// A group of the garrison standing again: under the open sky it comes back by airship.
    pub(crate) fn stand_group_again(&mut self, post: usize) {
        self.stand_post(post);
        let standing = self.garrison[post].standing.clone();
        self.by_airship(&standing);
    }

    /// Stands each site's group when a player comes within SITE_NEAR of it while it stands none, none within
    /// CLEAR_AROUND, and the living foes leave it room: drawn as a patrol's other groups are, at the site's middle or
    /// the lattice point nearest it within POSTS_APART that holds it, its beat over the lattice its mesh holds; given up
    /// where none does. None stands within EVENT_CLEAR of a public event's ground. One mesh is baked a tick, so a site
    /// may wait a tick for its own.
    pub(super) fn stand_sites(&mut self) {
        let events = self.event_grounds();
        for site in 0..self.foe_sites.len() {
            let Site { at, stood: tried, .. } = self.foe_sites[site];
            let within = |reach: f64| {
                self.players.values().any(|player| apart([player.fighter.body.x, player.fighter.body.y], at) <= reach)
            };
            let evented = events.iter().any(|&(middle, radius)| apart(at, middle) <= radius + EVENT_CLEAR);
            // One within CLEAR_AROUND would see it stand beside them, as a cleared group waits for none to be.
            if tried || evented || !within(SITE_NEAR) || within(CLEAR_AROUND) {
                continue;
            }
            // Mixed by odd numbers so the stream's fold to 32 bits keeps both halves of each of the two.
            let mix = at[0].to_bits().wrapping_mul(0x9e37_79b9_7f4a_7c15)
                ^ at[1].to_bits().wrapping_mul(0xc2b2_ae3d_27d4_eb4f);
            let seed = self.world_seed ^ SITE_STREAM ^ mix;
            let mut draws = draws_of(seed);
            // A site's group is a band; the smaller groups stand only in the landing's square (`smaller.rs`).
            let group = band(&mut draws, &PATROL);
            if self.living_foes() + group.members.len() > self.others_most() {
                continue;
            }
            let place = gear::quests::Place { name: format!("foes at {:.1} {:.1}", at[0], at[1]), at, radius: 0.0 };
            if self.ground_of(&place, NODE_AROUND - FROM_SQUARE).is_none() {
                continue;
            }
            self.foe_sites[site].stood = true;
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
            self.foe_sites[site] = Site { at, stood: true, post: Some(post.at), near: self.clock };
            self.garrison.push(post);
            self.stand_post(self.garrison.len() - 1);
        }
    }

    /// Lets go of each site's group that no player has come within LIFT_FAR of for LIFT_AFTER, its living foes all
    /// idle and none arriving, cleared or not: its foes are gone with its post, out of sight, and the site stands
    /// afresh, already on the ground, when a player next comes within SITE_NEAR. So a zone's territories stand where
    /// its players are, within the room's limit.
    pub(super) fn lift_sites(&mut self) {
        let players: Vec<[f64; 2]> =
            self.players.values().map(|found| [found.fighter.body.x, found.fighter.body.y]).collect();
        let mut lifted = Vec::new();
        for site in 0..self.foe_sites.len() {
            let Some(at) = self.foe_sites[site].post else { continue };
            let Some(post) = self.garrison.iter().position(|post| post.at == at) else { continue };
            let living: Vec<FighterId> = self.garrison[post]
                .standing
                .iter()
                .copied()
                .filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()))
                .collect();
            let bodies =
                living.iter().filter_map(|id| self.foes.get(id)).map(|foe| [foe.fighter.body.x, foe.fighter.body.y]);
            let near = core::iter::once([at[0], at[1]])
                .chain(bodies)
                .any(|place| players.iter().any(|player| apart(place, *player) <= LIFT_FAR));
            if near {
                self.foe_sites[site].near = self.clock;
                continue;
            }
            let idle = living.iter().all(|id| {
                !self.arriving(*id)
                    && self.foes.get(id).is_some_and(|foe| foe.brain.alertness() == ::foes::Alertness::Idle)
            });
            if !idle || self.clock < self.foe_sites[site].near + LIFT_AFTER {
                continue;
            }
            for id in living {
                self.gone(id);
            }
            if let Some(first) = self.garrison[post].standing.first() {
                self.unvisited.remove(first);
            }
            (self.foe_sites[site].stood, self.foe_sites[site].post) = (false, None);
            lifted.push(post);
        }
        lifted.sort_unstable();
        for post in lifted.into_iter().rev() {
            self.garrison.remove(post);
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
