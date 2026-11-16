use super::*;

const WALK: Controls =
    Controls { forward: 1.0, sideways: 0.0, yaw: 0.3, run: false, jump: false, crouch: false, mounted: false };

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
    assert_eq!(room.input(first, 1, WALK), Err(Refused::NoSuchPlayer));
}

#[test]
fn each_input_steps_the_body_once_as_the_movement_rules_do_and_is_acknowledged() {
    let mut room = room();
    let player = room.join();
    let mut expected = standing(0.0, 2.0);
    for sequence in 1..=40 {
        let controls = Controls { jump: sequence == 20, ..WALK };
        room.input(player, sequence, controls).unwrap();
        room.tick();
        expected = step_body(&expected, &controls, &room.blocks, TICK_SECONDS);
        assert_eq!(seen(&room, player), Seen { player, body: expected, acknowledged: sequence });
    }
}

#[test]
fn inputs_out_of_order_are_refused() {
    let mut room = room();
    let player = room.join();
    room.input(player, 1, WALK).unwrap();
    assert_eq!(room.input(player, 3, WALK), Err(Refused::OutOfOrder { expected: 2, got: 3 }));
    assert_eq!(room.input(player, 1, WALK), Err(Refused::OutOfOrder { expected: 2, got: 1 }));
    assert_eq!(room.input(player, 2, WALK), Ok(()));
}

#[test]
fn no_player_moves_faster_than_the_rooms_clock() {
    let mut room = room();
    let player = room.join();
    for sequence in 1..=20 {
        room.input(player, sequence, WALK).unwrap();
    }
    room.tick();
    assert_eq!(u64::from(seen(&room, player).acknowledged), 1 + SLACK_TICKS);
    for _ in 0..13 {
        room.tick();
    }
    assert_eq!(seen(&room, player).acknowledged, 20);
}

#[test]
fn inputs_past_the_waiting_limit_are_refused() {
    let mut room = room();
    let player = room.join();
    let limit = u32::try_from(WAITING_LIMIT).unwrap();
    for sequence in 1..=limit {
        room.input(player, sequence, WALK).unwrap();
    }
    assert_eq!(room.input(player, limit + 1, WALK), Err(Refused::TooManyWaiting));
}

#[test]
fn a_player_who_sends_nothing_stays_where_they_were_while_the_clock_runs() {
    let mut room = room();
    let (idle, walker) = (room.join(), room.join());
    room.input(walker, 1, WALK).unwrap();
    for _ in 0..10 {
        room.tick();
    }
    assert_eq!(room.clock(), 10);
    assert_eq!(seen(&room, idle).body, standing(0.0, 2.0));
    assert_ne!(seen(&room, walker).body, standing(0.0, 2.0));
}
