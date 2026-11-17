use super::*;
use crate::arms::{SLOOP_ARMS, Side};
use crate::guns::{SWIVEL, Shot};
use crate::shots::Flag;
use sailing::pose::Pose;
use sailing::ship::Ship;

fn near(actual: f64, wanted: f64) -> bool {
    (actual - wanted).abs() < 1e-9
}

#[test]
fn a_swivel_alone_reloads_in_5_6_seconds_and_a_crew_in_4_to_7_2() {
    assert!(near(reload_seconds(&SWIVEL, 1.0, false), 5.6));
    assert!(near(reload_seconds(&SWIVEL, 1.0, true), 4.0));
    assert!(near(reload_seconds(&SWIVEL, 0.0, true), 7.2));
    assert!(near(reload_seconds(&SWIVEL, 0.5, true), 5.6));
}

#[test]
fn a_battery_fired_reloads_and_a_brace_stops_its_clock() {
    let mut guns = Guns::new();
    assert!(guns.ready(Side::Port) && guns.ready(Side::Starboard));
    guns.fired(Side::Port, 1.0, false);
    assert!(!guns.ready(Side::Port) && guns.ready(Side::Starboard));
    assert!(near(guns.left(Side::Port), 5.6) && near(guns.progress(Side::Port), 0.0));
    guns.step(2.8);
    assert!(near(guns.progress(Side::Port), 0.5));
    guns.braced = true;
    guns.step(10.0);
    assert!(near(guns.left(Side::Port), 2.8), "braced, the crew holds on and loads nothing");
    assert!(!guns.ready(Side::Starboard), "braced, no gun fires");
    guns.braced = false;
    guns.step(10.0);
    assert!(guns.ready(Side::Port));
}

#[test]
fn a_new_load_draws_a_loaded_battery_and_scales_one_reloading() {
    let mut guns = Guns::new();
    guns.fired(Side::Port, 1.0, false);
    guns.step(2.8);
    assert!(guns.set_load(Shot::Heated, 1.0, false));
    // Port was halfway through 5.6 s: heated reloads 1.6 times as long, its progress kept.
    assert!(near(guns.left(Side::Port), 2.8 * 1.6) && near(guns.progress(Side::Port), 0.5));
    // Starboard stood loaded: drawn and loaded again in half the new load's reload.
    assert!(near(guns.left(Side::Starboard), 0.5 * 4.0 * 1.6 * 1.4));
    assert!(!guns.set_load(Shot::Heated, 1.0, false), "the same load changes nothing");
    assert_eq!(guns.load, Shot::Heated);
}

fn sailing_north(ahead: f64) -> Ship {
    Ship { x: 0.0, y: 0.0, heading: 0.0, ahead, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 2 }
}

const LEVEL: Pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };

#[test]
fn a_side_is_laid_square_to_her_hull_for_its_range() {
    let laid = lay(&sailing_north(0.0), &LEVEL, &SLOOP_ARMS, Side::Starboard, Shot::Round, 50.0, None);
    // Heading north, her starboard guns bear east.
    assert!(near(laid.dir[0], 1.0) && laid.dir[1].abs() < 1e-12);
    let rise = laid.centre[2];
    let landed = crate::ballistics::range_at(laid.elevation, SWIVEL.speed, rise);
    assert!((landed - 50.0).abs() < 1e-6, "{landed}");
    let port = lay(&sailing_north(0.0), &LEVEL, &SLOOP_ARMS, Side::Port, Shot::Round, 50.0, None);
    assert!(near(port.dir[0], -1.0));
}

#[test]
fn a_lay_on_a_point_above_the_water_lays_a_higher_arc() {
    let sea = lay(&sailing_north(0.0), &LEVEL, &SLOOP_ARMS, Side::Starboard, Shot::Round, 50.0, None);
    let deck = lay(&sailing_north(0.0), &LEVEL, &SLOOP_ARMS, Side::Starboard, Shot::Round, 50.0, Some(0.44));
    assert!(deck.elevation > sea.elevation, "less height to fall, so more rise");
}

#[test]
fn a_volley_ripples_its_guns_and_each_leaves_its_own_port_moving_with_the_deck() {
    let ship = sailing_north(3.0);
    let laid = lay(&ship, &LEVEL, &SLOOP_ARMS, Side::Port, Shot::Round, 80.0, None);
    let balls = volley(&laid, [0.0, -3.0, 0.0], 0.6, 1234, 10.0, (0, Flag::Player));
    assert_eq!(balls.len(), 3);
    for (index, ball) in balls.iter().enumerate() {
        let delay = index as f64 * RIPPLE_S;
        assert!(near(ball.born, 10.0 + delay));
        assert!(near(ball.start[1], laid.mouths[index][1] - 3.0 * delay), "its port has moved on");
        let own = [ball.launch[0], ball.launch[1] + 3.0, ball.launch[2]];
        let speed = (own[0] * own[0] + own[1] * own[1] + own[2] * own[2]).sqrt();
        assert!((speed - SWIVEL.speed).abs() < 1e-9, "{speed}");
    }
    assert_eq!(balls, volley(&laid, [0.0, -3.0, 0.0], 0.6, 1234, 10.0, (0, Flag::Player)), "one seed, one scatter");
    assert_ne!(balls, volley(&laid, [0.0, -3.0, 0.0], 0.6, 4321, 10.0, (0, Flag::Player)));
}

#[test]
fn her_muzzles_ride_her_heel() {
    let heeled = Pose { roll: 0.14, ..LEVEL };
    let upright = lay(&sailing_north(0.0), &LEVEL, &SLOOP_ARMS, Side::Starboard, Shot::Round, 50.0, None);
    let leaning = lay(&sailing_north(0.0), &heeled, &SLOOP_ARMS, Side::Starboard, Shot::Round, 50.0, None);
    assert!(leaning.mouths[0][2] < upright.mouths[0][2], "her starboard ports go down");
    assert!(near(leaning.dir[0], 1.0), "the lay stays the upright hull's");
}

#[test]
fn the_landing_zone_is_as_wide_as_the_crew_scatters_the_gun() {
    assert_eq!(zone_radius(&SWIVEL, 0.6, 10.0), 1.6, "never under 1.6 m");
    let wide = 200.0 * libm::tan(1.3 * 0.9 * DEGREE);
    assert!((zone_radius(&SWIVEL, 0.6, 200.0) - wide).abs() < 1e-9);
}
