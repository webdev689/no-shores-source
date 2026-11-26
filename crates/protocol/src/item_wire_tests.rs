//! An item on the wire as the page reads it: plain clothes marked plain, with no stats or nodes.

use crate::gear_wire::gear_bytes;
use crate::messages;
use room::asks::Asked;
use room::{Input, Room};

/// The page's test (`client/src/player/gearLooks.test.ts`) reads these bytes: a new character just past the prologue,
/// dressed by its end in plain clothes, so the page reads them plain, with no stats, and draws and names them so.
#[test]
fn a_character_dressed_in_plain_clothes_is_sent_them_plain_with_no_stats() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut character = gear::Character::starting();
    character.story.prologue = false;
    assert!(room.restore_character(player, &character.to_json()));
    for _ in 0..room::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    let asked = Some(Asked::Gear(gear::Ask::FinishPrologue));
    room.input(player, Input { sequence: 1, ask: asked, ..Input::default() }).expect("taken");
    room.tick();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = flatbuffers::root::<messages::FromRoom>(&bytes).expect("a message").gear().expect("the gear");
    let items = gear.items().expect("the items");
    let plain: Vec<_> = items.iter().filter(|item| item.plain()).collect();
    assert_eq!(plain.len(), 2, "the shirt and the breeches");
    for item in plain {
        assert_eq!((item.defense(), item.prestige(), item.xp_most()), (0, 0, 0));
        assert!(item.columns().is_none_or(|columns| columns.is_empty()), "no nodes");
    }
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/gear_plain.bin"), bytes).expect("written");
}
