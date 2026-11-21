use super::*;

/// Open water, but land everywhere north of y = -100 between x = -50 and 50: a headland ahead of a ship heading north.
fn headland(x: f64, y: f64) -> bool {
    !(y < -100.0 && (-50.0..=50.0).contains(&x))
}

const LOOK: Lookout = Lookout { from: 2.0, near: 20.0, dist: 150.0, half: 5.0 };

#[test]
fn a_course_is_clear_only_if_its_keel_and_both_sides_find_water_the_whole_way() {
    assert!(course_clear([0.0, 0.0], 0.0, 90.0, &headland, &LOOK));
    assert!(!course_clear([0.0, 0.0], 0.0, 150.0, &headland, &LOOK));
    assert!(course_clear([0.0, 0.0], std::f64::consts::PI, 150.0, &headland, &LOOK));
    assert!(!course_clear([47.0, -90.0], 0.0, 150.0, &headland, &LOOK), "its side would touch it");
}

#[test]
fn a_course_foul_of_land_swings_to_the_first_clear_one_and_holds_it() {
    let mut avoid = Avoid::new();
    let swung = avoid_land(&mut avoid, (0.0, [0.0, 0.0], 0.0), 0.0, &LOOK, &headland);
    assert!(swung.abs() > 0.0 && course_clear([0.0, 0.0], swung, LOOK.dist, &headland, &LOOK));
    // Within a quarter second the swing is kept without sounding again.
    assert_eq!(avoid_land(&mut avoid, (0.1, [0.0, 0.0], 0.0), 0.0, &LOOK, &headland), swung);
}

#[test]
fn a_clear_course_is_left_alone() {
    let mut avoid = Avoid::new();
    assert_eq!(avoid_land(&mut avoid, (0.0, [500.0, 0.0], 0.0), 0.0, &LOOK, &headland), 0.0);
}
