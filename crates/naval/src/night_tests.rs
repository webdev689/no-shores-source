use super::*;
use crate::ranks::{GREY_TITHE, PLAYERS};

const DAY: f64 = 1.0;
const NIGHT: f64 = 0.0;

#[test]
fn by_day_a_lookout_sees_as_far_as_it_ever_does_lit_or_dark() {
    for lit in [true, false] {
        assert_eq!(night_sight(750.0, DAY, lit), 750.0);
        assert_eq!(night_sight(5_000.0, DAY, lit), 5_000.0);
    }
}

#[test]
fn at_night_a_lit_ship_is_seen_to_650_metres_and_a_dark_one_to_220() {
    assert_eq!(night_sight(750.0, NIGHT, true), NIGHT_LIT_SIGHT_M);
    assert_eq!(night_sight(750.0, NIGHT, false), NIGHT_DARK_SIGHT_M);
    assert_eq!(NIGHT_LIT_SIGHT_M, 650.0);
    assert_eq!(NIGHT_DARK_SIGHT_M, 220.0);
}

#[test]
fn at_night_a_ship_is_never_seen_farther_than_by_day() {
    assert_eq!(night_sight(400.0, NIGHT, true), 400.0);
    assert_eq!(night_sight(100.0, NIGHT, false), 100.0);
}

#[test]
fn night_falls_once_the_lanterns_are_half_up_through_the_dusk() {
    assert!(!is_night(NIGHT_DAYLIGHT + 1e-9));
    assert!(is_night(NIGHT_DAYLIGHT));
    assert_eq!(night_sight(750.0, NIGHT_DAYLIGHT + 1e-9, false), 750.0);
    assert_eq!(night_sight(750.0, NIGHT_DAYLIGHT, false), NIGHT_DARK_SIGHT_M);
}

#[test]
fn the_grey_tithe_runs_dark_and_a_friendly_ship_only_while_it_runs() {
    assert!(runs_dark(GREY_TITHE, false));
    assert!(runs_dark(GREY_TITHE, true));
    assert!(!runs_dark(PLAYERS, false));
    assert!(runs_dark(PLAYERS, true));
}
