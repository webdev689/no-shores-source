//! The sea's part in its players' guilds (`guild_book.rs`), as a land room's (`guild_room.rs`): told each kept
//! player's guild by its host, it gives their guild its share of the XP they gain, and counts each ship they sank or
//! took toward the week's guild bounties. A guild bounty is claimed ashore.

use super::Sea;
use super::decks::Decks;
use crate::PlayerId;
use crate::guild_book::GuildSeen;
use crate::harbour::Harbour;
use gear::objectives::Feat;

impl Sea {
    /// Notes a kept player's guild as the accounts told the host, none for no guild; false for one the sea keeps no
    /// character for.
    pub fn guild_player(&mut self, player: PlayerId, seen: Option<GuildSeen>) -> bool {
        let Some(character) = self.harbour.characters.get(&player) else { return false };
        self.harbour.guilds.set(player, seen, character.xp);
        true
    }

    /// Gives each kept member's guild its share of the XP they gained since the sea last did.
    pub(super) fn give_guilds(&mut self) {
        let week = gear::clock::week_of(self.minute);
        let characters = self.harbour.characters.iter_mut().map(|(player, character)| (*player, character, true));
        self.harbour.guilds.give(week, characters);
    }
}

/// Counts a ship sunk or taken toward the guild bounties of each kept member who fought her, in `week`, together when
/// another of her fighters is of their guild; on a captain's deck, on the character its room holds too, theirs again
/// once they step off.
pub(super) fn guild_sunk(
    harbour: &mut Harbour,
    decks: &mut Decks,
    week: u64,
    fought: &[PlayerId],
    (water, rank): (Option<&str>, u8),
) {
    let sunk = Feat::Sunk { water, rank };
    for player in fought {
        let Some(character) = harbour.characters.get_mut(player) else { continue };
        harbour.guilds.saw(*player, character, week, &sunk, fought);
        let deck = decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(player));
        if let Some(found) = deck.and_then(|deck| deck.room.players.get_mut(&deck.aboard[player])) {
            harbour.guilds.saw(*player, &mut found.character, week, &sunk, fought);
            found.gear_changed = true;
        }
    }
}
