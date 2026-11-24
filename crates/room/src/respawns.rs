//! Where a player fallen in a patrol zone or a world boss's node stands again by their own respawn: near where they
//! fell, not back at the landing. The points lie along the node's ways every ALONG_M, its spawns among them, each
//! FROM_EDGE_M or more inside the section with room for a body to stand; the fallen stand at the one nearest where
//! they fell with no living foe within FOES_CLEAR_M, facing where they fell. Where a foe stands near every one, they
//! stand at the section's spawn nearest them.

use crate::garrison::SPAWN_CLEAR;
use crate::{PlayerId, Room};
use combat::sight::{apart, bearing};
use combat::tuning::BODY_HEIGHT;
use movement::Body;
use reach::{distance_to_ring, inside, respawn_point};

/// How far apart the points lie along a way, metres.
pub(crate) const ALONG_M: f64 = 25.0;
/// How far inside the section's edge each lies at least, metres, so no one stands again warned to go back.
pub(crate) const FROM_EDGE_M: f64 = 8.0;
/// No living foe stands nearer the point a player stands again at, metres: as a garrison keeps clear of a spawn.
pub(crate) const FOES_CLEAR_M: f64 = SPAWN_CLEAR;
/// A fallen player this near their point already faces the room's way rather than turning on the spot, metres.
const FACING_NEAR_M: f64 = 0.5;

/// The points every ALONG_M along a way, from its first, and its last.
fn along(way: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    let mut left = 0.0;
    for leg in way.windows(2) {
        let ([from_x, from_y], [to_x, to_y]) = (leg[0], leg[1]);
        let length = apart(leg[0], leg[1]);
        while left <= length {
            let share = if length > 0.0 { left / length } else { 0.0 };
            points.push([from_x + (to_x - from_x) * share, from_y + (to_y - from_y) * share]);
            left += ALONG_M;
        }
        left -= length;
    }
    points.extend(way.last().filter(|last| points.last() != Some(*last)));
    points
}

impl Room {
    /// Where a player's body that fell at (x, y) stands again by its own respawn: where a Breach's rules say
    /// (`breach_stands_at`); at an activity's checkpoint, near where it fell in a patrol zone, else at the section's
    /// spawn nearest it, or the room's spawn.
    pub(crate) fn stand_again(&self, id: PlayerId, x: f64, y: f64) -> Body {
        let found = self.breach_stands_at(id).or_else(|| self.at_checkpoint());
        if let Some(body) = found.or_else(|| self.near_where_fell(x, y)) {
            return body;
        }
        let near = self.section.as_ref().and_then(|section| respawn_point(section, x, y));
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        self.stand(near.map_or(first, |[near_x, near_y]| (near_x, near_y)))
    }

    /// Lays the points a patrol zone's or a world boss's fallen stand again at, from its ways; any other room lays none.
    pub(crate) fn lay_near(&mut self, ways: &[Vec<[f64; 2]>]) {
        let world_boss =
            self.clearing.as_ref().is_some_and(|clearing| clearing.clear == gear::rewards::Clear::WorldBoss);
        let patrol = self.place == Some(gear::gate::Place::Patrol);
        let Some(section) = self.section.as_ref().filter(|_| patrol || world_boss) else { return };
        let ring = &section.ring;
        let laid: Vec<[f64; 2]> =
            section.spawns.iter().copied().chain(ways.iter().flat_map(|way| along(way))).collect();
        let near = laid.into_iter().filter(|&[x, y]| {
            let within = inside(ring, x, y) && distance_to_ring(ring, x, y) >= FROM_EDGE_M;
            within && movement::blocks::room_at(&self.blocks, x, y, self.stand((x, y)).z, BODY_HEIGHT)
        });
        self.respawning.near = near.collect();
    }

    /// A body standing near where a player fell at (x, y), facing there: at the point nearest it with no living foe
    /// within FOES_CLEAR_M; none in a room that lays no points, or where a foe stands near every one.
    pub(crate) fn near_where_fell(&self, x: f64, y: f64) -> Option<Body> {
        let foes: Vec<[f64; 2]> = self
            .foes
            .iter()
            .filter(|(id, foe)| !foe.fighter.dead() && !self.is_companion(**id))
            .map(|(_, foe)| [foe.fighter.body.x, foe.fighter.body.y])
            .collect();
        let clear = |point: &&[f64; 2]| foes.iter().all(|&foe| apart(**point, foe) >= FOES_CLEAR_M);
        let fell = [x, y];
        let found = self
            .respawning
            .near
            .iter()
            .filter(clear)
            .min_by(|one, two| apart(**one, fell).total_cmp(&apart(**two, fell)))?;
        let facing = if apart(*found, fell) > FACING_NEAR_M { bearing(*found, fell) } else { self.facing };
        Some(Body { facing, ..self.stand((found[0], found[1])) })
    }
}

#[cfg(test)]
#[path = "respawns_tests.rs"]
mod respawns_tests;
