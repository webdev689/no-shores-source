//! Swings: DFO's timing, the stamina they cost, holding to swing again, a pair's hands taking turns, moving slowly
//! while swinging, the soft lock steering the blow, and who it reaches.

mod common;

use combat::arms::{OffHand, PAIR_DAMAGE, WeaponClass, foe_swing_ticks, pair_swing_ticks, swing_ticks, weapon};
use combat::fighter::{Action, Swing};
use combat::strike::{struck, weapon_reach};
use combat::{CombatInput, Happening, Intent, Stroke, Surroundings, step_fighter};
use common::{SWORD, foe_at, idle, player_at, run, swinging};
use movement::{Block, Controls, Flat};

#[test]
fn a_sword_swing_lands_its_blow_as_the_third_of_five_frames_begins_and_ends_at_the_fifth() {
    assert_eq!(swing_ticks(WeaponClass::Sword), (18, 45), "three quarters of DFO's 24 and 60");
    assert_eq!(swing_ticks(WeaponClass::Dagger), (16, 40));
    let (warhammer_strike, warhammer_end) = swing_ticks(WeaponClass::Warhammer);
    assert!(warhammer_strike > 18 && warhammer_end > 45, "two hands and weight swing slower");
    let (fighter, happenings) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Down), 19, None);
    assert!(matches!(happenings[0], (0, Happening::Swung(_))));
    assert!(matches!(happenings[1], (18, Happening::Struck(attack)) if attack.elapsed == 18));
    assert_eq!(happenings.len(), 2);
    assert!((fighter.stamina - (100.0 - weapon(WeaponClass::Sword).stamina)).abs() < 1e-9);
}

#[test]
fn holding_the_button_swings_again_as_each_blow_ends_and_a_tap_swings_once() {
    let (_, held) = run(player_at(0.0, 0.0), swinging(0.0, Stroke::Left), 100, None);
    let swung = held.iter().filter(|(_, happening)| matches!(happening, Happening::Swung(_))).count();
    assert_eq!(swung, 3, "swings begin at ticks 0, 45 and 90");
    let mut fighter = player_at(0.0, 0.0);
    let mut swings = 0;
    for tick in 0..130 {
        let intent = if tick == 0 { swinging(0.0, Stroke::Left) } else { idle(0.0) };
        let (next, happening) =
            step_fighter(&fighter, &intent, &Surroundings { blocks: &[], terrain: &movement::Flat, target_at: None });
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
    let (_, happenings) = run(pair, swinging(0.0, Stroke::DownLeft), 100, None);
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
fn a_foes_swing_takes_seven_eighths_of_the_laws_time_a_players_three_quarters() {
    assert_eq!(foe_swing_ticks(WeaponClass::Sword), (21, 52), "seven eighths of DFO's 24 and 60");
    assert_eq!(foe_at(0.0, 0.0, 0.0).swing_ticks(), foe_swing_ticks(WeaponClass::Sword));
    assert_eq!(player_at(0.0, 0.0).swing_ticks(), swing_ticks(WeaponClass::Sword));
    let (_, happenings) = run(foe_at(0.0, 0.0, 0.0), swinging(0.0, Stroke::Up), 1, None);
    assert!(matches!(happenings.first(), Some((_, Happening::Swung(attack))) if attack.strike == 21), "{happenings:?}");
}

#[test]
fn a_players_pair_comes_round_in_four_fifths_of_its_lone_weapons_time_each_blow_nine_tenths_and_a_foes_as_lone() {
    assert_eq!(pair_swing_ticks(WeaponClass::Sword), (14, 36), "a sword's 18 and 45 at four fifths");
    let mut striker = player_at(0.0, 0.0);
    let (_, happenings) = run(striker, swinging(0.0, Stroke::Up), 1, None);
    let Some(Happening::Swung(attack)) = happenings.first().map(|(_, happening)| *happening) else { panic!("a swing") };
    let lone = combat::judge::swing_blow(1, &striker, &attack, 2).damage;
    striker.arms.off_hand = OffHand::Weapon;
    let paired = combat::judge::swing_blow(1, &striker, &attack, 2).damage;
    assert!((paired - lone * PAIR_DAMAGE).abs() < 1e-9, "{paired} against {lone}");
    let (_, happenings) = run(striker, swinging(0.0, Stroke::Up), 1, None);
    assert!(matches!(happenings.first(), Some((_, Happening::Swung(attack))) if attack.end == 36), "a player's pair");
    let mut foe = foe_at(0.0, 0.0, 0.0);
    let foes_lone = combat::judge::swing_blow(1, &foe, &attack, 2).damage;
    foe.arms.off_hand = OffHand::Weapon;
    assert_eq!(
        combat::judge::swing_blow(1, &foe, &attack, 2).damage,
        foes_lone,
        "a foe's pair strikes as its lone weapon"
    );
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
fn a_blow_strikes_every_foe_its_arc_and_reach_hold_the_locks_target_first_then_the_nearest() {
    let striker = player_at(0.0, 0.0);
    let ahead = |x: f64, y: f64| foe_at(x, y, core::f64::consts::PI);
    let fighters = vec![
        (2, ahead(0.0, -1.5)),
        (3, ahead(0.6, -1.6)),
        (4, ahead(-0.8, -1.4)),
        (5, ahead(0.0, -4.0)),
        (6, ahead(0.0, 1.5)),
        (7, player_at(0.3, -1.0)),
        (8, ahead(1.1, -1.0)),
    ];
    let attack = |stroke| combat::fighter::Attack {
        stroke,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: Swing::Plain,
        left_hand: false,
    };
    assert_eq!(
        struck(1, &striker, &attack(Stroke::Up), &fighters, &[], &Flat),
        vec![2],
        "a thrust's narrow arc holds one"
    );
    assert_eq!(
        struck(1, &striker, &attack(Stroke::Left), &fighters, &[], &Flat),
        vec![8, 2, 4, 3],
        "a sweep strikes all four in its arc, nearest first, no cap"
    );
    assert!(
        struck(1, &striker, &attack(Stroke::Down), &fighters, &[], &Flat)
            .iter()
            .all(|id| *id != 5 && *id != 6 && *id != 7)
    );
    let wall = [Block { min_x: -2.0, min_y: -1.2, max_x: 2.0, max_y: -1.0, top: 3.0, bottom: 0.0 }];
    assert!(struck(1, &striker, &attack(Stroke::Left), &fighters, &wall, &Flat).is_empty(), "nothing through a wall");
    let mut locked = striker;
    locked.target = Some(3);
    assert_eq!(
        struck(1, &locked, &attack(Stroke::DownLeft), &fighters, &[], &Flat),
        vec![3, 8, 2, 4],
        "the lock's target first"
    );
}

#[test]
fn a_players_weapon_reaches_a_tenth_further_than_a_foes_and_bare_fists_as_far() {
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 24,
        strike: 24,
        end: 60,
        swing: Swing::Plain,
        left_hand: false,
    };
    // A chop reaches the weapon's reach and a body's radius: 2.15 m in a foe's hands, 2.33 m in a player's.
    let foe_struck = foe_at(0.0, -2.25, core::f64::consts::PI);
    assert_eq!(
        struck(1, &player_at(0.0, 0.0), &attack, &[(2, foe_struck)], &[], &Flat),
        vec![2],
        "the player reaches it"
    );
    let player_struck = player_at(0.0, -2.25);
    assert!(
        struck(1, &foe_at(0.0, 0.0, 0.0), &attack, &[(2, player_struck)], &[], &Flat).is_empty(),
        "a foe falls short"
    );
    let nearer = player_at(0.0, -2.1);
    assert_eq!(
        struck(1, &foe_at(0.0, 0.0, 0.0), &attack, &[(2, nearer)], &[], &Flat),
        vec![2],
        "and reaches nearer in"
    );
    assert!((weapon_reach(WeaponClass::Greatsword, true) - 2.3 * 1.1).abs() < 1e-12);
    assert_eq!(weapon_reach(WeaponClass::Greatsword, false), 2.3);
    assert_eq!(weapon_reach(WeaponClass::Fists, true), weapon_reach(WeaponClass::Fists, false));
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
