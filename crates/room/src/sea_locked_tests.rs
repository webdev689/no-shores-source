//! Locked seas: the sea of an island with no name yet is never sailed or travelled into, and a port in one is no port
//! a ship washes up or puts in at.
use super::*;
use crate::sea::travel::TravelRefused;
use std::collections::VecDeque;

/// Overlook's island to the west, named, and the fourth island to the east, not yet: their waters meet at x = 300 km.
fn locked_east() -> Sea {
    let text = r#"{ "continents": [
        { "id": "continent-1", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-4", "outline": [[400000, 100000], [500000, 100000], [500000, 200000], [400000, 200000]] }
    ], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    sea.lock_unnamed(world::islands::named);
    sea
}

fn at(sea: &mut Sea, point: [f64; 2]) -> PlayerId {
    let player = sea.join();
    sea.course(player, &[point], 10).unwrap();
    super::sea_tests::ticks(sea, usize::try_from(COURSE_EVERY_TICKS).unwrap());
    player
}

#[test]
fn a_course_into_a_locked_sea_is_refused_and_one_out_of_it_is_not() {
    let mut sea = locked_east();
    let player = at(&mut sea, [250_000.0, 150_000.0]);
    assert_eq!(sea.course(player, &[[350_000.0, 150_000.0]], 10), Err(CourseRefused::Locked));
    super::sea_tests::ticks(&mut sea, usize::try_from(COURSE_EVERY_TICKS).unwrap());
    assert_eq!(sea.course(player, &[[260_000.0, 150_000.0]], 10), Ok(()), "within its own open sea");
    let opened = Sea::new(
        &world::layout::parse(r#"{ "continents": [], "isles": [] }"#).unwrap(),
        crate::deck::test_deck(),
        7,
        &[],
    );
    assert!(!opened.chart.locked([350_000.0, 150_000.0]), "a sea opened with no names locks nothing");
}

#[test]
fn a_ship_about_to_cross_into_a_locked_sea_stops_at_its_edge() {
    let mut sea = locked_east();
    let player = at(&mut sea, [295_000.0, 150_000.0]);
    let sailing = sea.berths.get_mut(&player).unwrap().sailing.as_mut().unwrap();
    // A course the room would never take, as if held from before the sea was locked.
    sailing.course = VecDeque::from([[350_000.0, 150_000.0]]);
    sailing.ship.pace = 20;
    super::sea_tests::ticks(&mut sea, 60 * 60);
    let ship = super::sea_tests::ship(&sea, player);
    assert!(
        ship.x > 295_000.0 && !sea.chart.locked([ship.x, ship.y]),
        "sailed up to its edge and no further: {}",
        ship.x
    );
    assert_eq!(ship.pace, 0, "at rest");
}

#[test]
fn a_travel_into_a_locked_sea_is_refused() {
    let mut sea = locked_east();
    let player = at(&mut sea, [250_000.0, 150_000.0]);
    let refused = sea.travel(player, &[[350_000.0, 150_000.0]], 10);
    assert_eq!(refused, Err(TravelRefused::Course(CourseRefused::Locked)));
    assert_eq!(TravelRefused::Course(CourseRefused::Locked).number(), 8.0, "the page's words for it");
}

#[test]
fn a_ship_kept_in_a_locked_sea_comes_back_at_overlooks_roadstead_and_none_washes_up_at_a_locked_port() {
    let (layout, ports) = crate::measure_tests::world();
    let mut sea = Sea::new(&layout, crate::deck::test_deck(), 7, &ports);
    sea.lock_unnamed(world::islands::named);
    let harbours = &sea.harbour.harbours;
    let sunspire = harbours.ports.iter().find(|(id, _)| id == "sunspire").map(|(_, at)| *at).unwrap();
    let overlook = harbours.starting().unwrap();
    assert!(sea.chart.locked(sunspire), "Sunspire's sea is locked");
    let nearest = harbours.nearest([sunspire[0] + 2_000.0, sunspire[1]]).map(|port| harbours.ports[port].0.clone());
    assert_eq!(nearest.as_deref(), Some("overlook"), "washed up at the nearest open port");
    assert!(!harbours.in_reach(sunspire), "nor repaired by a locked one");
    let player = sea.join();
    let mut character = gear::Character::starting();
    assert!(character.give_first_ship());
    character.ship_at = Some([sunspire[0].round() as i64, sunspire[1].round() as i64]);
    assert!(sea.restore_character(player, &character.to_json()));
    let ship = super::sea_tests::ship(&sea, player);
    assert_eq!([ship.x, ship.y], overlook, "moored at Overlook's roadstead");
}
