//! A player's gear carries the chests and containers standing that they have not opened, and leaves out one once it is
//! opened for them.

use crate::gear_wire::gear_bytes;
use crate::messages;

/// A patrol's room with three chest places and two crates, a player standing by the first place.
fn room_with_finds() -> (room::Room, room::PlayerId) {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = room::Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false };
    let mut room = room::Room::node(room::Floor::Flat, Vec::new(), section);
    let places = [[10.0, 0.0, 0.0], [60.0, 0.0, 1.5], [110.0, 0.0, 3.0]];
    room.lay_finds(
        &places,
        vec![[0.0, 20.0, 1.0, 21.0, 0.0, 0.8, 41_816.0], [5.0, 20.0, 6.0, 21.0, 0.0, 0.8, 41_003.0]],
    );
    let player = room.join().expect("a room with space");
    room.tick();
    (room, player)
}

fn floats(numbers: Option<flatbuffers::Vector<'_, f64>>) -> Vec<f64> {
    numbers.map(|numbers| numbers.iter().collect()).unwrap_or_default()
}

#[test]
fn the_gear_message_carries_each_chest_in_five_numbers_and_each_container_in_eight() {
    let (room, player) = room_with_finds();
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    let chests = floats(gear.chests());
    let standing = room.chests_for(player);
    assert_eq!(standing.len(), 2, "three places stand two chests");
    let written: Vec<f64> =
        standing.iter().flat_map(|&(number, [x, y, z, facing])| [f64::from(number), x, y, z, facing]).collect();
    assert_eq!(chests, written);
    let searchables = floats(gear.searchables());
    let held = room.searchables_for(player);
    assert_eq!(held.len(), 1, "one of two in six, at least one");
    let [west, north, east, south, foot, top, model] = held[0].1;
    assert_eq!(searchables, [f64::from(held[0].0), west, north, east, south, foot, top, model]);
}

#[test]
fn a_chest_opened_is_left_out_of_its_players_gear() {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = room::Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false };
    let mut room = room::Room::node(room::Floor::Flat, Vec::new(), section);
    // Two places stand two chests, the first by the spawn.
    room.lay_finds(&[[1.0, 0.0, 0.0], [100.0, 0.0, 0.0]], Vec::new());
    let player = room.join().expect("a room with space");
    room.tick();
    let (number, _) = *room.chests_for(player).iter().find(|(_, [x, ..])| *x < 2.0).expect("the chest by the spawn");
    let asked = room::Input { sequence: 1, ask: Some(room::Asked::Find { number }), ..room::Input::default() };
    room.input(player, asked).expect("taken");
    for _ in 0..=room::OPEN_TICKS + 1 {
        room.tick();
    }
    let bytes = gear_bytes(&room, player).expect("a player of the room");
    let gear = messages::root_as_from_room(&bytes).expect("read").gear().expect("gear");
    let chests = floats(gear.chests());
    assert_eq!(chests.len(), 5, "one chest left of two");
    assert!((chests[0] - f64::from(number)).abs() > 0.5, "the one opened is gone");
    assert_eq!(gear.opened(), number, "and named as the last it paid");
}
