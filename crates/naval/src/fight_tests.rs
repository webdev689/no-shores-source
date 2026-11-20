use super::*;
use crate::arms::{PIRATE_SLOOP, SLOOP_ARMS};
use crate::ballistics::Ball;
use crate::captain::Temper;
use crate::damage::{Hurt, Zone};
use crate::gunnery::{Lay, lay, lay_on};
use crate::laying::Sighted;
use crate::shots::step_balls;
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const STILL: Helm = Helm { steer: 0.0, crab: false, climb: 0 };
const IDLE: Orders = Orders { helm: STILL, aim: None, fire: false, brace: false, load: None };

fn sloop_at(x: f64, y: f64) -> Ship {
    Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

fn player(fight: &Fight) -> &Vessel {
    fight.vessel(PLAYER).unwrap_or_else(|| panic!("the player's ship is in the fight"))
}

fn player_mut(fight: &mut Fight) -> &mut Vessel {
    fight.ships.get_mut(&PLAYER).unwrap_or_else(|| panic!("the player's ship is in the fight"))
}

fn captain(fight: &Fight) -> &Vessel {
    fight.vessel(CAPTAIN).unwrap_or_else(|| panic!("the captain is in the fight"))
}

fn captain_mut(fight: &mut Fight) -> &mut Vessel {
    fight.ships.get_mut(&CAPTAIN).unwrap_or_else(|| panic!("the captain is in the fight"))
}

fn her(fight: &Fight) -> &Captain {
    let Sailor::Captain(command) = &captain(fight).sailor else { panic!("a captain sails her") };
    &command.her
}

fn her_mut(fight: &mut Fight) -> &mut Captain {
    let Sailor::Captain(command) = &mut captain_mut(fight).sailor else { panic!("a captain sails her") };
    &mut command.her
}

fn begun(seed: u32) -> Fight {
    Fight::begin(sloop_at(0.0, 0.0), seed, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"))
}

/// A fight with the captain set `x` metres east of the player, still, heading north, of `temper`.
fn alongside(x: f64, temper: Temper) -> Fight {
    let mut fight = begun(1);
    captain_mut(&mut fight).ship = sloop_at(x, 0.0);
    her_mut(&mut fight).temper = temper;
    her_mut(&mut fight).cruise = 0.0;
    fight
}

fn run(fight: &mut Fight, orders: &Orders, ticks: u32) -> Vec<Event> {
    (0..ticks).flat_map(|tick| fight.step(&[(PLAYER, *orders)], &Open, &|_| WIND, f64::from(tick) * TICK_SECONDS)).collect()
}

#[test]
fn a_captain_is_put_to_sea_on_the_ring_round_the_player() {
    for seed in 1..50 {
        let fight = begun(seed);
        let her = captain(&fight).ship;
        let out = (her.x * her.x + her.y * her.y).sqrt();
        assert!((SPAWN_RING[0]..=SPAWN_RING[1]).contains(&out), "{seed}: {out}");
        assert!((0.0..TAU).contains(&her.heading));
    }
}

#[test]
fn with_no_water_to_float_her_no_captain_comes() {
    struct Dry;
    impl Waters for Dry {
        fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
            Spot { bed: 5.0, surface: None }
        }
    }
    assert!(Fight::begin(sloop_at(0.0, 0.0), 1, &Dry, 0.0).is_err());
}

#[test]
fn a_fight_is_the_same_every_time_it_is_fought() {
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 60.0, ray: None }), fire: true, ..IDLE };
    let fought = || {
        let mut fight = alongside(60.0, Temper::Bold);
        run(&mut fight, &IDLE, 60);
        run(&mut fight, &fire, 1);
        run(&mut fight, &IDLE, 600);
        fight.numbers()
    };
    let once = fought();
    assert_eq!(
        once.iter().map(|number| number.to_bits()).collect::<Vec<_>>(),
        fought().iter().map(|number| number.to_bits()).collect::<Vec<_>>()
    );
}

#[test]
fn a_broadside_laid_on_her_strikes_her() {
    let mut fight = alongside(50.0, Temper::Wary);
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 50.0, ray: None }), fire: true, ..IDLE };
    let mut events = run(&mut fight, &fire, 1);
    events.extend(run(&mut fight, &IDLE, 120));
    let muzzles =
        events.iter().filter(|event| matches!(event, Event::Shot(ShotEvent::Muzzle { shooter: PLAYER, .. }))).count();
    assert_eq!(muzzles, 3, "three guns, rippled");
    let hits =
        events.iter().filter(|event| matches!(event, Event::Shot(ShotEvent::Hit { target: CAPTAIN, .. }))).count();
    assert!(hits >= 1, "{events:?}");
    assert!(captain(&fight).damage.hull < PIRATE_SLOOP.hull);
    assert!(her(&fight).hostile_to(PLAYER), "struck, she is provoked");
}

#[test]
fn a_release_the_guns_cannot_answer_is_refused_with_its_reason() {
    let mut fight = alongside(50.0, Temper::Wary);
    let fire =
        |bearing_deg: f64| Orders { aim: Some(Aim { bearing_deg, range_m: 50.0, ray: None }), fire: true, ..IDLE };
    let refusals = |events: Vec<Event>| {
        events
            .into_iter()
            .filter_map(|event| match event {
                Event::Refused { ship: PLAYER, refusal } => Some(refusal),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(refusals(run(&mut fight, &fire(10.0), 1)), [Refusal::NoGuns]);
    run(&mut fight, &fire(90.0), 1);
    let again = refusals(run(&mut fight, &fire(90.0), 1));
    assert!(matches!(again[..], [Refusal::Reloading { side: Side::Starboard, left }] if left > 5.0), "{again:?}");
    let braced = Orders { brace: true, ..fire(-90.0) };
    assert_eq!(refusals(run(&mut fight, &braced, 1)), [Refusal::Braced]);
    let clock = fight.clock;
    player_mut(&mut fight).damage.apply(Hurt { hull: 300.0, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    assert_eq!(refusals(run(&mut fight, &fire(-90.0), 1)), [Refusal::Silent]);
}

#[test]
fn a_bold_captain_runs_out_her_guns_and_fires_on_the_player() {
    let mut fight = alongside(80.0, Temper::Bold);
    let events = run(&mut fight, &IDLE, 60 * 30);
    assert!(events.iter().any(|event| matches!(event, Event::RunOut { .. })), "the tell");
    let fired =
        events.iter().filter(|event| matches!(event, Event::Shot(ShotEvent::Muzzle { shooter: CAPTAIN, .. }))).count();
    assert!(fired >= 3, "{fired}");
}

#[test]
fn bare_yards_or_a_wreck_set_no_sail() {
    let mut fight = alongside(500.0, Temper::Wary);
    player_mut(&mut fight).damage.apply(Hurt { hull: 0.0, sail: 96.0, crew: 0.0, fire: false }, 0.0, 0.0);
    player_mut(&mut fight).ship.rung = 1;
    let climb = Orders { helm: Helm { climb: 1, ..STILL }, ..IDLE };
    let events = run(&mut fight, &climb, 1);
    assert!(events.contains(&Event::NoSail { ship: PLAYER, wrecked: false }));
    assert_eq!(player(&fight).ship.rung, 1);
}

#[test]
fn the_fight_ends_when_she_has_sunk_or_sailed_off_out_of_it() {
    let mut fight = alongside(60.0, Temper::Wary);
    captain_mut(&mut fight).damage.apply(Hurt { hull: 400.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let events = run(&mut fight, &IDLE, 60 * 23);
    assert_eq!(fight.over(), Some(End::Sunk));
    assert!(events.contains(&Event::Gone { ship: CAPTAIN, end: End::Sunk }));
    let mut far = alongside(1950.0, Temper::Wary);
    run(&mut far, &IDLE, 1);
    assert_eq!(far.over(), Some(End::Gone));
}

#[test]
fn the_rest_of_the_volley_that_made_her_strike_cannot_sink_her() {
    let mut fight = alongside(60.0, Temper::Wary);
    captain_mut(&mut fight).damage.apply(Hurt { hull: 190.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    let gun = crate::guns::SWIVEL;
    let mut events = Vec::new();
    // 74 of 264 left: a ball of 12 to 16 makes her strike, and the next ball of the volley would sink her.
    let hit = |hull: f64| ShotEvent::Hit {
        shooter: PLAYER,
        target: CAPTAIN,
        zone: Zone::Holed,
        point: [0.0; 3],
        flight: 0.5,
        gun: crate::guns::Gun { hull, ..gun },
        shot: Shot::Round,
    };
    fight.strike(&hit(10.0), &mut events);
    assert_eq!(captain(&fight).damage.state, State::Struck);
    fight.strike(&hit(100.0), &mut events);
    assert_eq!((captain(&fight).damage.state, captain(&fight).damage.hull), (State::Struck, 1.0));
}

#[test]
fn a_look_lays_its_range_out_from_her_middle() {
    let fight = alongside(500.0, Temper::Wary);
    let aim = Aim { bearing_deg: 90.0, range_m: 60.0, ray: None };
    let laid = fight.laid(PLAYER, &aim).map_or(f64::NAN, |lay| lay.elevation);
    let own = player(&fight);
    let out = SLOOP_ARMS.battery(Side::Starboard)[1][1];
    let from_guns = lay(&own.ship, &own.pose, &SLOOP_ARMS, Side::Starboard, Shot::Round, 60.0 - out, None);
    assert!((laid - from_guns.elevation).abs() < 1e-3, "her guns stand {out} m out from her middle");
}

#[test]
fn the_lay_reads_on_target_only_where_its_balls_would_strike_her() {
    let fight = alongside(50.0, Temper::Wary);
    let on = |range_m: f64| {
        let laid = fight.laid(PLAYER, &Aim { bearing_deg: 90.0, range_m, ray: None });
        laid.is_some_and(|laid| {
            fight.ends(PLAYER, &laid, &Open, 0.0).iter().flatten().any(|stop| stop.strike.is_some())
        })
    };
    assert!(on(50.0));
    assert!(!on(44.0), "the balls splash short of her");
    assert!(!on(30.0));
}

/// A look from the player's starboard aim eye toward `at`, its water range far past her.
fn looked(fight: &Fight, at: [f64; 3]) -> Aim {
    let eye = [5.1, 3.0, player(fight).pose.heave + 5.5];
    Aim { bearing_deg: 90.0, range_m: 300.0, ray: Some([eye, [0, 1, 2].map(|axis| at[axis] - eye[axis])]) }
}

#[test]
fn a_look_on_her_hull_lays_on_that_point_and_its_unscattered_volley_strikes_her() {
    let fight = alongside(50.0, Temper::Wary);
    let hull = Sighted::of(CAPTAIN, captain(&fight)).target().hull;
    let aim = looked(&fight, hull.centre);
    let [eye, look] = aim.ray.unwrap_or_default();
    let length = (look[0] * look[0] + look[1] * look[1] + look[2] * look[2]).sqrt();
    let far = [0, 1, 2].map(|axis| eye[axis] + look[axis] / length * 400.0);
    let share = crate::ballistics::segment_entry(eye, far, &hull, 0.0).unwrap_or(f64::NAN);
    let met = [0, 1, 2].map(|axis| eye[axis] + (far[axis] - eye[axis]) * share);
    let own = player(&fight);
    let on = lay_on(&own.ship, &own.pose, &SLOOP_ARMS, Side::Starboard, Shot::Round, met);
    let laid = fight.laid(PLAYER, &aim);
    // The look's point and the test's differ in their last bits, so the elevation is held to a hair of it.
    let same = laid.is_some_and(|laid| {
        (laid.elevation - on.elevation).abs() < 1e-12 && Lay { elevation: on.elevation, ..laid } == on
    });
    assert!(same, "laid for the point the look meets on her side, not the water's 300 m: {laid:?} against {on:?}");
    let ends = laid.map(|laid| fight.ends(PLAYER, &laid, &Open, 0.0)).unwrap_or_default();
    assert_eq!(ends.len(), 3);
    assert!(ends.iter().all(|end| end.is_some_and(|stop| stop.strike.is_some() && !stop.water)), "{ends:?}");
}

#[test]
fn a_look_past_her_lays_for_the_water() {
    let fight = alongside(50.0, Temper::Wary);
    let aim = looked(&fight, [50.0, -60.0, 0.0]);
    assert_eq!(fight.laid(PLAYER, &aim), fight.laid(PLAYER, &Aim { ray: None, ..aim }));
}

#[test]
fn each_gun_ends_where_an_unscattered_ball_fired_by_the_fight_stops() {
    let fight = alongside(50.0, Temper::Wary);
    for range_m in [50.0, 30.0] {
        let Some(laid) = fight.laid(PLAYER, &Aim { bearing_deg: 90.0, range_m, ray: None }) else {
            panic!("the starboard side bears");
        };
        let ends = fight.ends(PLAYER, &laid, &Open, 0.0);
        let carry = carry_of(&player(&fight).ship);
        let mut balls: Vec<Ball> =
            (0..3).map(|index| crate::gunnery::aimed(&laid, index, carry, 0.0, (PLAYER, Flag::Player))).collect();
        let targets = fight.targets();
        let mut stops = Vec::new();
        for tick in 1..=600 {
            for event in step_balls(&mut balls, f64::from(tick) * TICK_SECONDS, &targets, &Open, 0.0) {
                match event {
                    ShotEvent::Hit { zone, point, .. } if zone != Zone::Rig => stops.push((point, false)),
                    ShotEvent::Splash { point, .. } => stops.push((point, true)),
                    _ => {}
                }
            }
        }
        assert_eq!(stops.len(), 3, "{range_m}: {stops:?}");
        for (end, (point, water)) in ends.iter().zip(stops) {
            let Some(end) = end else { panic!("{range_m}: every ball stops") };
            let apart = (0..3)
                .map(|axis| (end.point[axis] - point[axis]) * (end.point[axis] - point[axis]))
                .sum::<f64>()
                .sqrt();
            assert!(apart < 0.1 && end.water == water, "{range_m}: {end:?} against {point:?}");
        }
    }
}

/// Deep water, but a headland of dry land from x = 100 to 220 m, 160 m from north to south.
struct Headland;

impl Waters for Headland {
    fn at(&self, x: f64, y: f64, _time: f64) -> Spot {
        if (100.0..=220.0).contains(&x) && y.abs() <= 80.0 {
            Spot { bed: 5.0, surface: None }
        } else {
            Spot { bed: -40.0, surface: Some(0.0) }
        }
    }
}

#[test]
fn a_captain_sails_round_land_that_lies_between_her_and_the_player() {
    let mut fight = begun(1);
    captain_mut(&mut fight).ship = Ship { heading: 1.5 * std::f64::consts::PI, ..sloop_at(400.0, 0.0) };
    her_mut(&mut fight).temper = Temper::Bold;
    let mut closest = f64::INFINITY;
    // Head to wind she rows (her oars beat her canvas there), so give her five minutes.
    for tick in 0..60 * 300 {
        fight.step(&[(PLAYER, IDLE)], &Headland, &|_| WIND, f64::from(tick) * TICK_SECONDS);
        let ship = captain(&fight).ship;
        closest = closest.min((ship.x * ship.x + ship.y * ship.y).sqrt());
    }
    assert!(closest < 120.0, "she never came round the headland: {closest}");
}

#[test]
fn a_wreck_does_not_mend_while_a_pirate_who_would_take_her_lies_near() {
    let mut fight = alongside(60.0, Temper::Bold);
    player_mut(&mut fight).damage.apply(Hurt { hull: 300.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    run(&mut fight, &IDLE, 60 * 60);
    let her = captain(&fight).ship;
    let apart = (her.x * her.x + her.y * her.y).sqrt();
    assert!(apart < HOSTILE_NEAR_M, "{apart}");
    assert_eq!(player(&fight).damage.hull, 0.0, "a bold pirate within 700 m would take her: her hands stand by");
}

#[test]
fn a_captain_her_fires_made_strike_is_graced_against_the_volley_then_aloft() {
    let mut fight = alongside(60.0, Temper::Wary);
    captain_mut(&mut fight).damage.apply(Hurt { hull: 197.0, sail: 0.0, crew: 0.0, fire: true }, 0.0, 0.0);
    for _ in 0..120 {
        run(&mut fight, &IDLE, 1);
        if captain(&fight).damage.state == State::Struck {
            break;
        }
    }
    assert_eq!(captain(&fight).damage.state, State::Struck);
    let hit = ShotEvent::Hit {
        shooter: PLAYER,
        target: CAPTAIN,
        zone: Zone::Holed,
        point: [0.0; 3],
        flight: 0.5,
        gun: crate::guns::Gun { hull: 100.0, ..crate::guns::SWIVEL },
        shot: Shot::Round,
    };
    let mut events = Vec::new();
    fight.strike(&hit, &mut events);
    assert_eq!((captain(&fight).damage.state, captain(&fight).damage.hull), (State::Struck, 1.0));
}
