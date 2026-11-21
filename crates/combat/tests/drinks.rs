//! Healing charges: a drink pressed from rest on the ground heals 40% of the player's most health as it ends, never
//! past the most, spending its charge; none without a charge, at full health, on horseback, in the air or in a loadout
//! swap, and never a foe's. It walks, never runs, as fast as Haste carries it. A blow that lands, a knockdown or a
//! Charge's hold cuts it short with the charge kept, and leaving the ground puts it down; a dodge does not leave it,
//! and one pressed in a swing's or a dodge's last ticks begins as it ends. And the meter: each whole one filled is a
//! charge, none past three, and one earned while drinking with three held is kept as the drink spends one.

mod common;

use combat::arms::{Arms, OffHand, Ranged, WeaponClass, swing_ticks};
use combat::drink::recharged;
use combat::fighter::{Action, Attack, Cause, Swing};
use combat::judge::{suffer, swing_blow};
use combat::tuning::{CHARGES, DODGE_ATTACK, DODGE_TICKS, DRINK_TICKS, SWAP_TICKS};
use combat::{CombatInput, Fighter, Happening, Intent, Status, Stroke, judge};
use common::{foe_at, idle, player_at, run, run_on, script};
use core::f64::consts::PI;
use movement::{Block, Body, Controls, Mode, standing};

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
fn a_full_meter_is_a_charge_none_comes_past_three_and_a_new_player_holds_all_three() {
    let player = Fighter { charges: 1, meter: 0.5, ..player_at(0.0, 0.0) };
    let filled = recharged(&player, 0.75);
    assert_eq!((filled.charges, filled.meter), (2, 0.25));
    let topped = recharged(&filled, 5.0);
    assert_eq!((topped.charges, topped.meter), (CHARGES, 0.0), "three at most, and the meter stops");
    assert_eq!(recharged(&topped, 0.5), topped, "a full set takes nothing more");
    assert_eq!(recharged(&filled, f64::NAN), filled, "nonsense gives nothing");
    assert_eq!(combat::fighter::player(standing(0.0, 0.0), common::SWORD).charges, CHARGES, "a player stands full");
}

#[test]
fn a_drink_is_put_down_in_the_saddle_at_full_health_or_with_no_charge_and_heals_nothing() {
    let begun = drinking(wounded(50.0), 10).0;
    assert!(matches!(begun.action, Action::Drink { .. }));
    let saddled = Intent { controls: Controls { mounted: true, ..Controls::default() }, ..idle(0.0) };
    let (put_down, happenings) = script(begun, &[saddled]);
    assert!(matches!(put_down.action, Action::Idle) && happenings.is_empty(), "{:?}", put_down.action);
    assert_eq!((put_down.health, put_down.charges), (50.0, CHARGES), "on horseback: no heal, the charge kept");
    // A spell tops it up mid-drink: it ends with nothing to heal and keeps its charge.
    let topped = Fighter { health: begun.health_max, ..begun };
    let rest = usize::try_from(DRINK_TICKS).unwrap();
    let (ended, happenings) = script(topped, &vec![idle(0.0); rest]);
    assert!(matches!(ended.action, Action::Idle) && happenings.is_empty(), "{happenings:?}");
    assert_eq!(ended.charges, CHARGES, "no charge spent for nothing");
    let (dry, happenings) = script(Fighter { charges: 0, ..begun }, &vec![idle(0.0); rest]);
    assert!(happenings.is_empty() && dry.health == 50.0, "no charge left, no heal: {happenings:?}");
}

#[test]
fn a_drink_is_put_down_as_its_drinker_walks_off_a_ledge_or_into_a_wall_they_climb() {
    let ahead = Controls { forward: 1.0, ..Controls::default() };
    let walked = |fighter: Fighter, blocks: &[Block]| {
        let (begun, _) = run_on(fighter, Intent { controls: ahead, combat: HEAL }, 1, None, blocks);
        assert!(matches!(begun.action, Action::Drink { .. }), "it drinks: {:?}", begun.action);
        let (after, happenings) = run_on(begun, Intent { controls: ahead, ..idle(0.0) }, DRINK_TICKS, None, blocks);
        assert!(happenings.is_empty(), "no heal comes: {happenings:?}");
        assert_eq!((after.health, after.charges), (50.0, CHARGES), "the charge is kept");
        after
    };
    let ledge = Block { min_x: -2.0, min_y: -1.0, max_x: 2.0, max_y: 2.0, top: 1.0, bottom: 0.0 };
    let on_the_ledge = Fighter { body: Body { z: 1.0, ..wounded(50.0).body }, ..wounded(50.0) };
    let fallen = walked(on_the_ledge, &[ledge]);
    assert!(fallen.body.y < -1.0 && fallen.body.z < 1.0, "it walked off and fell: {:?}", fallen.body);
    let tower = Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 4.0, bottom: 0.0 };
    let climbing = walked(wounded(50.0), &[tower]);
    assert!(climbing.body.mode != Mode::Ground, "it climbs: {:?}", climbing.body);
}

#[test]
fn a_knockdown_and_a_charges_hold_cut_a_drink_short_and_keep_its_charge() {
    let (under_way, _) = drinking(wounded(50.0), 30);
    let foe = foe_at(0.0, -1.5, PI);
    let chop = Attack { stroke: Stroke::Down, elapsed: 24, strike: 24, end: 60, swing: Swing::Plain, left_hand: false };
    let slam = combat::Blow { knocks_down: true, ..swing_blow(2, &foe, &chop, 1) };
    let knocked = suffer(&under_way, &slam, &judge(&slam, &under_way));
    assert!(matches!(knocked.action, Action::Down { .. }), "knocked down: {:?}", knocked.action);
    let held = combat::give(&under_way, Status::Charge, 60, Some(2)).expect("a Charge takes");
    assert!(matches!(held.action, Action::Staggered { cause: Cause::Charged, .. }), "{:?}", held.action);
    for cut in [knocked, held] {
        let (after, happenings) = run(cut, idle(0.0), DRINK_TICKS * 2, None);
        assert!(happenings.is_empty(), "no heal comes: {happenings:?}");
        assert_eq!((after.health, after.charges), (cut.health, CHARGES), "the charge is kept");
    }
}

#[test]
fn haste_quickens_a_drinks_walk() {
    let ahead = |fighter: Fighter| {
        let controls = Controls { forward: 1.0, run: true, ..Controls::default() };
        run(fighter, Intent { controls, combat: HEAL }, 30, None).0
    };
    let hasted = combat::give(&wounded(50.0), Status::Haste, 120, None).expect("Haste takes");
    let (quick, plain) = (ahead(hasted), ahead(wounded(50.0)));
    assert!(matches!(quick.action, Action::Drink { .. }) && matches!(plain.action, Action::Drink { .. }));
    assert!(quick.body.y < plain.body.y - 0.5, "Haste carried it further: {} against {}", quick.body.y, plain.body.y);
}

/// A wounded player's action after `first`, then `ticks` more at rest, with a drink pressed on tick `pressed`.
fn pressed_after(first: Intent, pressed: usize, ticks: usize) -> Action {
    let mut intents = vec![first];
    intents.extend((1..=ticks).map(|tick| if tick == pressed { common::asking(0.0, HEAL) } else { idle(0.0) }));
    script(wounded(50.0), &intents).0.action
}

#[test]
fn a_drink_pressed_in_a_swings_last_ticks_begins_as_it_ends() {
    let end = usize::try_from(swing_ticks(WeaponClass::Sword).1).unwrap();
    let swing = common::swinging(0.0, Stroke::Down);
    let before = pressed_after(swing, end - 4, end - 1);
    assert!(matches!(before, Action::Attack(_)), "the swing runs on: {before:?}");
    let after = pressed_after(swing, end - 4, end);
    assert!(matches!(after, Action::Drink { elapsed: 0 }), "it begins as the swing ends: {after:?}");
}

#[test]
fn a_drink_pressed_in_a_dodges_last_ticks_never_frees_it_early_and_begins_as_it_ends() {
    let dodge = common::dodging(0.0, 0.0, 1.0);
    let (pressed, last) = (usize::try_from(DODGE_ATTACK).unwrap() + 1, usize::try_from(DODGE_TICKS).unwrap());
    let before = pressed_after(dodge, pressed, last - 1);
    assert!(matches!(before, Action::Dodge { .. }), "a drink pressed never frees the dodge early: {before:?}");
    let after = pressed_after(dodge, pressed, last);
    assert!(matches!(after, Action::Drink { elapsed: 0 }), "it begins as the dodge ends: {after:?}");
}

#[test]
fn no_drink_begins_in_a_loadout_swap() {
    let bow = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::Bow), off_hand: OffHand::Empty };
    let swapping = wounded(50.0).holding(bow);
    assert_eq!(swapping.swap, SWAP_TICKS, "a new weapon taken up is a swap");
    let (after, _) = run(swapping, common::asking(0.0, HEAL), 10, None);
    assert!(!matches!(after.action, Action::Drink { .. }), "refused in the swap: {:?}", after.action);
}

#[test]
fn a_charge_earned_while_drinking_with_three_held_is_kept_as_the_drink_spends_one() {
    let (under_way, _) = drinking(wounded(50.0), 30);
    let earned = recharged(&under_way, 1.4);
    assert_eq!((earned.charges, earned.meter), (CHARGES, 1.0), "the meter fills to one whole, no more");
    let (drunk, happenings) = run(earned, idle(0.0), DRINK_TICKS, None);
    assert_eq!(happenings.len(), 1, "it drank: {happenings:?}");
    assert_eq!(
        (drunk.health, drunk.charges, drunk.meter),
        (90.0, CHARGES, 0.0),
        "spent, and the full meter took its place"
    );
    assert_eq!(recharged(&wounded(50.0), 0.5).meter, 0.0, "at rest with all three, nothing is banked");
}
