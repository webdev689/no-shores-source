//! A body against its section: inside the ring or on it, warned outside it with a count, dead when the count runs out
//! or it strays too far, dead until it respawns, and respawned at the nearest spawn.

use reach::{
    FALL_M, LIMIT_M, Place, RESPAWN_TICKS, Section, Standing, TICKS_PER_SECOND, WARNING_TICKS, distance_outside,
    inside, respawn_point,
};

/// A horseshoe, 30 m square, open to the south: a notch 10 m wide runs up from its south edge to 10 m short of its
/// north.
const HORSESHOE: [[f64; 2]; 8] =
    [[0.0, 0.0], [30.0, 0.0], [30.0, 30.0], [20.0, 30.0], [20.0, 10.0], [10.0, 10.0], [10.0, 30.0], [0.0, 30.0]];
/// A right triangle with a slanting edge from (40, 0) to (0, 30).
const TRIANGLE: [[f64; 2]; 3] = [[0.0, 0.0], [40.0, 0.0], [0.0, 30.0]];

fn square() -> Section {
    Section {
        ring: vec![[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]],
        spawns: vec![[50.0, 50.0]],
        falls_kill: false,
    }
}

/// A body with its feet on the ground at (x, y), 0 m up.
fn on_foot(x: f64, y: f64) -> Place {
    Place { x, y, z: 0.0, aloft: false }
}

/// A body in the air over (50, 50), `dropped` metres below where it last stood at 87 m.
fn falling(dropped: f64) -> Place {
    Place { x: 50.0, y: 50.0, z: 87.0 - dropped, aloft: true }
}

/// The standing after `ticks` ticks at (x, y).
fn after(standing: Standing, section: &Section, ticks: u32, x: f64, y: f64) -> Standing {
    (0..ticks).fold(standing, |now, _| now.tick(section, on_foot(x, y), 0.0))
}

#[test]
fn a_tick_here_is_the_tick_movement_steps_bodies_by() {
    assert_eq!(movement::TICK_SECONDS, 1.0 / f64::from(TICKS_PER_SECOND));
}

#[test]
fn a_concave_ring_holds_its_arms_and_its_base_but_not_its_notch() {
    for (x, y) in [(5.0, 20.0), (25.0, 20.0), (15.0, 5.0), (5.0, 10.0), (25.0, 10.0), (0.5, 29.5)] {
        assert!(inside(&HORSESHOE, x, y), "({x}, {y}) is inside");
    }
    for (x, y) in [(15.0, 20.0), (15.0, 29.0), (15.0, 40.0), (-1.0, 5.0), (31.0, 10.0), (5.0, -0.1)] {
        assert!(!inside(&HORSESHOE, x, y), "({x}, {y}) is outside");
    }
}

#[test]
fn a_point_on_the_ring_is_inside_and_one_just_beyond_it_is_not() {
    for ring in [&HORSESHOE[..], &TRIANGLE[..]] {
        for (index, &[from_x, from_y]) in ring.iter().enumerate() {
            let [to_x, to_y] = ring[(index + 1) % ring.len()];
            assert!(inside(ring, from_x, from_y), "the corner ({from_x}, {from_y})");
            let (middle_x, middle_y) = ((from_x + to_x) / 2.0, (from_y + to_y) / 2.0);
            assert!(inside(ring, middle_x, middle_y), "the edge's middle ({middle_x}, {middle_y})");
            assert_eq!(distance_outside(ring, middle_x, middle_y), 0.0);
        }
    }
    assert!(inside(&TRIANGLE, 20.0, 15.0) && inside(&TRIANGLE, 8.0, 24.0), "along the slanting edge");
    assert!(!inside(&TRIANGLE, 20.001, 15.001) && !inside(&TRIANGLE, 40.001, 0.0) && !inside(&HORSESHOE, 15.0, 10.001));
}

#[test]
fn a_ring_of_fewer_than_three_points_holds_nothing() {
    assert!(!inside(&[], 0.0, 0.0));
    assert!(!inside(&[[0.0, 0.0], [10.0, 0.0]], 5.0, 0.0));
    assert_eq!(
        Standing::Inside.tick(&Section::default(), on_foot(0.0, 0.0), 0.0),
        Standing::Dead { ticks: 0, fell: false }
    );
}

#[test]
fn the_distance_outside_is_to_the_nearest_edge() {
    let ring = square().ring;
    assert_eq!(distance_outside(&ring, 50.0, 50.0), 0.0);
    assert_eq!(distance_outside(&ring, 150.0, 50.0), 50.0);
    assert_eq!(distance_outside(&ring, 50.0, -20.0), 20.0);
    assert_eq!(distance_outside(&ring, 130.0, 140.0), 50.0, "past a corner, to the corner");
    assert_eq!(distance_outside(&HORSESHOE, 15.0, 20.0), 5.0, "in the notch, to its nearer side");
    assert_eq!(distance_outside(&TRIANGLE, 40.0, 30.0), 24.0, "off the slanting edge, square to it");
}

#[test]
fn outside_the_count_starts_runs_down_and_coming_back_ends_it() {
    let section = square();
    let outside = Standing::Inside.tick(&section, on_foot(110.0, 50.0), 0.0);
    assert_eq!(outside, Standing::Warned { ticks_left: WARNING_TICKS - 1 });
    let later = after(outside, &section, 100, 110.0, 50.0);
    assert_eq!(later, Standing::Warned { ticks_left: WARNING_TICKS - 101 });
    assert_eq!(later.tick(&section, on_foot(99.0, 50.0), 0.0), Standing::Inside);
    let again = after(later, &section, 2, 99.0, 50.0).tick(&section, on_foot(110.0, 50.0), 0.0);
    assert_eq!(again, Standing::Warned { ticks_left: WARNING_TICKS - 1 }, "a new count starts whole");
    assert_eq!(Standing::Inside.tick(&section, on_foot(100.0, 50.0), 0.0), Standing::Inside, "the edge is inside");
}

#[test]
fn the_body_dies_on_its_tenth_second_outside() {
    let section = square();
    assert_eq!(WARNING_TICKS, 10 * TICKS_PER_SECOND);
    let nearly = after(Standing::Inside, &section, WARNING_TICKS - 1, 130.0, 50.0);
    assert_eq!(nearly, Standing::Warned { ticks_left: 1 });
    assert_eq!(nearly.tick(&section, on_foot(130.0, 50.0), 0.0), Standing::Dead { ticks: 0, fell: false });
    assert_eq!(
        Standing::Warned { ticks_left: 0 }.tick(&section, on_foot(130.0, 50.0), 0.0),
        Standing::Dead { ticks: 0, fell: false }
    );
}

#[test]
fn the_limit_past_the_edge_kills_at_once() {
    let section = square();
    let short = 100.0 + LIMIT_M - 0.001;
    assert_eq!(
        Standing::Inside.tick(&section, on_foot(short, 50.0), 0.0),
        Standing::Warned { ticks_left: WARNING_TICKS - 1 }
    );
    assert_eq!(
        Standing::Inside.tick(&section, on_foot(100.0 + LIMIT_M, 50.0), 0.0),
        Standing::Dead { ticks: 0, fell: false }
    );
    let warned = Standing::Warned { ticks_left: 300 };
    assert_eq!(warned.tick(&section, on_foot(50.0, -LIMIT_M - 1.0), 0.0), Standing::Dead { ticks: 0, fell: false });
}

#[test]
fn death_never_ends_by_itself() {
    let section = square();
    let dead = after(Standing::Dead { ticks: 0, fell: false }, &section, 1000, 50.0, 50.0);
    assert_eq!(dead, Standing::Dead { ticks: 1000, fell: false }, "back inside, still dead");
    assert_eq!(
        Standing::Dead { ticks: u32::MAX, fell: false }.tick(&section, on_foot(50.0, 50.0), 0.0),
        Standing::Dead { ticks: u32::MAX, fell: false }
    );
}

#[test]
fn a_respawn_is_offered_four_seconds_after_death() {
    let section = square();
    assert_eq!(RESPAWN_TICKS, 4 * TICKS_PER_SECOND);
    let died = after(Standing::Inside, &section, WARNING_TICKS, 130.0, 50.0);
    assert_eq!(died, Standing::Dead { ticks: 0, fell: false });
    assert!(!died.may_respawn());
    assert!(!after(died, &section, RESPAWN_TICKS - 1, 130.0, 50.0).may_respawn());
    assert!(after(died, &section, RESPAWN_TICKS, 130.0, 50.0).may_respawn());
    assert!(!Standing::Inside.may_respawn() && !Standing::Warned { ticks_left: 1 }.may_respawn());
}

#[test]
fn a_body_respawns_at_the_spawn_nearest_where_it_died() {
    let section = Section { spawns: vec![[10.0, 10.0], [90.0, 10.0], [50.0, 90.0]], ..square() };
    assert_eq!(respawn_point(&section, 160.0, -30.0), Some([90.0, 10.0]));
    assert_eq!(respawn_point(&section, 50.0, 200.0), Some([50.0, 90.0]));
    assert_eq!(respawn_point(&section, -70.0, 40.0), Some([10.0, 10.0]));
    assert_eq!(respawn_point(&section, 50.0, -500.0), Some([10.0, 10.0]), "the first of two as near");
    assert_eq!(respawn_point(&Section { spawns: Vec::new(), ..square() }, 0.0, 0.0), None);
}

/// A social space's section: the square, where a fall kills.
fn social() -> Section {
    Section { falls_kill: true, ..square() }
}

const FELL: Standing = Standing::Dead { ticks: 0, fell: true };

#[test]
fn in_a_social_space_a_fall_of_six_metres_kills_at_once_inside_the_ring() {
    assert_eq!(FALL_M, 6.0);
    let section = social();
    assert_eq!(Standing::Inside.tick(&section, falling(5.9), 87.0), Standing::Inside);
    assert_eq!(Standing::Inside.tick(&section, falling(6.0), 87.0), FELL);
    assert_eq!(Standing::Inside.tick(&section, falling(40.0), 87.0), FELL);
}

#[test]
fn a_fall_kills_outside_the_ring_too_before_the_warning_runs_out() {
    let section = social();
    let out = |dropped: f64| Place { x: 120.0, ..falling(dropped) };
    let warned = Standing::Warned { ticks_left: 300 };
    assert_eq!(warned.tick(&section, out(5.9), 87.0), Standing::Warned { ticks_left: 299 });
    assert_eq!(warned.tick(&section, out(6.0), 87.0), FELL);
    assert_eq!(Standing::Inside.tick(&section, out(6.0), 87.0), FELL, "the first tick out");
}

#[test]
fn going_over_the_edge_of_a_social_space_warns_only_once_the_feet_are_down() {
    let section = social();
    let out = |dropped: f64| Place { x: 120.0, ..falling(dropped) };
    assert_eq!(Standing::Inside.tick(&section, out(3.0), 87.0), Standing::Inside, "no warning in the air");
    let landed = Place { aloft: false, ..out(3.0) };
    assert_eq!(Standing::Inside.tick(&section, landed, 87.0), Standing::Warned { ticks_left: WARNING_TICKS - 1 });
    let warned = Standing::Warned { ticks_left: 300 };
    assert_eq!(warned.tick(&section, out(1.0), 87.0), Standing::Warned { ticks_left: 299 }, "a jump keeps the count");
    let away = Place { x: 120.0, ..falling(3.0) };
    assert_eq!(Standing::Inside.tick(&square(), away, 87.0), Standing::Warned { ticks_left: WARNING_TICKS - 1 });
}

#[test]
fn a_fall_is_measured_from_where_the_feet_last_stood() {
    assert_eq!(reach::stood(87.0, falling(10.0)), 87.0, "in the air, the height it left");
    assert_eq!(reach::stood(87.0, Place { aloft: false, ..falling(10.0) }), 77.0, "landed, where it stands");
    assert_eq!(reach::stood(87.0, Place { z: 88.2, ..falling(0.0) }), 87.0, "a jump's rise is not a footing");
}

#[test]
fn a_drop_with_the_feet_down_never_kills() {
    let section = social();
    let down = Place { aloft: false, ..falling(30.0) };
    assert_eq!(Standing::Inside.tick(&section, down, 87.0), Standing::Inside);
}

#[test]
fn away_from_a_social_space_a_fall_does_no_harm() {
    let section = square();
    assert!(!section.falls_kill);
    assert_eq!(Standing::Inside.tick(&section, falling(40.0), 87.0), Standing::Inside);
}

#[test]
fn the_fallen_stay_dead_and_fallen_and_respawn_as_the_strayed_do() {
    let section = social();
    let later = after(FELL, &section, RESPAWN_TICKS, 50.0, 50.0);
    assert_eq!(later, Standing::Dead { ticks: RESPAWN_TICKS, fell: true });
    assert!(later.may_respawn());
}
