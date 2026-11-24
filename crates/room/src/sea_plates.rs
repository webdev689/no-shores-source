//! What others read over a player's ship at sea: the plate they wear over their head on land. The sea hears of no
//! menu, so its plates never show one.

use super::Sea;
use crate::PlayerId;
use crate::plates::{Plate, named};

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

    /// A player's plate as others read it over their ship: their name (empty for a guest) and their character's
    /// level; none before the sea holds their character.
    #[must_use]
    pub fn plate(&self, player: PlayerId) -> Option<Plate> {
        let level = self.harbour.characters.get(&player)?.level();
        let name = self.harbour.names.get(&player).cloned().unwrap_or_default();
        Some(Plate { name, level, menu: false })
    }
}
