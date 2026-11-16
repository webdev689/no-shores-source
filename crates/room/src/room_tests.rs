use super::*;

const WALK: Controls =
    Controls { forward: 1.0, sideways: 0.0, yaw: 0.3, run: false, jump: false, crouch: false, mounted: false };

/// An input with these controls and no look.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, controls, ..Input::default() }
}

fn room() -> Room {
    Room::new(vec![Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 2.3 }], (0.0, 2.0))
}

fn seen(room: &Room, player: PlayerId) -> Seen {
    room.seen().find(|each| each.player == player).unwrap()
}

#[test]
fn players_join_with_numbers_of_their_own_standing_at_the_spawn_and_leave() {
    let mut room = room();
    let (first, second) = (room.join(), room.join());
    assert_ne!(first, second);
    assert_eq!(seen(&room, first).body, standing(0.0, 2.0));
    room.leave(first);
    assert_eq!(room.seen().map(|each| each.player).collect::<Vec<_>>(), vec![second]);
    assert_eq!(room.input(first, input(1, WALK)), Err(Refused::NoSuchPlayer));
}

#[test]
fn each_input_steps_the_body_once_as_the_movement_rules_do_and_is_acknowledged() {
    let mut room = room();
    let player = room.join();
    let mut expected = standing(0.0, 2.0);
    for sequence in 1..=40 {
        let controls = Controls { jump: sequence == 20, ..WALK };
        room.input(player, input(sequence, controls)).unwrap();
        room.tick();
        expected = step_body(&expected, &controls, &room.blocks, &Floor::Flat, TICK_SECONDS);
        assert_eq!(
            seen(&room, player),
            Seen {
                player,
                body: expected,
                standing: Standing::Inside,
                shown: Shown::default(),
                acknowledged: sequence
            }
        );
    }
}

#[test]
fn inputs_out_of_order_are_refused() {
    let mut room = room();
    let player = room.join();
    room.input(player, input(1, WALK)).unwrap();
    assert_eq!(room.input(player, input(3, WALK)), Err(Refused::OutOfOrder { expected: 2, got: 3 }));
    assert_eq!(room.input(player, input(1, WALK)), Err(Refused::OutOfOrder { expected: 2, got: 1 }));
    assert_eq!(room.input(player, input(2, WALK)), Ok(()));
}

#[test]
fn no_player_moves_faster_than_the_rooms_clock() {
    let mut room = room();
    let player = room.join();
    for sequence in 1..=20 {
        room.input(player, input(sequence, WALK)).unwrap();
    }
    room.tick();
    assert_eq!(u64::from(seen(&room, player).acknowledged), STEPS_A_TICK);
    for _ in 0..13 {
        room.tick();
    }
    assert_eq!(seen(&room, player).acknowledged, 20);
}

#[test]
fn a_player_who_waits_banks_no_more_than_a_second_and_spends_it_at_twice_real_time() {
    let mut room = room();
    let player = room.join();
    for _ in 0..600 {
        room.tick();
    }
    let mut sent = 0;
    for _ in 0..100 {
        while room.input(player, input(sent + 1, WALK)).is_ok() {
            sent += 1;
        }
        let before = seen(&room, player).acknowledged;
        room.tick();
        assert!(u64::from(seen(&room, player).acknowledged - before) <= STEPS_A_TICK);
    }
    let stepped = u64::from(seen(&room, player).acknowledged);
    assert!(stepped <= 100 + BANK_TICKS + SLACK_TICKS, "{stepped} steps in 100 ticks after waiting 600");
}

#[test]
fn an_input_dropped_past_the_waiting_limit_leaves_the_next_in_order() {
    let mut room = room();
    let player = room.join();
    let limit = u32::try_from(WAITING_LIMIT).unwrap();
    for sequence in 1..=limit {
        room.input(player, input(sequence, WALK)).unwrap();
    }
    assert_eq!(room.input(player, input(limit + 1, WALK)), Err(Refused::TooManyWaiting));
    room.tick();
    assert_eq!(room.input(player, input(limit + 2, WALK)), Ok(()));
}

#[test]
fn inputs_past_the_waiting_limit_are_refused() {
    let mut room = room();
    let player = room.join();
    let limit = u32::try_from(WAITING_LIMIT).unwrap();
    for sequence in 1..=limit {
        room.input(player, input(sequence, WALK)).unwrap();
    }
    assert_eq!(room.input(player, input(limit + 1, WALK)), Err(Refused::TooManyWaiting));
}

#[test]
fn a_player_who_sends_nothing_stays_where_they_were_while_the_clock_runs() {
    let mut room = room();
    let (idle, walker) = (room.join(), room.join());
    room.input(walker, input(1, WALK)).unwrap();
    for _ in 0..10 {
        room.tick();
    }
    assert_eq!(room.clock(), 10);
    assert_eq!(seen(&room, idle).body, standing(0.0, 2.0));
    assert_ne!(seen(&room, walker).body, standing(0.0, 2.0));
}

#[test]
fn what_a_figure_shows_is_seen_with_the_tick_that_takes_its_input() {
    let mut room = room();
    let player = room.join();
    let shown = Shown { anim: "attack_sword".to_owned(), frame: 2, facing: 1.25 };
    room.input(player, Input { shown: shown.clone(), ..input(1, WALK) }).unwrap();
    assert_eq!(seen(&room, player).shown, Shown::default());
    room.tick();
    assert_eq!(seen(&room, player).shown, shown);
}

#[test]
fn a_dress_is_passed_on_once_each_time_it_changes_and_to_everyone_who_joins_later() {
    let mut room = room();
    let (first, second) = (room.join(), room.join());
    let dressed = |sequence, dress: &str| Input { dress: Some(dress.to_owned()), ..input(sequence, WALK) };
    room.input(first, dressed(1, "red")).unwrap();
    room.input(first, dressed(2, "red")).unwrap();
    assert_eq!(room.take_dress_changes(), vec![(first, "red".to_owned())]);
    assert_eq!(room.take_dress_changes(), vec![]);
    room.input(first, dressed(3, "blue")).unwrap();
    assert_eq!(room.take_dress_changes(), vec![(first, "blue".to_owned())]);
    assert_eq!(room.dresses().collect::<Vec<_>>(), vec![(first, "blue")]);
    assert!(room.dresses().all(|(player, _)| player != second));
}

#[test]
fn a_move_name_that_is_not_one_and_a_look_past_its_limit_are_refused() {
    let mut room = room();
    let player = room.join();
    let showing = |anim: &str| Input { shown: Shown { anim: anim.to_owned(), ..Shown::default() }, ..input(1, WALK) };
    assert_eq!(room.input(player, showing("Walk")), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing("walk; drop")), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing(&"a".repeat(MOVE_LIMIT + 1))), Err(Refused::BadLook));
    let huge = Input { dress: Some("x".repeat(DRESS_LIMIT + 1)), ..input(1, WALK) };
    assert_eq!(room.input(player, huge), Err(Refused::BadLook));
    assert_eq!(room.input(player, showing("crouch_walk")), Ok(()));
}
