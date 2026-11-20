//! A patrol's resource nodes take turns at spots laid out the same every time; its foes are its garrison's alone.

use super::*;
use crate::patrol::{GROUPS, ROTATE_TICKS, SPOTS};
use gear::Difficulty;

const SPAWN: [f64; 2] = [0.0, 0.0];

fn patrol(difficulty: Difficulty) -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![SPAWN] });
    room.start_patrol("saltgrass-downs", 0);
    room.set_difficulty(difficulty);
    let player = room.join().expect("a room with space");
    (room, player)
}

#[test]
fn a_patrol_stands_no_camps_of_its_own_its_fights_are_its_garrisons() {
    let (mut room, _) = patrol(Difficulty::Abyss);
    for _ in 0..600 {
        room.tick();
    }
    assert!(room.foes.is_empty(), "with a player in it a minute, no camp stood");
    assert_eq!(room.resource_nodes.len(), SPOTS, "its resource nodes keep their spots");
}

#[test]
fn resource_nodes_stand_at_their_spots_a_third_at_a_time_and_each_may_be_gathered_again_next_turn() {
    let (mut room, player) = patrol(Difficulty::Normal);
    let (again, _) = patrol(Difficulty::Normal);
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
    let (mut room, player) = patrol(Difficulty::Normal);
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
