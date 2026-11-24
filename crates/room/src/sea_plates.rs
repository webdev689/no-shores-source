//! What others read over a player's ship at sea: the plate they wear over their head on land. The sea hears of no
//! menu, so its plates never show one.

use super::Sea;
use crate::PlayerId;
use crate::plates::{Plate, named, tagged};

impl Sea {
    /// Names a player by their account's username, as the accounts gave it; false, naming no one, for a player not at
    /// sea or a name no username could be.
    pub fn name_player(&mut self, player: PlayerId, name: &str) -> bool {
        if !self.berths.contains_key(&player) || !named(name) {
            return false;
        }
        self.harbour.names.insert(player, name.to_owned());
        true
    }

    /// Gives a player their guild's tag, as their host told it, none for no guild; false, tagging no one, for a player
    /// not at sea or a tag no guild's could be.
    pub fn tag_player(&mut self, player: PlayerId, tag: &str) -> bool {
        if !self.berths.contains_key(&player) || !tagged(tag) {
            return false;
        }
        self.harbour.tags.insert(player, tag.to_owned());
        true
    }

    /// A player's plate as others read it over their ship: their name (empty for a guest), their character's level, a
    /// new character's for one who plays unkept, whose character the sea never holds, and their guild's tag; none for
    /// a player not at sea.
    #[must_use]
    pub fn plate(&self, player: PlayerId) -> Option<Plate> {
        if !self.berths.contains_key(&player) {
            return None;
        }
        let held = self.harbour.characters.get(&player);
        let level = held.map_or_else(|| gear::Character::starting().level(), gear::Character::level);
        let name = self.harbour.names.get(&player).cloned().unwrap_or_default();
        let tag = self.harbour.tags.get(&player).cloned().unwrap_or_default();
        Some(Plate { name, level, menu: false, tag })
    }
}
