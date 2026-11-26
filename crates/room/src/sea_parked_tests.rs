//! A ship left lying parked as its player leaves the sea at rest: kept by its account, seen only while a place's room
//! names that account ashore at the island it lies at, let go once no room names it, and its player's again as they
//! come back to the sea.

use super::tests::{sea, ticks};
use super::*;
use crate::sea::parked::{Ashore, NAMED_TICKS};

/// 20 km west of the tests' square continent's west coast, and 80 km west of it.
const OFF_COAST: [f64; 2] = [80_000.0, 150_000.0];
const FAR_OUT: [f64; 2] = [20_000.0, 150_000.0];

/// A player of `account` whose ship came to rest at `at`, then left the sea.
fn left_at(sea: &mut Sea, account: &str, at: [f64; 2]) -> PlayerId {
    let player = sea.join();
    assert!(sea.own(player, account));
    sea.course_anywhere(player, &[at], 10).unwrap();
    sea.tick();
    sea.leave(player);
    player
}

fn shown(sea: &Sea) -> Vec<PlayerId> {
    sea.parked().map(|parked| parked.number).collect()
}

fn answered(answer: &[(String, crate::sea::parked::Parked)]) -> Vec<&str> {
    answer.iter().map(|(account, _)| account.as_str()).collect()
}

#[test]
fn a_ship_left_at_rest_lies_parked_seen_only_while_a_room_names_its_account_on_the_island_it_lies_at() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", OFF_COAST);
    assert_eq!(sea.ships().count(), 0, "out of play: no hostile ship or fight heeds it");
    assert!(shown(&sea).is_empty(), "seen by no one before a room names its account");
    let answer = sea.ashore(Ashore::Continent("continent-4"), &["ann"]);
    assert_eq!(answered(&answer), ["ann"], "the island's room is answered with the ships lying at it");
    let (_, parked) = &answer[0];
    assert_eq!((parked.number, parked.ship.x, parked.ship.y, parked.ship.pace), (left, OFF_COAST[0], OFF_COAST[1], 0));
    assert_eq!(shown(&sea), [left], "seen at sea, under its player's number");
    let others = sea.ashore(Ashore::Continent("continent-4"), &["bea"]);
    assert_eq!(answered(&others), ["ann"], "every room at that island is told of it, whoever it names");
}

#[test]
fn a_ship_named_from_another_island_is_not_seen_and_is_let_go_once_no_room_names_it() {
    let mut sea = sea();
    left_at(&mut sea, "ann", FAR_OUT);
    assert!(sea.ashore(Ashore::Continent("continent-4"), &["ann"]).is_empty(), "80 km off its coast");
    assert!(shown(&sea).is_empty());
    ticks(&mut sea, usize::try_from(NAMED_TICKS).unwrap() + 1);
    left_at(&mut sea, "bea", OFF_COAST);
    assert_eq!(sea.parked.by_account.keys().collect::<Vec<_>>(), ["bea"], "named by no room in time, let go");
}

#[test]
fn a_ship_is_seen_while_its_naming_is_renewed_and_no_longer_once_it_stops() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", OFF_COAST);
    sea.ashore(Ashore::Continent("continent-4"), &["ann"]);
    ticks(&mut sea, usize::try_from(NAMED_TICKS).unwrap());
    sea.ashore(Ashore::Continent("continent-4"), &["ann"]);
    ticks(&mut sea, usize::try_from(NAMED_TICKS).unwrap());
    assert_eq!(shown(&sea), [left], "renewed in time");
    sea.tick();
    assert!(shown(&sea).is_empty(), "logged off or gone elsewhere, its naming lapsed");
    assert!(sea.ashore(Ashore::Continent("continent-4"), &["ann"]).is_empty(), "and let go");
}

#[test]
fn a_run_started_at_sea_keeps_a_ship_seen_wherever_it_lies_and_is_told_of_none() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", FAR_OUT);
    assert!(sea.ashore(Ashore::Anywhere, &["ann"]).is_empty(), "a run lies at no island");
    assert_eq!(shown(&sea), [left]);
}

#[test]
fn a_ship_under_way_or_fighting_as_its_player_leaves_is_not_parked() {
    let mut sea = sea();
    let player = sea.join();
    assert!(sea.own(player, "ann"));
    sea.course_anywhere(player, &[OFF_COAST, [OFF_COAST[0], OFF_COAST[1] + 5_000.0]], 10).unwrap();
    sea.tick();
    sea.leave(player);
    let (mut fought, fighting) = super::tests::met(700.0, naval::ranks::Rank::Minor);
    assert!(fought.own(fighting, "bea"));
    fought.leave(fighting);
    for sea in [&mut sea, &mut fought] {
        assert!(sea.ashore(Ashore::Anywhere, &["ann", "bea"]).is_empty());
        assert!(shown(sea).is_empty());
    }
}

#[test]
fn a_player_back_at_sea_has_their_ship_again_and_it_lies_parked_no_more() {
    let mut sea = sea();
    left_at(&mut sea, "ann", OFF_COAST);
    sea.ashore(Ashore::Continent("continent-4"), &["ann"]);
    let back = sea.join();
    assert!(sea.own(back, "ann"));
    assert!(shown(&sea).is_empty());
    assert!(sea.ashore(Ashore::Continent("continent-4"), &["ann"]).is_empty());
}

#[test]
fn a_sea_islands_room_holds_it_and_is_answered_with_the_ships_lying_off_it() {
    let text = r#"{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let player = sea.join();
    assert!(sea.own(player, "ann"));
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    ticks(&mut sea, 60 * 60 * 3);
    let island = sea.islands().standing().next().expect("an island rolled near the ship");
    let (id, seed) = (island.id, island.seed);
    sea.leave(player);
    let answer = sea.ashore(Ashore::Island { id, seed }, &["ann"]);
    assert_eq!(answer.iter().map(|(_, parked)| parked.number).collect::<Vec<_>>(), [player]);
    assert!(sea.ashore(Ashore::Island { id, seed: seed ^ 1 }, &["ann"]).is_empty(), "an island by its seed alone");
    ticks(&mut sea, usize::try_from(crate::sea::islands::FADE_TICKS).unwrap() + 1);
    assert!(sea.islands().by_id(id).is_some(), "held by its room's naming while players stand ashore");
}
