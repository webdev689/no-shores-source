//! The tactics: a lone foe walks to a player and swings in reach; four on one player take turns two at a time while
//! the rest ring it and circle, and the turns pass on after each blow; a foe that waited past its patience goes in; a
//! player who turns their back is open to anyone; a hurt foe backs off; a coward runs.

mod common;

use combat::fighter::Action;
use common::{Room, still, swinging, watching};
use core::f64::consts::PI;
use foes::{Board, Kind};

const PLAYER: u32 = 1;

fn in_a_fight(fighter: &combat::Fighter) -> bool {
    swinging(fighter) || matches!(fighter.action, Action::Telegraph(_))
}

#[test]
fn a_lone_swordsman_walks_to_a_player_and_swings_in_reach() {
    let mut room = Room::new(7).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Swordsman, 0.0, -8.0, PI);
    let mut closest = f64::MAX;
    let mut first_swing = None;
    for _ in 0..300 {
        room.step(&mut still(0.0));
        closest = closest.min(room.distance(PLAYER, 10));
        if first_swing.is_none() && swinging(&room.fighter(10)) {
            first_swing = Some(room.distance(PLAYER, 10));
        }
    }
    assert_eq!(room.brain(10).target(), Some(PLAYER));
    let reach = first_swing.expect("it swung");
    assert!(reach <= 1.8 + 0.35, "it swings only in reach: {reach}");
    assert!(closest < 2.2, "it walked in: {closest}");
    assert!(room.verdicts.iter().any(|(_, by, on, _)| *by == 10 && *on == PLAYER), "and its blows land");
}

fn four_swordsmen(seed: u64) -> Room {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0);
    for (index, degrees) in [-30.0_f64, -10.0, 10.0, 30.0].into_iter().enumerate() {
        let bearing = degrees.to_radians();
        let id = 10 + u32::try_from(index).expect("four foes");
        room = room.foe(id, Kind::Swordsman, 6.0 * libm::sin(bearing), -6.0 * libm::cos(bearing), PI);
    }
    room
}

#[test]
fn of_four_swordsmen_only_two_fight_at_once_and_the_rest_ring_the_player_and_circle() {
    let mut room = four_swordsmen(3);
    let foes = [10, 11, 12, 13];
    let ring = 1.8 + 1.5;
    let mut most = 0;
    // For each foe, the bearing from the player where its present stretch on the ring began.
    let mut stretches: [Option<f64>; 4] = [None; 4];
    let mut circled: f64 = 0.0;
    for tick in 0..480 {
        room.step(&mut still(0.0));
        most = most.max(foes.iter().filter(|id| in_a_fight(&room.fighter(**id))).count());
        for (index, id) in foes.into_iter().enumerate() {
            let on_ring = (room.distance(PLAYER, id) - ring).abs() <= 0.6 && !in_a_fight(&room.fighter(id));
            let bearing = room.toward(PLAYER, id);
            stretches[index] = if on_ring { Some(stretches[index].unwrap_or(bearing)) } else { None };
            circled = circled.max(stretches[index].map_or(0.0, |from| combat::sight::off(from, bearing)));
        }
        if tick == 150 {
            let ringed = foes.iter().filter(|id| (room.distance(PLAYER, **id) - ring).abs() <= 0.6).count();
            assert!(ringed >= 2, "the waiting stand on the ring, 1.5 m outside their reach");
        }
    }
    assert!(most <= 2, "never more than two at once: {most}");
    assert!(circled > 0.15, "and circle it slowly, staying on it: {circled}");
}

#[test]
fn the_turns_pass_on_after_each_blow_so_every_foe_fights_in_time() {
    let mut room = four_swordsmen(4);
    let mut most = 0;
    for _ in 0..900 {
        room.step(&mut still(0.0));
        most = most.max([10, 11, 12, 13].iter().filter(|id| in_a_fight(&room.fighter(**id))).count());
    }
    assert!(most <= 2, "{most}");
    for id in [10, 11, 12, 13] {
        let fought = !room.swings(id).is_empty() || !room.orders(id).is_empty();
        assert!(fought, "foe {id} had its turn");
    }
}

#[test]
fn the_longest_waiter_takes_a_freed_turn_and_a_foe_past_its_patience_goes_in_regardless() {
    let mut board = Board::default();
    let patience = 360;
    for (foe, since) in [(1, 0), (2, 0), (3, 10), (4, 20)] {
        board.join(9, foe, false, since);
    }
    assert!(board.take(9, 1, false, 30, patience) && board.take(9, 2, false, 30, patience));
    assert!(!board.take(9, 4, false, 40, patience), "two at once");
    assert_eq!(board.tokens_out(9), (2, 0));
    board.hand_on(9, 1, 50);
    assert!(!board.take(9, 4, false, 60, patience), "foe 3 has waited longer");
    assert!(!board.take(9, 1, false, 60, patience), "and the one that just struck waits behind everyone");
    assert!(board.take(9, 3, false, 60, patience));
    assert!(!board.take(9, 4, false, 379, patience));
    assert!(board.take(9, 4, false, 380, patience), "six seconds of waiting: in, whatever the count");
    assert_eq!(board.tokens_out(9), (3, 0));
    board.forget(3);
    board.forget(4);
    assert_eq!(board.tokens_out(9), (1, 0), "a foe that died gives its turn up");
}

/// Two swordsmen before a player and a third 3.3 m behind them: the third waits its turn unless the player turns its
/// back on it.
fn third_behind(facing: f64) -> Room {
    Room::new(5)
        .player(PLAYER, 0.0, 0.0, facing)
        .foe(10, Kind::Swordsman, -0.8, -5.0, PI)
        .foe(11, Kind::Swordsman, 0.8, -5.0, PI)
        .foe(12, Kind::Swordsman, 0.0, 3.3, 0.0)
}

#[test]
fn a_player_who_turns_their_back_on_a_waiting_foe_is_open_to_it() {
    let mut turned = third_behind(0.0);
    turned.run(90, &mut still(0.0));
    assert!(!turned.swings(12).is_empty(), "the foe at its back goes in without a turn");
    let mut facing = third_behind(PI);
    facing.run(90, &mut still(PI));
    assert!(facing.swings(12).is_empty(), "faced, it waits its turn");
    assert!(!facing.swings(10).is_empty() || !facing.orders(10).is_empty(), "while the holders fight");
}

#[test]
fn a_foe_that_loses_a_quarter_of_its_health_in_moments_backs_off_to_a_farther_ring() {
    let mut room = Room::new(11).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Swordsman, 0.0, -3.0, PI);
    room.run(60, &mut still(0.0));
    room.set(10, |fighter| fighter.health -= 0.3 * fighter.health_max);
    let swung_before = room.swings(10).len();
    let mut farthest: f64 = 0.0;
    for _ in 0..120 {
        room.step(&mut still(0.0));
        farthest = farthest.max(room.distance(PLAYER, 10));
    }
    assert!(farthest >= 1.8 + 1.5 + 2.0 - 0.6, "out to its farther ring: {farthest}");
    let late_swings = room.swings(10).iter().filter(|tick| **tick > 62).count();
    assert!(room.swings(10).len() - swung_before == late_swings && late_swings == 0, "and it does not swing");
    room.run(600, &mut still(0.0));
    assert!(room.swings(10).iter().any(|tick| *tick > 180), "then it comes back to fight");
}

#[test]
fn a_skirmisher_below_a_fifth_of_its_health_runs_once() {
    let mut room = Room::new(2).player(PLAYER, 0.0, 0.0, 0.0).foe(10, Kind::Skirmisher, 0.0, -2.5, PI);
    room.run(30, &mut watching(10));
    room.set(10, |fighter| fighter.health = 0.15 * fighter.health_max);
    room.run(30, &mut watching(10));
    let near = room.distance(PLAYER, 10);
    room.run(150, &mut watching(10));
    assert!(room.distance(PLAYER, 10) > near + 8.0, "it runs: {near} to {}", room.distance(PLAYER, 10));
    assert!(room.swings(10).iter().all(|tick| *tick < 30), "running, it does not swing");
    room.run(1200, &mut watching(10));
    assert!(room.distance(PLAYER, 10) < 4.0, "its run spent, it comes back and does not run again");
}
