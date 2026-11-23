//! An outpost's errands through the door: an ask taken from the player held for the host as JSON, and the accounts'
//! answer given back through it.

use super::*;
use crate::{gear_door, guild_door, room_join};
use serde_json::json;

/// A course's room made an outpost, with one member of its guild in it, kept by `salt`, holding `aurem`.
fn member(aurem: u32) -> u32 {
    let spawn: Vec<u8> = [0.0_f64, 0.0].iter().flat_map(|value| value.to_le_bytes()).collect();
    assert!(crate::open(&spawn));
    assert!(outpost(json!({ "key": "abcdef010000", "muster": [20.0, 0.0] }).to_string().as_bytes()));
    let player = room_join();
    assert!(gear_door::own(player, b"salt"));
    let told = json!({ "id": "ABCDEF01-0000", "done": [false, false, false, false], "beforeTheWeek": true });
    assert!(guild_door::guild(player, told.to_string().as_bytes()));
    holding(player, |materials| materials["aurem"] = json!(aurem));
    player
}

/// Changes a player's materials, as a character kept with them is given back.
fn holding(player: u32, change: impl FnOnce(&mut Value)) {
    let mut kept: Value = serde_json::from_slice(&gear_door::character(player)).unwrap();
    change(&mut kept["materials"]);
    assert!(gear_door::restore_character(player, kept.to_string().as_bytes()));
}

fn ask(player: u32, asked: room::OutpostAsk) {
    let bytes = protocol::input_bytes(&room::Input {
        sequence: 1,
        ask: Some(room::Asked::Outpost(asked)),
        ..room::Input::default()
    });
    assert_eq!(crate::input(player, &bytes), 0, "taken");
    crate::room_tick();
}

#[test]
fn a_deposit_is_held_as_an_errand_for_the_host_and_its_refusal_gives_the_aurem_back() {
    let player = member(300);
    ask(player, room::OutpostAsk::Deposit { count: 120 });
    let taken: Value = serde_json::from_str(&errands()).unwrap();
    assert_eq!(taken, json!([{ "id": 1, "player": player, "account": "salt", "kind": "deposit", "amount": 120 }]));
    assert_eq!(errands(), "[]", "taken once");
    let aurem = || on_land(|room| room.player(player).map(|found| found.character.materials.aurem)).flatten();
    assert_eq!(aurem(), Some(180));
    assert_eq!(room_outpost_answered(1, -1), 1, "the accounts could not be reached");
    assert_eq!(aurem(), Some(300), "given back whole");
    assert_eq!(room_outpost_answered(1, 0), 0, "answered once");
}

#[test]
fn a_delivery_names_its_structure_and_material_and_the_plot_stood_is_counted() {
    let player = member(0);
    holding(player, |materials| materials["ship"]["canvas"] = json!(9));
    ask(player, room::OutpostAsk::Deliver { structure: 4, slot: 1, count: 5 });
    let taken: Value = serde_json::from_str(&errands()).unwrap();
    assert_eq!(taken[0]["kind"], "deliver");
    assert_eq!((taken[0]["structure"].clone(), taken[0]["stuff"].clone()), (json!(4), json!("canvas")));
    assert_eq!(room_outpost_stood(), 1);
    assert_eq!(on_land(|room| room.outpost_plot()), Some(1));
    assert!(!outpost(b"not an outpost"));
}

#[test]
fn one_out_of_the_guild_dungeon_joins_before_the_delve_gate_the_host_stood() {
    member(0);
    assert_eq!(crate::dungeon_door::room_join_at(0), 0, "no gate stood yet");
    assert_eq!(room_outpost_gate(4.0, 6.0, 0.0), 1);
    assert_ne!(crate::dungeon_door::room_join_at(0), 0, "before it");
    assert_eq!(room_outpost_gate(f64::NAN, 0.0, 0.0), 1);
    assert_eq!(crate::dungeon_door::room_join_at(0), 0, "taken down");
}
