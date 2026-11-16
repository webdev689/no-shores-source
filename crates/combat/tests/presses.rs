//! How presses feel: a press made while the fighter is busy is kept a few ticks and acted on as soon as it can be;
//! a tapped guard keeps its parry window; the newest press wins over a button only held; the guard and the dodge cut
//! a swing's follow-through short; a flinch can be dodged out of; and numbers that are none never reach the fight.

mod common;

use combat::arms::{Arms, OffHand, Ranged, WeaponClass};
use combat::fighter::{Action, Cause, Swing};
use combat::judge::{Blow, BlowKind, suffer};
use combat::tuning::{FLINCH, PARRY_WINDOW, PRESS_KEPT};
use combat::{CombatInput, Fighter, Happening, Intent, Stroke, Surroundings, Verdict, step_fighter};
use common::{asking, dodging, guarding, idle, player_at, run, swinging};
use movement::Controls;

/// Steps a fighter through a list of intents, one a tick; gives it and every happening with its tick.
fn script(mut fighter: Fighter, intents: &[Intent]) -> (Fighter, Vec<(usize, Happening)>) {
    let mut happenings = Vec::new();
    for (tick, intent) in intents.iter().enumerate() {
        let (next, happening) = step_fighter(&fighter, intent, &Surroundings { blocks: &[], target_at: None });
        fighter = next;
        happenings.extend(happening.map(|happening| (tick, happening)));
    }
    (fighter, happenings)
}

fn both(stroke: Stroke) -> Intent {
    asking(0.0, CombatInput { attack: Some(stroke), guard: true, ..CombatInput::default() })
}

fn tick_of(happenings: &[(usize, Happening)], wanted: fn(&Happening) -> bool) -> Option<usize> {
    happenings.iter().find(|(_, happening)| wanted(happening)).map(|(tick, _)| *tick)
}

#[test]
fn a_dodge_pressed_on_a_blows_own_tick_is_kept_and_taken_the_tick_after() {
    // A sword's blow lands 24 ticks after the swing begins; the dodge is pressed on that very tick and held.
    let mut intents = vec![swinging(0.0, Stroke::Down); 24];
    intents.extend(vec![dodging(0.0, 0.0, 1.0); 3]);
    let (_, happenings) = script(player_at(0.0, 0.0), &intents);
    assert_eq!(tick_of(&happenings, |each| matches!(each, Happening::Struck(_))), Some(24), "the blow lands");
    assert_eq!(tick_of(&happenings, |each| *each == Happening::Dodged), Some(25), "then the dodge");
}

#[test]
fn a_press_made_while_held_fast_is_kept_eight_ticks_and_no_longer() {
    let mut staggered = player_at(0.0, 0.0);
    staggered.action = Action::Staggered { left: 5, cause: Cause::Poise };
    let pressed_once = [vec![dodging(0.0, 0.0, 1.0)], vec![idle(0.0); 9]].concat();
    let (_, happenings) = script(staggered, &pressed_once);
    assert_eq!(tick_of(&happenings, |each| *each == Happening::Dodged), Some(5), "as the stagger ends");
    let mut longer = staggered;
    longer.action = Action::Staggered { left: u32::from(PRESS_KEPT) + 2, cause: Cause::Poise };
    let (_, happenings) = script(longer, &pressed_once);
    assert!(happenings.is_empty(), "a press older than {PRESS_KEPT} ticks is let go: {happenings:?}");
}

#[test]
fn a_tapped_guard_holds_its_parry_window_open_for_the_whole_window() {
    let tap = [vec![guarding(0.0)], vec![idle(0.0); 20]].concat();
    let (open, _) = script(player_at(0.0, 0.0), &tap[..6]);
    assert_eq!(open.guarding(), Some(true), "let go, the window still stands");
    let (closed, _) = script(player_at(0.0, 0.0), &tap[..usize::try_from(PARRY_WINDOW).unwrap_or(0) + 2]);
    assert_eq!(closed.action, Action::Idle, "and the guard drops once it closes");
}

#[test]
fn an_attack_pressed_while_guarding_swings_and_a_held_guard_does_not_stop_the_riposte() {
    let held = [vec![guarding(0.0); 20], vec![both(Stroke::Down)]].concat();
    let (swung, happenings) = script(player_at(0.0, 0.0), &held);
    assert!(matches!(swung.action, Action::Attack(_)), "{:?}", swung.action);
    assert!(happenings.iter().any(|(tick, each)| *tick == 20 && matches!(each, Happening::Swung(_))));
    let mut parrier = player_at(0.0, 0.0);
    parrier.action = Action::Parry { elapsed: 0 };
    parrier.riposte = Some((2, 54));
    let (riposting, _) = run(parrier, both(Stroke::Up), 1, None);
    let Action::Attack(attack) = riposting.action else { panic!("{:?}", riposting.action) };
    assert_eq!(attack.swing, Swing::Riposte(2));
}

#[test]
fn the_guard_cuts_a_swings_follow_through_short_but_never_its_wind_up() {
    // Pressed in the wind-up and held: the guard rises the tick after the blow lands, its window spent waiting.
    let early = [vec![swinging(0.0, Stroke::Down); 10], vec![guarding(0.0); 20]].concat();
    let (_, happenings) = script(player_at(0.0, 0.0), &early);
    assert_eq!(tick_of(&happenings, |each| matches!(each, Happening::Struck(_))), Some(24));
    assert_eq!(
        happenings.iter().find(|(_, each)| matches!(each, Happening::Guarded { .. })).map(|pair| pair.1),
        Some(Happening::Guarded { window: false })
    );
    // Pressed just before the blow lands: kept, it opens a parry window as the follow-through is cut.
    let late = [vec![swinging(0.0, Stroke::Down); 20], vec![guarding(0.0); 10]].concat();
    let (_, happenings) = script(player_at(0.0, 0.0), &late);
    assert!(happenings.contains(&(25, Happening::Guarded { window: true })), "{happenings:?}");
}

#[test]
fn a_flinch_can_be_dodged_out_of_from_its_eighth_tick_and_blow_on_blow_does_not_hold_it_open() {
    let mut flinching = player_at(0.0, 0.0);
    flinching.action = Action::Flinch { left: FLINCH };
    let intents = [vec![idle(0.0); 3], vec![dodging(0.0, 0.0, 1.0); 8]].concat();
    let (_, happenings) = script(flinching, &intents);
    assert_eq!(tick_of(&happenings, |each| *each == Happening::Dodged), Some(8));
    let mut midway = player_at(0.0, 0.0);
    midway.action = Action::Flinch { left: 5 };
    let blow = Blow {
        striker: 2,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, -1.0],
        damage: 5.0,
        poise: 1.0,
        guard: 1.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
    };
    let struck = suffer(&midway, &blow, &Verdict::Hit { damage: 5.0, poise: 1.0 });
    assert_eq!(struck.action, Action::Flinch { left: 5 }, "a second blow does not start the flinch again");
    let mut reloading = player_at(0.0, 0.0);
    reloading.action = Action::Reload { left: 100 };
    let struck = suffer(&reloading, &blow, &Verdict::Hit { damage: 5.0, poise: 1.0 });
    assert_eq!(struck.action, Action::Reload { left: 100 }, "nor does a blow load a gun sooner");
}

#[test]
fn a_dodge_chains_into_the_next_pressed_in_its_air_as_soon_as_it_lands() {
    let intents = [vec![dodging(0.0, 0.0, 1.0)], vec![idle(0.0); 11], vec![dodging(0.0, 0.0, -1.0); 10]].concat();
    let (_, happenings) = script(player_at(0.0, 0.0), &intents);
    let dodges: Vec<usize> =
        happenings.iter().filter(|(_, each)| *each == Happening::Dodged).map(|(tick, _)| *tick).collect();
    assert_eq!(dodges, vec![0, 18]);
}

#[test]
fn a_look_or_a_push_that_is_no_number_never_reaches_the_fight() {
    let nowhere = Intent {
        controls: Controls { yaw: f64::NAN, forward: f64::INFINITY, sideways: f64::NAN, ..Controls::default() },
        combat: CombatInput { dodge: true, pitch: f64::NAN, ..CombatInput::default() },
    };
    let (dodged, _) = run(player_at(0.0, 0.0), nowhere, 30, None);
    assert!(dodged.body.x.is_finite() && dodged.body.y.is_finite() && dodged.aim.is_finite(), "{:?}", dodged.body);
    let mut gunner = player_at(0.0, 0.0);
    gunner.arms = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::Pistolet), off_hand: OffHand::Empty };
    let firing = Intent { combat: CombatInput { shoot: true, dodge: false, ..nowhere.combat }, ..nowhere };
    let (_, happenings) = run(gunner, firing, 1, None);
    let Some((_, Happening::Loosed(ball))) = happenings.first() else { panic!("{happenings:?}") };
    assert!(ball.at.iter().chain(&ball.velocity).all(|number| number.is_finite()), "{ball:?}");
}
