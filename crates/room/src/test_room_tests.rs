//! A test room's rules, and that nothing of them reaches any other room: the test character joins it, its blows weigh
//! TEST_HARM times, its health never falls below 1, and its gate shuts to no one.

use super::breach_perks_tests::room_wearing;
use super::verbs_tests::{SWING, blow};
use crate::encounters::encounters_tests::hardy;
use crate::test_room::TEST_HARM;
use crate::{PlayerId, Room};
use gear::Kind;
use gear::breach::Tier;

/// A Breach's run at a tier with `count` hardy players.
fn run(tier: Tier, count: usize) -> (Room, Vec<PlayerId>) {
    let mut room = Room::breach_run(tier, 29_000_000).expect("the run opens");
    let players = (0..count).map(|_| hardy(&mut room)).collect();
    (room, players)
}

#[test]
fn every_player_joining_a_test_room_plays_the_test_character_and_elsewhere_a_new_one() {
    let (mut room, _) = run(Tier::Hard, 0);
    room.make_test();
    let tester = room.join().expect("in");
    assert_eq!(room.players[&tester].character.level(), 30);
    assert_eq!(room.players[&tester].character.prestige(), 120);
    assert_ne!(room.players[&tester].trims, [combat::Trim::PLAIN; 2], "its perks trim its fight from the first blow");
    let (mut room, _) = run(Tier::Hard, 0);
    let player = room.join().expect("in");
    assert_eq!(room.players[&player].character.level(), 1);
}

#[test]
fn a_testers_blows_weigh_ten_times_in_a_test_room_alone() {
    let (mut room, player, [_, foe]) = room_wearing(Kind::Sword, "vein_strike");
    let plain = room.empower(blow(player, SWING), foe).damage;
    room.make_test();
    let tested = room.empower(blow(player, SWING), foe).damage;
    assert!((tested / plain - TEST_HARM).abs() < 1e-9, "{tested} against {plain}");
}

#[test]
fn a_tester_never_falls_in_a_test_room_and_anyone_falls_elsewhere() {
    let fallen = |test: bool| {
        let (mut room, players) = run(Tier::Hard, 1);
        if test {
            room.make_test();
        }
        room.harm_share(players[0], 4.0, 0);
        room.players[&players[0]].fighter
    };
    let tester = fallen(true);
    assert!(!tester.dead() && (tester.health - 1.0).abs() < 1e-9, "held at 1: {}", tester.health);
    assert!(fallen(false).dead());
}

#[test]
fn a_test_rooms_gate_shuts_to_no_one_and_every_other_rooms_as_it_did() {
    let (mut room, _) = run(Tier::Hard, 0);
    let starting = gear::Character::starting();
    assert!(room.shut(&starting).is_some(), "a new character is shut out of a Hard Breach");
    room.make_test();
    assert_eq!(room.shut(&starting), None);
}
