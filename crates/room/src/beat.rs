//! A garrison group's beat: a round of points over its room's navmesh, drawn from the node's seed, that the group
//! walks at a stroll, its leader on the way and the rest on a half ring behind it, pausing at each point and starting
//! again from the first. The way between points is the navmesh's and keeps as clear of the spawns as the posts do,
//! and SPREAD inside the section's edge. The group halts while any of its foes is stirred, fights or walks back to its place, and
//! waits for one that has fallen behind.

use super::{SPAWN_CLEAR, SPREAD};
use crate::Floor;
use ::foes::Alertness;
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use core::f64::consts::PI;
use movement::{TICK_SECONDS, TUNING, Terrain};
use naval::random::Mulberry32;
use navmesh::NavMesh;
use reach::{Section, distance_to_ring, inside};

/// A beat's points, its post the first; how far each lies from the one before, and at least from every earlier one.
pub(crate) const POINTS: usize = 4;
pub(crate) const LEG: (f64, f64) = (12.0, 30.0);
pub(crate) const APART: f64 = 10.0;
/// The group pauses this many ticks (4 s) at each point, and walks at this share of a walk: a stroll.
pub(crate) const PAUSE: u64 = 4 * 60;
pub(crate) const PACE: f64 = 0.35;
/// The group waits for a foe this far from its place. Walking, it faces the way this far on along its beat.
pub(crate) const LAG: f64 = 4.0;
const AHEAD: f64 = 2.0;
/// The way between two points is checked every this many metres along it, and its draws tried this many times.
const SAMPLE: f64 = 1.0;
const TRIES: usize = 24;

/// A group's beat: its points, the way round them back to the first (its corners, and how far along it each stands),
/// how far along that way each point stands, how far along it the group's leader stands now, and the tick its pause
/// at a point ends.
#[derive(Clone, Debug)]
pub(crate) struct Beat {
    corners: Vec<[f64; 3]>,
    along: Vec<f64>,
    stops: Vec<f64>,
    at: f64,
    paused_until: u64,
}

/// The navmesh's point nearest (x, y), where a foe of a group keeps its place round `from`, its leader's point or its
/// gathering's middle: on the ground's level under `from`, else on `from`'s, so beside a leader on a ledge or a ramp
/// with no ground near it stands on that; `from` itself only where the mesh has neither, so it never shares its
/// leader's point while the mesh holds one.
pub(crate) fn near_on((nav, floor): (&NavMesh, &Floor), from: [f64; 3], (x, y): (f64, f64)) -> [f64; 3] {
    let on = |z: f64| nav.nearest_point([x, y, z]);
    on(floor.height_under(x, y, from[2])).or_else(|| on(from[2])).unwrap_or(from)
}

/// The navmesh's way from one point to another, if every metre of it keeps inside the section, SPREAD inside its edge,
/// and SPAWN_CLEAR and SPREAD from every spawn, as a group walking it round its leader needs.
fn clear_way(nav: &NavMesh, from: [f64; 3], to: [f64; 3], section: &Section) -> Option<Vec<[f64; 3]>> {
    let way = nav.find_path(from, to)?;
    let clear = |x: f64, y: f64| {
        inside(&section.ring, x, y)
            && distance_to_ring(&section.ring, x, y) >= SPREAD
            && section.spawns.iter().all(|&spawn| apart([x, y], spawn) >= SPAWN_CLEAR + SPREAD)
    };
    let clear_leg = |pair: &[[f64; 3]]| {
        let steps = (apart([pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]) / SAMPLE).ceil().max(1.0) as u32;
        (0..=steps).all(|step| {
            let share = f64::from(step) / f64::from(steps);
            clear(pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share)
        })
    };
    way.windows(2).all(clear_leg).then_some(way)
}

impl Beat {
    /// A beat drawn from `draws` for a group posted at `post`: each next point an open point of the lattice LEG from
    /// the one before and APART from every earlier one, the navmesh's way to it clear; the last's way back to the post
    /// clear too. None when no second point can be had, and the group holds its post.
    pub(crate) fn drawn(
        (nav, floor): (&NavMesh, &Floor),
        post: [f64; 3],
        open: &[(f64, f64)],
        section: &Section,
        draws: &mut Mulberry32,
    ) -> Option<Beat> {
        let mut points = vec![post];
        let mut ways: Vec<Vec<[f64; 3]>> = Vec::new();
        for _ in 0..TRIES {
            if points.len() == POINTS {
                break;
            }
            let last = points[points.len() - 1];
            let fits = |&&(x, y): &&(f64, f64)| {
                let from_last = apart([x, y], [last[0], last[1]]);
                (LEG.0..=LEG.1).contains(&from_last)
                    && points.iter().all(|point| apart([x, y], [point[0], point[1]]) >= APART)
            };
            let near: Vec<&(f64, f64)> = open.iter().filter(fits).collect();
            if near.is_empty() {
                break;
            }
            let &(x, y) = near[((draws.draw() * near.len() as f64) as usize).min(near.len() - 1)];
            let Some(point) = nav.nearest_point([x, y, floor.height_at(x, y)]) else { continue };
            if let Some(way) = clear_way(nav, last, point, section) {
                points.push(point);
                ways.push(way);
            }
        }
        // The way back to the post closes the round; a last point with no clear way back is given up.
        while points.len() > 1 {
            if let Some(way) = clear_way(nav, points[points.len() - 1], post, section) {
                ways.push(way);
                return Some(Beat::round(&points, &ways));
            }
            points.pop();
            ways.pop();
        }
        None
    }

    /// A beat round `points` by `ways`, the way from each to the next and from the last back to the first, its
    /// group standing at the first, pausing.
    fn round(points: &[[f64; 3]], ways: &[Vec<[f64; 3]>]) -> Beat {
        let mut corners = vec![points[0]];
        let mut stops = vec![0.0];
        for way in ways {
            corners.extend(way.iter().skip(1));
            stops.push(0.0);
        }
        let mut along = vec![0.0];
        for pair in corners.windows(2) {
            along.push(along[along.len() - 1] + apart([pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]));
        }
        // Each point stands where its way in ends: the corners counted so far.
        let mut corner = 0;
        for (stop, way) in stops.iter_mut().skip(1).zip(ways) {
            corner += way.len() - 1;
            *stop = along[corner];
        }
        stops.pop();
        Beat { corners, along, stops, at: 0.0, paused_until: PAUSE }
    }

    /// Its points, its post the first.
    #[cfg(test)]
    pub(crate) fn points(&self) -> Vec<[f64; 3]> {
        self.stops.iter().map(|&stop| self.point_at(stop)).collect()
    }

    /// Its way round, a point every metre.
    #[cfg(test)]
    pub(crate) fn way(&self) -> Vec<[f64; 3]> {
        (0..=self.length().ceil() as u32).map(|metre| self.point_at(f64::from(metre))).collect()
    }

    /// The length of its way round.
    fn length(&self) -> f64 {
        self.along[self.along.len() - 1]
    }

    /// The point `distance` along its way round, from the first point, round again past the end.
    fn point_at(&self, distance: f64) -> [f64; 3] {
        let distance = distance.rem_euclid(self.length().max(1e-9));
        let leg = self.along.windows(2).position(|pair| distance < pair[1]).unwrap_or(self.along.len() - 2);
        let (from, to) = (self.corners[leg], self.corners[leg + 1]);
        let share = (distance - self.along[leg]) / (self.along[leg + 1] - self.along[leg]).max(1e-9);
        [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share]
    }

    /// Its group stands again at its post, pausing there, from `clock`.
    pub(crate) fn restart(&mut self, clock: u64) {
        (self.at, self.paused_until) = (0.0, clock + PAUSE);
    }

    /// One tick of its group's walk: on along its way at PACE while the group is `ready` and its pause is over,
    /// pausing at each point it reaches. Answers whether it walks on.
    pub(crate) fn step(&mut self, clock: u64, ready: bool) -> bool {
        if clock < self.paused_until || !ready {
            return false;
        }
        let next = self.stops.iter().copied().find(|&stop| stop > self.at).unwrap_or(self.length());
        self.at += PACE * TUNING.walk * TICK_SECONDS;
        if self.at >= next {
            self.at = if next >= self.length() { 0.0 } else { next };
            self.paused_until = clock + PAUSE;
        }
        true
    }

    /// The places of its group of `count` and the way each faces: its leader on its way, facing the way on, and the
    /// rest on a half ring SPREAD behind it, each the navmesh's point nearest its place; walking (`marching`) they face
    /// the way on, standing each faces out from the leader.
    pub(crate) fn places(
        &self,
        (nav, floor): (&NavMesh, &Floor),
        count: usize,
        marching: bool,
    ) -> Vec<([f64; 3], f64)> {
        let lead = self.point_at(self.at);
        let on = self.point_at(self.at + AHEAD);
        let heading = bearing([lead[0], lead[1]], [on[0], on[1]]);
        let followers = count.saturating_sub(1);
        let mut places = vec![(lead, heading)];
        for index in 0..followers {
            let out = heading + PI + ((index as f64 + 0.5) / followers as f64 - 0.5) * PI;
            let (x, y) = (lead[0] + libm::sin(out) * SPREAD, lead[1] - libm::cos(out) * SPREAD);
            let place = near_on((nav, floor), lead, (x, y));
            places.push((place, if marching { heading } else { out }));
        }
        places.truncate(count);
        places
    }
}

impl crate::Room {
    /// Each group with a beat walks on along it while all its living foes are idle and none is LAG from its place,
    /// and each of them is given its place: its leader the beat's, the rest round it in turn.
    pub(super) fn walk_beats(&mut self) {
        for post in 0..self.garrison.len() {
            // A group gathered elsewhere, as its encounter gives ground or it defends, keeps to the places it has there.
            if self.garrison[post].anchor.is_some() {
                continue;
            }
            let Some(mut beat) = self.garrison[post].beat.take() else { continue };
            let living: Vec<FighterId> = self.garrison[post]
                .standing
                .iter()
                .copied()
                .filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead()))
                .collect();
            // A foe still arriving is not yet home: its beat waits until it lands.
            let ready = living.iter().all(|id| {
                let foe = &self.foes[id];
                if self.arriving(*id) {
                    return false;
                }
                let near = foe.brain.home().is_some_and(|home| {
                    apart([foe.fighter.body.x, foe.fighter.body.y], [home.at[0], home.at[1]]) <= LAG
                });
                near && foe.brain.alertness() == Alertness::Idle && !foe.brain.returning()
            });
            let marching = beat.step(self.clock, ready);
            let places = beat.places((self.mesh_at(self.garrison[post].at), &self.floor), living.len(), marching);
            for (id, (place, facing)) in living.iter().zip(places) {
                if let Some(foe) = self.foes.get_mut(id) {
                    foe.brain.keep_to(place, facing, marching);
                }
            }
            self.garrison[post].beat = Some(beat);
        }
    }
}
