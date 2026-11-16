//! Swings: DFO's timing, the stamina they cost, holding to swing again, a pair's hands taking turns, moving slowly
//! while swinging, the soft lock steering the blow, and who it reaches.

mod common;

use combat::arms::{OffHand, WeaponClass, swing_ticks, weapon};
use combat::fighter::{Action, Swing};
use combat::strike::struck;
use combat::{CombatInput, Happening, Intent, Stroke, Surroundings, step_fighter};
use common::{SWORD, foe_at, idle, player_at, run, swinging};
use movement::{Block, Controls};

#[test]
fn a_sword_swing_lands_its_blow_as_the_third_of_five_frames_begins_and_ends_at_the_fifth() {
    assert_eq!(swing_ticks(WeaponClass::Sword), (24, 60));
    assert_eq!(swing_ticks(WeaponClass::Dagger), (21, 54));
    let (warhammer_strike, warhammer_end) = swing_ticks(WeaponClass::Warhammer);
    assert!(warhammer_strike > 24 && warhammer_end > 60, "two hands and weight swing slower");
    let (fighter, happenings) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Down), 25, None);
    assert!(matches!(happenings[0], (0, Happening::Swung(_))));
    assert!(matches!(happenings[1], (24, Happening::Struck(attack)) if attack.elapsed == 24));
    assert_eq!(happenings.len(), 2);
    assert!((fighter.stamina - (100.0 - weapon(WeaponClass::Sword).stamina)).abs() < 1e-9);
}

#[test]
fn holding_the_button_swings_again_as_each_blow_ends_and_a_tap_swings_once() {
    let (_, held) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Left), 130, None);
    let swung = held.iter().filter(|(_, happening)| matches!(happening, Happening::Swung(_))).count();
    assert_eq!(swung, 3, "swings begin at ticks 0, 60 and 120");
    let mut fighter = player_at(0.0, 0.0);
    let mut swings = 0;
    for tick in 0..130 {
        let intent = if tick == 0 { swinging(0.0, Stroke::Left) } else { idle(0.0) };
        let (next, happening) = step_fighter(&fighter, &intent, &Surroundings { blocks: &[], target_at: None });
        fighter = next;
        swings += usize::from(matches!(happening, Some(Happening::Swung(_))));
    }
    assert_eq!(swings, 1);
}

#[test]
fn a_fighter_with_no_stamina_cannot_swing_and_stamina_comes_back_after_its_rest() {
    let mut tired = player_at(0.0, 0.0);
    tired.stamina = 0.0;
    let (still_tired, happenings) = run(tired, swinging(0.0, Stroke::Up), 29, None);
    assert!(happenings.is_empty());
    assert!(still_tired.stamina < 0.6, "it rests half a second before it comes back");
    let (rested, _) = run(still_tired, idle(0.0), 60, None);
    assert!(rested.stamina > 30.0, "35 a second once rested");
}

#[test]
fn a_pairs_blows_take_turns_between_the_hands() {
    let mut pair = player_at(0.0, 0.0);
    pair.arms.off_hand = OffHand::Weapon;
    let (_, happenings) = run(pair, swinging(0.0, Stroke::DownLeft), 125, None);
    let hands: Vec<bool> = happenings
        .iter()
        .filter_map(|(_, happening)| match happening {
            Happening::Swung(attack) => Some(attack.left_hand),
            _ => None,
        })
        .collect();
    assert_eq!(hands, vec![false, true, false]);
}

#[test]
fn a_swing_moves_slowly_and_turns_its_blow_after_the_lock_target_in_reach() {
    let walking = Intent {
        controls: Controls { forward: 1.0, yaw: 0.0, ..Controls::default() },
        combat: CombatInput { attack: Some(Stroke::Right), ..CombatInput::default() },
    };
    let (fighter, _) = run(player_at(0.0, 0.0), walking, 20, None);
    let walked = -fighter.body.y;
    assert!(walked > 0.4 && walked < 0.6, "a swing walks at a third of 4.43 m/s: {walked}");
    // A foe 2 m away 60 degrees east of the look north: the wind-up turns the aim to it, 9 degrees a tick.
    let sixty = core::f64::consts::FRAC_PI_3;
    let off_look = [2.0 * libm::sin(sixty), -2.0 * libm::cos(sixty), 1.1];
    let (turned, _) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Right), 12, Some(off_look));
    assert!((turned.aim - sixty).abs() < 1e-9, "aim {}", turned.aim);
    assert!((turned.body.facing - turned.aim).abs() < 1e-9, "the body faces its swing");
    // Due east, past the lock's arc of the look: the look was turned from it, so the swing keeps to the look.
    let (looked, _) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Right), 12, Some([2.0, 0.0, 1.1]));
    assert!(looked.aim.abs() < 1e-9, "aim {}", looked.aim);
    // Beyond its reach and the steer, the swing keeps to the look.
    let (kept, _) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Right), 12, Some([20.0, 0.0, 1.1]));
    assert!(kept.aim.abs() < 1e-9);
}

#[test]
fn a_blow_reaches_the_nearest_foes_in_its_arc_and_reach_up_to_its_strokes_count() {
    let striker = player_at(0.0, 0.0);
    let ahead = |x: f64, y: f64| foe_at(x, y, core::f64::consts::PI);
    let fighters = vec![
        (2, ahead(0.0, -1.5)),
        (3, ahead(0.6, -1.6)),
        (4, ahead(-0.8, -1.4)),
        (5, ahead(0.0, -4.0)),
        (6, ahead(0.0, 1.5)),
        (7, player_at(0.3, -1.0)),
    ];
    let attack = |stroke| combat::fighter::Attack {
        stroke,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: Swing::Plain,
        left_hand: false,
    };
    assert_eq!(struck(1, &striker, &attack(Stroke::Up), &fighters, &[]), vec![2], "a thrust strikes one");
    assert_eq!(
        struck(1, &striker, &attack(Stroke::Left), &fighters, &[]),
        vec![2, 4, 3],
        "a sweep three, nearest first"
    );
    assert!(
        struck(1, &striker, &attack(Stroke::Down), &fighters, &[]).iter().all(|id| *id != 5 && *id != 6 && *id != 7)
    );
    let wall = [Block { min_x: -2.0, min_y: -1.2, max_x: 2.0, max_y: -1.0, top: 3.0 }];
    assert!(struck(1, &striker, &attack(Stroke::Left), &fighters, &wall).is_empty(), "nothing through a wall");
    let mut locked = striker;
    locked.target = Some(3);
    assert_eq!(struck(1, &locked, &attack(Stroke::DownLeft), &fighters, &[]), vec![3, 2], "the lock's target first");
}

#[test]
fn a_dodge_pressed_in_a_swings_wind_up_cancels_it() {
    let (fighter, _) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Down), 10, None);
    let dodge = Intent {
        controls: Controls { yaw: 0.0, sideways: 1.0, ..Controls::default() },
        combat: CombatInput { attack: Some(Stroke::Down), dodge: true, ..CombatInput::default() },
    };
    let (dodged, happenings) = run(fighter, dodge, 1, None);
    assert!(matches!(dodged.action, Action::Dodge { .. }));
    assert_eq!(happenings, vec![(0, Happening::Dodged)]);
    let _ = SWORD;
}

#[test]
fn an_arms_code_names_only_hands_someone_could_hold() {
    use combat::arms::{Arms, Ranged, arms_of};
    for (right, left) in
        [("warhammer_iron", ""), ("sword_iron", "shield_kite_steel"), ("bow_short_iron", ""), ("", "dagger_iron_l")]
    {
        let arms = arms_of(right, left, true);
        assert_eq!(Arms::from_code(arms.code()), arms, "{right} and {left} cross whole");
    }
    let forged =
        |melee: WeaponClass, ranged: Option<Ranged>, off_hand: OffHand| Arms { melee, ranged, off_hand }.code();
    let bare = Arms::from_code(0);
    assert_eq!(Arms::from_code(forged(WeaponClass::Warhammer, None, OffHand::Shield)), bare, "two hands and a shield");
    assert_eq!(Arms::from_code(forged(WeaponClass::Sword, Some(Ranged::Thunderlock), OffHand::Empty)), bare);
}
