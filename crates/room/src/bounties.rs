//! What a room counts toward the bounties and side quests (`gear::objectives`): each foe felled for each player who
//! shares its kill, each resource node gathered, and each dungeon cleared for each player the room keeps as its cache
//! opens, on the island the room stands on.

use crate::{PlayerId, Room};
use gear::objectives::Feat;

impl Room {
    /// Sets the island it stands on from its node's continent; none for a continent with no island.
    pub fn set_island(&mut self, continent: &str) {
        self.island = gear::world::ISLANDS.iter().map(|(id, ..)| *id).find(|id| *id == continent);
    }

    /// Counts a feat toward a player's bounties and side quests, sending their gear again when a count moved.
    pub(crate) fn saw(&mut self, player: PlayerId, feat: &Feat<'_>) {
        let day = self.day();
        let Some(found) = self.players.get_mut(&player) else { return };
        if found.character.saw(feat, day) {
            found.gear_changed = true;
        }
    }
}

#[cfg(test)]
#[path = "bounties_tests.rs"]
mod bounties_tests;
