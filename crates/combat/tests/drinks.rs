//! Healing charges: a drink pressed from rest on the ground heals 40% of the player's most health as it ends, never
//! past the most, spending its charge; none without a charge, at full health, on horseback or in the air, and never a
//! foe's. It walks, never runs. A blow that lands cuts it short with the charge kept; a dodge does not leave it, but
//! one pressed in its last ticks hops as it ends. And the meter: each whole one filled is a charge, none past three.

mod common;

use combat::drink::recharged;
use combat::fighter::{Action, Attack, Swing};
use combat::judge::{suffer, swing_blow};
use combat::tuning::{CHARGES, DRINK_TICKS};
use combat::{CombatInput, Fighter, Happening, Intent, Stroke, judge};
use common::{foe_at, idle, player_at, run, script};
use core::f64::consts::PI;
use movement::{Controls, Mode};

const HEAL: CombatInput = CombatInput {
    attack: None,
    guard: false,
    dodge: false,
    shoot: false,
    pitch: 0.0,
    aim: false,
    mark: None,
    heal: true,
    telegraph: None,
};

fn wounded(health: f64) -> Fighter {
    Fighter { health, ..player_at(0.0, 0.0) }
}

/// A press of the drink, then `ticks` more ticks at rest.
fn drinking(fighter: Fighter, ticks: usize) -> (Fighter, Vec<(usize, Happening)>) {
    let mut intents = vec![common::asking(0.0, HEAL)];
    intents.extend(std::iter::repeat_n(idle(0.0), ticks));
    script(fighter, &intents)
}

#[test]
fn a_drink_heals_forty_percent_of_the_most_as_it_ends_and_spends_its_charge() {
    let last = usize::try_from(DRINK_TICKS).unwrap();
    let (under_way, happenings) = drinking(wounded(50.0), last - 1);
    assert!(matches!(under_way.action, Action::Drink { .. }) && happenings.is_empty(), "{:?}", under_way.action);
    assert_eq!((under_way.health, under_way.charges), (50.0, CHARGES), "nothing comes until it ends");
    let (drunk, happenings) = drinking(wounded(50.0), last);
    assert_eq!(happenings, vec![(last, Happening::Drank(40.0))]);
    assert_eq!((drunk.health, drunk.charges, drunk.action), (90.0, CHARGES - 1, Action::Idle));
    let (topped, happenings) = drinking(wounded(80.0), last);
    assert_eq!((topped.health, happenings), (100.0, vec![(last, Happening::Drank(20.0))]), "never past the most");
}

#[test]
fn no_drink_without_a_charge_at_full_health_on_horseback_or_in_the_air_and_never_a_foes() {
    let refused = |fighter: Fighter, controls: Controls| {
        let (after, _) = run(fighter, Intent { controls, combat: HEAL }, 8, None);
        !matches!(after.action, Action::Drink { .. })
    };
    let on_foot = Controls::default();
    assert!(!refused(wounded(50.0), on_foot), "a wounded player on foot drinks");
    assert!(refused(Fighter { charges: 0, ..wounded(50.0) }, on_foot), "no charge");
    assert!(refused(wounded(100.0), on_foot), "full health");
    assert!(refused(wounded(50.0), Controls { mounted: true, ..on_foot }), "on horseback");
    let mut aloft = wounded(50.0);
    (aloft.body.mode, aloft.body.z) = (Mode::Air, 6.0);
    assert!(refused(aloft, on_foot), "in the air");
    let foe = Fighter { health: 20.0, charges: CHARGES, ..foe_at(0.0, 0.0, 0.0) };
    assert!(refused(foe, on_foot), "a foe never drinks");
}

#[test]
fn a_drink_walks_however_its_player_runs() {
    let ahead = |combat: CombatInput, run: bool| {
        let controls = Controls { forward: 1.0, run, ..Controls::default() };
        common::run(wounded(50.0), Intent { controls, combat }, 30, None).0.body
    };
    let (drinking, walking) = (ahead(HEAL, true), ahead(CombatInput::default(), false));
    assert!((drinking.x, drinking.y) == (walking.x, walking.y), "{drinking:?} walked as {walking:?}");
    let running = ahead(CombatInput::default(), true);
    assert!(running.y < walking.y - 0.5, "a run would have gone further: {} against {}", running.y, walking.y);
}

#[test]
fn a_blow_that_lands_cuts_a_drink_short_and_keeps_its_charge() {
    let (under_way, _) = drinking(wounded(50.0), 30);
    let foe = foe_at(0.0, -1.5, PI);
    let chop = Attack { stroke: Stroke::Down, elapsed: 24, strike: 24, end: 60, swing: Swing::Plain, left_hand: false };
    let blow = swing_blow(2, &foe, &chop, 1);
    let struck = suffer(&under_way, &blow, &judge(&blow, &under_way));
    assert!(matches!(struck.action, Action::Flinch { .. }), "a blow flinches the drinker: {:?}", struck.action);
    let heavy = combat::Blow { poise: 1000.0, ..blow };
    let staggered = suffer(&under_way, &heavy, &judge(&heavy, &under_way));
    assert!(matches!(staggered.action, Action::Staggered { .. }), "{:?}", staggered.action);
    for cut in [struck, staggered] {
        let (after, happenings) = run(cut, idle(0.0), DRINK_TICKS * 2, None);
        assert!(happenings.is_empty(), "no heal comes: {happenings:?}");
        assert_eq!((after.health, after.charges), (cut.health, CHARGES), "the charge is kept");
    }
}

#[test]
fn a_dodge_does_not_leave_a_drink_but_one_pressed_in_its_last_ticks_hops_as_it_ends() {
    let dodge = common::dodging(0.0, 0.0, 1.0);
    let at = |pressed: usize, ticks: usize| {
        let mut intents = vec![common::asking(0.0, HEAL)];
        intents.extend((1..=ticks).map(|tick| if tick == pressed { dodge } else { idle(0.0) }));
        script(wounded(50.0), &intents)
    };
    let last = usize::try_from(DRINK_TICKS).unwrap();
    let (early, happenings) = at(20, 21);
    assert!(matches!(early.action, Action::Drink { elapsed: 21 }), "it drinks on: {:?}", early.action);
    assert!(happenings.is_empty());
    let (late, happenings) = at(last - 4, last + 1);
    assert_eq!(happenings, vec![(last, Happening::Drank(40.0)), (last + 1, Happening::Dodged)]);
    assert_eq!((late.health, late.charges), (90.0, CHARGES - 1));
}

#[test]
fn a_full_meter_is_a_charge_and_none_comes_past_three() {
    let player = Fighter { charges: 1, meter: 0.5, ..player_at(0.0, 0.0) };
    let filled = recharged(&player, 0.75);
    assert_eq!((filled.charges, filled.meter), (2, 0.25));
    let topped = recharged(&filled, 5.0);
    assert_eq!((topped.charges, topped.meter), (CHARGES, 0.0), "three at most, and the meter stops");
    assert_eq!(recharged(&topped, 0.5), topped, "a full set takes nothing more");
    assert_eq!(recharged(&filled, f64::NAN), filled, "nonsense gives nothing");
    assert_eq!(
        combat::fighter::player(movement::standing(0.0, 0.0), common::SWORD).charges,
        CHARGES,
        "a player stands full"
    );
}
