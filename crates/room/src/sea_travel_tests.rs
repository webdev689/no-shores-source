use super::*;
use crate::hostiles::{FIRST_ROLL_S, Hostile};
use crate::sea::{COURSE_EVERY_TICKS, CourseRefused, Ship};
use core::f64::consts::FRAC_PI_2;
use naval::ranks::{Commission, GREY_TITHE, Rank};

/// Two square continents 100 km a side, 400 km apart west to east: the sea west of the line halfway between them is
/// the fourth island's water, the sea east of it the fifth's.
fn sea() -> Sea {
    let text = r#"{ "continents": [
        { "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-5", "outline": [[600000, 100000], [700000, 100000], [700000, 200000], [600000, 200000]] }
    ], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[])
}

fn ticks(sea: &mut Sea, count: u64) {
    for _ in 0..count {
        sea.tick();
    }
}

fn ship(sea: &Sea, player: PlayerId) -> Ship {
    sea.ships().find(|(each, _)| *each == player).map(|(_, ship)| ship).unwrap()
}

/// A player whose ship lies in the fourth island's water, free to set its next course.
fn at_sea(sea: &mut Sea) -> PlayerId {
    let player = sea.join();
    sea.course_anywhere(player, &[[250_000.0, 150_000.0]], 10).unwrap();
    ticks(sea, COURSE_EVERY_TICKS);
    player
}

/// The last travel told to the player: its outcome's number.
fn told(sea: &Sea, player: PlayerId) -> Option<f64> {
    let numbers = sea.harbour.told.iter().rev().find(|(to, numbers)| *to == player && numbers[0] == TRAVELLED);
    numbers.map(|(_, numbers)| numbers[2])
}

#[test]
fn a_travel_puts_the_ship_400_metres_short_of_its_course_end_heading_along_its_last_leg() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    let end = [550_000.0, 300_000.0];
    assert_eq!(sea.travel(player, &[[250_000.0, 300_000.0], end], 20), Ok(()));
    let ship = ship(&sea, player);
    assert_eq!([ship.x, ship.y], [549_600.0, 300_000.0]);
    assert!((ship.heading - FRAC_PI_2).abs() < 1e-12, "heading east: {}", ship.heading);
    assert_eq!(ship.pace, 20);
    assert_eq!(told(&sea, player), Some(0.0), "told it was taken");
    ticks(&mut sea, 200);
    let ship = self::ship(&sea, player);
    assert_eq!(([ship.x, ship.y], ship.pace), (end, 0), "it sails on to the course's end and comes to rest");
}

#[test]
fn a_travel_whose_last_leg_is_shorter_than_400_metres_puts_the_ship_at_the_legs_start() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    assert_eq!(sea.travel(player, &[[549_000.0, 150_000.0], [549_000.0, 149_800.0]], 10), Ok(()));
    let ship = ship(&sea, player);
    assert_eq!([ship.x, ship.y], [549_000.0, 150_000.0]);
    assert!(ship.heading.abs() < 1e-12, "heading north: {}", ship.heading);
}

#[test]
fn a_travel_waits_the_players_next_roll_its_first_wait_and_never_brings_it_sooner() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    ticks(&mut sea, 600);
    let before = sea.hostiles.wait_of(player).unwrap();
    assert!(before < FIRST_ROLL_S, "the roll's wait ran down: {before}");
    sea.travel(player, &[[550_000.0, 150_000.0]], 10).unwrap();
    assert_eq!(sea.hostiles.wait_of(player), Some(FIRST_ROLL_S), "a wait run down waits its first again");
    // Once the roll has come, the next waits half a minute or more, and a travel's wait brings it no sooner (the roll's ship
    // may chase the player, which refuses a travel, so the wait the travel sets is asked of the hostiles alone).
    for _ in 0..120 {
        if sea.hostiles.wait_of(player).unwrap() > FIRST_ROLL_S {
            break;
        }
        ticks(&mut sea, 60);
    }
    let longer = sea.hostiles.wait_of(player).unwrap();
    assert!(longer > FIRST_ROLL_S, "the roll came and the next waits longer: {longer}");
    sea.hostiles.wait_first(player);
    assert_eq!(sea.hostiles.wait_of(player), Some(longer), "travelling again brings it no sooner");
}

#[test]
fn a_travel_within_the_ships_own_water_is_taken() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    assert_eq!(sea.travel(player, &[[250_000.0, 300_000.0]], 10), Ok(()));
    assert_eq!(told(&sea, player), Some(0.0));
    assert_eq!([ship(&sea, player).x, ship(&sea, player).y], [250_000.0, 299_600.0], "400 m short of its end");
    assert_eq!(sea.hostiles.wait_of(player), Some(FIRST_ROLL_S), "its next roll waits as after any travel");
}

#[test]
fn a_travel_off_the_helm_is_refused() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    sea.leave_helm(player).unwrap();
    assert_eq!(sea.travel(player, &[[550_000.0, 150_000.0]], 10), Err(TravelRefused::OffTheHelm));
}

#[test]
fn a_travel_while_a_hostile_ship_chases_the_player_is_refused() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let chaser =
        Hostile { quarry: Some(player), ..Hostile::standing(1, 7, commission, [270_000.0, 150_000.0], 0.0, true) };
    sea.hostiles.sailing.push(chaser);
    assert_eq!(sea.travel(player, &[[550_000.0, 150_000.0]], 10), Err(TravelRefused::Chased));
}

#[test]
fn a_travel_while_fighting_is_refused() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Major };
    sea.hostiles.sailing.push(Hostile::standing(1, 7, commission, [250_000.0, 150_600.0], 0.0, true));
    sea.tick();
    assert!(sea.fights.fighting(player));
    ticks(&mut sea, COURSE_EVERY_TICKS);
    assert_eq!(sea.travel(player, &[[550_000.0, 150_000.0]], 10), Err(TravelRefused::Fighting));
}

#[test]
fn a_travel_is_refused_as_any_course_is() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    let across = sea.travel(player, &[[650_000.0, 250_000.0], [650_000.0, 50_000.0]], 10);
    assert_eq!(across, Err(TravelRefused::Course(CourseRefused::CrossesLand)));
    assert_eq!(told(&sea, player), Some(TravelRefused::Course(CourseRefused::CrossesLand).number()));
    let again = sea.travel(player, &[[550_000.0, 150_000.0]], 10);
    assert_eq!(again, Err(TravelRefused::Course(CourseRefused::TooSoon)), "a travel waits as a course does");
    ticks(&mut sea, COURSE_EVERY_TICKS);
    assert_eq!(sea.travel(player, &[[550_000.0, 150_000.0]], 7), Err(TravelRefused::Course(CourseRefused::BadPace)));
}

/// Home waters to the west, where a traveller lies within their reach; a desert's to the east, where another player's
/// ship has an island rolled round it, out of the traveller's sight: the sea, the traveller, and where the island stands.
fn an_island_out_of_sight() -> (Sea, PlayerId, [f64; 2]) {
    let text = r#"{ "continents": [
        { "id": "continent-1", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-5", "climate": "desert", "outline": [[600000, 100000], [700000, 100000], [700000, 200000], [600000, 200000]] }
    ], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let traveller = sea.join();
    sea.course_anywhere(traveller, &[[205_000.0, 150_000.0]], 10).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS);
    let other = sea.join();
    sea.course_anywhere(other, &[[550_000.0, 40_000.0]], 10).unwrap();
    while sea.islands().standing().next().is_none() {
        assert!(sea.clock() < 60 * 60 * 10, "no island in ten minutes");
        sea.tick();
    }
    let at = sea.islands().standing().next().unwrap().at;
    ticks(&mut sea, COURSE_EVERY_TICKS);
    (sea, traveller, at)
}

#[test]
fn a_travel_whose_last_leg_meets_an_island_never_told_is_refused_and_leaves_the_ship_as_it_was() {
    let (mut sea, traveller, [x, y]) = an_island_out_of_sight();
    assert_eq!(sea.islands().told(traveller, [205_000.0, 150_000.0]).count(), 0, "never told to the traveller");
    let before = ship(&sea, traveller);
    let across = sea.travel(traveller, &[[x - 20_000.0, y], [x + 20_000.0, y]], 10);
    assert_eq!(across, Err(TravelRefused::Course(CourseRefused::CrossesLand)));
    assert_eq!(ship(&sea, traveller), before, "the ship as it was");
}

#[test]
fn a_travel_refused_over_an_island_spends_no_course_turn() {
    let (mut sea, traveller, [x, y]) = an_island_out_of_sight();
    let across = sea.travel(traveller, &[[x - 20_000.0, y], [x + 20_000.0, y]], 10);
    assert_eq!(across, Err(TravelRefused::Course(CourseRefused::CrossesLand)));
    assert_eq!(sea.course(traveller, &[[206_000.0, 150_000.0]], 10), Ok(()), "a course at once after it");
}

#[test]
fn a_travel_refused_where_it_goes_waits_a_courses_wait_before_the_waters_are_searched_again() {
    let (mut sea, traveller, [x, y]) = an_island_out_of_sight();
    let across = sea.travel(traveller, &[[x - 20_000.0, y], [x + 20_000.0, y]], 10);
    assert_eq!(across, Err(TravelRefused::Course(CourseRefused::CrossesLand)));
    sea.tick();
    let open = [[550_000.0, 300_000.0]];
    assert_eq!(
        sea.travel(traveller, &open, 10),
        Err(TravelRefused::Course(CourseRefused::TooSoon)),
        "nothing searched"
    );
    ticks(&mut sea, COURSE_EVERY_TICKS);
    assert_eq!(sea.travel(traveller, &open, 20), Ok(()), "taken once the wait is over");
}

#[test]
fn a_travel_of_no_point_is_refused_and_leaves_the_ship_and_its_course_as_they_were() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    sea.course(player, &[[260_000.0, 150_000.0]], 10).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS);
    let before = ship(&sea, player);
    assert_eq!(sea.travel(player, &[], 10), Err(TravelRefused::Course(CourseRefused::BadCourse)));
    assert_eq!(ship(&sea, player), before, "still under way on its course");
}

#[test]
fn a_travel_to_where_the_ship_lies_keeps_its_heading() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    sea.course(player, &[[260_000.0, 150_000.0]], 10).unwrap();
    ticks(&mut sea, COURSE_EVERY_TICKS);
    let before = ship(&sea, player);
    assert!((before.heading - FRAC_PI_2).abs() < 1e-9, "heading east: {}", before.heading);
    assert_eq!(sea.travel(player, &[[before.x.round(), before.y.round()]], 10), Ok(()));
    assert_eq!(ship(&sea, player).heading, before.heading, "no leg to head along");
}
