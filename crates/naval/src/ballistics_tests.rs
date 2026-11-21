use super::*;
use crate::random::Mulberry32;
use std::f64::consts::FRAC_PI_2;

const SWIVEL_SPEED: f64 = 55.0;
const DECK: f64 = 1.1;

fn degrees(value: f64) -> f64 {
    value * 180.0 / std::f64::consts::PI
}

fn radians(value: f64) -> f64 {
    value * std::f64::consts::PI / 180.0
}

#[test]
fn a_swivel_from_1_1_metres_throws_149_metres_at_its_highest() {
    let reach = max_range(SWIVEL_SPEED, DECK, radians(14.0));
    assert!((reach - 149.0).abs() < 0.5, "{reach}");
    let level = range_at(0.0, SWIVEL_SPEED, DECK);
    assert!((level - 26.0).abs() < 0.5, "{level}");
    assert!((range_at(radians(-10.0), SWIVEL_SPEED, DECK) - 5.9).abs() < 0.1);
}

#[test]
fn the_low_arc_lays_for_a_range_within_the_carriage() {
    let lay = |range: f64| degrees(elevation_for_range(range, SWIVEL_SPEED, DECK, radians(-10.0), radians(14.0)));
    assert!((lay(25.0) + 0.2).abs() < 0.05, "{}", lay(25.0));
    assert!((lay(50.0) - 3.4).abs() < 0.05, "{}", lay(50.0));
    assert!((lay(100.0) - 8.8).abs() < 0.05, "{}", lay(100.0));
    assert_eq!(lay(400.0), 14.0, "past its reach it lays at its highest");
    assert_eq!(lay(0.0), -10.0, "no range lays its lowest");
    let back = range_at(radians(lay(75.0)), SWIVEL_SPEED, DECK);
    assert!((back - 75.0).abs() < 1e-6, "{back}");
}

#[test]
fn a_ball_leaves_at_its_speed_and_carries_the_decks_way() {
    let still = launch_velocity([0.0, -2.0], radians(30.0), 10.0, [0.0; 3]);
    assert!((still[0]).abs() < 1e-12 && (still[1] + 10.0 * 0.866_025_403_784_438_6).abs() < 1e-9);
    assert!((still[2] - 5.0).abs() < 1e-9);
    let carried = launch_velocity([1.0, 0.0], 0.0, 10.0, [2.0, 3.0, 0.5]);
    assert_eq!(carried, [12.0, 3.0, 0.5]);
}

#[test]
fn a_ball_flies_the_closed_form_and_falls_by_half_g_t_squared() {
    let at = flight([1.0, 2.0, 3.0], [10.0, -4.0, 6.0], 2.0);
    assert_eq!(at, [21.0, -6.0, 3.0 + 12.0 - GRAVITY * 2.0]);
    assert_eq!(velocity([10.0, -4.0, 6.0], 2.0), [10.0, -4.0, 6.0 - 2.0 * GRAVITY]);
}

#[test]
fn the_scatter_is_the_seeds_and_within_the_spread() {
    let mut first = Mulberry32::new(99);
    let mut second = Mulberry32::new(99);
    let laid = ([0.0, 1.0], radians(5.0));
    let one = scatter(laid.0, laid.1, 1.3, 0.8, &mut first);
    assert_eq!(one, scatter(laid.0, laid.1, 1.3, 0.8, &mut second));
    let mut stream = Mulberry32::new(5);
    for _ in 0..500 {
        let (dir, elevation) = scatter(laid.0, laid.1, 1.3, 0.8, &mut stream);
        assert!((dir[0] * dir[0] + dir[1] * dir[1] - 1.0).abs() < 1e-12);
        assert!(libm::asin(dir[0]).abs() <= radians(1.3) + 1e-12);
        assert!((elevation - laid.1).abs() <= radians(0.8) + 1e-12);
    }
}

#[test]
fn a_positive_yaw_turns_toward_starboard() {
    // Heading north (forward (0, -1)), its starboard is east (1, 0).
    assert_eq!(turned([0.0, -1.0], FRAC_PI_2).map(|value| value.round()), [1.0, 0.0]);
}

fn upright(centre: [f64; 3], half: [f64; 3]) -> Block {
    Block { centre, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], half }
}

#[test]
fn a_segment_enters_a_box_where_it_first_meets_it() {
    let block = upright([10.0, 0.0, 0.0], [1.0, 2.0, 1.0]);
    assert_eq!(segment_entry([0.0, 0.0, 0.0], [20.0, 0.0, 0.0], &block, 0.0), Some(0.45));
    assert_eq!(segment_entry([0.0, 5.0, 0.0], [20.0, 5.0, 0.0], &block, 0.0), None);
    assert_eq!(segment_entry([10.0, 0.0, 0.0], [20.0, 0.0, 0.0], &block, 0.0), Some(0.0));
    assert_eq!(segment_entry([0.0, 0.0, 0.0], [5.0, 0.0, 0.0], &block, 0.0), None, "short of it");
    // Grown by the ball's radius, a near miss strikes.
    assert_eq!(segment_entry([0.0, 2.05, 0.0], [20.0, 2.05, 0.0], &block, 0.0), None);
    assert!(segment_entry([0.0, 2.05, 0.0], [20.0, 2.05, 0.0], &block, 0.07).is_some());
}

#[test]
fn a_turned_box_is_met_in_its_own_frame() {
    let half = std::f64::consts::FRAC_1_SQRT_2;
    let block = Block {
        centre: [0.0, 0.0, 0.0],
        axes: [[half, half, 0.0], [-half, half, 0.0], [0.0, 0.0, 1.0]],
        half: [3.0, 0.5, 1.0],
    };
    // Along its long axis it is met 3 m from the middle; across it, half a metre.
    let along = segment_entry([-10.0 * half, -10.0 * half, 0.0], [0.0, 0.0, 0.0], &block, 0.0).unwrap_or(1.0);
    assert!((along - 0.7).abs() < 1e-12, "{along}");
    let across = segment_entry([10.0 * half, -10.0 * half, 0.0], [0.0, 0.0, 0.0], &block, 0.0).unwrap_or(1.0);
    assert!((across - 0.95).abs() < 1e-12, "{across}");
}
