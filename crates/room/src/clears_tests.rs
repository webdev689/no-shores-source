use super::garrison_tests::levelled;
use super::gird_tests::land;
use super::*;
use crate::PlayerId;

/// A room of `kind` with its garrison stood and no shield on any foe, and one player in it.
fn cleared_room(kind: NodeKind) -> (Room, PlayerId) {
    let mut room = levelled(kind, "glade", (18, 20));
    for foe in room.foes.values_mut() {
        foe.shield = None;
    }
    let player = room.join().expect("room");
    (room, player)
}

/// Every foe of the garrison felled by the player's blow.
fn fell_all(room: &mut Room, player: PlayerId) {
    let ids: Vec<_> = room.garrison.iter().flat_map(|post| post.standing.clone()).collect();
    for id in ids {
        land(room, player, id, 1e9);
    }
}

#[test]
fn a_dungeon_cleared_pays_who_fought_it_once_with_an_item_and_a_patrol_pays_none() {
    let (mut room, player) = cleared_room(NodeKind::Dungeon);
    let items_before = room.players[&player].character.items.len();
    fell_all(&mut room, player);
    let after_kills = room.players[&player].character.xp;
    room.tick();
    let paid = room.players[&player].character.xp - after_kills;
    assert!(paid >= 2_000, "a dungeon's clear at its levels: {paid}");
    assert!(room.players[&player].character.items.len() > items_before, "its Miniboss's item, and the clear's");
    room.tick();
    assert_eq!(room.players[&player].character.xp - after_kills, paid, "paid once until a group stands again");
    let (mut patrol, walker) = cleared_room(NodeKind::Patrol);
    fell_all(&mut patrol, walker);
    let before = patrol.players[&walker].character.xp;
    patrol.tick();
    assert_eq!(patrol.players[&walker].character.xp, before, "a patrol never ends");
}

#[test]
fn a_world_boss_cleared_pays_more_than_a_dungeon_and_a_dungeon_more_than_a_mission() {
    let clear = |kind: NodeKind| {
        let (mut room, player) = cleared_room(kind);
        fell_all(&mut room, player);
        let before = room.players[&player].character.xp;
        room.tick();
        room.players[&player].character.xp - before
    };
    let (mission, dungeon, world_boss) = (clear(NodeKind::Mission), clear(NodeKind::Dungeon), clear(NodeKind::Boss));
    assert!(mission < dungeon && dungeon < world_boss, "{mission} {dungeon} {world_boss}");
}

#[test]
fn a_minibosss_or_a_bosss_group_stands_again_after_ten_minutes_and_the_rest_after_two() {
    assert_eq!((STAND_AGAIN, GREAT_STAND_AGAIN), (120 * 60, 600 * 60));
    let (mut room, player) = cleared_room(NodeKind::Dungeon);
    fell_all(&mut room, player);
    // Far from every post, so nothing holds a group from standing.
    let mut away = room.players[&player].fighter;
    (away.body.x, away.body.y) = (1e6, 1e6);
    room.players.get_mut(&player).expect("in").fighter = away;
    let great = |post: &Post| {
        post.members.iter().any(|(_, rank, _, _)| matches!(rank, ::foes::Rank::Miniboss | ::foes::Rank::Boss))
    };
    for _ in 0..=STAND_AGAIN {
        room.tick();
    }
    assert!(
        room.garrison.iter().filter(|post| great(post)).all(|post| post.cleared_at.is_some()),
        "the Miniboss waits"
    );
    assert!(room.garrison.iter().filter(|post| !great(post)).all(|post| post.cleared_at.is_none()), "the rest stand");
}

#[test]
fn a_wave_that_stands_and_falls_after_a_clear_pays_no_clear_again() {
    let (mut room, player) = cleared_room(NodeKind::Dungeon);
    fell_all(&mut room, player);
    room.tick();
    let cleared = room.players[&player].character.xp;
    // A quest's wave, an arriving post, stands at the cleared garrison and falls.
    let at = room.garrison[0].at;
    let foe_type = ::foes::foe_type(14).expect("the pirates' swordsman");
    let wave = room.stand_foe(foe_type, ::foes::Rank::Minor, at, 0.0, None);
    room.garrison.push(Post {
        at,
        members: vec![(14, ::foes::Rank::Minor, at, 0.0)],
        girds: vec![(0, None)],
        beat: None,
        standing: vec![wave],
        cleared_at: None,
        leader: None,
        broken: false,
        defending: false,
        fallback: at,
        anchor: None,
        arrival: true,
    });
    room.tick();
    land(&mut room, player, wave, 1e9);
    room.tick();
    room.tick();
    let gained = room.players[&player].character.xp - cleared;
    assert!(gained < 1_000, "the wave's kill alone, not the dungeon's clear again: {gained}");
}
