use super::*;

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
