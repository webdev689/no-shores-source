//! Ammunition: a player's shot spends one of their Ranged weapon's, a double pistolet's two shots two, and at none it
//! will not fire, quick or aimed; a foe's never runs dry; and what is left crosses whole with the fighter.

mod common;

use combat::arms::{Arms, OffHand, Ranged, WeaponClass};
use combat::fighter::Action;
use combat::{CombatInput, Fighter, Happening};
use common::{asking, foe_at, player_at, run};

const TRIGGER: CombatInput = CombatInput {
    attack: None,
    guard: false,
    dodge: false,
    shoot: true,
    pitch: 0.0,
    aim: false,
    mark: None,
    telegraph: None,
};
const AIMING: CombatInput = CombatInput { shoot: false, aim: true, ..TRIGGER };

fn holding(ranged: Ranged, ammo: Option<u32>) -> Fighter {
    let mut fighter = player_at(0.0, 0.0);
    fighter.arms = Arms { melee: WeaponClass::Fists, ranged: Some(ranged), off_hand: OffHand::Empty };
    fighter.ammo = ammo;
    fighter
}

fn shots(happenings: &[(u32, Happening)]) -> usize {
    happenings.iter().filter(|(_, happening)| matches!(happening, Happening::Loosed(_))).count()
}

#[test]
fn a_shot_spends_one_and_at_none_the_weapon_will_not_fire() {
    let (spent, happenings) = run(holding(Ranged::Bow, Some(2)), asking(0.0, TRIGGER), 200, None);
    assert_eq!(shots(&happenings), 2, "two shots, then none however long the trigger is held");
    assert_eq!(spent.ammo, Some(0));
    assert!(!spent.loaded());
    let (drawn, _) = run(holding(Ranged::Crossbow, Some(0)), asking(0.0, AIMING), 30, None);
    assert!(matches!(drawn.action, Action::Draw { .. }), "an empty weapon is still raised");
    let (_, pulled) = run(drawn, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert_eq!(shots(&pulled), 0, "an aimed pull fires nothing at none");
}

#[test]
fn a_double_pistolets_two_shots_spend_two() {
    let (spent, happenings) = run(holding(Ranged::DoublePistolet, Some(5)), asking(0.0, TRIGGER), 40, None);
    assert_eq!(shots(&happenings), 2, "right, then left");
    assert_eq!(spent.ammo, Some(3));
}

#[test]
fn a_foes_weapon_never_runs_dry() {
    let mut foe = foe_at(0.0, 0.0, 0.0);
    foe.arms = holding(Ranged::Bow, None).arms;
    assert_eq!(foe.ammo, None);
    let (after, happenings) = run(foe, asking(0.0, TRIGGER), 400, None);
    assert!(shots(&happenings) >= 9 && after.ammo.is_none() && after.loaded());
}

#[test]
fn what_is_left_crosses_whole_with_the_fighter() {
    for ammo in [None, Some(0), Some(1), Some(60)] {
        let fighter = holding(Ranged::Thunderlock, ammo);
        assert_eq!(Fighter::from_floats(&fighter.to_floats()).ammo, ammo);
    }
    assert_eq!(Fighter::from_glance(&holding(Ranged::Bow, Some(4)).glance()).ammo, None, "a glance carries none");
}
