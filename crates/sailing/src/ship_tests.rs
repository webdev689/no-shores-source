use super::*;
use crate::helm::{HANDLING, PACE, canvas, point_of_sail, steerage};
use crate::pose::pose_of;
use crate::waters::{LandWaters, Spot, Waters};
use crate::{SLOOP, TICK_SECONDS};
use std::f64::consts::{FRAC_PI_2, PI, TAU};

/// Deep water everywhere, still.
struct Flat;
impl Waters for Flat {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -20.0, surface: Some(0.0) }
    }
}

/// Five metres deep to x = 100, then the bed rises a metre in ten eastward, onto a dry beach at x = 150.
struct Shelf;
impl Waters for Shelf {
    fn at(&self, x: f64, _y: f64, _time: f64) -> Spot {
        let bed = if x < 100.0 { -5.0 } else { -5.0 + (x - 100.0) / 10.0 };
        Spot { bed, surface: (bed < 0.0).then_some(0.0) }
    }
}

/// Deep water whose surface rises a metre in ten eastward.
struct Tilted;
impl Waters for Tilted {
    fn at(&self, x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -20.0, surface: Some(0.1 * x) }
    }
}

/// The sea west of x = 0, a river 0.6 m above it east of x = 0.
struct Mouth;
impl Waters for Mouth {
    fn at(&self, x: f64, _y: f64, _time: f64) -> Spot {
        if x < 0.0 { Spot { bed: -10.0, surface: Some(0.0) } } else { Spot { bed: -2.0, surface: Some(0.6) } }
    }
}

const EAST: [f64; 2] = [1.5, 0.0];
const SOUTH: [f64; 2] = [0.0, 1.5];
const STILL: Helm = Helm { steer: 0.0, climb: 0 };

fn at_rest(heading: f64, rung: i8) -> Ship {
    Ship { x: 0.0, y: 0.0, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung }
}

fn sail(mut ship: Ship, helm: Helm, wind: [f64; 2], waters: &impl Waters, ticks: u32) -> Ship {
    for tick in 0..ticks {
        let helm = if tick == 0 { helm } else { Helm { climb: 0, ..helm } };
        ship = step_ship(&ship, &helm, &SLOOP, wind, waters, f64::from(tick) * TICK_SECONDS, TICK_SECONDS);
    }
    ship
}

/// Its way under sail at a point of sail, as DFO's responsive helm sets it: its canvas, the share, the sea's wind and
/// its pace, at the mod's sailing speed.
fn way_under_sail(off_run_deg: f64) -> f64 {
    canvas(&SLOOP) * point_of_sail(off_run_deg) * 1.5 * PACE * HANDLING.move_speed_sail
}

fn full_way_north() -> Ship {
    sail(at_rest(0.0, 2), STILL, EAST, &Flat, 600)
}

#[test]
fn under_sail_on_a_beam_reach_it_gathers_its_full_way() {
    let ship = full_way_north();
    assert!((ship.ahead - way_under_sail(90.0)).abs() < 1e-9, "{}", ship.ahead);
    assert!((ship.ahead - 0.74 * 0.8875 * 1.5 * 1.2 * 2.0).abs() < 1e-9);
    assert_eq!([ship.abeam, ship.turn, ship.heading, ship.x], [0.0, 0.0, 0.0, 0.0]);
    assert!(ship.y < -15.0, "it sails north: {}", ship.y);
}

#[test]
fn struck_sails_lose_its_way_at_the_coast() {
    let mut ship = full_way_north();
    ship = sail(ship, Helm { climb: -1, ..STILL }, EAST, &Flat, 1);
    ship = sail(ship, Helm { climb: -1, ..STILL }, EAST, &Flat, 1);
    assert_eq!(ship.rung, 0);
    let mut lowest = ship.ahead;
    for _ in 0..300 {
        ship = sail(ship, STILL, EAST, &Flat, 1);
        lowest = lowest.min(ship.ahead);
    }
    assert_eq!(ship.ahead, 0.0);
    assert!(lowest >= 0.0);
}

#[test]
fn oars_ahead_and_astern_reach_two_metres_a_second() {
    assert_eq!(sail(at_rest(0.0, 1), STILL, EAST, &Flat, 300).ahead, 2.0);
    assert_eq!(sail(at_rest(0.0, -1), STILL, EAST, &Flat, 300).ahead, -2.0);
}

#[test]
fn backing_water_reverses_the_helm() {
    let ship = sail(at_rest(0.0, -1), Helm { steer: 1.0, ..STILL }, EAST, &Flat, 300);
    assert_eq!(ship.turn, -HANDLING.turn_speed_oar);
    assert!(ship.heading > PI, "it swings to port: {}", ship.heading);
}

#[test]
fn at_full_way_it_swings_at_its_steerage() {
    let mut ship = full_way_north();
    let mut before = ship;
    for _ in 0..300 {
        before = ship;
        ship = sail(ship, Helm { steer: 1.0, ..STILL }, EAST, &Flat, 1);
    }
    let way = length(before.ahead, before.abeam);
    assert!((ship.turn - steerage(way / SLOOP.gain)).abs() < 1e-9, "{} against {}", ship.turn, steerage(way));
    assert!(ship.heading > 0.5 && ship.heading < PI, "it swings to starboard: {}", ship.heading);
}

#[test]
fn head_to_wind_it_still_makes_way_at_the_head_share() {
    let ship = sail(at_rest(0.0, 2), STILL, SOUTH, &Flat, 600);
    assert!((ship.ahead - way_under_sail(180.0)).abs() < 1e-9, "{}", ship.ahead);
    assert!((point_of_sail(180.0) - 0.55).abs() < 1e-12);
}

#[test]
fn it_takes_the_ground_on_the_shelf_and_stops() {
    let ship = sail(at_rest(FRAC_PI_2, 2), STILL, EAST, &Shelf, 60 * 90);
    let bow_keel = ship.x + 0.8 * SLOOP.half_length_m;
    let draught_deep = 100.0 + (5.0 - SLOOP.draught_m) * 10.0;
    assert!(
        bow_keel > draught_deep - 4.0 && bow_keel <= draught_deep,
        "its bow's keel stops where the water is its draught: {bow_keel}"
    );
    assert!(ship.ahead.abs() < 0.05, "it has lost its way: {}", ship.ahead);
    assert!(pose_of(&ship, &SLOOP, &Shelf, 0.0).aground, "its keel touches, so the panel can say so");
}

#[test]
fn it_steers_off_the_shelf_under_sail() {
    let aground = sail(at_rest(FRAC_PI_2, 2), STILL, EAST, &Shelf, 60 * 90);
    let ship = sail(aground, Helm { steer: -1.0, ..STILL }, EAST, &Shelf, 60 * 30);
    assert!(ship.heading < FRAC_PI_2 - 0.5 || ship.heading > PI, "its helm swings it: {}", ship.heading);
    assert!(length(ship.x - aground.x, ship.y - aground.y) > 10.0, "and it sails off: {ship:?} from {aground:?}");
    assert!(!pose_of(&ship, &SLOOP, &Shelf, 0.0).aground);
}

#[test]
fn oars_astern_take_it_off_the_shelf() {
    let aground = sail(at_rest(FRAC_PI_2, 2), STILL, EAST, &Shelf, 60 * 90);
    let mut ship = aground;
    for _ in 0..3 {
        ship = sail(ship, Helm { climb: -1, ..STILL }, EAST, &Shelf, 1);
    }
    assert_eq!(ship.rung, -1);
    ship = sail(ship, STILL, EAST, &Shelf, 600);
    assert!(ship.x < aground.x - 5.0, "it backs off: {} from {}", ship.x, aground.x);
}

#[test]
fn the_ladder_climbs_from_astern_to_sail_and_no_further() {
    let climb =
        |ship: Ship, by: i8, hull: &Hull| step_ship(&ship, &Helm { climb: by, ..STILL }, hull, EAST, &Flat, 0.0, 0.0);
    let mut ship = at_rest(0.0, 0);
    ship = climb(climb(ship, -1, &SLOOP), -1, &SLOOP);
    assert_eq!(ship.rung, -1);
    for _ in 0..5 {
        ship = climb(ship, 1, &SLOOP);
    }
    assert_eq!(ship.rung, 2);
    let rowboat = Hull { sails: &[], ..SLOOP };
    assert_eq!(climb(climb(at_rest(0.0, 0), 1, &rowboat), 1, &rowboat).rung, 1);
}

#[test]
fn a_level_sea_holds_its_level() {
    let pose = pose_of(&at_rest(1.0, 0), &SLOOP, &Flat, 0.0);
    assert_eq!([pose.heave, pose.pitch, pose.roll], [0.0, 0.0, 0.0]);
    assert!(!pose.aground);
}

#[test]
fn a_tilted_sea_lifts_its_bow() {
    let pose = pose_of(&Ship { x: 10.0, ..at_rest(FRAC_PI_2, 0) }, &SLOOP, &Tilted, 0.0);
    assert!((pose.pitch - libm::atan(0.1)).abs() < 1e-9, "{}", pose.pitch);
    assert!(pose.roll.abs() < 1e-9 && (pose.heave - 1.0).abs() < 1e-9, "{pose:?}");
}

#[test]
fn a_tilted_sea_heels_it() {
    let pose = pose_of(&at_rest(0.0, 0), &SLOOP, &Tilted, 0.0);
    assert!((pose.roll + libm::atan(0.1)).abs() < 1e-9, "its starboard side is east and higher: {}", pose.roll);
    assert!(pose.pitch.abs() < 1e-9);
}

#[test]
fn a_turn_heels_the_ship_into_it() {
    let turning = Ship { ahead: 2.0, turn: 10.0, ..at_rest(0.0, 2) };
    let pose = pose_of(&turning, &SLOOP, &Flat, 0.0);
    assert!((pose.roll - 0.5_f64.to_radians()).abs() < 1e-12, "{}", pose.roll);
    let slow = Ship { ahead: 0.4, ..turning };
    assert_eq!(pose_of(&slow, &SLOOP, &Flat, 0.0).roll, 0.0);
}

#[test]
fn it_floats_up_a_river_mouth() {
    let ship = sail(Ship { x: -20.0, ..at_rest(FRAC_PI_2, 2) }, STILL, EAST, &Mouth, 60 * 30);
    assert!(ship.x > 20.0, "it sails into the river: {}", ship.x);
    assert!((pose_of(&ship, &SLOOP, &Mouth, 0.0).heave - 0.6).abs() < 1e-12);
}

#[test]
fn putting_to_sea_on_the_beach_is_aground() {
    assert!(pose_of(&Ship { x: 148.0, ..at_rest(0.0, 0) }, &SLOOP, &Shelf, 0.0).aground);
}

#[test]
fn an_hour_of_circles_keeps_its_heading_in_range() {
    let mut ship = at_rest(0.0, 1);
    for tick in 0..216_000 {
        ship = step_ship(&ship, &Helm { steer: 1.0, ..STILL }, &SLOOP, EAST, &Flat, 0.0, TICK_SECONDS);
        assert!((0.0..TAU).contains(&ship.heading), "tick {tick}: {}", ship.heading);
    }
}

#[test]
fn land_waters_read_the_sea_and_the_lakes() {
    use land::grid::Grid;
    use land::ground::{Ground, WaterAt};
    use land::relief::COAST_REACH_M;
    use land::sea::Swell;
    // Sea in the west three kilometres, a lake 2 m deep in a hollow at (5.5 km, 4.5 km), dry land round it.
    let mut ground_grid = Grid::new(9, 9, 0.0, 0.0, 1000.0);
    for (index, value) in ground_grid.data.iter_mut().enumerate() {
        let (i, j) = (index % 9, index / 9);
        *value = if i < 3 {
            -30.0
        } else if (i, j) == (5, 4) {
            8.0
        } else {
            20.0
        };
    }
    let lake_level: Vec<f64> = ground_grid.data.iter().map(|&height| if height == 8.0 { 10.0 } else { 0.0 }).collect();
    let coast =
        Grid { data: (0..81).map(|index| ((index % 9) as f64 - 2.5) * 1000.0).collect(), ..ground_grid.like(0.0) };
    let coast = Grid { data: coast.data.iter().map(|&distance| distance.min(COAST_REACH_M)).collect(), ..coast };
    let ground = Ground::new(&ground_grid, &coast, &lake_level, &[], &land::edits::Edits::default(), 1);
    let swell = Swell::default();
    let waters = LandWaters { ground: &ground, swell: &swell };
    let (sea, lake, dry) = ((500.0, 4500.0), (5500.0, 4500.0), (8500.0, 500.0));
    assert_eq!(ground.water_at(sea.0, sea.1), WaterAt::Sea);
    let time = 3.0;
    let spot = waters.at(sea.0, sea.1, time);
    assert_eq!(spot.bed, ground.height_at(sea.0, sea.1));
    assert_eq!(spot.surface, Some(swell.height_at(sea.0, sea.1, time, -spot.bed)));
    assert_ne!(spot.surface, Some(0.0), "the swell moves the sea");
    assert_eq!(waters.at(lake.0, lake.1, time).surface, Some(10.0));
    assert_eq!(waters.at(dry.0, dry.1, time).surface, None);
}

/// A shoal 0.3 m deep west of x = 0, deep water east of it.
struct Bank;
impl Waters for Bank {
    fn at(&self, x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: if x < 0.0 { -0.3 } else { -20.0 }, surface: Some(0.0) }
    }
}

fn step(ship: Ship, helm: Helm, hull: &Hull, waters: &impl Waters) -> Ship {
    step_ship(&ship, &helm, hull, EAST, waters, 0.0, TICK_SECONDS)
}

#[test]
fn a_ship_on_dry_land_cannot_row_further_up_it_but_may_row_off_it() {
    let beached = Ship { x: 200.0, ..at_rest(FRAC_PI_2, 1) };
    assert_eq!(sail(beached, STILL, EAST, &Shelf, 600).x, 200.0, "the land rises east: it is held");
    let astern = sail(Ship { rung: -1, ..beached }, STILL, EAST, &Shelf, 600);
    assert!(astern.x < 190.0, "backing west, the land falls away: {}", astern.x);
}

#[test]
fn a_swing_that_would_ground_its_stern_does_not_cost_its_way() {
    // Its stern's keel 2.5 mm off the shoal, so any swing to starboard would ground it.
    let heading: f64 = 0.003;
    let x = 0.8 * SLOOP.half_length_m * libm::sin(heading) + 0.0025;
    let ship = Ship { x, heading, ahead: 2.0, turn: 20.0, ..at_rest(0.0, 1) };
    let next = step(ship, Helm { steer: 1.0, ..STILL }, &SLOOP, &Bank);
    assert_eq!([next.ahead, next.heading, next.turn], [2.0, 0.003, 0.0], "it runs on, unswung");
    assert!(next.y < ship.y);
}

#[test]
fn struck_sails_slow_it_at_the_coast_times_its_gain() {
    let mut ship = full_way_north();
    for _ in 0..2 {
        ship = sail(ship, Helm { climb: -1, ..STILL }, EAST, &Flat, 1);
    }
    assert_eq!(ship.rung, 0);
    let next = step(ship, STILL, &SLOOP, &Flat);
    let rate = (ship.ahead - next.ahead) / TICK_SECONDS;
    assert!((rate - 0.2 * 3.0 * SLOOP.gain).abs() < 1e-9, "all its way is its canvas's: {rate}");
}

#[test]
fn its_canvas_share_of_way_follows_its_way() {
    let ship = full_way_north();
    assert!((ship.sail_way - ship.ahead).abs() < 1e-12, "{} of {}", ship.sail_way, ship.ahead);
    let struck =
        sail(sail(ship, Helm { climb: -1, ..STILL }, EAST, &Flat, 1), Helm { climb: -1, ..STILL }, EAST, &Flat, 60);
    assert!((struck.sail_way - struck.ahead).abs() < 1e-12 && struck.ahead < ship.ahead, "{struck:?}");
}

#[test]
fn a_hair_of_port_helm_at_north_keeps_its_heading_within_a_turn() {
    let next = step(at_rest(0.0, 1), Helm { steer: -1e-16, ..STILL }, &SLOOP, &Flat);
    assert!((0.0..TAU).contains(&next.heading), "{}", next.heading);
}

#[test]
fn a_hull_of_high_gain_runs_down_to_its_oars_at_its_faster_coast() {
    let galley = Hull { gain: 2.071, ..SLOOP };
    let ship = Ship { ahead: 3.0, sail_way: 3.0, ..at_rest(0.0, 1) };
    let rate = (ship.ahead - step(ship, STILL, &galley, &Flat).ahead) / TICK_SECONDS;
    assert!((rate - 0.2 * 3.0 * 2.071).abs() < 1e-9, "{rate}");
}

#[test]
fn let_go_its_oars_helm_eases_its_swing_at_the_sails_rate() {
    let ship = Ship { turn: 20.0, ..at_rest(0.0, 1) };
    let next = step(ship, STILL, &SLOOP, &Flat);
    assert!((next.turn - (20.0 - 5.0 * 2.4 / 60.0)).abs() < 1e-12, "{}", next.turn);
}

#[test]
fn land_waters_float_it_on_a_carved_river() {
    use land::grid::Grid;
    use land::ground::{Ground, WaterAt};
    use land::relief::COAST_REACH_M;
    use land::sea::Swell;
    // A slope 40 km across, all land, and a river carved across it 40 m wide and 4 m deep.
    let mut slope = Grid::new(40, 40, 0.0, 0.0, 1000.0);
    for (index, value) in slope.data.iter_mut().enumerate() {
        *value = 100.0 + 10.0 * (index % 40) as f64;
    }
    let river = r#"{ "strokes": [], "rivers": [{ "id": "river-1", "width_m": 40, "depth_m": 4,
        "points": [[30000, 20000], [5000, 20000]] }] }"#;
    let edits = land::edits::parse(river).unwrap();
    let ground = Ground::new(&slope, &slope.like(COAST_REACH_M), &vec![0.0; slope.data.len()], &[], &edits, 1);
    let swell = Swell::default();
    let waters = LandWaters { ground: &ground, swell: &swell };
    let WaterAt::River { surface } = ground.water_at(20_000.0, 20_000.0) else { panic!("water in the channel") };
    let spot = waters.at(20_000.0, 20_000.0, 7.0);
    assert_eq!(spot, Spot { bed: ground.height_at(20_000.0, 20_000.0), surface: Some(surface) });
    assert!(surface > spot.bed, "the river stands over its bed");
    assert_eq!(waters.at(20_000.0, 25_000.0, 7.0).surface, None, "the bank 5 km off is dry");
}

#[test]
fn a_pull_on_its_sails_or_oars_holds_it_to_its_share_of_its_way() {
    let mut ship = at_rest(0.0, 2);
    let torn = Pull { sail: 0.35, oars: 1.0, turn: 1.0 };
    for tick in 0..600 {
        ship = step_pulled(&ship, &STILL, &SLOOP, EAST, &Flat, f64::from(tick) * TICK_SECONDS, TICK_SECONDS, torn);
    }
    assert!((ship.ahead - 0.35 * way_under_sail(90.0)).abs() < 1e-9, "{}", ship.ahead);
    let mut rowed = at_rest(0.0, 1);
    let wrecked = Pull { sail: 0.0, oars: 0.35, turn: 1.0 };
    for tick in 0..600 {
        rowed = step_pulled(&rowed, &STILL, &SLOOP, EAST, &Flat, f64::from(tick) * TICK_SECONDS, TICK_SECONDS, wrecked);
    }
    assert!((rowed.ahead - 0.35 * HANDLING.move_speed_oar).abs() < 1e-9, "{}", rowed.ahead);
    let whole = Pull { sail: 1.0, oars: 1.0, turn: 1.0 };
    let once = step_pulled(&full_way_north(), &STILL, &SLOOP, EAST, &Flat, 10.0, TICK_SECONDS, whole);
    assert_eq!(once, step_ship(&full_way_north(), &STILL, &SLOOP, EAST, &Flat, 10.0, TICK_SECONDS));
}

#[test]
fn the_open_sea_is_the_swell_whole_as_it_rolls_over_any_sea_past_its_reach() {
    let swell = land::sea::Swell::default();
    let sea = crate::waters::OpenSea { swell: &swell };
    for (x, y, time) in [(0.0, 0.0, 0.0), (1234.5, -987.25, 77.7), (2.0e5, 3.0e5, 1.0e4)] {
        let spot = sea.at(x, y, time);
        let whole = swell.height_at(x, y, time, land::sea::FULL_DEPTH_M);
        assert_eq!(spot.surface.map(f64::to_bits), Some(whole.to_bits()), "the same water, to the bit");
        assert!(!crate::pose::shallower(&spot, SLOOP.draught_m), "nowhere aground");
    }
}

#[test]
fn the_weathers_wind_blows_its_way_held_inside_the_sailing_band() {
    use crate::helm::{WIND_RATED, WIND_SHARE};
    use crate::waters::{RATED_M_S, weather_wind};
    let rated = weather_wind([0.0, -RATED_M_S]);
    assert!(rated[0].abs() < 1e-12 && (rated[1] + WIND_RATED).abs() < 1e-12, "{rated:?}");
    let light = weather_wind([1.0, 0.0]);
    assert!((light[0] - WIND_RATED * WIND_SHARE[0]).abs() < 1e-12, "a calm's light air still sails it: {light:?}");
    let gale = weather_wind([-15.0, 20.0]);
    let strength = (gale[0] * gale[0] + gale[1] * gale[1]).sqrt();
    assert!((strength - WIND_RATED * WIND_SHARE[1]).abs() < 1e-12 && gale[0] < 0.0 && gale[1] > 0.0, "{gale:?}");
    assert_eq!(weather_wind([0.0, 0.0]), [0.0, 0.0]);
}

#[test]
fn a_bigger_hull_rides_the_swell_slower_and_still_water_holds_both_alike() {
    use crate::FRIGATE;
    use crate::pose::{LAG_S_PER_M, lag_of};
    use crate::waters::OpenSea;
    assert!((lag_of(&FRIGATE) / lag_of(&SLOOP) - FRIGATE.half_length_m / SLOOP.half_length_m).abs() < 1e-12);
    assert!((lag_of(&SLOOP) - LAG_S_PER_M * 2.0 * SLOOP.half_length_m).abs() < 1e-12);
    // The same hull lengths and beams, so only its inertia tells them apart.
    let slow = Hull { half_length_m: SLOOP.half_length_m * 4.0, ..SLOOP };
    let swell = land::sea::Swell::default();
    let sea = OpenSea { swell: &swell };
    let heave = |hull: &Hull| {
        (0..600)
            .map(|step| pose_of(&at_rest(0.3, 0), hull, &sea, f64::from(step) * 0.1).heave)
            .map(|h| h * h)
            .sum::<f64>()
    };
    assert!(heave(&slow) < heave(&SLOOP), "{} {}", heave(&slow), heave(&SLOOP));
    assert_eq!(Flat.lagged(3.0, 4.0, 5.0, 9.0), Flat.at(3.0, 4.0, 5.0));
}
