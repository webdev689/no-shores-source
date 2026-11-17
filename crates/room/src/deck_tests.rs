use super::*;
use movement::Terrain;

/// Forward at a walk, toward her bow (north in her frame).
const FORWARD: Controls =
    Controls { forward: 1.0, sideways: 0.0, yaw: 0.0, run: false, jump: false, crouch: false, mounted: false };

#[test]
fn a_player_leaving_the_helm_stands_behind_the_wheel_on_the_deck_facing_her_bow() {
    let deck = test_deck();
    let aboard = Aboard::left_helm(&deck, 10);
    assert_eq!((aboard.body.x, aboard.body.y), (0.0, 2.7));
    assert!((aboard.body.z - 0.8).abs() < 1e-9, "on her planks, over her waterline");
    assert_eq!(aboard.body.facing, 0.0);
    assert!(aboard.at_wheel(&deck));
}

#[test]
fn steps_are_taken_in_order_and_walk_her_deck() {
    let deck = test_deck();
    let mut aboard = Aboard::left_helm(&deck, 0);
    assert_eq!(aboard.walk(2, FORWARD), Err(WalkRefused::OutOfOrder { expected: 1, got: 2 }));
    for (clock, sequence) in (1..=30).zip(1..) {
        assert_eq!(aboard.walk(sequence, FORWARD), Ok(()));
        aboard.tick(&deck, clock);
    }
    assert_eq!(aboard.acknowledged, 30);
    assert!(aboard.body.y < 2.7 - 1.5, "half a second's walk toward her bow: {}", aboard.body.y);
    assert!(!aboard.at_wheel(&deck), "and away from the wheel");
}

#[test]
fn steps_come_no_faster_than_the_clock_and_its_slack_so_time_away_is_never_banked() {
    let deck = test_deck();
    let mut aboard = Aboard::left_helm(&deck, 100);
    // Two seconds standing at the wheel sending nothing, a tick at a time, then a flood of steps.
    for clock in 101..=220 {
        aboard.tick(&deck, clock);
    }
    let still = aboard.body;
    for sequence in 1..=29 {
        aboard.walk(sequence, FORWARD).unwrap();
    }
    for clock in 221..=230 {
        aboard.tick(&deck, clock);
    }
    // Stood out to the slack behind the clock while away, then up to the slack ahead of it: never the whole flood.
    let taken = u64::from(aboard.acknowledged);
    assert!(taken <= 10 + 2 * SLACK_TICKS, "ten ticks on, the ten and their slack either way: {taken}");
    assert!(taken >= 10, "every tick takes one");
    assert!(aboard.body.y < still.y, "and the steps walk her deck");
    let mut flooded = Aboard::left_helm(&deck, 100);
    for sequence in 1..=29 {
        flooded.walk(sequence, FORWARD).unwrap();
    }
    for clock in 101..=103 {
        flooded.tick(&deck, clock);
    }
    assert_eq!(u64::from(flooded.acknowledged), 3 + SLACK_TICKS, "three ticks in, the ticks and their slack");
}

#[test]
fn a_walk_never_leaves_her_deck_nor_passes_her_mast() {
    let deck = test_deck();
    let mut aboard = Aboard::left_helm(&deck, 0);
    // East for four seconds: far past her side.
    let east = Controls { yaw: std::f64::consts::FRAC_PI_2, ..FORWARD };
    for (clock, sequence) in (1..=240).zip(1..) {
        aboard.walk(sequence, east).unwrap();
        aboard.tick(&deck, clock);
    }
    assert!(aboard.body.x < 1.0 && deck.heights.stands_at(aboard.body.x, aboard.body.y), "{}", aboard.body.x);
    assert!((aboard.body.z - deck.heights.height_at(aboard.body.x, aboard.body.y)).abs() < 0.01);
    // From her centre line abaft the mast, forward into it.
    let mut aboard = Aboard { body: deck.heights.standing(0.05, 1.0), ..Aboard::left_helm(&deck, 0) };
    for (clock, sequence) in (1..=120).zip(1..) {
        aboard.walk(sequence, FORWARD).unwrap();
        aboard.tick(&deck, clock);
    }
    assert!(aboard.body.y > 0.0, "stopped short of the mast amidships: {}", aboard.body.y);
}

#[test]
fn controls_that_are_not_numbers_or_ask_past_a_whole_pace_are_refused() {
    let mut aboard = Aboard::left_helm(&test_deck(), 0);
    assert_eq!(aboard.walk(1, Controls { forward: 2.0, ..FORWARD }), Err(WalkRefused::BadControls));
    assert_eq!(aboard.walk(1, Controls { yaw: f64::NAN, ..FORWARD }), Err(WalkRefused::BadControls));
    assert_eq!(aboard.walk(1, Controls { mounted: true, ..FORWARD }), Ok(()), "taken, on foot: a deck is no saddle");
}

#[test]
fn the_wheel_is_judged_where_the_steps_waiting_leave_the_body() {
    let deck = test_deck();
    let mut aboard = Aboard::left_helm(&deck, 100);
    let aft = Controls { yaw: std::f64::consts::PI, ..FORWARD };
    for (sequence, clock) in (1..=30).zip(101..) {
        aboard.walk(sequence, FORWARD).unwrap();
        aboard.tick(&deck, clock);
    }
    assert!(!aboard.at_wheel(&deck), "a pace forward of her wheel");
    for sequence in 31..=60 {
        aboard.walk(sequence, aft).unwrap();
    }
    assert!(aboard.at_wheel(&deck), "the steps back to it are waiting, not yet taken");
}
