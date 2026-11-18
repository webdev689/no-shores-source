//! A patrol keeps its island's foes up, well away from players and spawns, at its levels and its voyage's; and its
//! resource nodes take turns at spots laid out the same every time.

use super::*;
use crate::patrol::{CAMP_CLEAR_M, CAMPS, GROUPS, PATROL_FOES, REFILL_TICKS, ROTATE_TICKS, SPOTS};
use gear::Difficulty;

const SPAWN: [f64; 2] = [0.0, 0.0];

fn patrol(difficulty: Difficulty) -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![SPAWN] });
    room.start_patrol("saltgrass-downs", (1, 4), 0);
    room.set_difficulty(difficulty);
    let player = room.join().expect("a room with space");
    (room, player)
}

#[test]
fn a_patrol_stands_its_camps_whole_at_their_places_at_its_levels() {
    let (mut room, player) = patrol(Difficulty::Rough);
    let (again, _) = patrol(Difficulty::Rough);
    let camps = room.patrol.as_ref().expect("a patrol").camps.clone();
    assert_eq!(camps.len(), CAMPS);
    assert_eq!(camps, again.patrol.expect("a patrol").camps, "the same places every time");
    room.tick();
    let you = room.fighter(player).expect("in").body;
    let camps = room.patrol.as_ref().expect("a patrol").camps.clone();
    let standing: usize = camps.iter().map(|camp| camp.foes.len()).sum();
    assert_eq!(standing, room.foes.len());
    assert!((2..=PATROL_FOES).contains(&standing), "{standing} foes");
    for camp in camps.iter().filter(|camp| !camp.foes.is_empty()) {
        assert_eq!(camp.foes.len(), camp.size, "a camp stands whole");
        assert!(libm::hypot(camp.at[0] - you.x, camp.at[1] - you.y) >= CAMP_CLEAR_M);
        for id in &camp.foes {
            let foe = &room.foes[id];
            let at = foe.fighter.body;
            assert!(libm::hypot(at.x - camp.at[0], at.y - camp.at[1]) <= 8.0 + 1e-9, "at its camp");
            assert!((3..=6).contains(&foe.level), "the island's 1 to 4, two higher rough: {}", foe.level);
        }
    }
}

#[test]
fn a_cleared_camp_stands_again_after_its_wait_and_only_with_no_one_near() {
    let (mut room, player) = patrol(Difficulty::Calm);
    room.tick();
    let camp =
        room.patrol.as_ref().expect("a patrol").camps.iter().position(|camp| !camp.foes.is_empty()).expect("one");
    let at = room.patrol.as_ref().expect("a patrol").camps[camp].at;
    for id in room.patrol.as_ref().expect("a patrol").camps[camp].foes.clone() {
        room.foes.remove(&id);
    }
    room.tick();
    let fallen_at = room.clock;
    // Someone stands in the empty camp as its wait runs out: it stays empty while they are there.
    let mut there = *room.fighter(player).expect("in");
    there.body.x = at[0];
    there.body.y = at[1];
    while room.clock < fallen_at + REFILL_TICKS + 60 {
        room.set_fighter(player, there);
        room.tick();
    }
    assert!(room.patrol.as_ref().expect("a patrol").camps[camp].foes.is_empty(), "not while watched");
    let mut away = there;
    away.body.x = 0.0;
    away.body.y = 0.0;
    room.set_fighter(player, away);
    room.tick();
    let refilled = &room.patrol.as_ref().expect("a patrol").camps[camp];
    assert_eq!(refilled.foes.len(), refilled.size, "whole again once no one is near");
}

#[test]
fn an_empty_patrol_stands_no_one() {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![SPAWN] });
    room.start_patrol("saltgrass-downs", (1, 4), 0);
    for _ in 0..600 {
        room.tick();
    }
    assert!(room.foes.is_empty());
}

#[test]
fn resource_nodes_stand_at_their_spots_a_third_at_a_time_and_each_may_be_gathered_again_next_turn() {
    let (mut room, player) = patrol(Difficulty::Calm);
    let (again, _) = patrol(Difficulty::Calm);
    assert_eq!(room.resource_nodes.len(), SPOTS);
    assert_eq!(room.resource_nodes, again.resource_nodes, "the same spots every time, for routes to be learned");
    let ring = [[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    for (index, node) in room.resource_nodes.iter().enumerate() {
        assert!(reach::inside(&ring, node.x, node.y));
        for other in &room.resource_nodes[index + 1..] {
            assert!(libm::hypot(node.x - other.x, node.y - other.y) >= 60.0);
        }
    }
    let standing = |room: &Room| room.nodes_for(player).map(|(index, _)| index).collect::<Vec<u8>>();
    let first = standing(&room);
    assert_eq!(first.len(), SPOTS / GROUPS);
    // Gathered where it stands: spent for this turn.
    let [x, y] = {
        let node = room.resource_nodes[usize::from(first[0])];
        [node.x, node.y]
    };
    let mut there = *room.fighter(player).expect("in");
    there.body.x = x;
    there.body.y = y;
    room.set_fighter(player, there);
    let gathered = |room: &mut Room, node: u8| {
        room.answer(player, asks::Asked::Gather { node });
        room.player(player).expect("in").answer
    };
    assert_eq!(gathered(&mut room, first[0]), 0);
    assert!(!standing(&room).contains(&first[0]));
    while room.clock % ROTATE_TICKS != ROTATE_TICKS - 1 {
        room.tick();
    }
    room.tick();
    let next = standing(&room);
    assert_eq!(next.len(), SPOTS / GROUPS);
    assert!(next.iter().all(|index| !first.contains(index)), "the next third");
    assert_eq!(gathered(&mut room, first[0]), asks::OUT_OF_REACH, "its spot rests this turn");
}

#[test]
fn a_node_gathered_stays_spent_for_its_account_however_often_the_player_rejoins_this_turn() {
    let (mut room, player) = patrol(Difficulty::Calm);
    room.own(player, "account-a");
    let node = room.nodes_for(player).map(|(index, _)| index).next().expect("a node standing");
    let spot = room.resource_nodes[usize::from(node)];
    let stand_at = |room: &mut Room, player: PlayerId| {
        let mut there = *room.fighter(player).expect("in");
        there.body.x = spot.x;
        there.body.y = spot.y;
        room.set_fighter(player, there);
    };
    stand_at(&mut room, player);
    room.answer(player, asks::Asked::Gather { node });
    assert_eq!(room.player(player).expect("in").answer, 0);
    room.leave(player);
    let back = room.join().expect("a room with space");
    room.own(back, "account-a");
    stand_at(&mut room, back);
    room.answer(back, asks::Asked::Gather { node });
    assert_ne!(room.player(back).expect("in").answer, 0, "spent for the account, not the socket");
    assert!(!room.nodes_for(back).any(|(index, _)| index == node), "and not shown as standing for them");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    stand_at(&mut room, other);
    room.answer(other, asks::Asked::Gather { node });
    assert_eq!(room.player(other).expect("in").answer, 0, "another account gathers it");
}
