//! The Tack's riding lesson in a room: each tick, a player whose task asks a riding act is watched as the room steps
//! them (`gear::quests::RideAct`): up on their horse, a stretch at a walk and one at a gallop, a boost, down again, and
//! up to a keeper's counter in the saddle; each told to their quest log as it is done, however it was pressed.

use crate::asks::keeper_counter;
use crate::{PlayerId, Room};
use gear::quests::{Event, Goal, Ride, RideAct};
use movement::TICK_SECONDS;
use std::collections::BTreeMap;

/// How far a rider rides at a walk, and at a gallop, before that step is done, metres.
pub const WALKED_M: f64 = 10.0;
pub const GALLOPED_M: f64 = 30.0;
/// The pace past which a horse gallops, metres a second: past a boosted walk's 9, short of a gallop's 12.
const GALLOP_FROM: f64 = 10.5;
/// How near a keeper's counter a rider must come to have ridden up to it, metres.
pub const ARRIVED_M: f64 = 8.0;

/// What the room keeps of a rider for the lesson: whether they rode last tick, and how far they have ridden at a walk
/// and at a gallop since the lesson began here.
#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct Ridden {
    mounted: bool,
    walked: f64,
    galloped: f64,
}

impl Room {
    /// Watches each player whose task asks a riding act, telling their quest log each act done this tick; a player
    /// whose task asks none is forgotten.
    pub(crate) fn keep_lessons(&mut self) {
        let mut told: Vec<(PlayerId, RideAct, Option<&'static str>)> = Vec::new();
        let ridden = &mut self.quests.ridden;
        ridden.retain(|id, _| self.players.contains_key(id));
        for (id, found) in &self.players {
            let asked: Vec<&'static Ride> = found
                .character
                .goals_unmet()
                .filter_map(|(_, goal)| match &goal.goal {
                    Goal::Ride(ride) => Some(ride),
                    _ => None,
                })
                .collect();
            if asked.is_empty() {
                ridden.remove(id);
                continue;
            }
            let body = found.fighter.body;
            let kept = ridden.entry(*id).or_default();
            let pace = libm::hypot(body.vx, body.vy);
            if found.mounted && body.moving {
                let stretch = if pace > GALLOP_FROM { &mut kept.galloped } else { &mut kept.walked };
                *stretch += pace * TICK_SECONDS;
            }
            let counter = |key: &str| {
                let number = (1..=u8::MAX).find(|number| gear::quests::keeper_key(*number) == Some(key));
                let kind = number.and_then(keeper_counter);
                self.counters.iter().flatten().any(|counter| {
                    Some(counter.kind) == kind
                        && libm::hypot(body.x - counter.at[0], body.y - counter.at[1]) <= ARRIVED_M
                })
            };
            for ride in asked {
                let done = match ride.act {
                    RideAct::Mount => found.mounted,
                    RideAct::Walk => kept.walked >= WALKED_M,
                    RideAct::Gallop => kept.galloped >= GALLOPED_M,
                    RideAct::Boost => found.mounted && body.boosting > 0.0,
                    RideAct::Dismount => kept.mounted && !found.mounted,
                    RideAct::Arrive => found.mounted && ride.to.as_deref().is_some_and(counter),
                };
                if done {
                    told.push((*id, ride.act, ride.to.as_deref()));
                }
            }
            kept.mounted = found.mounted;
        }
        for (player, act, at) in told {
            self.tell_quest(player, &Event::Ride { act, at });
        }
    }
}

/// The riders a room watches, by player.
pub(crate) type Riders = BTreeMap<PlayerId, Ridden>;

#[cfg(test)]
#[path = "lessons_tests.rs"]
mod tests;
