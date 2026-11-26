//! What others read over a player's ship at sea, and what they see of it: the plate they wear over their head on land
//! (the sea hears of no menu, so its plates never show one), and the ship as they keep it, its hull, its dress, its
//! name and the emblem a flag that bears one flies.

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

    /// The ship a player sails as others see it (`ShipLook::of` their character, the one the sea holds); none for a
    /// player not at sea.
    #[must_use]
    pub fn look(&self, player: PlayerId) -> Option<ShipLook> {
        self.berths.contains_key(&player).then(|| ShipLook::of(self.harbour.characters.get(&player)))
    }
}

/// A player's ship as others see it: its hull's number, each part's dress by its number (`ship::fleet::Part`'s
/// order), its name's two words by their places in the shipyard's lists, and the emblem its player wears by its number.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShipLook {
    pub hull: u8,
    pub dress: [u16; 4],
    pub name: [u8; 2],
    pub emblem: u16,
}

impl ShipLook {
    /// The ship a character sails as others see it: as it keeps it, the Sloop as built and unnamed for none. The sea
    /// shows its players' ships so, and a room on land tells it so of a ship lying parked (`Sea::refit`).
    #[must_use]
    pub fn of(character: Option<&gear::Character>) -> ShipLook {
        let ship = character.and_then(|character| character.fleet.sailing());
        let built = || gear::ship::fleet::KeptShip::new(gear::ship::fleet::SLOOP);
        let ship = ship.cloned().unwrap_or_else(built);
        let emblem = character.and_then(|character| gear::emblems::number_of(&character.emblem)).unwrap_or_default();
        ShipLook { hull: ship.hull, dress: ship.dress.numbers(), name: ship.name_numbers(), emblem }
    }
}
