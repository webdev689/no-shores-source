use super::*;
use std::f64::consts::{FRAC_PI_2, PI};

fn near(actual: f64, wanted: f64) -> bool {
    (actual - wanted).abs() < 1e-9
}

#[test]
fn headings_are_clockwise_from_north_and_wrap_within_a_half_turn() {
    assert!(near(heading_to([0.0, 0.0], [0.0, -5.0]), 0.0), "north is up the map, y falling");
    assert!(near(heading_to([0.0, 0.0], [5.0, 0.0]), FRAC_PI_2));
    assert!(near(wrap(3.0 * PI / 2.0), -FRAC_PI_2));
    assert!(near(wrap(-PI), PI));
}

#[test]
fn an_intercept_meets_a_crossing_target() {
    // It lies 100 m south of a target sailing east at 2 m/s, and makes 4 m/s itself.
    let (point, heading) = intercept([0.0, 100.0], 4.0, [0.0, 0.0], [2.0, 0.0]);
    let meet = (point[0] * point[0] + 100.0 * 100.0).sqrt() / 4.0;
    assert!(near(point[0], 2.0 * meet) && near(point[1], 0.0));
    assert!(heading > 0.0 && heading < FRAC_PI_2, "north of east: {heading}");
}

#[test]
fn a_target_that_outruns_it_is_led_twenty_seconds_at_most() {
    let (point, _) = intercept([0.0, 1000.0], 1.0, [0.0, 0.0], [6.0, 0.0]);
    assert!(near(point[0], 6.0 * PURSUIT_LEAD_S));
}

#[test]
fn a_ball_is_laid_where_the_target_will_be_when_it_arrives() {
    let lead = lead_point([0.0, 0.0], [100.0, 0.0], [0.0, 3.0], 55.0);
    let flight = (lead[0] * lead[0] + lead[1] * lead[1]).sqrt() / (55.0 * 0.97);
    assert!(near(lead[0], 100.0) && (lead[1] - 3.0 * flight).abs() < 0.01);
}

#[test]
fn running_it_takes_the_best_wind_within_sixty_degrees_of_dead_away() {
    // The threat lies due south of it; the wind blows to the north-east.
    let wind = [1.5 / 2f64.sqrt(), -1.5 / 2f64.sqrt()];
    let away = flee_course([0.0, 0.0], [0.0, 100.0], wind);
    assert!(away.abs() <= 60.0_f64.to_radians() + 1e-9);
    let dead_away = flee_course([0.0, 0.0], [0.0, 100.0], [0.0, -1.5]);
    assert!(near(dead_away, 0.0), "with the wind behind it, it runs dead away");
}

#[test]
fn a_hull_on_a_collision_course_bends_it_away() {
    // Head on: both heading at each other 60 m apart, each at 2 m/s.
    let bent = traffic_course(([0.0, 0.0], 0.0, [0.0, -2.0]), 0.0, &[([0.0, -60.0], [0.0, 2.0], 2.25)], 2.25);
    assert!(bent > 0.0, "it turns to starboard for a hull ahead");
    let clear = traffic_course(([0.0, 0.0], 0.0, [0.0, -2.0]), 0.0, &[([200.0, -60.0], [0.0, 2.0], 2.25)], 2.25);
    assert!(near(clear, 0.0));
}

#[test]
fn a_sloop_and_a_frigate_passing_each_other_keep_the_same_clearance() {
    use crate::arms::{FRIGATE_ARMS, SLOOP_ARMS};
    let (sloop, frigate) = (pass_reach(&SLOOP_ARMS), pass_reach(&FRIGATE_ARMS));
    assert!((sloop - 6.83).abs() < 0.01 && (frigate - 13.13).abs() < 0.01, "{sloop} {frigate}");
    // Head on, each heading at the other's line `abeam` metres to one side: each bends exactly when the other does.
    let bends = |abeam: f64| {
        let sloops =
            traffic_course(([0.0, 0.0], 0.0, [0.0, -2.0]), 0.0, &[([abeam, -60.0], [0.0, 2.0], frigate)], sloop);
        let frigates =
            traffic_course(([abeam, -60.0], PI, [0.0, 2.0]), PI, &[([0.0, 0.0], [0.0, -2.0], sloop)], frigate);
        (!near(sloops, 0.0), !near(frigates, PI))
    };
    let clearance = sloop + frigate + AVOID_SHIP_CLEAR;
    assert!((clearance - 34.96).abs() < 0.01, "{clearance}");
    assert_eq!(bends(clearance - 0.5), (true, true), "both bend inside it");
    assert_eq!(bends(clearance + 0.5), (false, false), "neither outside it");
}
