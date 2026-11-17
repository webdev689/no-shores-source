use super::*;
use crate::pirates::Pirate;
use naval::fight::{CAPTAIN, End, Sailor};

/// A ship of a fight, by its number.
fn sailed(fight: &Fight, id: naval::shots::ShipId) -> sailing::ship::Ship {
    fight.vessel(id).map(|vessel| vessel.ship).expect("a ship of the fight")
}

/// One square continent, 100 km a side, its north-west corner 100 km from the frame's.
fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap())
}

fn ship(sea: &Sea, player: PlayerId) -> Ship {
    sea.ships().find(|(each, _)| *each == player).map(|(_, ship)| ship).unwrap()
}

fn ticks(sea: &mut Sea, count: usize) {
    for _ in 0..count {
        sea.tick();
    }
}

/// Sets a course on the next tick, so each try is the player's one course of its tick.
fn next_course(sea: &mut Sea, player: PlayerId, points: &[[f64; 2]], pace: u16) -> Result<(), CourseRefused> {
    sea.tick();
    sea.course(player, points, pace)
}

#[test]
fn a_ship_puts_to_sea_at_its_first_point_and_sails_north_at_its_pace() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.ships().count(), 0, "not at sea before its first course");
    sea.course(player, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10).unwrap();
    assert_eq!(ship(&sea, player), Ship { x: 50_000.0, y: 150_000.0, heading: 0.0, pace: 10 });
    ticks(&mut sea, 60);
    let sailed = ship(&sea, player);
    assert!((sailed.y - (150_000.0 - 120.0)).abs() < 1e-6, "a second at 10 × 12 m/s: {}", sailed.y);
    assert_eq!((sailed.x, sailed.heading, sailed.pace), (50_000.0, 0.0, 10));
}

#[test]
fn a_ship_turns_onto_each_leg_and_comes_to_rest_at_its_course_end() {
    let mut sea = sea();
    let player = sea.join();
    let course = [[50_000.0, 150_000.0], [50_000.0, 149_000.0], [51_000.0, 149_000.0]];
    sea.course(player, &course, 100).unwrap();
    ticks(&mut sea, 60);
    let turned = ship(&sea, player);
    assert_eq!(turned.y, 149_000.0, "past the corner");
    assert!(turned.x > 50_000.0 && turned.heading == std::f64::consts::FRAC_PI_2, "heading east at {turned:?}");
    ticks(&mut sea, 60);
    assert_eq!(ship(&sea, player), Ship { x: 51_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0 });
}

#[test]
fn a_course_that_crosses_or_touches_a_coast_or_stands_on_land_is_refused_whole() {
    let mut sea = sea();
    let player = sea.join();
    let across = [[50_000.0, 150_000.0], [250_000.0, 150_000.0]];
    assert_eq!(sea.course(player, &across, 10), Err(CourseRefused::CrossesLand));
    assert_eq!(next_course(&mut sea, player, &[[150_000.0, 150_000.0]], 10), Err(CourseRefused::CrossesLand));
    assert_eq!(sea.ships().count(), 0, "a refused course puts no ship to sea");
    next_course(&mut sea, player, &[[50_000.0, 150_000.0]], 10).unwrap();
    // From where the ship is, the way to here grazes the continent's north-west corner.
    assert_eq!(next_course(&mut sea, player, &[[150_000.0, 50_000.0]], 10), Err(CourseRefused::CrossesLand));
    assert_eq!(next_course(&mut sea, player, &[[50_000.0, 50_000.0], [150_000.0, 50_000.0]], 10), Ok(()));
}

#[test]
fn a_pace_off_the_steps_a_point_off_the_frame_and_too_long_a_course_are_refused() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 7), Err(CourseRefused::BadPace));
    assert_eq!(next_course(&mut sea, player, &[[-5.0, 150_000.0]], 10), Err(CourseRefused::BadCourse));
    assert_eq!(next_course(&mut sea, player, &[[f64::NAN, 150_000.0]], 10), Err(CourseRefused::BadCourse));
    let long = vec![[50_000.0, 150_000.0]; COURSE_LIMIT + 1];
    assert_eq!(next_course(&mut sea, player, &long, 10), Err(CourseRefused::BadCourse));
    assert_eq!(next_course(&mut sea, player, &[], 10), Err(CourseRefused::BadCourse), "nothing to put to sea at");
    assert_eq!(sea.course(99, &[[50_000.0, 150_000.0]], 10), Err(CourseRefused::NoSuchPlayer));
}

#[test]
fn a_player_sets_one_course_a_tick() {
    let mut sea = sea();
    let player = sea.join();
    let refused = [[50_000.0, 150_000.0], [250_000.0, 150_000.0]];
    assert_eq!(sea.course(player, &refused, 10), Err(CourseRefused::CrossesLand));
    assert_eq!(sea.course(player, &[[50_000.0, 150_000.0]], 10), Err(CourseRefused::TooSoon), "even after a refusal");
    assert_eq!(next_course(&mut sea, player, &[[50_000.0, 150_000.0]], 10), Ok(()));
}

#[test]
fn a_new_course_starts_from_where_the_ship_is_to_the_nearest_metre() {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 150_000.0], [50_700.0, 140_000.0]], 5).unwrap();
    ticks(&mut sea, 7);
    let between = ship(&sea, player);
    assert!(between.x.fract() != 0.0 && between.y.fract() != 0.0, "mid-metre at {between:?}");
    sea.course(player, &[[40_000.0, between.y.round()]], 5).unwrap();
    let started = ship(&sea, player);
    assert_eq!((started.x, started.y), (between.x.round(), between.y.round()));
    assert_eq!(started.heading, between.heading, "it keeps its heading until it sails");
    ticks(&mut sea, 1);
    assert_eq!(ship(&sea, player).heading, -std::f64::consts::FRAC_PI_2, "west along the judged leg");
}

#[test]
fn an_empty_course_brings_a_ship_to_rest_and_one_who_leaves_takes_their_ship() {
    let mut sea = sea();
    let (first, second) = (sea.join(), sea.join());
    sea.course(first, &[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 60).unwrap();
    sea.course(second, &[[60_000.0, 150_000.0], [60_000.0, 50_000.0]], 5).unwrap();
    ticks(&mut sea, 10);
    sea.course(first, &[], 5).unwrap();
    let stopped = ship(&sea, first);
    ticks(&mut sea, 10);
    assert_eq!(ship(&sea, first), Ship { pace: 0, ..stopped });
    sea.leave(second);
    assert_eq!(sea.ships().map(|(player, _)| player).collect::<Vec<_>>(), vec![first]);
    assert_eq!(sea.clock(), 20);
}

/// A player at rest at sea far off the square continent, a bold pirate `out` metres north of them.
fn met_at_sea(out: f64) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let bold = Pirate { id: 1, seed: 7, x: 50_000.0, y: 50_000.0 - out, heading: 0.0, bold: true };
    sea.pirates.sailing.push(bold);
    (sea, player)
}

#[test]
fn a_bold_pirate_in_sight_begins_a_fight_where_she_and_the_ship_lie() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let (fighting, fought) = sea.fights().next().expect("a fight");
    assert_eq!(fighting, player);
    assert!(sea.pirates().is_empty(), "she left the sea for the fight");
    let captain = sailed(&fought.fight, CAPTAIN);
    assert!((captain.y - (50_000.0 - 700.0)).abs() < 1.0 && (captain.x - 50_000.0).abs() < 1e-6, "{captain:?}");
    assert_eq!((sailed(&fought.fight, PLAYER).rung, captain.rung), (0, SAILS_SET), "hove to, she under sail");
    assert_eq!(sea.course(player, &[[60_000.0, 50_000.0]], 10), Err(CourseRefused::Fighting));
}

#[test]
fn a_fight_steps_by_the_players_orders_and_moves_their_ship_with_it() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let helm = Helm { steer: 1.0, crab: false, climb: 0 };
    sea.orders(player, Orders { helm, ..QUIET }).unwrap();
    ticks(&mut sea, 600);
    let fought = &sea.fights().next().unwrap().1.fight;
    let her = sailed(fought, PLAYER);
    assert!(her.heading != 0.0, "she answered her helm");
    assert_eq!(ship(&sea, player), Ship { x: her.x, y: her.y, heading: her.heading, pace: 0 });
    assert_eq!(sea.orders(2, QUIET), Err(CourseRefused::Fighting), "no fight, no orders");
}

#[test]
fn a_fight_that_ends_is_shown_once_and_the_player_sails_again() {
    let (mut sea, player) = met_at_sea(700.0);
    sea.tick();
    let fight = &mut sea.fights.get_mut(&player).unwrap().fight;
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor) {
        command.gone = Some(End::Gone);
    }
    assert_eq!(sea.fights().count(), 1, "shown in the snapshot after the tick it ended");
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    next_course(&mut sea, player, &[[60_000.0, 50_000.0]], 10).unwrap();
}

#[test]
fn a_wary_pirate_or_one_out_of_sight_begins_no_fight() {
    let (mut sea, _) = met_at_sea(900.0);
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
    sea.pirates.sailing[0] = Pirate { bold: false, y: 50_000.0 - 500.0, ..sea.pirates.sailing[0] };
    sea.tick();
    assert_eq!(sea.fights().count(), 0);
}
