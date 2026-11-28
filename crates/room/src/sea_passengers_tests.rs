//! A player travelling aboard a company member's ship: let in with no ship of their own, boarding only their company's
//! ship at sea, setting no course, and let off as its captain leaves.

use super::*;
use crate::sea::{CourseRefused, HelmRefused};

/// One square continent, 100 km a side, its north-west corner 100 km from the frame's.
fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[])
}

/// A player of `account`, named `name`, whose ship has put to sea off the continent's west coast.
fn sailing(sea: &mut Sea, account: &str, name: &str) -> PlayerId {
    let player = sea.join();
    assert!(sea.own(player, account) && sea.name_player(player, name));
    sea.course_anywhere(player, &[[90_000.0, 150_000.0]], 10).unwrap();
    sea.tick();
    player
}

#[test]
fn a_player_boards_their_company_members_ship_takes_no_helm_and_is_let_off_as_its_captain_leaves() {
    let mut sea = sea();
    let ann = sailing(&mut sea, "ann", "Ann");
    let bea = sea.join();
    assert_eq!(sea.go_aboard(bea, "Ann", &["ann", "bea"]), Err(AboardRefused::NotAsked), "not asked as she joined");
    assert!(sea.ask_aboard(bea) && sea.own(bea, "bea") && sea.name_player(bea, "Bea"));
    assert_eq!(sea.go_aboard(bea, "Ann", &["bea"]), Err(AboardRefused::NoCaptain), "Ann is not of her company");
    assert_eq!(sea.go_aboard(bea, "Cal", &["ann", "bea"]), Err(AboardRefused::NoCaptain), "no one so named sails here");
    assert_eq!(sea.go_aboard(bea, "Ann", &["ann", "bea"]), Ok(ann));
    assert_eq!(sea.passengers().collect::<Vec<_>>(), [(bea, ann)]);
    let course = sea.course_anywhere(bea, &[[80_000.0, 150_000.0]], 10);
    assert_eq!(course, Err(CourseRefused::OffTheHelm), "the helm is her captain's");
    assert_eq!(sea.leave_helm(bea), Err(HelmRefused::NotAtSea));
    sea.tick();
    assert!(sea.ships().all(|(each, _)| each != bea), "no ship of her own at sea");
    assert!(!sea.ask_aboard(ann), "one whose ship is at sea sails it");
    let cal = sea.join();
    assert!(sea.ask_aboard(cal) && sea.own(cal, "cal") && sea.name_player(cal, "Cal"));
    assert_eq!(sea.go_aboard(cal, "Bea", &["bea", "cal"]), Err(AboardRefused::NoCaptain), "no ship under a passenger");
    sea.take_told();
    sea.leave(ann);
    assert_eq!(sea.captain_of(bea), None);
    assert!(sea.take_told().iter().any(|(each, told)| *each == bea && told.first() == Some(&LET_OFF)), "told");
}

#[test]
fn the_gate_takes_one_who_travels_aboard_with_no_ship_and_leaves_their_own_where_it_lies() {
    let mut sea = sea();
    let shipless = gear::Character::starting();
    let ann = sea.join();
    assert!(sea.shut_to(ann, &shipless).is_some(), "no ship, no sea");
    assert!(sea.ask_aboard(ann) && sea.own(ann, "ann"));
    assert_eq!(sea.shut_to(ann, &shipless), None, "aboard another's ship");
    let mut kept = gear::Character::starting();
    assert!(kept.give_first_ship());
    kept.ship_at = Some([90_000, 150_000]);
    assert!(sea.restore_character(ann, &kept.to_json()));
    sea.tick();
    assert!(sea.ships().all(|(each, _)| each != ann), "her own ship stays where it lies");
}

#[test]
fn a_passenger_let_off_sets_no_course_and_puts_no_ship_of_theirs_to_sea() {
    let mut sea = sea();
    let ann = sailing(&mut sea, "ann", "Ann");
    let bea = sea.join();
    assert!(sea.ask_aboard(bea) && sea.own(bea, "bea"));
    assert_eq!(sea.go_aboard(bea, "Ann", &["ann", "bea"]), Ok(ann));
    sea.leave(ann);
    sea.tick();
    let course = sea.course_anywhere(bea, &[[80_000.0, 150_000.0]], 10);
    assert_eq!(course, Err(CourseRefused::OffTheHelm), "let off, she still sails no ship of her own here");
    sea.tick();
    assert!(sea.ships().all(|(each, _)| each != bea), "no ship of hers put to sea");
}
