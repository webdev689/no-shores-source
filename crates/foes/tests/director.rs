//! The combat director: its heat rises as the players deal damage and kill, falls faster as they take it, eases back
//! to rest, and stays between 0 and 1; each band of heat sets its turn caps; a holder keeps its turn when the caps
//! drop; the bias leaves a fight at rest as it was and presses a hot one; the same events give the same heat.

mod common;

use common::{Room, still, swinging};
use core::f64::consts::PI;
use foes::director::{DEALT_GAIN, KILL_GAIN, REST};
use foes::tuning::{BEAT, PATIENCE, RING_GAP, SWING_DELAY};
use foes::{Board, Caps, Director, Pressed, Rank};

const PLAYER: u32 = 1;

fn at(heat: f64) -> Director {
    Director { heat }
}

#[test]
fn the_heat_rises_with_damage_dealt_and_kills_and_falls_faster_with_damage_taken() {
    let mut director = Director::default();
    assert_eq!(director.heat, REST, "a room's fight starts at rest");
    director.dealt(20.0);
    assert_eq!(director.heat, REST + 20.0 * DEALT_GAIN);
    director.killed();
    assert_eq!(director.heat, REST + 20.0 * DEALT_GAIN + KILL_GAIN);
    let before = director.heat;
    director.taken(20.0);
    let fell = before - director.heat;
    assert!(fell > 2.5 * 20.0 * DEALT_GAIN, "taking a blow cools the fight faster than dealing one heats it: {fell}");
}

#[test]
fn the_heat_stays_between_nothing_and_full() {
    let mut director = Director::default();
    director.dealt(1e6);
    assert_eq!(director.heat, 1.0);
    for _ in 0..40 {
        director.killed();
    }
    assert_eq!(director.heat, 1.0);
    director.taken(1e6);
    assert_eq!(director.heat, 0.0);
}

#[test]
fn the_heat_eases_back_to_rest_with_a_six_second_time_constant() {
    for start in [1.0, 0.0] {
        let mut director = at(start);
        for _ in 0..360 {
            director.step();
        }
        let expected = REST + (start - REST) * libm::exp(-1.0);
        assert!((director.heat - expected).abs() < 1e-12, "after 6 s, a share of 1/e is left: {}", director.heat);
        for _ in 0..360 * 10 {
            director.step();
        }
        assert!((director.heat - REST).abs() < 1e-4, "and it settles at rest: {}", director.heat);
    }
    let mut resting = Director::default();
    resting.step();
    assert_eq!(resting.heat, REST, "at rest it stays");
}

#[test]
fn each_band_of_heat_sets_its_turn_caps() {
    let caps = |heat| {
        let Caps { melee, ranged } = at(heat).caps();
        (melee, ranged)
    };
    assert_eq!(caps(0.0), (1, 1), "cold: room to breathe");
    assert_eq!(caps(0.2499), (1, 1));
    assert_eq!(caps(0.25), (2, 2), "mid: the caps of a fight at rest");
    assert_eq!(caps(REST), (2, 2));
    assert_eq!(caps(0.5999), (2, 2));
    assert_eq!(caps(0.6), (3, 2), "hot: a third foe hand to hand");
    assert_eq!(caps(0.8499), (3, 2));
    assert_eq!(caps(0.85), (3, 3), "hottest: and a third shooter");
    assert_eq!(caps(1.0), (3, 3));
}

#[test]
fn a_holder_keeps_its_turn_when_the_caps_drop_until_it_hands_it_on() {
    let (hot, cold) = (at(0.7).caps(), at(0.0).caps());
    let patience = 360;
    let mut board = Board::default();
    for (foe, since) in [(1, 0), (2, 0), (3, 0), (4, 5)] {
        board.join(9, foe, false, since);
    }
    for foe in [1, 2, 3] {
        assert!(board.take(9, foe, false, 10, patience, hot), "three at once in a hot fight");
    }
    assert!(!board.take(9, 4, false, 10, patience, hot));
    for foe in [1, 2, 3] {
        assert!(board.take(9, foe, false, 20, patience, cold), "the fight cools: holders keep their turns");
        assert!(board.holds(9, foe, false));
    }
    assert!(!board.take(9, 4, false, 20, patience, cold), "and no one new goes in");
    board.hand_on(9, 1, 30);
    board.hand_on(9, 2, 30);
    assert_eq!(board.tokens_out(9), (1, 0));
    assert!(!board.take(9, 4, false, 31, patience, cold), "one out already fills a cold fight's one");
    board.hand_on(9, 3, 40);
    assert!(board.take(9, 4, false, 41, patience, cold), "the last handed on, the longest waiter goes in");
}

#[test]
fn the_bias_leaves_a_fight_at_rest_as_tuned_and_presses_a_hot_one_by_at_most_three_tenths() {
    let tuned = Pressed { patience: PATIENCE, swing_delay: SWING_DELAY, ring_gap: RING_GAP, beat: BEAT };
    for heat in [0.0, 0.25, REST, 0.6] {
        assert_eq!(at(heat).bias(), 0.0);
        assert_eq!(at(heat).pressed(), tuned, "exactly today's numbers at heat {heat}");
    }
    assert_eq!(at(1.0).bias(), 0.3);
    let mut last = tuned;
    for heat in [0.7, 0.85, 1.0] {
        let pressed = at(heat).pressed();
        assert!(pressed.patience < last.patience && pressed.ring_gap < last.ring_gap && pressed.beat < last.beat);
        assert!(pressed.swing_delay.0 < last.swing_delay.0 && pressed.swing_delay.1 < last.swing_delay.1);
        last = pressed;
    }
    let share = |pressed: f64, tuned: f64| pressed / tuned;
    for (pressed, tuned) in [
        (last.patience, PATIENCE),
        (last.swing_delay.0, SWING_DELAY.0),
        (last.swing_delay.1, SWING_DELAY.1),
        (last.ring_gap, RING_GAP),
        (last.beat, BEAT),
    ] {
        assert!((share(pressed, tuned) - 0.7).abs() < 1e-12, "full heat takes off three tenths: {pressed} of {tuned}");
    }
}

/// The heat after a minute of a fight's events, a tick at a time.
fn heat_after(dealt_every: u64) -> u64 {
    let mut director = Director::default();
    for tick in 0..3600_u64 {
        if tick.is_multiple_of(dealt_every) {
            director.dealt(18.0 + (tick % 5) as f64);
        }
        if tick.is_multiple_of(90) {
            director.taken(12.0);
        }
        if tick.is_multiple_of(140) {
            director.killed();
        }
        director.step();
    }
    director.heat.to_bits()
}

#[test]
fn the_same_events_give_the_same_heat_to_the_bit() {
    assert_eq!(heat_after(37), heat_after(37));
    assert_ne!(heat_after(37), heat_after(38));
}

/// Six swordsmen on a player who stands still, at a heat held: the mean distance of the foes waiting their turn.
fn waiting_distance(heat: f64) -> f64 {
    let mut room = Room::new(9).player(PLAYER, 0.0, 0.0, 0.0);
    room.director = at(heat);
    for index in 0..6_u32 {
        let bearing = (f64::from(index) * 20.0 - 50.0).to_radians();
        room = room.foe(10 + index, 14, Rank::Major, 7.0 * libm::sin(bearing), -7.0 * libm::cos(bearing), PI);
    }
    let (mut total, mut count) = (0.0, 0.0);
    for tick in 0..600 {
        room.step(&mut still(0.0));
        if tick < 240 {
            continue;
        }
        for id in 10..16 {
            if !room.board.holds(PLAYER, id, false) && !swinging(&room.fighter(id)) {
                total += room.distance(PLAYER, id);
                count += 1.0;
            }
        }
    }
    total / count
}

#[test]
fn in_a_hot_fight_the_waiting_foes_stand_closer() {
    let (resting, hot) = (waiting_distance(REST), waiting_distance(1.0));
    assert!(hot < resting - 0.2, "the ring is pulled in: {hot} against {resting}");
}
