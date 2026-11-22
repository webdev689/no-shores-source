use super::*;
use combat::Intent;
use movement::{Controls, TICK_SECONDS, step_body};

const WALK: Controls =
    Controls { forward: 1.0, sideways: 0.0, yaw: 0.3, run: false, jump: false, crouch: false, mounted: false };

/// An input with these controls and no look.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

fn room() -> Room {
    Room::new(vec![Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 2.3, bottom: 0.0 }], (0.0, 2.0))
}

fn seen(room: &Room, player: PlayerId) -> Seen {
    room.seen().find(|each| each.player == player).unwrap()
}

#[test]
fn players_join_with_numbers_of_their_own_standing_at_the_spawn_and_leave() {
    let mut room = room();
    let (first, second) = (room.join().expect("a room with space"), room.join().expect("a room with space"));
    assert_ne!(first, second);
    assert_eq!(seen(&room, first).fighter.body, standing(0.0, 2.0));
    room.leave(first);
    assert_eq!(room.seen().map(|each| each.player).collect::<Vec<_>>(), vec![second]);
    assert_eq!(room.input(first, input(1, WALK)), Err(Refused::NoSuchPlayer));
}

#[test]
fn each_input_steps_the_body_once_as_the_movement_rules_do_and_is_acknowledged() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let mut expected = standing(0.0, 2.0);
    for sequence in 1..=40 {
        let controls = Controls { jump: sequence == 20, ..WALK };
        room.input(player, input(sequence, controls)).unwrap();
        room.tick();
        expected = step_body(&expected, &controls, &room.blocks, &room.floor, TICK_SECONDS);
        let now = seen(&room, player);
        assert_eq!((now.fighter.body, now.shown, now.acknowledged), (expected, Shown::default(), sequence));
    }
}

#[test]
fn inputs_out_of_order_are_refused() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    room.input(player, input(1, WALK)).unwrap();
    assert_eq!(room.input(player, input(3, WALK)), Err(Refused::OutOfOrder { expected: 2, got: 3 }));
    assert_eq!(room.input(player, input(1, WALK)), Err(Refused::OutOfOrder { expected: 2, got: 1 }));
    assert_eq!(room.input(player, input(2, WALK)), Ok(()));
}

#[test]
fn no_player_moves_faster_than_the_rooms_clock_and_one_catching_up_takes_a_few_inputs_a_tick() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    for sequence in 1..=20 {
        room.input(player, input(sequence, WALK)).unwrap();
    }
    room.tick();
    assert_eq!(usize::try_from(seen(&room, player).acknowledged).unwrap(), CATCH_UP);
    for _ in 0..13 {
        room.tick();
    }
    assert_eq!(seen(&room, player).acknowledged, 20, "within the clock and its slack of {SLACK_TICKS} ticks");
}

#[test]
fn past_the_waiting_limit_the_oldest_input_is_let_go_and_the_order_holds() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let limit = u32::try_from(WAITING_LIMIT).unwrap();
    for sequence in 1..=limit + 5 {
        room.input(player, input(sequence, WALK)).unwrap();
    }
    assert_eq!(
        room.input(player, input(limit + 7, WALK)),
        Err(Refused::OutOfOrder { expected: limit + 6, got: limit + 7 })
    );
    room.tick();
    assert!(seen(&room, player).acknowledged >= 6, "the five let go count as taken, and the tick takes one");
}

#[test]
fn a_player_who_sends_nothing_stays_where_they_were_while_the_clock_runs() {
    let mut room = room();
    let (idle, walker) = (room.join().expect("a room with space"), room.join().expect("a room with space"));
    room.input(walker, input(1, WALK)).unwrap();
    for _ in 0..10 {
        room.tick();
    }
    assert_eq!(room.clock(), 10);
    assert_eq!(seen(&room, idle).fighter.body, standing(0.0, 2.0));
    assert_ne!(seen(&room, walker).fighter.body, standing(0.0, 2.0));
}

#[test]
fn what_a_figure_shows_is_seen_with_the_tick_that_takes_its_input() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let shown = Shown { anim: "attack_sword".to_owned(), frame: 2, facing: 1.25 };
    room.input(player, Input { shown: shown.clone(), ..input(1, WALK) }).unwrap();
    assert_eq!(seen(&room, player).shown, Shown::default());
    room.tick();
    assert_eq!(seen(&room, player).shown, shown);
}

#[test]
fn a_dress_is_passed_on_once_each_time_it_changes_and_to_everyone_who_joins_later() {
    let mut room = room();
    let (first, second) = (room.join().expect("a room with space"), room.join().expect("a room with space"));
    let dressed = |sequence, dress: &str| Input { dress: Some(dress.to_owned()), ..input(sequence, WALK) };
    let (red, blue) = (r#"{"outfit":{"garments":["red"]}}"#, r#"{"outfit":{"garments":["blue"]}}"#);
    room.input(first, dressed(1, red)).unwrap();
    room.input(first, dressed(2, red)).unwrap();
    room.tick();
    assert_eq!(room.take_dress_changes(), vec![(first, red.to_owned())]);
    assert_eq!(room.take_dress_changes(), vec![]);
    // A change hard on the heels of the last waits its turn, a second after it.
    room.input(first, dressed(3, blue)).unwrap();
    room.tick();
    assert_eq!(room.take_dress_changes(), vec![]);
    for _ in 0..60 {
        room.tick();
    }
    assert_eq!(room.take_dress_changes(), vec![(first, blue.to_owned())]);
    assert_eq!(room.dresses().collect::<Vec<_>>(), vec![(first, blue)]);
    assert!(room.dresses().all(|(player, _)| player != second));
    // A boarder come over a ship's side has no welcome to bring the dresses aboard: every one is passed on once more.
    room.announce_dresses();
    assert_eq!(room.take_dress_changes(), vec![(first, blue.to_owned())]);
    assert_eq!(room.take_dress_changes(), vec![]);
    // A dress that does not read is refused, the input taken all the same, and the last good one is still shown.
    for (sequence, bad) in [(4, "red"), (5, r#"{"outfit":"red"}"#)] {
        assert_eq!(room.input(first, dressed(sequence, bad)), Ok(()));
    }
    for _ in 0..=60 {
        room.tick();
    }
    assert_eq!(room.take_dress_changes(), vec![]);
    assert_eq!(room.dresses().collect::<Vec<_>>(), vec![(first, blue)]);
}

#[test]
fn a_move_name_that_is_not_one_and_a_look_past_its_limit_are_refused() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let showing = |anim: &str| Input { shown: Shown { anim: anim.to_owned(), ..Shown::default() }, ..input(1, WALK) };
    assert_eq!(room.input(player, showing("Walk")), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing("walk; drop")), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing(&"a".repeat(MOVE_LIMIT + 1))), Err(Refused::BadLook));
    let huge = Input { dress: Some("x".repeat(DRESS_LIMIT + 1)), ..input(1, WALK) };
    assert_eq!(room.input(player, huge), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing("crouch_walk")), Ok(()));
}

#[test]
fn a_held_players_inputs_are_taken_in_order_and_stand_still_until_they_are_let_play() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("in");
    let at = |room: &Room| {
        let body = room.players[&player].fighter.body;
        [body.x, body.y]
    };
    let start = at(&room);
    assert!(room.hold(player, true));
    let ahead =
        |sequence| Input { sequence, intent: Intent { controls: WALK, ..Intent::default() }, ..Input::default() };
    for sequence in 1..=30 {
        assert_eq!(room.input(player, ahead(sequence)), Ok(()), "every input taken in its order while held");
        room.tick();
    }
    assert_eq!(at(&room), start, "held, the player stood still");
    assert!(room.hold(player, false));
    for sequence in 31..=60 {
        assert_eq!(room.input(player, ahead(sequence)), Ok(()), "and the next follows on");
        room.tick();
    }
    assert_ne!(at(&room), start, "let play, the player walks");
    assert!(!room.hold(99, true), "no such player");
}

#[test]
fn a_plate_carries_its_players_name_level_prestige_and_menu_and_goes_once_each_time_it_changes() {
    let mut room = room();
    let (first, second) = (room.join().expect("a room with space"), room.join().expect("a room with space"));
    let plate = |name: &str, menu| Plate { name: name.to_owned(), level: 1, prestige: 0, menu };
    assert_eq!(room.take_plate_changes(), vec![(first, plate("", false)), (second, plate("", false))]);
    assert_eq!(room.take_plate_changes(), vec![], "a plate goes once");
    assert!(room.name_player(first, "Wooden_Osprey"));
    // A name no username could be names no one.
    assert!(!room.name_player(second, "Two words"));
    assert!(!room.name_player(second, "A_name_longer_than_twenty"));
    room.input(second, Input { menu: true, ..input(1, WALK) }).unwrap();
    assert_eq!(room.take_plate_changes(), vec![(first, plate("Wooden_Osprey", false)), (second, plate("", true))]);
    assert_eq!(
        room.plates().collect::<Vec<_>>(),
        vec![(first, plate("Wooden_Osprey", false)), (second, plate("", true))]
    );
    room.input(second, input(2, WALK)).unwrap();
    assert_eq!(room.take_plate_changes(), vec![(second, plate("", false))], "a menu closed shows at once");
    room.players.get_mut(&first).unwrap().character.xp = 190_000;
    let raised = room.take_plate_changes();
    assert_eq!(raised.iter().map(|(player, plate)| (*player, plate.level)).collect::<Vec<_>>(), vec![(first, 20)]);
    room.announce_plates();
    assert_eq!(room.take_plate_changes().len(), 2, "a boarder is sent every plate once more");
}
