//! A land room's part in its players' guilds (`guild_book.rs`): told each player's guild by its host, it gives their
//! guild its share of the XP they gain each tick, counts what they do toward the week's guild bounties, and answers a
//! claim of one their guild finished.

use crate::asks::answer_code;
use crate::guild_book::GuildSeen;
use crate::{PlayerId, Room};
use gear::objectives::Feat;

impl Room {
    /// Notes a player's guild as the accounts told the host, none for no guild; false for a player not in the room.
    pub fn guild_player(&mut self, player: PlayerId, seen: Option<GuildSeen>) -> bool {
        let Some(found) = self.players.get(&player) else { return false };
        self.guilds.set(player, seen, found.character.xp);
        true
    }

    /// The week by the room's minute.
    fn guild_week(&self) -> u64 {
        gear::clock::week_of(self.minute)
    }

    /// Gives each member's guild its share of the XP they gained since the room last did.
    pub(crate) fn give_guilds(&mut self) {
        let week = self.guild_week();
        let characters = self.players.iter_mut().map(|(player, found)| (*player, &mut found.character, found.claimed));
        self.guilds.give(week, characters);
    }

    /// Counts a feat toward a member's guild bounties, together when another member of their guild is in the room.
    pub(crate) fn guild_saw(&mut self, player: PlayerId, feat: &Feat<'_>) {
        let week = self.guild_week();
        let present: Vec<PlayerId> = self.players.keys().copied().collect();
        let Some(found) = self.players.get_mut(&player) else { return };
        self.guilds.saw(player, &mut found.character, week, feat, &present);
    }

    /// A member's claim of a guild bounty, by its slot among the week's four: the answer's number.
    pub(crate) fn claim_guild(&mut self, player: PlayerId, slot: u8) -> u8 {
        let (week, dice) = (self.guild_week(), self.dice(player));
        let Some(found) = self.players.get_mut(&player) else {
            return answer_code(Err(gear::asks::Refusal::NotInGuild));
        };
        answer_code(self.guilds.claim(player, &mut found.character, week, slot, &dice))
    }
}

#[cfg(test)]
#[path = "guild_room_tests.rs"]
mod tests;
