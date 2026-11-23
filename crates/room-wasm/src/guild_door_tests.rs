//! A player's guild told through the door: its outposts' boons reach their character, and one in no guild has none.

use super::*;
use crate::{room_join, room_tick};
use serde_json::json;

fn boons_of(player: PlayerId) -> Option<gear::guild::Boons> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.player(player).map(|found| found.character.boons),
        _ => None,
    })
    .flatten()
}

fn joined() -> PlayerId {
    let spawn: Vec<u8> = [0.0_f64, 0.0].iter().flat_map(|value| value.to_le_bytes()).collect();
    assert!(crate::open(&spawn));
    room_join()
}

#[test]
fn the_told_boons_reach_the_character() {
    let player = joined();
    let told = json!({ "id": "g", "done": [false, false, false, false], "beforeTheWeek": true,
        "boons": { "xp": 5, "aurem": 10, "reputation": 3 } });
    assert!(guild(player, told.to_string().as_bytes()));
    room_tick();
    assert_eq!(boons_of(player), Some(gear::guild::Boons { xp: 5, aurem: 10, reputation: 3 }));
}

#[test]
fn a_character_in_no_guild_has_no_boons() {
    let player = joined();
    let told = json!({ "id": "g", "done": [false, false, false, false], "beforeTheWeek": true, "boons": { "xp": 5, "aurem": 5, "reputation": 5 } });
    assert!(guild(player, told.to_string().as_bytes()));
    room_tick();
    assert!(guild(player, b""), "left the guild");
    room_tick();
    assert_eq!(boons_of(player), Some(gear::guild::Boons::default()));
}
