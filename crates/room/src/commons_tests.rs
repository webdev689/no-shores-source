//! A Normal piece the room hands out comes as itself, never sealed: the Test Ground's grant of a Normal Vestige gives
//! its item, and a first clear whose Vestige rolls Normal keeps its item and tells the page.

use crate::asks::{Asked, Grant};
use crate::run::{Pays, Run};
use crate::{PlayerId, Room};
use gear::{Character, Rarity, Slot};

/// A room with one player kept for an account.
fn kept() -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    assert!(room.own(player, "an account"));
    (room, player)
}

fn character(room: &Room, player: PlayerId) -> &Character {
    &room.players[&player].character
}

#[test]
fn the_test_grounds_normal_vestige_comes_as_its_item() {
    let (mut room, player) = kept();
    let before = character(&room, player).clone();
    room.answer(player, Asked::Grant(Grant::Vestige { rarity: Rarity::Normal, slot: Slot::Head, level: 9 }));
    let after = character(&room, player);
    assert_eq!(after.vestiges.len(), before.vestiges.len(), "no Normal Vestige is made");
    let new: Vec<_> = after.items.iter().filter(|(id, _)| !before.items.contains_key(id)).collect();
    assert_eq!(new.len(), 1, "its item instead");
    let (item, _) = new[0].1;
    assert_eq!((item.rarity, item.bucket, item.level), (Rarity::Normal, Slot::Head, 9));
    room.answer(player, Asked::Grant(Grant::Vestige { rarity: Rarity::Magic, slot: Slot::Head, level: 9 }));
    assert_eq!(character(&room, player).vestiges.len(), before.vestiges.len() + 1, "a Magic one stays sealed");
}

#[test]
fn a_first_clear_rolling_normal_keeps_its_item_and_tells_the_page() {
    let (mut unsealed, mut sealed) = (0, 0);
    for seed in 0..40 {
        let (mut room, player) = kept();
        room.seed = seed;
        room.run = Some(Run { pays: Pays::Day { day: room.day() }, ..Run::default() });
        let before = character(&room, player).clone();
        room.players.get_mut(&player).expect("in").gear_changed = false;
        room.pay_clear(player, 12);
        let found = &room.players[&player];
        assert!(found.gear_changed, "seed {seed}: the page is told of what was paid");
        assert!(found.character.vestiges.values().all(|(vestige, _)| vestige.rarity > Rarity::Normal));
        let items = found.character.items.len() - before.items.len();
        let vestiges = found.character.vestiges.len() - before.vestiges.len();
        assert_eq!(items + vestiges, 1, "seed {seed}: one Vestige, or a Normal one's item");
        (unsealed, sealed) = (unsealed + items, sealed + vestiges);
    }
    assert!(unsealed > 0 && sealed > 0, "{unsealed} items, {sealed} Vestiges");
}
