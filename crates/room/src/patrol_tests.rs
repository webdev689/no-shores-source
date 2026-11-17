//! A patrol keeps its island's foes up, well away from players and spawns, at its levels and its voyage's; and its
//! resource nodes take turns at spots laid out the same every time.

use super::*;
use crate::patrol::{GROUPS, PATROL_FOES, ROTATE_TICKS, SPOTS};
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
fn a_patrol_stands_its_foes_one_at_a_time_away_from_players_and_spawns() {
    let (mut room, player) = patrol(Difficulty::Rough);
    room.tick();
    assert_eq!(room.foes.len(), 1, "the first at once");
    for _ in 0..180 {
        room.tick();
    }
    assert_eq!(room.foes.len(), 2, "then one every three seconds");
    let you = room.fighter(player).expect("in").body;
    for foe in room.foes.values() {
        let at = foe.fighter.body;
        assert!(libm::hypot(at.x - you.x, at.y - you.y) >= 25.0 - 1.0, "clear of the player");
        assert!(libm::hypot(at.x - SPAWN[0], at.y - SPAWN[1]) >= 30.0 - 1.0, "clear of the spawn");
        assert!((3..=6).contains(&foe.level), "the island's 1 to 4, two higher rough: {}", foe.level);
    }
    for _ in 0..(PATROL_FOES as u64 * 180) {
        room.tick();
    }
    assert!(room.foes.len() <= PATROL_FOES, "never more than it keeps");
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
