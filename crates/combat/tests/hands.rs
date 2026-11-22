//! What the hands may do where the body is: a swing, a guard and a shot only on foot or in the air, never hanging,
//! climbing or going over a lip; a riposte only once a swing can start; and a dodge from a crouch under a low ceiling
//! keeps the body crouched there.

mod common;

use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::Action;
use combat::tuning::DODGE_TICKS;
use combat::{CombatInput, Happening};
use common::{asking, dodging, guarding, player_at, run, run_on, swinging};
use movement::{Block, Mode};

#[test]
fn hanging_climbing_or_going_over_a_lip_the_hands_neither_swing_guard_nor_shoot() {
    for mode in [Mode::Hang, Mode::Climb, Mode::Mantle, Mode::Vault] {
        let mut fighter = player_at(0.0, 0.0);
        fighter.body.mode = mode;
        let (swung, happenings) = run(fighter, swinging(0.0, Stroke::Down), 1, None);
        assert!(happenings.is_empty() && matches!(swung.action, Action::Idle), "{mode:?}: {happenings:?}");
        let (guarded, _) = run(fighter, guarding(0.0), 1, None);
        assert!(matches!(guarded.action, Action::Idle), "{mode:?} raises no guard: {:?}", guarded.action);
        let mut archer = fighter;
        archer.arms = Arms { melee: WeaponClass::Sword, ranged: Some(Ranged::Bow), off_hand: OffHand::Empty };
        let shooting = asking(0.0, CombatInput { shoot: true, ..CombatInput::default() });
        let (_, shots) = run(archer, shooting, 1, None);
        assert!(shots.is_empty(), "{mode:?} looses no shot: {shots:?}");
    }
    let mut leaping = player_at(0.0, 0.0);
    leaping.body.mode = Mode::Air;
    let (_, happenings) = run(leaping, swinging(0.0, Stroke::Down), 1, None);
    assert!(matches!(happenings.first(), Some((0, Happening::Swung(_)))), "in the air it swings");
}

#[test]
fn a_riposte_clicked_while_a_swing_cannot_start_leaves_the_parry_playing() {
    let mut parrier = player_at(0.0, 0.0);
    parrier.action = Action::Parry { elapsed: 0 };
    parrier.riposte = Some((2, 30));
    parrier.swap = 10;
    let (after, happenings) = run(parrier, swinging(0.0, Stroke::Up), 1, None);
    assert!(happenings.is_empty());
    assert!(matches!(after.action, Action::Parry { elapsed: 1 }), "{:?}", after.action);
    assert!(after.riposte.is_some(), "the riposte is still owed");
}

#[test]
fn a_dodge_from_a_crouch_under_a_low_slab_stays_crouched_there_and_is_never_thrown_aside() {
    let slab = Block { min_x: -2.0, min_y: -2.0, max_x: 2.0, max_y: 2.0, top: 1.5, bottom: 1.2 };
    let mut fighter = player_at(0.0, 0.0);
    fighter.body.crouched = true;
    fighter.body.crouch = 1.0;
    let (mut body, mut ticks) = (fighter, 0);
    let mut intent = dodging(0.0, 0.0, 1.0);
    while ticks < DODGE_TICKS + 20 {
        let (next, _) = run_on(body, intent, 1, None, &[slab]);
        let (east, south) = (next.body.x - body.body.x, next.body.y - body.body.y);
        let step = (east * east + south * south).sqrt();
        assert!(step < 0.2, "tick {ticks} moved {step} m: {:?}", next.body);
        let under = next.body.x < slab.max_x + movement::TUNING.radius;
        assert!(!under || next.body.crouched, "tick {ticks} stands under the slab: {:?}", next.body);
        (body, ticks) = (next, ticks + 1);
        intent = common::idle(0.0);
    }
    assert!(body.body.x > slab.max_x, "the hop carries it out east: {:?}", body.body);
}
