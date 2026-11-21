//! A won event's chest: opened by its player within reach, paying once and never again; refused out of reach;
//! opened for its player as it goes or as they leave, so it is never lost.

use super::fixture::{FISSURE_AT, place, room_at};
use crate::asks::{Asked, OUT_OF_REACH};
use crate::{DROP_TICKS, Dropped, EventKind, PlayerId, Room};

/// A room with one player and a heroic chest laid for them at the Fissure's ground; the chest's number.
fn chested() -> (Room, PlayerId, u32) {
    let (mut room, players) = room_at(0, 1);
    place(&mut room, players[0], [FISSURE_AT[0], FISSURE_AT[1] + 10.0]);
    room.lay_chest(players[0], 3, FISSURE_AT, 5);
    let chest = room.drops_for(players[0]).next().expect("the chest").id;
    (room, players[0], chest)
}

fn chest_at(room: &Room, player: PlayerId) -> Option<[f64; 3]> {
    room.drops_for(player).find(|drop| matches!(drop.what, Dropped::Chest { .. })).map(|drop| drop.at)
}

#[test]
fn a_chest_opens_within_reach_pays_once_and_cannot_pay_again() {
    let (mut room, player, chest) = chested();
    let at = chest_at(&room, player).unwrap();
    assert_eq!(room.open_chest(player, chest), OUT_OF_REACH, "seven metres off");
    place(&mut room, player, [at[0] + 1.0, at[1]]);
    let before = room.players[&player].character.clone();
    room.answer(player, Asked::OpenChest { chest });
    let after = room.players[&player].character.clone();
    assert!(after.xp > before.xp && after.materials.aurem > before.materials.aurem && after.vestiges.len() == 1);
    assert_eq!(room.players[&player].answer, 0);
    assert!(chest_at(&room, player).is_none(), "taken off the ground");
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::ChestOpened).count(), 1);
    assert_eq!(room.open_chest(player, chest), OUT_OF_REACH, "no such chest any more");
    assert_eq!(room.players[&player].character, after, "paid once");
}

#[test]
fn a_chest_left_unopened_is_opened_for_its_player_as_it_goes_and_as_they_leave() {
    let (mut room, player, _) = chested();
    let before = room.players[&player].character.xp;
    for _ in 0..DROP_TICKS {
        room.tick();
    }
    assert!(chest_at(&room, player).is_none(), "gone");
    assert!(room.players[&player].character.xp > before, "but paid");
    let (mut room, player, _) = chested();
    room.leave(player);
    let paid = room.take_events().iter().any(|event| event.kind == EventKind::ChestOpened && event.striker == player);
    assert!(paid, "opened for them as they left");
}
