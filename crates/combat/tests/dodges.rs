//! The dodge: a low fast hop the way the keys point (straight back with none), facing the lock's target, that blows
//! pass through for most of its flight, the first stretch of which is perfect and earns a counter. No dodge from the
//! air, the saddle or an empty stamina bar, and none catches a ledge.

mod common;

use combat::arms::Stroke;
use combat::fighter::{Action, Attack, Swing};
use combat::judge::{suffer, swing_blow};
use combat::tuning::{COUNTER_TICKS, DODGE_PERFECT, DODGE_SAFE, DODGE_STAMINA, DODGE_TICKS};
use combat::{CombatInput, Happening, Intent, Verdict, judge};
use common::{dodging, foe_at, idle, player_at, run, run_on};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::{Block, Controls, Mode};

const CHOP: Attack =
    Attack { stroke: Stroke::Down, elapsed: 24, strike: 24, end: 60, swing: Swing::Plain, left_hand: false };

#[test]
fn a_dodge_hops_about_three_metres_the_way_the_keys_point_and_lands() {
    let (fighter, happenings) = run(player_at(0.0, 0.0), dodging(0.0, 0.0, 1.0), 1, None);
    assert_eq!(happenings, vec![(0, Happening::Dodged)]);
    assert_eq!(fighter.body.mode, Mode::Air);
    assert!((fighter.stamina - (100.0 - DODGE_STAMINA)).abs() < 1e-9);
    let (landed, _) = run(fighter, idle(0.0), DODGE_TICKS, None);
    assert!(landed.body.x > 2.8 && landed.body.x < 3.4 && landed.body.y.abs() < 1e-9, "east 3 m: {}", landed.body.x);
    assert_eq!(landed.body.mode, Mode::Ground);
    assert!(matches!(landed.action, Action::Idle));
    // No keys: straight back from the look.
    let (back, _) = run(player_at(0.0, 0.0), dodging(0.0, 0.0, 0.0), DODGE_TICKS + 1, None);
    assert!(back.body.y > 2.8 && back.body.x.abs() < 1e-9);
}

#[test]
fn a_dodge_faces_the_locks_target_while_it_hops_aside() {
    let (fighter, _) = run(player_at(0.0, 0.0), dodging(0.0, 0.0, -1.0), 5, Some([0.0, -3.0, 1.1]));
    assert!(fighter.body.facing.abs() < 0.05, "still facing north toward the foe: {}", fighter.body.facing);
    assert!(fighter.body.x < -0.5);
}

#[test]
fn blows_pass_through_the_hops_safe_stretch_and_its_first_part_is_perfect() {
    let foe = foe_at(0.0, -1.5, PI);
    let blow = swing_blow(2, &foe, &CHOP, 1);
    let (begun, _) = run(player_at(0.0, 0.0), dodging(0.0, 0.0, 1.0), 1, None);
    assert!(matches!(judge(&blow, &begun), Verdict::Hit { .. }), "the hop's first tick is not yet safe");
    let (perfect, _) = run(begun, idle(0.0), DODGE_SAFE.0, None);
    assert_eq!(judge(&blow, &perfect), Verdict::Dodged { perfect: true });
    let (plain, _) = run(begun, idle(0.0), DODGE_PERFECT + 1, None);
    assert_eq!(judge(&blow, &plain), Verdict::Dodged { perfect: false });
    let (late, _) = run(begun, idle(0.0), DODGE_SAFE.1 + 1, None);
    assert!(matches!(judge(&blow, &late), Verdict::Hit { .. }));
    let countered = suffer(&perfect, &blow, &Verdict::Dodged { perfect: true });
    assert_eq!(countered.counter, COUNTER_TICKS);
    let (_, happenings) = run(countered, common::swinging(0.0, Stroke::Up), DODGE_TICKS, None);
    let swung = happenings.iter().find_map(|(_, happening)| match happening {
        Happening::Swung(attack) => Some(attack.swing),
        _ => None,
    });
    assert_eq!(swung, Some(Swing::Counter), "a swing after a perfect dodge is the counter");
}

#[test]
fn no_dodge_from_the_air_the_saddle_or_an_empty_stamina_bar() {
    let jumping =
        Intent { controls: Controls { yaw: 0.0, jump: true, ..Controls::default() }, combat: CombatInput::default() };
    let (in_air, _) = run(player_at(0.0, 0.0), jumping, 15, None);
    let (still_air, happenings) = run(in_air, dodging(0.0, 0.0, 1.0), 1, None);
    assert!(happenings.is_empty() && !matches!(still_air.action, Action::Dodge { .. }));
    let mounted =
        Intent { controls: Controls { mounted: true, sideways: 1.0, ..Controls::default() }, ..dodging(0.0, 0.0, 1.0) };
    assert!(run(player_at(0.0, 0.0), mounted, 1, None).1.is_empty());
    let mut tired = player_at(0.0, 0.0);
    tired.stamina = 0.0;
    assert!(run(tired, dodging(0.0, 0.0, 1.0), 1, None).1.is_empty());
}

#[test]
fn a_dodge_into_a_wall_stops_at_it_and_catches_no_ledge() {
    let wall = [Block { min_x: 1.0, min_y: -5.0, max_x: 2.0, max_y: 5.0, top: 1.9 }];
    let (fighter, _) = run_on(player_at(0.0, 0.0), dodging(FRAC_PI_2, 1.0, 0.0), DODGE_TICKS + 2, None, &wall);
    assert_eq!(fighter.body.mode, Mode::Ground);
    assert!(fighter.body.x < 1.0 && fighter.body.z.abs() < 1e-9, "against the wall, on the ground: {:?}", fighter.body);
}
