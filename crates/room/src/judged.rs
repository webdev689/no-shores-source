//! What the next room judges a player's arrival by (`server/arrival.ts`): their dive's island, week, zone, route, lamp
//! and whether it goes home, and the lamps they lit this week with that week. The room keeps a mark of it for each
//! player and says when it moved, so the keeper saves such a move at once without reading the whole character.

use crate::{PlayerId, Room};
use std::hash::{Hash, Hasher};

/// The mark of what an arrival is judged by in a character. A hash: two marks that differ only by a collision miss
/// an instant save, and the keeper's ordinary save follows a moment later.
pub(crate) fn mark(character: &gear::Character) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let dive = character.passage.as_ref().map(|dive| {
        let route = std::mem::discriminant(&dive.route);
        (&dive.island, dive.week, dive.zone, route, dive.lamp, dive.homeward)
    });
    let week = &character.activity.this_week;
    (dive, week.week, &week.passage_lamps).hash(&mut hasher);
    hasher.finish()
}

impl crate::Player {
    /// Notes whether what the player's arrival is judged by moved since the mark was last set: called as their gear
    /// changed, the one place every change of their character passes before it is sent.
    pub(crate) fn mark_judged(&mut self) {
        let now = mark(&self.character);
        self.judged_moved |= now != self.judged;
        self.judged = now;
    }
}

impl Room {
    /// Whether what a player's arrival is judged by moved since this was last asked; asking clears it.
    pub fn take_judged_move(&mut self, player: PlayerId) -> bool {
        self.players.get_mut(&player).is_some_and(|found| std::mem::take(&mut found.judged_moved))
    }
}

#[cfg(test)]
#[path = "judged_tests.rs"]
mod judged_tests;
