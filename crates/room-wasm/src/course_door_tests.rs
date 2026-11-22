use super::*;
use course_door::{
    room_clear_foes, room_put_player, room_set_spawn, room_stand_block, room_stand_foe, room_take_block,
};
use protocol::wire::overlook::wire as messages;

/// Opens a course with a deck 2.3 m up from x -5 to 5, its spawn on it.
fn open_deck() {
    let numbers: [f64; 8] = [0.0, 0.0, -5.0, -4.0, 5.0, 4.0, 2.3, 0.0];
    assert!(open(&numbers.iter().flat_map(|value| value.to_le_bytes()).collect::<Vec<u8>>()));
}

/// The player's feet in the last snapshot.
fn feet(player: PlayerId) -> [f64; 3] {
    let bytes = snapshot(player);
    let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap().players().unwrap();
    let found = seen.iter().find(|seen| seen.player() == player).unwrap();
    let numbers: Vec<f64> = found.fighter().unwrap().iter().take(22).collect();
    let body = protocol::body_of(&numbers).unwrap();
    [body.x, body.y, body.z]
}

#[test]
fn a_course_s_player_joins_on_the_deck_and_the_page_stands_foes_and_puts_them_there() {
    open_deck();
    let player = room_join();
    room_tick();
    assert_eq!(feet(player), [0.0, 0.0, 2.3]);
    let foe = room_stand_foe(13, 1, 2.0, 1.0, 0.5, 2);
    assert_ne!(foe, 0);
    room_tick();
    let bytes = snapshot(player);
    let foes = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap().foes().unwrap();
    let seen = foes.iter().find(|seen| seen.id() == foe).unwrap();
    // A foe crosses packed: its type, rank and level are the second, third and seventh numbers after its glance.
    let numbers =
        protocol::pack::unpack(seen.packed().unwrap().bytes(), protocol::land::FOE_NUMBERS, [0.0; 2]).unwrap();
    let after = &numbers[combat::floats::GLANCE_FLOATS..];
    assert_eq!((after[1], after[2], after[6]), (13.0, 1.0, 2.0));
    assert_eq!(room_stand_foe(250, 1, 0.0, 0.0, 0.0, 0), 0, "no type has that number");
    assert_eq!(room_clear_foes(), 1);
    room_tick();
    let bytes = snapshot(player);
    assert_eq!(messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap().foes().map_or(0, |foes| foes.len()), 0);
    assert_eq!(room_put_player(player, -3.0, 2.0), 1);
    room_tick();
    assert_eq!(feet(player), [-3.0, 2.0, 2.3]);
    assert_eq!(room_put_player(999, 0.0, 0.0), 0);
    assert_eq!(room_set_spawn(4.0, -3.0), 1);
    assert_eq!(room_stand_block(-5.0, -2.0, 5.0, -1.5, 5.0, 0.0), 1);
    assert!(fighter_door::COURSE.with(|course| course.borrow().iter().any(|block| block.top == 5.0)));
    assert_eq!(room_take_block(-5.0, -2.0, 5.0, -1.5, 5.0, 0.0), 1);
    assert!(!fighter_door::COURSE.with(|course| course.borrow().iter().any(|block| block.top == 5.0)));
    assert_eq!(room_take_block(-5.0, -2.0, 5.0, -1.5, 5.0, 0.0), 0, "no such block is left");
}

#[test]
fn the_course_s_asks_do_nothing_at_sea() {
    open_fleet();
    assert_eq!(room_stand_foe(13, 1, 0.0, 0.0, 0.0, 0), 0);
    assert_eq!(room_clear_foes(), 0);
    assert_eq!(room_set_spawn(0.0, 0.0), 0);
    assert_eq!(room_put_player(1, 0.0, 0.0), 0);
    assert_eq!(room_stand_block(0.0, 0.0, 1.0, 1.0, 1.0, 0.0), 0);
    assert_eq!(room_take_block(0.0, 0.0, 1.0, 1.0, 1.0, 0.0), 0);
}
