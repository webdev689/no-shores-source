//! The door that names a player by their account's username, for the plate others read over their head.

use crate::{Opened, with_open};
use room::PlayerId;

/// Names a player by the username written in `bytes` (`Room::name_player`); false if it is not text, no username could
/// be it, or the player is not in a room on land.
pub fn name(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(name) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.name_player(player, name),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Names a player by the username written at `address`; 1 if named, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_name(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(name(player, unsafe { std::slice::from_raw_parts(address, length) }))
}
