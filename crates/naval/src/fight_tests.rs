use super::*;
use crate::captain::Temper;
use crate::damage::Hurt;
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

fn begun(seed: u32) -> Fight {
    Fight::begin(sloop_at(0.0, 0.0), seed, &Open, 0.0).unwrap_or_else(|error| panic!("{error}"))
}

/// A fight with the captain set `x` metres east of the player, still, heading north, of `temper`.
fn alongside(x: f64, temper: Temper) -> Fight {
    let mut fight = begun(1);
    fight.captain.ship = sloop_at(x, 0.0);
    fight.her.temper = temper;
    fight.her.cruise = 0.0;
    fight
}

fn run(fight: &mut Fight, orders: &Orders, ticks: u32) -> Vec<Event> {
    (0..ticks).flat_map(|tick| fight.step(orders, &Open, WIND, f64::from(tick) * TICK_SECONDS)).collect()
}

#[test]
fn a_captain_is_put_to_sea_on_the_ring_round_the_player() {
    for seed in 1..50 {
        let fight = begun(seed);
        let out = (fight.captain.ship.x * fight.captain.ship.x + fight.captain.ship.y * fight.captain.ship.y).sqrt();
        assert!((SPAWN_RING[0]..=SPAWN_RING[1]).contains(&out), "{seed}: {out}");
        assert!((0.0..TAU).contains(&fight.captain.ship.heading));
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
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 60.0 }), fire: true, ..IDLE };
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
    let fire = Orders { aim: Some(Aim { bearing_deg: 90.0, range_m: 50.0 }), fire: true, ..IDLE };
    let mut events = run(&mut fight, &fire, 1);
    events.extend(run(&mut fight, &IDLE, 120));
    let muzzles =
        events.iter().filter(|event| matches!(event, Event::Shot(ShotEvent::Muzzle { shooter: PLAYER, .. }))).count();
    assert_eq!(muzzles, 3, "three guns, rippled");
    let hits =
        events.iter().filter(|event| matches!(event, Event::Shot(ShotEvent::Hit { target: CAPTAIN, .. }))).count();
    assert!(hits >= 1, "{events:?}");
    assert!(fight.captain.damage.hull < PIRATE_SLOOP.hull);
    assert!(fight.her.hostile(), "struck, she is provoked");
}

#[test]
fn a_release_the_guns_cannot_answer_is_refused_with_its_reason() {
    let mut fight = alongside(50.0, Temper::Wary);
    let fire = |bearing_deg: f64| Orders { aim: Some(Aim { bearing_deg, range_m: 50.0 }), fire: true, ..IDLE };
    let refusals = |events: Vec<Event>| {
        events
            .into_iter()
            .filter_map(|event| match event {
                Event::Refused(why) => Some(why),
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
    fight.player.damage.apply(Hurt { hull: 300.0, sail: 0.0, crew: 0.0, fire: false }, fight.clock, 0.0);
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
    fight.player.damage.apply(Hurt { hull: 0.0, sail: 96.0, crew: 0.0, fire: false }, 0.0, 0.0);
    fight.player.ship.rung = 1;
    let climb = Orders { helm: Helm { climb: 1, ..STILL }, ..IDLE };
    let events = run(&mut fight, &climb, 1);
    assert!(events.contains(&Event::NoSail { wrecked: false }));
    assert_eq!(fight.player.ship.rung, 1);
}

#[test]
fn the_fight_ends_when_she_has_sunk_or_sailed_off_out_of_it() {
    let mut fight = alongside(60.0, Temper::Wary);
    fight.captain.damage.apply(Hurt { hull: 400.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    run(&mut fight, &IDLE, 60 * 23);
    assert_eq!(fight.over, Some(End::Sunk));
    let mut far = alongside(1950.0, Temper::Wary);
    run(&mut far, &IDLE, 1);
    assert_eq!(far.over, Some(End::Gone));
}

#[test]
fn the_rest_of_the_volley_that_made_her_strike_cannot_sink_her() {
    let mut fight = alongside(60.0, Temper::Wary);
    fight.captain.damage.apply(Hurt { hull: 190.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
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
    assert_eq!(fight.captain.damage.state, State::Struck);
    fight.strike(&hit(100.0), &mut events);
    assert_eq!((fight.captain.damage.state, fight.captain.damage.hull), (State::Struck, 1.0));
}
