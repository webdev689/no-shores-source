use super::*;
use crate::arms::{Build, SLOOP_ARMS, Side, TITHE_SLOOP};
use crate::gunnery::Guns;
use crate::random::Mulberry32;
use sailing::pose::Pose;
use sailing::ship::Ship;

const LEVEL: Pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };

fn heading_north() -> Ship {
    Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 2 }
}

/// A still target `range` metres east of it: abeam to starboard, lying north-south.
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
            build: &TITHE_SLOOP,
            aim_error: 1.0,
        };
        captain_guns(&mut self.run, &at, mark, clock, &mut self.draws)
    }
}

#[test]
fn the_window_narrows_with_range_and_its_gunners_skill() {
    let window = |range: f64, skill: f64| fire_window([0.0, 0.0], [range, 0.0], Some(0.0), &SLOOP_ARMS, skill);
    assert!(window(40.0, 0.45) > window(120.0, 0.45));
    assert!(window(120.0, 0.25) >= window(120.0, 0.75));
    assert!(window(10.0, 0.45) <= BEAR_DEG);
    assert!(window(5000.0, 0.45) >= SWIVEL.yaw_spread_deg * 1.05 - 1e-12, "never under its scatter");
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
    assert!(deck.run.out(Side::Starboard).is_none(), "fired, its side is run in");
}

#[test]
fn an_unloaded_side_a_mark_out_of_reach_or_off_its_beam_runs_nothing_out() {
    let mut deck = Deck::new();
    deck.guns.fired(Side::Starboard, 1.0, true);
    assert_eq!(deck.step(0.0, &target_east(60.0)).run_out, None, "loading");
    let mut far = Deck::new();
    assert_eq!(far.step(0.0, &target_east(400.0)).run_out, None, "out of reach");
    let mut ahead = Deck::new();
    let dead_ahead = Mark { place: [0.0, -60.0], ..target_east(60.0) };
    assert_eq!(ahead.step(0.0, &dead_ahead).run_out, None, "dead ahead, off its beam");
}

#[test]
fn a_side_run_out_too_long_unfired_is_run_in_and_waits() {
    let mut deck = Deck::new();
    let mark = target_east(60.0);
    deck.step(0.0, &mark);
    // The mark slips off its beam before the tell is out.
    let slipped = Mark { place: [10.0, -60.0], ..mark };
    let after = deck.step(0.5, &slipped);
    assert!(after.fire.is_none() && deck.run.out(Side::Starboard).is_none(), "past 45 degrees it runs in");
    assert_eq!(deck.step(1.0, &mark).run_out, None, "run in within 2 s, it waits");
    assert_eq!(deck.step(2.6, &mark).run_out, Some(Side::Starboard));
}

#[test]
fn its_lay_is_long_or_short_by_its_crews_error() {
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
    let most = 0.45 * (1.0 - TITHE_SLOOP.skill);
    // Laid long or short by up to `most` of the range, then misjudged up or down by up to its elevation's error.
    let tilt = JUDGE_ELEVATION_DEG * DEG * (1.0 - TITHE_SLOOP.skill);
    for seed in 1..40 {
        let mut deck = Deck { draws: Mulberry32::new(seed), ..Deck::new() };
        deck.step(0.0, &target_east(60.0));
        let lay = deck.step(1.4, &target_east(60.0)).fire.map_or(0.0, |lay| lay.elevation);
        let [low, high] = [true_lay(1.0 - most).elevation - tilt, true_lay(1.0 + most).elevation + tilt];
        assert!(lay >= low - 1e-9 && lay <= high + 1e-9, "{seed}");
    }
}

#[test]
fn a_volley_flies_as_far_across_its_mark_as_its_gunners_misjudge_it_within_its_bearing() {
    // Square off its beam is due east; each volley flies off it by as much as its gunners misjudge the mark across
    // their line, but never more than 13 degrees off its beam (10.6 m at 60 m off, a Sloop's half length abeam).
    let (mut wide, mut held) = (0, 0);
    for seed in 1..60 {
        let mut deck = Deck { draws: Mulberry32::new(seed), ..Deck::new() };
        deck.step(0.0, &target_east(60.0));
        let judged = deck.run.judged[Side::Starboard.index()].across_m;
        let Some(lay) = deck.step(1.4, &target_east(60.0)).fire else { panic!("seed {seed} fires") };
        let off = libm::atan2(lay.dir[1], lay.dir[0]) / DEG;
        assert!(off.abs() <= BEAR_DEG + 1e-9, "{seed}: {off} degrees off its beam");
        let across = 60.0 * lay.dir[1] / lay.dir[0];
        let most = 60.0 * libm::tan(BEAR_DEG * DEG);
        assert!((across - judged.clamp(-most, most)).abs() < 1e-6, "{seed}: {across} m across, judged {judged}");
        wide += u32::from(across.abs() > 10.6);
        held += u32::from(off.abs() >= BEAR_DEG - 1e-9);
    }
    assert!((5..40).contains(&wide) && held > 0, "{wide} of 59 volleys pass wide of a Sloop abeam, {held} at 13°");
}

#[test]
fn a_better_crew_and_a_higher_rank_misjudge_less() {
    let widest = |skill: f64, aim_error: f64| {
        let mut draws = Mulberry32::new(9);
        (0..400).map(|_| Judgement::drawn(skill, aim_error, &mut draws).across_m.abs()).fold(0.0, f64::max)
    };
    assert!(widest(0.45, 0.6) < widest(0.45, 1.0) && widest(0.75, 1.0) < widest(0.45, 1.0));
    assert!(widest(0.45, 1.0) <= JUDGE_ACROSS_M * 0.55 + 1e-9 && widest(1.0, 1.0) == 0.0);
}

#[test]
fn its_gunners_lead_a_mark_by_its_way_as_they_last_saw_it() {
    // A mark that has just come about, closing on it now, its way smoothed still opening the range: laid where that
    // way would carry it, farther than it will be. Gunners of whole skill misjudge nothing else.
    let mark = Mark { velocity: [-5.0, 0.0], smoothed: [5.0, 0.0], ..target_east(60.0) };
    let ship = heading_north();
    let sure = Build { skill: 1.0, ..TITHE_SLOOP };
    let mut run = RunOut::new();
    let guns = Guns::new();
    let mut draws = Mulberry32::new(3);
    let at = Aboard { ship: &ship, pose: &LEVEL, arms: &SLOOP_ARMS, guns: &guns, build: &sure, aim_error: 1.0 };
    captain_guns(&mut run, &at, &mark, 0.0, &mut draws);
    let Some(lay) = captain_guns(&mut run, &at, &mark, 1.4, &mut draws).fire else { panic!("it fires") };
    let laid_on = |velocity: [f64; 2]| {
        let lead = lead_point([0.0, 0.0], mark.place, velocity, lay.gun.speed);
        let target = [lead[0], lead[1], SLOOP_ARMS.hull[1][2] * AIM_FREEBOARD];
        crate::gunnery::lay_on(&ship, &LEVEL, &SLOOP_ARMS, Side::Starboard, crate::guns::Shot::Round, target).elevation
    };
    assert!((lay.elevation - laid_on(mark.smoothed)).abs() < 1e-9, "laid on its old way");
    assert!(lay.elevation > laid_on(mark.velocity) + 1e-4, "farther than its true way would lay");
}

#[test]
fn a_misjudged_elevation_never_passes_what_its_carriage_raises_to() {
    // Laid near its longest throw, the gunners' misjudgement upward is held at the carriage's highest.
    let far = target_east(145.0);
    let mut held = 0;
    for seed in 1..40 {
        let mut deck = Deck { draws: Mulberry32::new(seed), ..Deck::new() };
        deck.step(0.0, &far);
        if let Some(lay) = deck.step(1.4, &far).fire {
            assert!(lay.elevation <= lay.gun.max_el_deg * DEG + 1e-12, "{seed}: {}", lay.elevation);
            held += u32::from((lay.elevation - lay.gun.max_el_deg * DEG).abs() < 1e-12);
        }
    }
    assert!(held > 0, "some volleys laid at the carriage's highest");
}

#[test]
fn a_lay_passes_where_its_middle_gun_comes_abreast_of_the_mark_within_its_height() {
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
    assert!(!lay_passes(&lay, [0.0; 3], [-60.0, 0.0], [0.0, top]), "behind its guns");
}

#[test]
fn its_dead_zone_alongside_a_sloop_is_a_few_metres() {
    let zone = dead_zone(&SLOOP_ARMS);
    assert!((1.0..10.0).contains(&zone), "{zone}");
}

#[test]
fn whether_a_mark_bears_soon_is_read_from_its_smoothed_way() {
    // Still now, but its way smoothed over the last second sweeps it aft fast: led by that way to 20 degrees forward
    // of its beam, and coming on aft.
    let mark = Mark { place: [60.0, -57.8], smoothed: [0.0, 30.0], ..target_east(60.0) };
    let mut deck = Deck::new();
    assert_eq!(deck.step(0.0, &mark).run_out, Some(Side::Starboard));
}
