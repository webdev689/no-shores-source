//! A passage zone's room behind the door: opened from its ask (the island, the week of its web, the zone, the route
//! and the minute it opens at) as the `passage` crate and the room lay it, so the server's host and a page playing
//! alone open the same room; and a patrol zone's mouths, its runs' doors named in its node file, where a dive begins.

use crate::{Opened, keep};
use gear::dive::Route;
use gear::quests::Place;
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
pub(crate) fn open_mouths(room: &mut Room, island: &str, doors: &[Place], places: &[Place]) {
    let Some(passages) = passage::island(island) else { return };
    let found: Option<Vec<([f64; 2], [f64; 2])>> = passages
        .mouths
        .iter()
        .map(|mouth| {
            let door = doors.iter().find(|door| &door.name == mouth)?.at;
            // A mouth's front lies toward its run's end arena, the place named for the run.
            let arena = places.iter().find(|place| &place.name == mouth).map_or(door, |place| place.at);
            Some((door, arena))
        })
        .collect();
    if let Some(found) = found {
        room.open_mouths(island, found);
    }
}

/// The zone a passage ask names, laid whole, with the ask: none where its island has no passages or its week's web
/// no such zone.
fn plan_of(text: &[u8]) -> Option<(Asked, passage::Plan)> {
    let asked = serde_json::from_slice::<Asked>(text).ok()?;
    // The door's last laying, when the page asked for the same zone's plan first.
    let plan = crate::passage_door::with_plan(&asked.island, asked.week, asked.zone, passage::Plan::clone)?;
    Some((asked, plan))
}

/// A passage zone's ground from its ask's JSON (its island, week and zone), as its room stands bodies on it
/// (`room::passage_ground`): its floor and its blocks. None where the ask names no zone.
pub(crate) fn ground_of(text: &[u8]) -> Option<(room::Floor, Vec<movement::Block>)> {
    let (_, plan) = plan_of(text)?;
    let (floor, blocks, _) = room::passage_ground(&plan)?;
    Some((floor, blocks))
}

/// Opens a passage zone's room from its ask's JSON: its foes at its island's band raised by depth, the week's two
/// modifiers on, its clock at the ask's minute, and refusing players once the clock's week is past the web's. Answers
/// whether the ask named a zone of an island's week's web.
pub fn open_passage(text: &[u8]) -> bool {
    let Some((asked, plan)) = plan_of(text) else { return false };
    let Some(band) = gear::world::island_levels(&asked.island) else { return false };
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
