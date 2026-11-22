use super::*;
use crate::pirates::{FIRST_ROLL_S, Pirate};
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
fn a_travel_sets_the_players_next_roll_to_its_first_wait_again() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    ticks(&mut sea, 600);
    let before = sea.pirates.wait_of(player).unwrap();
    assert!(before < FIRST_ROLL_S, "the roll's wait ran down: {before}");
    sea.travel(player, &[[550_000.0, 150_000.0]], 10).unwrap();
    assert_eq!(sea.pirates.wait_of(player), Some(FIRST_ROLL_S));
}

#[test]
fn a_travel_within_the_ships_own_water_is_refused() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    assert_eq!(sea.travel(player, &[[260_000.0, 150_000.0]], 10), Err(TravelRefused::OwnWater));
    assert_eq!(told(&sea, player), Some(TravelRefused::OwnWater.number()));
    assert_eq!([ship(&sea, player).x, ship(&sea, player).y], [250_000.0, 150_000.0], "the ship stays");
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
        Pirate { quarry: Some(player), ..Pirate::standing(1, 7, commission, [270_000.0, 150_000.0], 0.0, true) };
    sea.pirates.sailing.push(chaser);
    assert_eq!(sea.travel(player, &[[550_000.0, 150_000.0]], 10), Err(TravelRefused::Chased));
}

#[test]
fn a_travel_while_fighting_is_refused() {
    let mut sea = sea();
    let player = at_sea(&mut sea);
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Major };
    sea.pirates.sailing.push(Pirate::standing(1, 7, commission, [250_000.0, 150_600.0], 0.0, true));
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

#[test]
fn a_travel_whose_last_leg_meets_an_island_never_told_is_refused_and_leaves_the_ship_as_it_was() {
    // Home waters to the west, where the traveller lies; a desert's to the east, where another player's ship has
    // islands rolled round it, out of the traveller's sight.
    let text = r#"{ "continents": [
        { "id": "continent-1", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-5", "climate": "desert", "outline": [[600000, 100000], [700000, 100000], [700000, 200000], [600000, 200000]] }
    ], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let traveller = at_sea(&mut sea);
    let other = sea.join();
    sea.course_anywhere(other, &[[550_000.0, 40_000.0]], 10).unwrap();
    while sea.islands().standing().next().is_none() {
        assert!(sea.clock() < 60 * 60 * 10, "no island in ten minutes");
        sea.tick();
    }
    let [x, y] = sea.islands().standing().next().unwrap().at;
    assert_eq!(sea.islands().told(traveller, [250_000.0, 150_000.0]).count(), 0, "never told to the traveller");
    ticks(&mut sea, COURSE_EVERY_TICKS);
    let before = ship(&sea, traveller);
    let across = sea.travel(traveller, &[[x - 20_000.0, y], [x + 20_000.0, y]], 10);
    assert_eq!(across, Err(TravelRefused::Course(CourseRefused::CrossesLand)));
    assert_eq!(ship(&sea, traveller), before, "the ship as it was");
}
