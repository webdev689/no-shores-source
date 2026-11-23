//! The doors for what others read of a player: their account's username and their guild's tag on the plate over their
//! head, and at sea the water their ship lies in, which the chat's Region channel is.

use crate::{Opened, hand_over, with_open};
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

/// Gives a player the guild tag written in `bytes`, none for no guild (`Room::tag_player`); false if it is not text, no
/// guild's tag could be it, or the player is not in a room on land.
pub fn tag(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(tag) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.tag_player(player, tag),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Gives a player the guild tag written at `address`; 1 if given, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_tag(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(tag(player, unsafe { std::slice::from_raw_parts(address, length) }))
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

/// The name of the water a player's ship lies in at sea, as its bytes, packed as `hand_over` packs; empty off the sea
/// or before the ship puts to sea.
#[unsafe(no_mangle)]
pub extern "C" fn room_water(player: PlayerId) -> u64 {
    let name = with_open(|opened| match opened {
        Opened::Sea(sea) => sea.water_name(player),
        Opened::Land { .. } | Opened::Fleet(_) => None,
    });
    hand_over(name.flatten().unwrap_or_default().as_bytes().to_vec())
}
