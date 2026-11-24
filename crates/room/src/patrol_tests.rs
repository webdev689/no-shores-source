//! A patrol's resource nodes all stand at its layout's resource places, each gathered by holding E two seconds and
//! spent for that player alone until it returns for them; its foes are its garrison's alone.

use super::*;
use crate::asks::{GATHER_TICKS, NODE_REACH};
use crate::patrol::RETURN_TICKS;
use gear::Difficulty;

const SPAWN: [f64; 2] = [0.0, 0.0];

/// Twelve resource places within the section.
fn places() -> Vec<[f64; 2]> {
    (0..12).map(|at| [f64::from(at % 4) * 80.0 - 120.0, f64::from(at / 4) * 80.0 - 80.0]).collect()
}

fn patrol(difficulty: Difficulty) -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![SPAWN], falls_kill: false });
    room.start_patrol("saltgrass-downs", 0, &places());
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
    room.player(player).expect("in").spent.iter().any(|&(spent, _)| spent == node)
}

#[test]
fn a_patrol_stands_no_camps_of_its_own_its_fights_are_its_garrisons() {
    let (mut room, _) = patrol(Difficulty::Abyss);
    for _ in 0..600 {
        room.tick();
    }
    assert!(room.foes.is_empty(), "with a player in it a minute, no camp stood");
    assert_eq!(room.resource_nodes.len(), 12, "its nodes keep their places");
    // Garrisoned, as a patrol zone's room is: every foe it stands is its garrison's.
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = Section { ring, spawns: vec![[0.0, 180.0]], falls_kill: false };
    let mut garrisoned = Room::garrisoned(Floor::Flat, Vec::new(), section, NodeKind::Patrol, ("downs", None));
    garrisoned.start_patrol("downs", 0, &[]);
    garrisoned.join().expect("a room with space");
    for _ in 0..600 {
        garrisoned.tick();
    }
    let posted: Vec<FighterId> = garrisoned.garrison.iter().flat_map(|post| post.standing.iter().copied()).collect();
    assert!(!posted.is_empty(), "its garrison stands");
    assert!(garrisoned.foes.keys().all(|id| posted.contains(id)), "no foe but its garrison's");
}

#[test]
fn every_node_stands_for_everyone_and_one_gathered_is_spent_for_its_gatherer_alone_until_it_returns() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let at = |room: &Room| room.resource_nodes.iter().map(|node| [node.x, node.y]).collect::<Vec<_>>();
    assert_eq!(at(&room), places(), "at the layout's places, in its order");
    let standing = |room: &Room, who: PlayerId| room.nodes_for(who).map(|(index, _)| index).collect::<Vec<u8>>();
    let every: Vec<u8> = (0..12).collect();
    assert_eq!(standing(&room, player), every, "every node stands, none waiting a turn");
    for _ in 0..60 * 200 {
        room.tick();
    }
    assert_eq!(standing(&room, player), every, "and still stands minutes on");
    // Gathered by its dressing's edge: spent for this player, standing for another.
    let other = room.join().expect("a room with space");
    stand_by(&mut room, player, 4, NODE_REACH - 0.2);
    assert_eq!(hold(&mut room, player, 4, GATHER_TICKS + 1), 0);
    assert!(spent(&room, player, 4) && !standing(&room, player).contains(&4));
    assert_eq!(standing(&room, other), every, "still standing for another player");
    stand_by(&mut room, other, 4, 1.0);
    assert_eq!(hold(&mut room, other, 4, GATHER_TICKS + 1), 0, "who gathers it too");
    // It returns for its gatherer nine minutes after they gathered it, and not before.
    stand_by(&mut room, player, 4, 1.0);
    let gathered_at = room.clock - 1 - (GATHER_TICKS + 1);
    while room.clock < gathered_at + RETURN_TICKS - 1 {
        room.tick();
    }
    assert_eq!(hold(&mut room, player, 4, 0), asks::OUT_OF_REACH, "spent a moment before it returns");
    room.players.get_mut(&player).expect("in").gear_changed = false;
    room.tick();
    room.tick();
    assert!(standing(&room, player).contains(&4), "back for them");
    assert!(room.player(player).expect("in").gear_changed, "and their page is told");
    assert_eq!(hold(&mut room, player, 4, GATHER_TICKS + 1), 0, "gathered again");
    assert_eq!(RETURN_TICKS, 60 * 540, "nine minutes");
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
fn a_node_gathered_stays_spent_for_its_account_however_often_the_player_rejoins_until_it_returns() {
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
    // Once it has returned, a rejoin brings it back spent no more.
    room.leave(back);
    for _ in 0..RETURN_TICKS {
        room.tick();
    }
    let again = room.join().expect("a room with space");
    room.own(again, "account-a");
    assert!(room.nodes_for(again).any(|(index, _)| index == node), "returned for the account");
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
fn a_full_stock_stops_a_gather() {
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
}
