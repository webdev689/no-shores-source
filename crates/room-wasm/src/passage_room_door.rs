//! A passage zone's room behind the door: opened from its ask (the island, the week of its web, the zone, the route
//! and the minute it opens at) as the `passage` crate and the room lay it, so the server's host and a page playing
//! alone open the same room; and a patrol zone's mouths, its runs' doors named in its node file, where a dive begins.

use crate::{Opened, keep};
use gear::dive::Route;
use room::Room;
use serde::Deserialize;

/// What a page or the host asks a passage zone's room by.
#[derive(Deserialize)]
struct Asked {
    island: String,
    week: u64,
    zone: u16,
    #[serde(default)]
    route: Route,
    #[serde(default)]
    minute: u64,
}

/// The words a zone's room refuses players with once its week's web has turned: its ways lead elsewhere now.
pub const SHIFTED: &str = "The passage has shifted";

/// Lays a patrol zone's mouths into its island's passages: its runs' doors, matched by name to the island's mouths in
/// their order. A patrol zone of no island with passages, or one missing a mouth's door, opens none.
pub(crate) fn open_mouths(room: &mut Room, island: &str, doors: &[gear::quests::Place]) {
    let Some(passages) = passage::island(island) else { return };
    let found: Option<Vec<[f64; 2]>> =
        passages.mouths.iter().map(|mouth| doors.iter().find(|door| &door.name == mouth).map(|door| door.at)).collect();
    if let Some(found) = found {
        room.open_mouths(island, found);
    }
}

/// Opens a passage zone's room from its ask's JSON: its foes at its island's band raised by depth, the week's two
/// modifiers on, its clock at the ask's minute, and refusing players once the clock's week is past the web's. Answers
/// whether the ask named a zone of an island's week's web.
pub fn open_passage(text: &[u8]) -> bool {
    let Ok(asked) = serde_json::from_slice::<Asked>(text) else { return false };
    let (Some(passages), Some(band)) = (passage::island(&asked.island), gear::world::island_levels(&asked.island))
    else {
        return false;
    };
    let web = passage::Web::of(passages, asked.week);
    let Some(plan) = passage::Plan::of(&web, asked.zone) else { return false };
    let modifiers = gear::passages::week_modifiers(&asked.island, asked.week);
    let Some(mut room) = Room::passage(&plan, band, modifiers, (&asked.island, asked.week, asked.route)) else {
        return false;
    };
    room.set_minute(asked.minute);
    let refusal = (gear::clock::week_of(asked.minute) > asked.week).then(|| SHIFTED.to_owned());
    keep(Opened::Land { room: Box::new(room), node: None, refusal, sent: Box::default() });
    true
}

/// Opens a passage zone's room from its ask's JSON written at `address`, `length` bytes long; 1 if it opened, 0 if
/// not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_passage(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_passage(unsafe { std::slice::from_raw_parts(address, length) }))
}

#[cfg(test)]
#[path = "passage_room_door_tests.rs"]
mod passage_room_door_tests;
