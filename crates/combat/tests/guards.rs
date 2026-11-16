//! Guards and parries: a press opens a short parry window, mashing opens none, a guard pays stamina for what it
//! blocks and breaks when it cannot, a shield covers more, and a parry staggers the striker open to a riposte no guard
//! stops. Iron blows and shots are never parried.

mod common;

use combat::arms::{OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::{Action, Attack, Cause, Swing};
use combat::judge::{answered, shot_blow, suffer, swing_blow, telegraph_blow};
use combat::shapes::{Shape, Telegraph, TelegraphOrder};
use combat::shots::loose;
use combat::tuning::{PARRIED, PARRY_WINDOW};
use combat::{CombatInput, Happening, Verdict, judge};
use common::{SWORD_AND_SHIELD, foe_at, guarding, idle, player_at, run};
use core::f64::consts::PI;

const CHOP: Attack =
    Attack { stroke: Stroke::Down, elapsed: 24, strike: 24, end: 60, swing: Swing::Plain, left_hand: false };

/// A foe 1.5 m north of a player at the origin, facing it.
fn striker() -> combat::Fighter {
    foe_at(0.0, -1.5, PI)
}

#[test]
fn a_press_opens_a_parry_window_of_a_fifth_of_a_second_and_then_the_guard_blocks() {
    let blow = swing_blow(2, &striker(), &CHOP, 1);
    let (raised, happenings) = run(player_at(0.0, 0.0), guarding(0.0), 1, None);
    assert_eq!(happenings, vec![(0, Happening::Guarded { window: true })]);
    assert_eq!(judge(&blow, &raised), Verdict::Parried);
    let (late, _) = run(raised, guarding(0.0), PARRY_WINDOW, None);
    assert!(matches!(judge(&blow, &late), Verdict::Blocked { .. }));
}

#[test]
fn a_press_hard_on_the_heels_of_an_unused_window_opens_none() {
    let (raised, _) = run(player_at(0.0, 0.0), guarding(0.0), PARRY_WINDOW + 2, None);
    let (lowered, _) = run(raised, idle(0.0), 2, None);
    let (mashed, happenings) = run(lowered, guarding(0.0), 1, None);
    assert_eq!(happenings, vec![(0, Happening::Guarded { window: false })]);
    assert!(matches!(judge(&swing_blow(2, &striker(), &CHOP, 1), &mashed), Verdict::Blocked { .. }));
    let (waited, _) = run(lowered, idle(0.0), 40, None);
    let (pressed, _) = run(waited, guarding(0.0), 1, None);
    assert_eq!(
        judge(&swing_blow(2, &striker(), &CHOP, 1), &pressed),
        Verdict::Parried,
        "after half a second it is open again"
    );
}

#[test]
fn a_guard_pays_stamina_for_what_it_blocks_lets_a_little_through_and_breaks_when_it_cannot_pay() {
    let blow = swing_blow(2, &striker(), &CHOP, 1);
    let (raised, _) = run(player_at(0.0, 0.0), guarding(0.0), 20, None);
    let Verdict::Blocked { damage, stamina } = judge(&blow, &raised) else { panic!("blocked") };
    assert!((damage - 14.0 * 1.15 * 0.2).abs() < 1e-9, "a fifth of a chop gets through a blade's guard");
    assert!((stamina - 10.0 * 1.5).abs() < 1e-9, "a chop is half again as heavy on a guard");
    let blocked = suffer(&raised, &blow, &judge(&blow, &raised));
    assert!((blocked.stamina - (100.0 - 15.0)).abs() < 1e-9 && matches!(blocked.action, Action::Guard { .. }));
    let mut spent = raised;
    spent.stamina = 10.0;
    let verdict = judge(&blow, &spent);
    assert!(matches!(verdict, Verdict::GuardBroken { .. }));
    let broken = suffer(&spent, &blow, &verdict);
    assert!(matches!(broken.action, Action::Staggered { cause: Cause::GuardBroken, .. }));
    assert_eq!(broken.stamina, 0.0);
}

#[test]
fn a_shield_covers_a_wider_arc_lets_less_through_and_pays_less() {
    let mut shielded = player_at(0.0, 0.0);
    shielded.arms = SWORD_AND_SHIELD;
    let (shielded, _) = run(shielded, guarding(0.0), 20, None);
    let (bladed, _) = run(player_at(0.0, 0.0), guarding(0.0), 20, None);
    // A blow from 70 degrees off the guard's aim: past a blade's 60, inside a shield's 80.
    let side = foe_at(1.5 * libm::sin(70.0_f64.to_radians()), -1.5 * libm::cos(70.0_f64.to_radians()), 0.0);
    let blow = swing_blow(2, &side, &CHOP, 1);
    assert!(matches!(judge(&blow, &bladed), Verdict::Hit { .. }));
    let Verdict::Blocked { damage, stamina } = judge(&blow, &shielded) else { panic!("the shield blocks it") };
    assert!(damage < 1.0 && (stamina - 15.0 * 0.6).abs() < 1e-9);
}

#[test]
fn a_parry_staggers_the_striker_open_to_a_riposte_that_strikes_harder_and_no_guard_stops() {
    let (raised, _) = run(player_at(0.0, 0.0), guarding(0.0), 1, None);
    let foe = striker();
    let blow = swing_blow(2, &foe, &CHOP, 1);
    let parrier = suffer(&raised, &blow, &Verdict::Parried);
    assert!(matches!(parrier.action, Action::Parry { elapsed: 0 }));
    assert_eq!(parrier.riposte, Some((2, PARRIED)));
    assert!((parrier.health - 100.0).abs() < 1e-9);
    let parried = answered(&foe, 1, &Verdict::Parried);
    assert!(matches!(parried.action, Action::Staggered { left: PARRIED, cause: Cause::Parried }));
    // The parrier's next swing is the riposte: two and a half times, through any guard.
    let (riposting, happenings) = run(parrier, common::swinging(0.0, Stroke::Up), 1, None);
    let Some((_, Happening::Swung(attack))) = happenings.first() else { panic!("a riposte begins at once") };
    assert_eq!(attack.swing, Swing::Riposte(2));
    assert_eq!(riposting.riposte, None);
    let riposte = swing_blow(1, &riposting, attack, 2);
    assert!((riposte.damage - 14.0 * 2.5).abs() < 1e-9);
    assert!(!riposte.parryable && !riposte.blockable);
    assert!(swing_blow(1, &riposting, attack, 3).parryable, "only against the parried foe");
}

#[test]
fn iron_blows_pass_any_guard_and_an_iron_slam_knocks_down() {
    let order = TelegraphOrder { shape: Shape::Slam, windup: 54, iron: true, feint_at: None, bearing: PI, ahead: 0.0 };
    let mut brute = foe_at(0.0, -2.0, PI);
    brute.arms.melee = WeaponClass::Warhammer;
    let slam = telegraph_blow(2, &brute, &Telegraph::begin(&order, [0.0, -2.0, 0.0]));
    let (raised, _) = run(player_at(0.0, 0.0), guarding(0.0), 1, None);
    let verdict = judge(&slam, &raised);
    assert!(matches!(verdict, Verdict::Hit { .. }));
    assert!(matches!(suffer(&raised, &slam, &verdict).action, Action::Down { .. }));
    let plain = TelegraphOrder { iron: false, ..order };
    assert_eq!(
        judge(&telegraph_blow(2, &brute, &Telegraph::begin(&plain, [0.0, -2.0, 0.0])), &raised),
        Verdict::Parried
    );
}

#[test]
fn a_shot_is_never_parried_and_only_a_shield_guards_against_it() {
    let arrow = loose(2, Ranged::Bow, [0.0, -10.0, 1.1], PI, 0.0, 1.0);
    let blow = shot_blow(&arrow, [0.0, -10.0]);
    let (bladed, _) = run(player_at(0.0, 0.0), guarding(0.0), 1, None);
    assert!(matches!(judge(&blow, &bladed), Verdict::Hit { .. }));
    let mut shielded = player_at(0.0, 0.0);
    shielded.arms.off_hand = OffHand::Shield;
    let (shielded, _) = run(shielded, guarding(0.0), 1, None);
    assert!(matches!(judge(&blow, &shielded), Verdict::Blocked { .. }));
    let _ = CombatInput::default();
}
