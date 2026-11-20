use super::*;
use movement::Block;

/// A deck 2.3 m up, from x -5 to 5, and the open floor beside it.
fn deck() -> Block {
    Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: 4.0, top: 2.3 }
}

#[test]
fn a_player_joins_and_stands_again_on_the_top_of_the_block_under_the_spawn() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let body = room.players[&player].fighter.body;
    assert_eq!((body.x, body.y, body.z), (0.0, 0.0, 2.3));
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 0.0;
    fighter.action = Action::Dead { elapsed: RESPAWN };
    room.tick();
    assert_eq!(room.players[&player].fighter.body.z, 2.3, "the respawn stands on the deck, not under it");
}

#[test]
fn a_spawn_off_every_block_stands_on_the_floor() {
    let mut room = Room::new(vec![deck()], (8.0, 0.0));
    let player = room.join().expect("a room with space");
    assert_eq!(room.players[&player].fighter.body.z, 0.0);
}

#[test]
fn a_foe_stood_by_the_page_stands_on_the_top_under_it_facing_as_asked_at_its_level_posted_there() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let foe = room.stand_foe_at(14, 1, (2.0, 1.0), 1.5, 3).expect("a pirate Swordsman");
    let seen = room.foes_seen().find(|seen| seen.foe == foe).unwrap();
    assert_eq!((seen.foe_type, seen.rank, seen.level), (14, 1, 3));
    assert_eq!((seen.fighter.body.x, seen.fighter.body.y, seen.fighter.body.z), (2.0, 1.0, 2.3));
    assert_eq!(seen.fighter.aim, 1.5);
    let brain = format!("{:?}", room.foes[&foe].brain);
    assert!(
        brain.contains("home: Some(Home { at: [2.0, 1.0, 2.3], facing: 1.5, marching: false })"),
        "posted where it stands: {brain}"
    );
    assert_eq!(room.stand_foe_at(99, 1, (2.0, 1.0), 0.0, 0), None, "no type has that number");
}

#[test]
fn a_type_asked_at_a_rank_it_has_not_comes_at_its_first() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let thule = room.stand_foe_at(12, 1, (0.0, 0.0), 0.0, 4).unwrap();
    assert_eq!(room.foes_seen().find(|seen| seen.foe == thule).unwrap().rank, ::foes::Rank::Boss as u8);
}

#[test]
fn the_page_stands_no_more_foes_than_the_room_holds() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let stood = (0..FOES_MOST + 3).filter_map(|_| room.stand_foe_at(7, 1, (0.0, 0.0), 0.0, 1)).count();
    assert_eq!(stood, FOES_MOST);
}

#[test]
fn a_boss_the_page_stood_calls_no_one_in_its_last_phase() {
    let mut room = Room::new(vec![deck()], (0.0, 3.0));
    let player = room.join().expect("a room with space");
    let boss = room.stand_foe_at(12, 5, (0.0, -2.5), 0.0, 0).unwrap();
    for _ in 0..400 {
        let found = room.foes.get_mut(&boss).unwrap();
        found.fighter.health = 0.3 * found.fighter.health_max;
        room.tick();
        let whole = room.players[&player].fighter.health_max;
        room.players.get_mut(&player).unwrap().fighter.health = whole;
    }
    assert!(room.foes_seen().any(|seen| seen.foe == boss && seen.phase == 3), "it reached its last phase");
    assert_eq!(room.foes.len(), 1, "and called no crew");
}

#[test]
fn the_page_sends_every_foe_away_at_once() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    room.stand_foe_at(7, 1, (2.0, 1.0), 0.0, 1).unwrap();
    room.stand_foe_at(12, 5, (-2.0, 1.0), 0.0, 4).unwrap();
    room.clear_foes();
    assert_eq!(room.foes_seen().count(), 0);
    assert!(room.quiet.is_empty());
}

#[test]
fn a_checkpoint_moves_where_the_next_respawn_stands() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.set_spawn(4.0, -3.0);
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 0.0;
    fighter.action = Action::Dead { elapsed: RESPAWN };
    room.tick();
    let body = room.players[&player].fighter.body;
    assert_eq!((body.x, body.y, body.z), (4.0, -3.0, 2.3));
}

#[test]
fn a_player_put_somewhere_stands_there_at_once_keeping_their_health() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
    fighter.health = 40.0;
    fighter.body = Body { z: -1.0, vz: -6.0, ..standing(9.0, 9.0) };
    assert!(room.put_player(player, -3.0, 2.0));
    let fighter = room.players[&player].fighter;
    assert_eq!((fighter.body.x, fighter.body.y, fighter.body.z, fighter.body.vz), (-3.0, 2.0, 2.3, 0.0));
    assert_eq!(fighter.health, 40.0);
    assert!(!room.put_player(99, 0.0, 0.0), "no such player");
}

#[test]
fn a_block_stood_after_the_room_opened_stops_a_player() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.stand_block(Block { min_x: -5.0, min_y: -2.0, max_x: 5.0, max_y: -1.5, top: 5.0 });
    let north = combat::Intent {
        controls: movement::Controls { forward: 1.0, yaw: 0.0, ..movement::Controls::default() },
        ..combat::Intent::default()
    };
    // Half a second of walking north would take the body 2.2 m, past where the block stands.
    for sequence in 1..=30 {
        room.input(player, Input { sequence, intent: north, ..Input::default() }).unwrap();
        room.tick();
    }
    let body = room.players[&player].fighter.body;
    assert!(body.y > -1.5, "the block stands in the way: {body:?}");
}

#[test]
fn a_block_taken_from_the_course_lets_a_player_through_and_only_a_block_it_holds_is_taken() {
    let mut room = Room::new(vec![deck()], (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let gate = Block { min_x: -5.0, min_y: -2.0, max_x: 5.0, max_y: -1.5, top: 5.0 };
    room.stand_block(gate);
    assert!(room.take_block(gate));
    assert!(!room.take_block(gate), "it is gone");
    let north = combat::Intent {
        controls: movement::Controls { forward: 1.0, yaw: 0.0, ..movement::Controls::default() },
        ..combat::Intent::default()
    };
    for sequence in 1..=30 {
        room.input(player, Input { sequence, intent: north, ..Input::default() }).unwrap();
        room.tick();
    }
    let body = room.players[&player].fighter.body;
    assert!(body.y < -2.0, "the way is open: {body:?}");
}
