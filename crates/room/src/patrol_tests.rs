//! A patrol's resource nodes stand at its layout's resource places, a third at a time, each gathered by holding E two
//! seconds; its foes are its garrison's alone.

use super::*;
use crate::asks::{GATHER_TICKS, NODE_REACH};
use crate::patrol::{GROUPS, ROTATE_TICKS};
use gear::Difficulty;

const SPAWN: [f64; 2] = [0.0, 0.0];

/// Twelve resource places within the section, and one past its edge.
fn places() -> Vec<[f64; 2]> {
    let mut places: Vec<[f64; 2]> =
        (0..12).map(|at| [f64::from(at % 4) * 80.0 - 120.0, f64::from(at / 4) * 80.0 - 80.0]).collect();
    places.push([500.0, 0.0]);
    places
}

fn patrol(difficulty: Difficulty) -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![SPAWN], falls_kill: false });
    room.start_patrol(0, &places());
    room.set_difficulty(difficulty);
    let player = room.join().expect("a room with space");
    (room, player)
}

/// Stands `player` `away` metres east of `node`'s place.
fn stand_by(room: &mut Room, player: PlayerId, node: u8, away: f64) {
    let spot = room.resource_nodes[usize::from(node)];
    let mut there = *room.fighter(player).expect("in");
    there.body.x = spot.x + away;
    there.body.y = spot.y;
    room.set_fighter(player, there);
}

/// Asks to gather `node` and holds it `ticks`; answers the ask's answer.
fn hold(room: &mut Room, player: PlayerId, node: u8, ticks: u64) -> u8 {
    room.answer(player, asks::Asked::Gather { node });
    let answer = room.player(player).expect("in").answer;
    for _ in 0..ticks {
        room.tick();
    }
    answer
}

fn spent(room: &Room, player: PlayerId, node: u8) -> bool {
    room.player(player).expect("in").spent.contains(&node)
}

#[test]
fn a_patrol_stands_no_camps_of_its_own_its_fights_are_its_garrisons() {
    let (mut room, _) = patrol(Difficulty::Abyss);
    for _ in 0..600 {
        room.tick();
    }
    assert!(room.foes.is_empty(), "with a player in it a minute, no camp stood");
    assert_eq!(room.resource_nodes.len(), 12, "its nodes keep their places; the one past its edge stands none");
}

#[test]
fn resource_nodes_stand_at_the_layouts_places_a_third_at_a_time_and_each_may_be_gathered_again_next_turn() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let at = |room: &Room| room.resource_nodes.iter().map(|node| [node.x, node.y]).collect::<Vec<_>>();
    assert_eq!(at(&room), places()[..12], "at the layout's places, in its order");
    let standing = |room: &Room| room.nodes_for(player).map(|(index, _)| index).collect::<Vec<u8>>();
    let first = standing(&room);
    assert_eq!(first.len(), 12 / GROUPS);
    // Gathered where it stands, by its dressing's edge: spent for this turn.
    stand_by(&mut room, player, first[0], NODE_REACH - 0.2);
    assert_eq!(hold(&mut room, player, first[0], GATHER_TICKS + 1), 0);
    assert!(spent(&room, player, first[0]) && !standing(&room).contains(&first[0]));
    while room.clock % ROTATE_TICKS != ROTATE_TICKS - 1 {
        room.tick();
    }
    room.tick();
    let next = standing(&room);
    assert_eq!(next.len(), 12 / GROUPS);
    assert!(next.iter().all(|index| !first.contains(index)), "the next third");
    assert_eq!(hold(&mut room, player, first[0], 0), asks::OUT_OF_REACH, "its place rests this turn");
}

#[test]
fn a_node_is_gathered_only_once_held_two_seconds() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    let resource = |room: &Room| room.player(player).expect("in").character.materials.resource(0);
    let before = resource(&room);
    assert_eq!(hold(&mut room, player, node, GATHER_TICKS - 1), 0, "begun");
    assert!(!spent(&room, player, node) && resource(&room) == before, "not yet");
    room.tick();
    assert!(spent(&room, player, node) && resource(&room) > before, "gathered at two seconds");
}

#[test]
fn letting_go_stirring_or_being_hurt_stops_a_gather() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    let gathering = |room: &Room| room.player(player).expect("in").gathering.is_some();
    // Let go of.
    stand_by(&mut room, player, node, 1.0);
    hold(&mut room, player, node, 30);
    room.answer(player, asks::Asked::StopGather);
    room.tick();
    assert!(!gathering(&room), "let go of well before its end");
    // Stirred: the body walked half a metre on.
    hold(&mut room, player, node, 30);
    stand_by(&mut room, player, node, 1.5);
    room.tick();
    assert!(!gathering(&room), "a step stops it");
    // Hurt.
    hold(&mut room, player, node, 30);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health -= 1.0;
    room.set_fighter(player, hurt);
    room.tick();
    assert!(!gathering(&room), "a blow stops it");
    for _ in 0..GATHER_TICKS {
        room.tick();
    }
    assert!(!spent(&room, player, node), "none of them gathered it");
    // Out of reach, it is never begun.
    stand_by(&mut room, player, node, NODE_REACH + 0.5);
    assert_eq!(hold(&mut room, player, node, 0), asks::OUT_OF_REACH);
}

#[test]
fn a_node_gathered_stays_spent_for_its_account_however_often_the_player_rejoins_this_turn() {
    let (mut room, player) = patrol(Difficulty::Normal);
    room.own(player, "account-a");
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    assert_eq!(hold(&mut room, player, node, GATHER_TICKS + 1), 0);
    room.leave(player);
    let back = room.join().expect("a room with space");
    room.own(back, "account-a");
    stand_by(&mut room, back, node, 1.0);
    assert_ne!(hold(&mut room, back, node, 0), 0, "spent for the account, not the socket");
    assert!(!room.nodes_for(back).any(|(index, _)| index == node), "and not shown as standing for them");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    stand_by(&mut room, other, node, 1.0);
    assert_eq!(hold(&mut room, other, node, GATHER_TICKS + 1), 0, "another account gathers it");
    assert!(spent(&room, other, node));
}

#[test]
fn letting_go_as_the_ring_fills_still_gathers_the_room_counting_from_its_answer() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    // The page's ring, counted from the press, fills a crossing before the room's count does.
    hold(&mut room, player, node, GATHER_TICKS - 5);
    room.take_ask(player, asks::Asked::StopGather);
    room.tick();
    assert!(spent(&room, player, node), "let go as it filled, it is gathered");
}

#[test]
fn a_blow_after_a_heal_stops_a_gather() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health -= 20.0;
    room.set_fighter(player, hurt);
    hold(&mut room, player, node, 20);
    let mut healed = *room.fighter(player).expect("in");
    healed.health += 10.0;
    room.set_fighter(player, healed);
    room.tick();
    healed.health -= 5.0;
    room.set_fighter(player, healed);
    room.tick();
    assert!(room.player(player).expect("in").gathering.is_none(), "still above where it began, but struck");
}

#[test]
fn pressing_e_again_and_again_leaves_no_gather_running_once_it_is_let_go() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    for _ in 0..3 {
        room.take_ask(player, asks::Asked::Gather { node });
        room.take_ask(player, asks::Asked::StopGather);
    }
    for _ in 0..GATHER_TICKS * 2 {
        room.tick();
    }
    assert!(!spent(&room, player, node), "every press let go of");
}

#[test]
fn a_gather_is_not_begun_on_horseback_and_mounting_stops_one() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    room.players.get_mut(&player).expect("in").mounted = true;
    assert_eq!(hold(&mut room, player, node, 0), asks::MOUNTED);
    room.players.get_mut(&player).expect("in").mounted = false;
    hold(&mut room, player, node, 30);
    room.players.get_mut(&player).expect("in").mounted = true;
    room.tick();
    assert!(room.player(player).expect("in").gathering.is_none(), "mounting stops it");
}

#[test]
fn a_full_stock_or_the_turn_passing_stops_a_gather() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    hold(&mut room, player, node, 30);
    let character = &mut room.players.get_mut(&player).expect("in").character;
    while character.materials.resource(0) < gear::character::STOCK_MOST {
        character.gather(0);
    }
    room.tick();
    assert!(room.player(player).expect("in").gathering.is_none(), "full");
    let (mut room, player) = patrol(Difficulty::Normal);
    while room.clock % ROTATE_TICKS != ROTATE_TICKS - GATHER_TICKS / 2 {
        room.tick();
    }
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    stand_by(&mut room, player, node, 1.0);
    hold(&mut room, player, node, GATHER_TICKS + 1);
    assert!(!spent(&room, player, node), "its turn passed before it was gathered");
}
