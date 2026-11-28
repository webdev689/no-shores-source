//! The doors for a player who travels aboard a company member's ship (`room::sea::passengers`): asking it as they join
//! the sea, and boarding once the accounts have said who their company is.

use crate::{Opened, with_open};
use room::PlayerId;
use serde::Deserialize;

/// Whom a player boards: their captain's username, and the accounts of the passenger's company.
#[derive(Deserialize)]
struct Boarding {
    captain: String,
    company: Vec<String>,
}

/// A player just joined the open sea asks to travel aboard another's ship (`Sea::ask_aboard`); false with no sea open.
pub fn ask_aboard(player: PlayerId) -> bool {
    with_open(|opened| match opened {
        Opened::Sea(sea) => sea.ask_aboard(player),
        Opened::Land { .. } | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// A player who asked boards the ship of the captain the word names (`Boarding`, `Sea::go_aboard`); false if refused,
/// for a word that does not read, or with no sea open.
pub fn board(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(boarding) = serde_json::from_slice::<Boarding>(bytes) else { return false };
    let company: Vec<&str> = boarding.company.iter().map(String::as_str).collect();
    with_open(|opened| match opened {
        Opened::Sea(sea) => sea.go_aboard(player, &boarding.captain, &company).is_ok(),
        Opened::Land { .. } | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Asks to travel aboard (`ask_aboard`); 1 if asked, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_ask_aboard(player: PlayerId) -> u32 {
    u32::from(ask_aboard(player))
}

/// Boards the ship the word written at `address` names (`board`); 1 if aboard, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_board(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(board(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

#[cfg(test)]
#[path = "aboard_door_tests.rs"]
mod aboard_door_tests;
