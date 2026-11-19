//! The hulls beyond the Sloop under the same helm: the Schooner's fore-and-aft rig, and the Brig's and the Frigate's
//! square sails, each drawing at the crest of its own curve.

use super::*;
use crate::helm::{HANDLING, PACE, canvas, point_of_sail, sail_power, steerage};
use crate::waters::{Spot, Waters};
use crate::{BRIG, FRIGATE, HullKind, SCHOONER, SLOOP, SailKind, SailSize, TICK_SECONDS};
use std::f64::consts::{FRAC_PI_2, PI};

/// Deep water everywhere, still.
struct Flat;
impl Waters for Flat {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -20.0, surface: Some(0.0) }
    }
}

/// The wind blowing to the east, at a ship's rated wind.
const EAST: [f64; 2] = [1.5, 0.0];
const STILL: Helm = Helm { steer: 0.0, crab: false, climb: 0 };

fn under_sail(heading: f64) -> Ship {
    Ship { x: 0.0, y: 0.0, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: SAILS_SET }
}

fn sail(mut ship: Ship, helm: Helm, hull: &Hull, ticks: u32) -> Ship {
    for tick in 0..ticks {
        ship = step_ship(&ship, &helm, hull, EAST, &Flat, f64::from(tick) * TICK_SECONDS, TICK_SECONDS);
    }
    ship
}

/// Her way under sail at a point of sail, as the responsive helm sets it.
fn way_under_sail(hull: &Hull, off_run_deg: f64) -> f64 {
    canvas(hull) * point_of_sail(off_run_deg) * 1.5 * PACE * HANDLING.move_speed_sail
}

#[test]
fn each_hull_is_named_by_her_key_and_numbered_from_the_sloop() {
    let names: Vec<&str> = HullKind::ALL.iter().map(|kind| kind.name()).collect();
    assert_eq!(names, ["sloop", "schooner", "brig", "frigate"]);
    assert_eq!(HullKind::default(), HullKind::Sloop);
    for kind in HullKind::ALL {
        assert_eq!(HullKind::numbered(kind.number()), Some(kind));
    }
    assert_eq!(HullKind::numbered(4), None);
    assert_eq!(*HullKind::Brig.hull(), BRIG);
}

#[test]
fn a_square_sail_draws_its_most_running_before_the_wind() {
    assert_eq!(sail_power(SailKind::Square, SailSize::Small, 0.0), 0.4);
    assert_eq!(sail_power(SailKind::Square, SailSize::Small, 45.0), 0.2);
    assert_eq!(sail_power(SailKind::Square, SailSize::Small, 90.0), 0.0);
    assert!(sail_power(SailKind::Square, SailSize::Small, 135.0) < 0.0, "laid aback, it pulls her astern");
}

#[test]
fn each_hulls_canvas_is_every_sail_she_carries_at_its_crest() {
    assert!((canvas(&SCHOONER) - (0.3 * 0.8 + 0.5 + 0.5)).abs() < 1e-12);
    assert!((canvas(&BRIG) - (2.0 * 0.24 + 6.0 * 0.4 + 0.5)).abs() < 1e-12);
    assert!((canvas(&FRIGATE) - (2.0 * 0.24 + 8.0 * 0.4 + 0.5)).abs() < 1e-12);
    let squares = |hull: &Hull| hull.sails.iter().filter(|sail| sail.kind == SailKind::Square).count();
    assert_eq!([squares(&SLOOP), squares(&SCHOONER), squares(&BRIG), squares(&FRIGATE)], [0, 0, 6, 8]);
}

#[test]
fn a_square_rigged_hull_gathers_her_way_on_a_beam_reach_at_her_rigs_rate() {
    for hull in [&BRIG, &FRIGATE] {
        let ship = sail(under_sail(0.0), STILL, hull, 1200);
        assert!((ship.ahead - way_under_sail(hull, 90.0)).abs() < 1e-9, "{}: {}", hull.name, ship.ahead);
        assert!(ship.y < -100.0, "{} sails north: {}", hull.name, ship.y);
        // Her way comes on at her rig's gain: a tick's worth from rest.
        let first = sail(under_sail(0.0), STILL, hull, 1);
        let rate = HANDLING.move_accel_sail * 1.5 * crate::helm::SAIL_ACCEL * hull.gain;
        assert!((first.ahead - rate * TICK_SECONDS).abs() < 1e-12, "{}: {}", hull.name, first.ahead);
    }
}

#[test]
fn a_square_rigged_hull_runs_before_the_wind_and_beats_into_it() {
    for hull in [&BRIG, &FRIGATE] {
        let running = sail(under_sail(FRAC_PI_2), STILL, hull, 1200);
        let beating = sail(under_sail(3.0 * FRAC_PI_2), STILL, hull, 1200);
        assert!((running.ahead - way_under_sail(hull, 0.0)).abs() < 1e-9, "{}", hull.name);
        assert!((beating.ahead - way_under_sail(hull, 180.0)).abs() < 1e-9, "{}", hull.name);
        assert!(beating.ahead > 0.0 && beating.x < -50.0, "{} makes way into the wind's eye", hull.name);
    }
}

#[test]
fn a_square_rigged_hull_tacks_through_the_winds_eye_and_keeps_her_way() {
    for hull in [&BRIG, &FRIGATE] {
        // Close-hauled north-west, the wind from the west: her helm to port takes her through its eye to the
        // south-west, and she never loses her way doing it.
        let mut ship = sail(under_sail(1.75 * PI), STILL, hull, 900);
        let (mut through, mut slowest) = (false, ship.ahead);
        for _ in 0..3000 {
            ship = sail(ship, Helm { steer: -1.0, ..STILL }, hull, 1);
            through |= (ship.heading - 1.5 * PI).abs() < 0.01;
            slowest = slowest.min(ship.ahead);
            if ship.heading < 1.25 * PI {
                break;
            }
        }
        assert!(through && ship.heading < 1.25 * PI, "{} came about: {}", hull.name, ship.heading);
        assert!(slowest > way_under_sail(hull, 180.0) * 0.9, "{} kept her way: {slowest}", hull.name);
    }
}

#[test]
fn a_square_rigged_hull_swings_at_her_steerage_at_her_rigs_gain() {
    for hull in [&BRIG, &FRIGATE] {
        let mut ship = sail(under_sail(0.0), STILL, hull, 1200);
        let mut before = ship;
        for _ in 0..300 {
            before = ship;
            ship = sail(ship, Helm { steer: 1.0, ..STILL }, hull, 1);
        }
        let way = length(before.ahead, before.abeam);
        assert!((ship.turn - steerage(way / hull.gain)).abs() < 1e-9, "{}: {}", hull.name, ship.turn);
        assert!(ship.heading > 0.5 && ship.heading < PI, "{} swings to starboard: {}", hull.name, ship.heading);
    }
}

#[test]
fn a_square_rigged_hull_strikes_her_sails_and_coasts_to_her_oars() {
    for hull in [&BRIG, &FRIGATE] {
        let mut ship = sail(under_sail(0.0), STILL, hull, 1200);
        ship = sail(ship, Helm { climb: -1, ..STILL }, hull, 1);
        ship = sail(ship, Helm { climb: 0, ..STILL }, hull, 1);
        assert_eq!(ship.rung, 1, "{} on her oars", hull.name);
        let ship = sail(ship, STILL, hull, 3000);
        assert!((ship.ahead - HANDLING.move_speed_oar).abs() < 1e-9, "{}: {}", hull.name, ship.ahead);
    }
}
