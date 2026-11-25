//! A patrol's Grey Tithe kept as a Destiny patrol area keeps its foes, under the open sky: a group standing again, or
//! a half-fallen group's fallen, comes back by airship; and while players roam the zone past its landing, airships
//! bring more groups to the ground near them, so foes are met across the whole zone and not only by the landing and at
//! its sites (the owner's "be present moreso than they are now"). A group brought walks a beat where it was set down
//! (a sentry or a watch holds its post there) and never stands again; once no player has come near it for a while, far
//! off, it is gone, so the next is brought where the players are.

use super::{FROM_SQUARE, NODE_AROUND, POSTS_APART, SPAWN_CLEAR, draws_of, gird_of, open_points, varied};
use crate::Room;
use combat::fighter::FighterId;
use combat::sight::apart;
use std::collections::BTreeMap;

/// At most this many groups the airships brought stand at once; the first comes this long after a player first
/// roams, each next between these two after the last (ticks), and a try that finds no room or ground tries again
/// this much later.
pub(crate) const BROUGHT_MOST: usize = 3;
const FIRST_AFTER: u64 = 20 * 60;
const EVERY: (u64, u64) = (45 * 60, 75 * 60);
const TRY_AGAIN: u64 = 5 * 60;
/// A player roams once this far from every spawn: at the landing, nothing is brought.
pub(crate) const ROAMS_FROM: f64 = 60.0;
/// A group is set down this far from the player it is brought to, as near as it can to the middle, and at least
/// SPAWN_CLEAR from every player.
pub(crate) const SET_DOWN: (f64, f64) = (35.0, 80.0);
const SET_DOWN_AT: f64 = 50.0;
/// Nor within this of a foes' site or a quest's place, nor of the edge of a public event's ground.
pub(crate) const LAID_CLEAR: f64 = 60.0;
/// Where no ground the room has reaches a point that far, one is baked round the middle of the cell of this grid
/// that holds a point this far from the player, ahead of them as near as it can be (AROUND), at most this many for
/// the airships in a room (each kept, as a place's is).
const CELL: f64 = 60.0;
const AHEAD: f64 = 50.0;
pub(crate) const GROUNDS_MOST: usize = 10;
/// The ways round a player a cell to bake is looked for, in eighths of a turn off where they face: ahead first, then
/// either side of it, and behind last.
const AROUND: [f64; 8] = [0.0, 1.0, -1.0, 2.0, -2.0, 3.0, -3.0, 4.0];
/// A ground baked for an airship is named so.
pub(crate) const GROUND_NAME: &str = "airship";
/// A group brought that no player has come within this of for this long, its foes all idle, is gone.
pub(crate) const LIFT_FAR: f64 = 220.0;
pub(crate) const LIFT_AFTER: u64 = 90 * 60;
/// The groups the airships bring are drawn from a stream of their own.
const BROUGHT_STREAM: u64 = 0x6272_6f75_6768_7421;

/// The airships' groups: the tick the next is tried, how many have been brought, and each group standing by its first
/// foe, with the last tick a player came near it.
#[derive(Debug, Default)]
pub(crate) struct Brought {
    next: u64,
    sent: u32,
    pub groups: BTreeMap<FighterId, u64>,
}

impl Room {
    /// A group of the garrison standing again: under the open sky it comes back by airship.
    pub(crate) fn stand_group_again(&mut self, post: usize) {
        self.stand_post(post);
        let standing = self.garrison[post].standing.clone();
        self.by_airship(&standing);
    }

    /// Each tick in a patrol under the open sky: groups no one comes near are gone, and when one is due and the room
    /// has room, an airship brings a varied group to a roaming player, in turn.
    pub(super) fn reinforce(&mut self) {
        if self.place != Some(gear::gate::Place::Patrol) || !self.open_sky() {
            return;
        }
        self.lift_away();
        let roaming = self.roaming();
        if roaming.is_empty() {
            return;
        }
        if self.brought.next == 0 {
            self.brought.next = self.clock + FIRST_AFTER;
        }
        let standing = self.brought.groups.len();
        if self.clock < self.brought.next || standing >= BROUGHT_MOST {
            return;
        }
        let sent = self.brought.sent;
        let seed = self.world_seed ^ BROUGHT_STREAM ^ u64::from(sent).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        let mut draws = draws_of(seed);
        let group = varied(&mut draws);
        if self.living_foes() + group.members.len() > self.others_most() {
            self.brought.next = self.clock + TRY_AGAIN;
            return;
        }
        let player = roaming[sent as usize % roaming.len()];
        let Some((point, ground)) = self.set_down_near(player) else { return };
        let Some(section) = self.section.clone() else { return };
        let middle = self.ground_middle_of(ground);
        let mut lattice = open_points(&section, middle);
        lattice.retain(|point| self.mesh_index([point.0, point.1]) == ground);
        let mut beats = draws_of(seed ^ super::BEAT_STREAM);
        let Some(mut post) = self.post_at(&group, point, (&section, &lattice), (&mut draws, &mut beats)) else {
            self.brought.next = self.clock + TRY_AGAIN;
            return;
        };
        post.arrival = true;
        let (levels, chance) = (self.quests.levels, self.shield_chance());
        post.girds = (0..post.members.len()).map(|nth| gird_of(seed, nth as u32, levels, chance)).collect();
        self.garrison.push(post);
        let at = self.garrison.len() - 1;
        self.stand_post(at);
        let standing = self.garrison[at].standing.clone();
        if let Some(first) = standing.first() {
            self.brought.groups.insert(*first, self.clock);
        }
        self.by_airship(&standing);
        let (least, most) = EVERY;
        self.brought.sent += 1;
        self.brought.next = self.clock + least + (draws.draw() * (most - least) as f64) as u64;
    }

    /// The players roaming: living, and farther than ROAMS_FROM from every spawn.
    fn roaming(&self) -> Vec<[f64; 3]> {
        let spawns = &self.spawn_points;
        self.players
            .values()
            .filter(|player| player.living())
            .map(|player| player.fighter.body)
            .filter(|body| spawns.iter().all(|&(x, y)| apart([body.x, body.y], [x, y]) > ROAMS_FROM))
            .map(|body| [body.x, body.y, body.facing])
            .collect()
    }

    /// Where a group is set down for a player at (x, y, facing): a point of a ground the room has, on its lattice,
    /// SET_DOWN from them and as near SET_DOWN_AT as any, SPAWN_CLEAR from every player and POSTS_APART from every foe
    /// and post; else a ground baked round a cell round them (`cell_to_bake`), while the airships may bake more,
    /// waiting on it.
    fn set_down_near(&mut self, [x, y, facing]: [f64; 3]) -> Option<((f64, f64), usize)> {
        let section = self.section.clone()?;
        let players: Vec<[f64; 2]> = self
            .players
            .values()
            .filter(|player| player.living())
            .map(|found| [found.fighter.body.x, found.fighter.body.y])
            .collect();
        let taken: Vec<[f64; 2]> = self
            .foes
            .values()
            .filter(|foe| !foe.fighter.dead())
            .map(|foe| [foe.fighter.body.x, foe.fighter.body.y])
            .chain(self.garrison.iter().map(|post| [post.at[0], post.at[1]]))
            .collect();
        // Clear of the zone's laid encounters, its caverns' and runs' sites, its quests' places and its public events'
        // grounds, running or not: an airship adds to the ground between them, never crowds one.
        let laid: Vec<([f64; 2], f64)> = self
            .foe_sites
            .iter()
            .map(|(at, _)| (*at, LAID_CLEAR))
            .chain(self.quests.places.iter().map(|place| (place.at, LAID_CLEAR)))
            .chain(self.event_grounds().into_iter().map(|(at, radius)| (at, radius + LAID_CLEAR)))
            .collect();
        let fits = |point: [f64; 2]| {
            let far = apart(point, [x, y]);
            (SET_DOWN.0..=SET_DOWN.1).contains(&far)
                && players.iter().all(|player| apart(point, *player) >= SPAWN_CLEAR)
                && taken.iter().all(|other| apart(point, *other) >= POSTS_APART)
                && laid.iter().all(|(other, clear)| apart(point, *other) >= *clear)
        };
        let mut best: Option<((f64, f64), usize, f64)> = None;
        for ground in 0..=self.quests.grounds.len() {
            for point in open_points(&section, self.ground_middle_of(ground)) {
                let off = (apart([point.0, point.1], [x, y]) - SET_DOWN_AT).abs();
                if self.mesh_index([point.0, point.1]) == ground
                    && fits([point.0, point.1])
                    && best.is_none_or(|(_, _, was)| off < was)
                {
                    best = Some((point, ground, off));
                }
            }
        }
        if let Some((point, ground, _)) = best {
            return Some((point, ground));
        }
        // The room bakes one ground at a time, some 45 ticks each: an airship's under way is stepped on until it is
        // whole, wherever the player has gone since; it never takes the turn of another's under way, nor begins one
        // the tick after another place waited for its turn, so a site or a quest's place waits at most one of its.
        let waited = self.quests.waited.as_ref();
        let others_wait = waited.is_some_and(|(tick, name)| tick + 1 >= self.clock && !name.starts_with(GROUND_NAME));
        let to_bake = match self.quests.baking.as_ref() {
            Some((name, bounds, _)) if name.starts_with(GROUND_NAME) => {
                Some([(bounds.min_x + bounds.max_x) / 2.0, (bounds.min_y + bounds.max_y) / 2.0])
            }
            Some(_) => None,
            None if others_wait || self.airship_grounds() >= GROUNDS_MOST => None,
            None => self.cell_to_bake(&section, [x, y, facing]),
        };
        let Some(cell) = to_bake else {
            self.brought.next = self.clock + TRY_AGAIN;
            return None;
        };
        let name = format!("{GROUND_NAME} {:.0} {:.0}", cell[0], cell[1]);
        let place = gear::quests::Place { name, at: cell, radius: 0.0 };
        // Once whole, the next tick sets the group down on it, or on another ground nearer the player by then.
        let _ = self.ground_of(&place, NODE_AROUND - FROM_SQUARE);
        None
    }

    /// How many grounds the room has baked for the airships, whichever place's turn finished each.
    pub(crate) fn airship_grounds(&self) -> usize {
        self.quests.grounds.iter().filter(|(name, _, _)| name.starts_with(GROUND_NAME)).count()
    }

    /// The middle and radius of each of the zone's public events' grounds, running or not.
    fn event_grounds(&self) -> Vec<([f64; 2], f64)> {
        let Some(public) = self.public.as_ref() else { return Vec::new() };
        let fissure = public.grounds.fissure.as_ref().map(|ground| (ground.at, ground.radius));
        let raid = public.grounds.raid.as_ref().map(|ground| (ground.at, ground.radius));
        fissure.into_iter().chain(raid).collect()
    }

    /// The cell of the CELL grid a ground is baked round for a player at (x, y, facing): the one holding the point
    /// AHEAD of them, else the one holding such a point an eighth of a turn off that way to either side, then a
    /// quarter, and so on round to behind them; the first whose middle is in the section and that the room has no ground round yet (where it has one, it
    /// was looked over and nothing on it fit). None where every cell round them is out or had.
    fn cell_to_bake(&self, section: &crate::Section, [x, y, facing]: [f64; 3]) -> Option<[f64; 2]> {
        let reach = NODE_AROUND - FROM_SQUARE;
        AROUND
            .iter()
            .map(|turn| {
                let bearing = facing + turn * core::f64::consts::FRAC_PI_4;
                let ahead = [x + libm::sin(bearing) * AHEAD, y - libm::cos(bearing) * AHEAD];
                ahead.map(|part| (libm::floor(part / CELL) + 0.5) * CELL)
            })
            .find(|cell| reach::inside(&section.ring, cell[0], cell[1]) && self.ground_had(*cell, reach).is_none())
    }

    /// The middle of one of the room's grounds: the node's own square's, or a place's.
    fn ground_middle_of(&self, ground: usize) -> (f64, f64) {
        let bounds = ground.checked_sub(1).and_then(|at| self.quests.grounds.get(at)).map(|(_, bounds, _)| *bounds);
        let Some(bounds) = bounds.or_else(|| self.own_square()) else { return (0.0, 0.0) };
        ((bounds.min_x + bounds.max_x) / 2.0, (bounds.min_y + bounds.max_y) / 2.0)
    }

    /// The groups brought that no player has come within LIFT_FAR of for LIFT_AFTER, every foe of them idle, are
    /// gone; one all fallen is forgotten. A player fallen near one is near it: they stand again near where they fell.
    fn lift_away(&mut self) {
        let clock = self.clock;
        let players: Vec<[f64; 2]> =
            self.players.values().map(|found| [found.fighter.body.x, found.fighter.body.y]).collect();
        for (first, near) in core::mem::take(&mut self.brought.groups) {
            let Some(post) =
                self.garrison.iter().position(|post| post.arrival && post.standing.first() == Some(&first))
            else {
                continue;
            };
            let living: Vec<FighterId> = self.garrison[post]
                .standing
                .iter()
                .copied()
                .filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()))
                .collect();
            if living.is_empty() {
                continue;
            }
            let at = self.garrison[post].at;
            let bodies = living.iter().filter_map(|id| self.foes.get(id)).map(|foe| foe.fighter.body);
            let near_now = core::iter::once([at[0], at[1]])
                .chain(bodies.map(|body| [body.x, body.y]))
                .any(|place| players.iter().any(|player| apart(place, *player) <= LIFT_FAR));
            let idle = living.iter().all(|id| {
                self.foes.get(id).is_some_and(|foe| foe.brain.alertness() == ::foes::Alertness::Idle)
                    && !self.arriving(*id)
            });
            if !near_now && idle && clock >= near + LIFT_AFTER {
                for id in living {
                    self.gone(id);
                }
                continue;
            }
            self.brought.groups.insert(first, if near_now { clock } else { near });
        }
    }
}
