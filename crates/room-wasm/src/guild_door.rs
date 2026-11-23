//! The door the host tells a room of a player's guild through, as the accounts told it: which guild, which of the
//! week's four guild bounties it has done, whether the player was in it before the week turned, and what its outposts
//! give its members.

use crate::{Opened, with_open};
use room::{GuildSeen, PlayerId};
use serde::Deserialize;

/// A player's guild as the host writes it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Told {
    id: String,
    done: [bool; gear::guild::SLOTS],
    before_the_week: bool,
    /// What the guild's outposts give, percent; none before the accounts told them.
    #[serde(default)]
    boons: Boons,
}

/// A guild's boons as the host writes them.
#[derive(Default, Deserialize)]
struct Boons {
    xp: u8,
    aurem: u8,
    reputation: u8,
}

/// Tells the room a player's guild from the text in `bytes` (`Told`), or that they are in none, given no text; false
/// if the text is no guild, or the room keeps no such player.
pub fn guild(player: PlayerId, bytes: &[u8]) -> bool {
    let seen = if bytes.is_empty() {
        None
    } else {
        let Ok(told) = serde_json::from_slice::<Told>(bytes) else { return false };
        let standing = gear::guild::Standing { done: told.done, before_the_week: told.before_the_week };
        let Boons { xp, aurem, reputation } = told.boons;
        Some(GuildSeen { id: told.id, standing, boons: gear::guild::Boons { xp, aurem, reputation } })
    };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.guild_player(player, seen),
        Opened::Sea(sea) => sea.guild_player(player, seen),
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Tells the room a player's guild written at `address`; 1 if told, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_guild(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(guild(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

#[cfg(test)]
#[path = "guild_door_tests.rs"]
mod tests;
