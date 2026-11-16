//! Poise and what blows do that land: the meter fills until its fighter staggers for its weight, then holds no new
//! stagger for a while; staggered or overreached it takes more; a player flinches, a foe stands; and at no health it
//! dies.

mod common;

use combat::arms::{Stroke, WeaponClass};
use combat::fighter::{Action, Attack, Cause, Swing, Weight};
use combat::judge::{suffer, swing_blow};
use combat::tuning::{FLINCH, POISE_IMMUNE};
use combat::{Verdict, judge};
use common::{foe_at, idle, player_at, run};
use core::f64::consts::PI;

const CHOP: Attack =
    Attack { stroke: Stroke::Down, elapsed: 24, strike: 24, end: 60, swing: Swing::Plain, left_hand: false };

#[test]
fn blows_fill_poise_until_the_fighter_staggers_for_its_weight_then_none_for_a_while() {
    let mut foe = foe_at(0.0, -1.5, PI);
    foe.weight = Weight::Heavy;
    let mut player = player_at(0.0, 0.0);
    player.arms.melee = WeaponClass::Mace;
    let blow = swing_blow(1, &player, &CHOP, 2);
    assert!((blow.poise - 1.5 * 10.0 * 1.4).abs() < 1e-9, "a mace's chop weighs 21");
    let once = suffer(&foe, &blow, &judge(&blow, &foe));
    assert!(matches!(once.action, Action::Idle), "a foe stands through a blow");
    let twice = suffer(&once, &blow, &judge(&blow, &once));
    assert!(matches!(twice.action, Action::Staggered { left: 60, cause: Cause::Poise }));
    assert_eq!(twice.poise, 0.0);
    assert_eq!(twice.poise_immune, 60 + POISE_IMMUNE);
    let (stood, _) = run(twice, idle(PI), 61, None);
    let again = (0..3).fold(stood, |fighter, _| suffer(&fighter, &blow, &judge(&blow, &fighter)));
    assert!(!again.staggered(), "no new stagger while immune");
}

#[test]
fn a_blow_from_behind_weighs_half_again_and_a_staggered_fighter_takes_a_quarter_more() {
    let foe = foe_at(0.0, -1.5, 0.0);
    let blow = swing_blow(1, &player_at(0.0, 0.0), &CHOP, 2);
    let Verdict::Hit { damage, poise } = judge(&blow, &foe) else { panic!("it lands") };
    assert!((poise - 14.0 * 1.5).abs() < 1e-9 && (damage - 14.0 * 1.15).abs() < 1e-9);
    let staggered = combat::Fighter { action: Action::Staggered { left: 30, cause: Cause::Poise }, ..foe };
    let Verdict::Hit { damage, .. } = judge(&blow, &staggered) else { panic!("it lands") };
    assert!((damage - 14.0 * 1.15 * 1.25).abs() < 1e-9);
}

#[test]
fn an_overreached_foe_takes_more_and_the_first_blow_landed_staggers_it() {
    let foe = combat::Fighter { punished: 40, action: Action::Overreach { left: 40 }, ..foe_at(0.0, -1.5, PI) };
    let blow = swing_blow(1, &player_at(0.0, 0.0), &CHOP, 2);
    let Verdict::Hit { damage, .. } = judge(&blow, &foe) else { panic!("it lands") };
    assert!((damage - 14.0 * 1.15 * 1.3).abs() < 1e-9);
    let struck = suffer(&foe, &blow, &judge(&blow, &foe));
    assert!(matches!(struck.action, Action::Staggered { cause: Cause::Poise, .. }));
    assert_eq!(struck.punished, 0);
}

#[test]
fn a_struck_player_flinches_out_of_a_wind_up_but_not_out_of_its_landing_or_a_stagger() {
    let blow = swing_blow(2, &foe_at(0.0, -1.5, PI), &CHOP, 1);
    let (winding, _) = run(player_at(0.0, 0.0), common::swinging(0.0, Stroke::Up), 10, None);
    let flinched = suffer(&winding, &blow, &judge(&blow, &winding));
    assert!(matches!(flinched.action, Action::Flinch { left: FLINCH }));
    let (free, _) = run(flinched, idle(0.0), FLINCH, None);
    assert!(matches!(free.action, Action::Idle));
    let staggered =
        combat::Fighter { action: Action::Staggered { left: 30, cause: Cause::Parried }, ..player_at(0.0, 0.0) };
    assert!(matches!(suffer(&staggered, &blow, &judge(&blow, &staggered)).action, Action::Staggered { .. }));
}

#[test]
fn at_no_health_a_fighter_dies_and_lies_where_it_fell() {
    let mut player = player_at(0.0, 0.0);
    player.health = 5.0;
    let blow = swing_blow(2, &foe_at(0.0, -1.5, PI), &CHOP, 1);
    let dead = suffer(&player, &blow, &judge(&blow, &player));
    assert!(dead.dead() && dead.health == 0.0);
    let (lying, happenings) = run(dead, common::swinging(0.0, Stroke::Up), 30, None);
    assert!(happenings.is_empty() && matches!(lying.action, Action::Dead { elapsed: 30 }));
    assert_eq!(dead.target, Some(2), "struck, its lock takes the striker");
}
