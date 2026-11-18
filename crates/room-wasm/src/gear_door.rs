//! A player's gear through the door: the course's stall and resource nodes laid out, each player's own gear sent to
//! them alone, and their character as it is kept between sessions, given back to them when they return.

use crate::{Opened, PlayerId, floats_of, hand_over, with_open};

/// Lays out a course's stall and resource nodes: the stall's x and y (not numbers for none), then each node's x, y
/// and resource, little-endian floats. Answers whether a room on land is open and the numbers made a layout.
pub fn furnish(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    let Some((stall, nodes)) = floats.split_first_chunk::<2>() else { return false };
    if !nodes.len().is_multiple_of(3) || nodes.iter().any(|number| !number.is_finite()) {
        return false;
    }
    let stall = stall.iter().all(|number| number.is_finite()).then_some(*stall);
    let nodes = nodes.chunks_exact(3).map(|node| room::ResourceNode {
        x: node[0],
        y: node[1],
        resource: u8::try_from(node[2] as u32).unwrap_or_default(),
    });
    let nodes = nodes.collect();
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.furnish(stall, nodes);
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// A player's own gear, as its bytes, when it changed since it was last asked; empty when it did not, or in a room
/// that keeps no gear.
#[must_use]
pub fn gear(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            if room.take_gear_change(player) {
                protocol::gear_wire::gear_bytes(room, player)
            } else {
                None
            }
        }
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
    .unwrap_or_default()
}

/// A player's character as it is kept between sessions, as JSON's bytes; empty on land with no such player, and at
/// sea, where no one holds gear.
#[must_use]
pub fn character(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.kept_character(player),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
    .map(String::into_bytes)
    .unwrap_or_default()
}

/// Gives a player on land the character kept for them, from JSON's bytes; false if it is not one or they are not in.
pub fn restore_character(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.restore_character(player, text),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Notes the account, written in `bytes`, that keeps a player's character (`Room::own`); false if it is not text or
/// they are not in.
pub fn own(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(owner) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.own(player, owner),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Notes the account written at `address` that keeps a player's character; 1 if noted, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_own(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(own(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// A player's own gear's bytes, empty when it has not changed.
#[unsafe(no_mangle)]
pub extern "C" fn room_gear(player: PlayerId) -> u64 {
    hand_over(gear(player))
}

/// A player's character as kept, as JSON's bytes (`character`), packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_character(player: PlayerId) -> u64 {
    hand_over(character(player))
}

/// Gives a player the character written at `address` as JSON; 1 if it was one and they are in, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_restore_character(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(restore_character(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Lays out the course's stall and resource nodes written at `address`; 1 if laid, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_furnish(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(furnish(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Sets the difficulty a node's room's voyage set out at: 0 calm, 1 rough, 2 storm; false for no such difficulty, or
/// no room on land.
pub fn set_difficulty(number: u32) -> bool {
    let Some(difficulty) = usize::try_from(number).ok().and_then(|index| gear::Difficulty::ALL.get(index).copied())
    else {
        return false;
    };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.set_difficulty(difficulty);
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Sets a node's room's difficulty (`set_difficulty`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_difficulty(number: u32) -> u32 {
    u32::from(set_difficulty(number))
}

/// Sets the day, counted from the epoch, whose wares a room's vendors show; false with no room on land.
pub fn set_day(day: u32) -> bool {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.set_day(u64::from(day));
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Draws a room on land's chances from the host's own secret seed, from its two halves; false with no room on land.
pub fn reseed(low: u32, high: u32) -> bool {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.reseed(u64::from(high) << 32 | u64::from(low));
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Reseeds the room (`reseed`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_reseed(low: u32, high: u32) -> u32 {
    u32::from(reseed(low, high))
}

/// Sets the room's day (`set_day`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_day(day: u32) -> u32 {
    u32::from(set_day(day))
}
