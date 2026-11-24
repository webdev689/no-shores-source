//! A won event's chest: opened by its player within reach, paying once and never again, its Vestige poured out of it;
//! refused out of reach; opened for its player as it goes or as they leave, so it is never lost.

use super::fixture::{FISSURE_AT, place, room_at};
use crate::asks::{Asked, OUT_OF_REACH};
use crate::{DROP_TICKS, Dropped, EventKind, POURED_REST_TICKS, PlayerId, Room};

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
    assert!(after.xp > before.xp && after.materials.aurem > before.materials.aurem && after.vestiges.is_empty());
    assert_eq!(room.players[&player].answer, 0);
    assert!(chest_at(&room, player).is_none(), "taken off the ground");
    let poured: Vec<_> = room.drops_for(player).collect();
    assert!(
        poured.len() == 1 && poured[0].poured && poured[0].from == at && matches!(poured[0].what, Dropped::Vestige(_)),
        "its Vestige poured out of it: {poured:?}"
    );
    assert_eq!(room.take_events().iter().filter(|event| event.kind == EventKind::ChestOpened).count(), 1);
    assert_eq!(room.open_chest(player, chest), OUT_OF_REACH, "no such chest any more");
    assert_eq!(room.players[&player].character, after, "paid once");
    for _ in 1..POURED_REST_TICKS {
        room.tick();
    }
    assert!(room.players[&player].character.vestiges.is_empty(), "never taken in the air");
    room.tick();
    assert_eq!(room.players[&player].character.vestiges.len(), 1, "taken once it rests, the player beside it");
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

#[test]
fn a_leavers_chest_vestige_with_their_ten_full_goes_to_their_vault() {
    let (mut room, player, chest) = chested();
    let character = &mut room.players.get_mut(&player).unwrap().character;
    for _ in 0..gear::character::VESTIGES_MOST {
        let id = character.take_id();
        assert!(character.pick_up(gear::Vestige::new(id, gear::Rarity::Normal, gear::Slot::Head, 1)));
    }
    room.open_chests_of(player);
    let character = &room.players[&player].character;
    assert_eq!((character.vestiges_held(false), character.vestiges_held(true)), (10, 1), "kept in the vault");
    assert!(room.drops_for(player).all(|drop| drop.id != chest), "and the chest is gone");
}

#[test]
fn a_leavers_chest_vestige_with_their_ten_and_their_vault_full_is_kept_in_the_vault_never_lost() {
    let (mut room, player, _) = chested();
    let character = &mut room.players.get_mut(&player).unwrap().character;
    for _ in 0..gear::character::VESTIGES_MOST {
        let id = character.take_id();
        assert!(character.pick_up(gear::Vestige::new(id, gear::Rarity::Normal, gear::Slot::Head, 1)));
    }
    for _ in 0..gear::character::VAULT_MOST {
        let id = character.take_id();
        character.vestiges.insert(id, (gear::Vestige::new(id, gear::Rarity::Normal, gear::Slot::Head, 1), true));
    }
    room.open_chests_of(player);
    let character = &room.players[&player].character;
    assert_eq!(character.vestiges_held(true), gear::character::VAULT_MOST + 1, "kept in the vault, over its limit");
    assert_eq!(room.drops_for(player).count(), 0, "nothing laid on the ground for leave() to sweep away");
}

#[test]
fn a_player_the_section_killed_opens_no_chest() {
    let (mut room, player, chest) = chested();
    let at = chest_at(&room, player).unwrap();
    place(&mut room, player, [at[0] + 1.0, at[1]]);
    room.players.get_mut(&player).unwrap().standing = crate::Standing::Dead { ticks: 0, fell: true };
    assert_eq!(room.open_chest(player, chest), OUT_OF_REACH, "dead, though their body stands");
}

#[test]
fn a_chest_is_its_players_alone_and_a_dead_player_or_one_far_above_or_below_it_cannot_open_it() {
    let (mut room, owner, chest) = chested();
    let other = room.join().expect("room for a second player");
    let at = chest_at(&room, owner).unwrap();
    place(&mut room, other, [at[0] + 1.0, at[1]]);
    let before = room.players[&other].character.clone();
    assert_eq!(room.open_chest(other, chest), OUT_OF_REACH, "another's chest, asked for by its number");
    assert_eq!(room.players[&other].character, before, "paid them nothing");
    assert!(chest_at(&room, owner).is_some(), "it still lies for its owner");
    place(&mut room, owner, [at[0] + 1.0, at[1]]);
    let body = &mut room.players.get_mut(&owner).unwrap().fighter.body;
    body.z = at[2] + 2.5;
    assert_eq!(room.open_chest(owner, chest), OUT_OF_REACH, "on a ledge above it");
    room.players.get_mut(&owner).unwrap().fighter.body.z = at[2] - 2.5;
    assert_eq!(room.open_chest(owner, chest), OUT_OF_REACH, "below it");
    room.players.get_mut(&owner).unwrap().fighter.body.z = at[2] + 1.5;
    let fell = &mut room.players.get_mut(&owner).unwrap().fighter;
    (fell.health, fell.action) = (0.0, combat::fighter::Action::Dead { elapsed: 0 });
    assert_eq!(room.open_chest(owner, chest), OUT_OF_REACH, "fallen");
    let fell = &mut room.players.get_mut(&owner).unwrap().fighter;
    (fell.health, fell.action) = (fell.health_max, combat::fighter::Action::Idle);
    assert_eq!(room.open_chest(owner, chest), 0, "standing again, within reach across and up");
}

#[test]
fn a_chest_stands_three_metres_out_from_the_grounds_middle_on_its_players_side() {
    let (mut room, players) = room_at(0, 1);
    for (side, offset) in [[0.0, 10.0], [-20.0, 0.0], [6.0, -6.0]].into_iter().enumerate() {
        place(&mut room, players[0], [FISSURE_AT[0] + offset[0], FISSURE_AT[1] + offset[1]]);
        room.lay_chest(players[0], 1, FISSURE_AT, 5);
        let at = room.drops_for(players[0]).last().expect("the chest").at;
        let out = [at[0] - FISSURE_AT[0], at[1] - FISSURE_AT[1]];
        assert!((libm::hypot(out[0], out[1]) - 3.0).abs() < 1e-9, "side {side}: 3 m out, {out:?}");
        let along = (out[0] * offset[0] + out[1] * offset[1]) / (3.0 * libm::hypot(offset[0], offset[1]));
        assert!(along > 1.0 - 1e-9, "side {side}: toward the player, {out:?}");
    }
}

#[test]
fn left_to_lapse_with_their_ten_full_its_vestige_goes_to_the_vault_and_with_the_vault_full_to_the_ground() {
    let fill = |room: &mut Room, player: PlayerId, vault: bool| {
        let character = &mut room.players.get_mut(&player).unwrap().character;
        for _ in 0..gear::character::VESTIGES_MOST {
            let id = character.take_id();
            assert!(character.pick_up(gear::Vestige::new(id, gear::Rarity::Normal, gear::Slot::Head, 1)));
        }
        for _ in 0..if vault { gear::character::VAULT_MOST } else { 0 } {
            let id = character.take_id();
            character.vestiges.insert(id, (gear::Vestige::new(id, gear::Rarity::Normal, gear::Slot::Head, 1), true));
        }
    };
    let lapse = |room: &mut Room| {
        for _ in 0..DROP_TICKS {
            room.tick();
        }
    };
    let (mut room, player, _) = chested();
    fill(&mut room, player, false);
    lapse(&mut room);
    let character = &room.players[&player].character;
    assert_eq!((character.vestiges_held(false), character.vestiges_held(true)), (10, 1), "to the vault");
    assert_eq!(room.drops_for(player).count(), 0, "nothing on the ground");
    let (mut room, player, _) = chested();
    fill(&mut room, player, true);
    let at = chest_at(&room, player).unwrap();
    lapse(&mut room);
    let character = &room.players[&player].character;
    assert_eq!(character.vestiges_held(true), gear::character::VAULT_MOST, "the vault kept to its limit");
    let lying: Vec<[f64; 3]> =
        room.drops_for(player).filter(|drop| matches!(drop.what, Dropped::Vestige(_))).map(|drop| drop.at).collect();
    assert_eq!(lying, [at], "laid on the ground where the chest stood");
}

#[test]
fn a_chest_still_lying_as_its_players_drops_go_to_their_mail_is_opened_for_them_never_lost() {
    let (mut room, player, _) = chested();
    let before = room.players[&player].character.xp;
    room.mail_lying(player);
    assert!(chest_at(&room, player).is_none(), "off the ground");
    assert!(room.players[&player].character.xp > before, "and paid, whatever its host called first");
}
