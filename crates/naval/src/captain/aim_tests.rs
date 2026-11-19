use super::*;
use crate::arms::{PIRATE_SLOOP, SLOOP_ARMS, Side};
use crate::gunnery::Guns;
use crate::random::Mulberry32;
use sailing::pose::Pose;
use sailing::ship::Ship;

const LEVEL: Pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };

fn heading_north() -> Ship {
    Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 2 }
}

/// A still target `range` metres east of her: abeam to starboard, lying north-south.
fn target_east(range: f64) -> Mark {
    Mark {
        place: [range, 0.0],
        heading: Some(0.0),
        velocity: [0.0, 0.0],
        smoothed: [0.0, 0.0],
        level: 0.0,
        arms: &SLOOP_ARMS,
    }
}

struct Deck {
    run: RunOut,
    guns: Guns,
    draws: Mulberry32,
}

impl Deck {
    fn new() -> Self {
        Self { run: RunOut::new(), guns: Guns::new(), draws: Mulberry32::new(3) }
    }

    fn step(&mut self, clock: f64, mark: &Mark) -> Battery {
        let ship = heading_north();
        let at = Aboard {
            ship: &ship,
            pose: &LEVEL,
            arms: &SLOOP_ARMS,
            guns: &self.guns,
            build: &PIRATE_SLOOP,
            aim_error: 1.0,
        };
        captain_guns(&mut self.run, &at, mark, clock, &mut self.draws)
    }
}

#[test]
fn the_window_narrows_with_range_and_her_gunners_skill() {
    let window = |range: f64, skill: f64| fire_window([0.0, 0.0], [range, 0.0], Some(0.0), &SLOOP_ARMS, skill);
    assert!(window(40.0, 0.45) > window(120.0, 0.45));
    assert!(window(120.0, 0.25) >= window(120.0, 0.75));
    assert!(window(10.0, 0.45) <= BEAR_DEG);
    assert!(window(5000.0, 0.45) >= SWIVEL.yaw_spread_deg * 1.05 - 1e-12, "never under her scatter");
}

#[test]
fn a_loaded_side_bearing_in_reach_runs_out_then_fires_no_sooner_than_the_tell() {
    let mut deck = Deck::new();
    let mark = target_east(60.0);
    let first = deck.step(0.0, &mark);
    assert_eq!((first.run_out, first.fire.is_some()), (Some(Side::Starboard), false));
    assert!(deck.step(1.0, &mark).fire.is_none(), "within the tell's 1.3 s");
    let fired = deck.step(1.4, &mark);
    let lay = fired.fire.map(|lay| lay.side);
    assert_eq!(lay, Some(Side::Starboard));
    assert!(deck.run.out(Side::Starboard).is_none(), "fired, her side is run in");
}

#[test]
fn an_unloaded_side_a_mark_out_of_reach_or_off_her_beam_runs_nothing_out() {
    let mut deck = Deck::new();
    deck.guns.fired(Side::Starboard, 1.0, true);
    assert_eq!(deck.step(0.0, &target_east(60.0)).run_out, None, "loading");
    let mut far = Deck::new();
    assert_eq!(far.step(0.0, &target_east(400.0)).run_out, None, "out of reach");
    let mut ahead = Deck::new();
    let dead_ahead = Mark { place: [0.0, -60.0], ..target_east(60.0) };
    assert_eq!(ahead.step(0.0, &dead_ahead).run_out, None, "dead ahead, off her beam");
}

#[test]
fn a_side_run_out_too_long_unfired_is_run_in_and_waits() {
    let mut deck = Deck::new();
    let mark = target_east(60.0);
    deck.step(0.0, &mark);
    // The mark slips off her beam before the tell is out.
    let slipped = Mark { place: [10.0, -60.0], ..mark };
    let after = deck.step(0.5, &slipped);
    assert!(after.fire.is_none() && deck.run.out(Side::Starboard).is_none(), "past 45 degrees she runs in");
    assert_eq!(deck.step(1.0, &mark).run_out, None, "run in within 2 s, she waits");
    assert_eq!(deck.step(2.6, &mark).run_out, Some(Side::Starboard));
}

#[test]
fn her_lay_is_long_or_short_by_her_crews_error() {
    let ship = heading_north();
    let true_lay = |share: f64| {
        crate::gunnery::lay_on(
            &ship,
            &LEVEL,
            &SLOOP_ARMS,
            Side::Starboard,
            crate::guns::Shot::Round,
            [60.0 * share, 0.0, SLOOP_ARMS.hull[1][2] * AIM_FREEBOARD],
        )
    };
    let most = 0.45 * (1.0 - PIRATE_SLOOP.skill);
    for seed in 1..40 {
        let mut deck = Deck { draws: Mulberry32::new(seed), ..Deck::new() };
        deck.step(0.0, &target_east(60.0));
        let lay = deck.step(1.4, &target_east(60.0)).fire.map_or(0.0, |lay| lay.elevation);
        assert!(lay >= true_lay(1.0 - most).elevation - 1e-9 && lay <= true_lay(1.0 + most).elevation + 1e-9, "{seed}");
    }
}

#[test]
fn a_lay_passes_where_its_middle_gun_comes_abreast_of_the_mark_within_her_height() {
    let ship = heading_north();
    let lay = crate::gunnery::lay_on(
        &ship,
        &LEVEL,
        &SLOOP_ARMS,
        Side::Starboard,
        crate::guns::Shot::Round,
        [60.0, 0.0, SLOOP_ARMS.hull[1][2] * AIM_FREEBOARD],
    );
    let top = SLOOP_ARMS.hull[1][2];
    assert!(lay_passes(&lay, [0.0; 3], [60.0, 0.0], [0.0, top]));
    assert!(!lay_passes(&lay, [0.0; 3], [60.0, 0.0], [top + 2.0, top + 3.0]));
    assert!(!lay_passes(&lay, [0.0; 3], [-60.0, 0.0], [0.0, top]), "behind her guns");
}

#[test]
fn her_dead_zone_alongside_a_sloop_is_a_few_metres() {
    let zone = dead_zone(&SLOOP_ARMS);
    assert!((1.0..10.0).contains(&zone), "{zone}");
}

#[test]
fn whether_a_mark_bears_soon_is_read_from_its_smoothed_way() {
    // 20 degrees forward of her beam and still, but its way smoothed over the last second sweeps it aft fast.
    let mark = Mark { place: [60.0, -21.84], smoothed: [0.0, 30.0], ..target_east(60.0) };
    let mut deck = Deck::new();
    assert_eq!(deck.step(0.0, &mark).run_out, Some(Side::Starboard));
}
