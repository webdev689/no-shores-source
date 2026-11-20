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
    room.input(first, dressed(1, "red")).unwrap();
    room.input(first, dressed(2, "red")).unwrap();
    room.tick();
    assert_eq!(room.take_dress_changes(), vec![(first, "red".to_owned())]);
    assert_eq!(room.take_dress_changes(), vec![]);
    // A change hard on the heels of the last waits its turn, a second after it.
    room.input(first, dressed(3, "blue")).unwrap();
    room.tick();
    assert_eq!(room.take_dress_changes(), vec![]);
    for _ in 0..60 {
        room.tick();
    }
    assert_eq!(room.take_dress_changes(), vec![(first, "blue".to_owned())]);
    assert_eq!(room.dresses().collect::<Vec<_>>(), vec![(first, "blue")]);
    assert!(room.dresses().all(|(player, _)| player != second));
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
