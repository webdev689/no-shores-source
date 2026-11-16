//! The kinds: each spawns a fighter of the foes' side with its kind's arms, health, poise, weight and might, and its
//! brain, and each kind's number and name read back.

use combat::arms::{OffHand, Ranged, WeaponClass};
use combat::fighter::{Side, Weight};
use foes::{Kind, spawn};

#[test]
fn each_kind_spawns_with_its_own_numbers() {
    let expected = [
        (Kind::Skirmisher, WeaponClass::Dagger, OffHand::Weapon, None, 45.0, 18.0, Weight::Light, 1.0),
        (Kind::Swordsman, WeaponClass::Sword, OffHand::Shield, None, 70.0, 35.0, Weight::Medium, 1.0),
        (Kind::Brute, WeaponClass::Warhammer, OffHand::Empty, None, 130.0, 70.0, Weight::Heavy, 1.1),
        (Kind::Archer, WeaponClass::Fists, OffHand::Empty, Some(Ranged::Bow), 50.0, 18.0, Weight::Light, 1.0),
        (Kind::Captain, WeaponClass::Sword, OffHand::Empty, None, 400.0, 120.0, Weight::Heavy, 1.2),
    ];
    for (kind, melee, off_hand, ranged, health, poise, weight, might) in expected {
        let (fighter, brain) = spawn(kind, 3.0, -4.0, 1.0);
        assert_eq!(fighter.side, Side::Foes, "{kind:?}");
        assert_eq!((fighter.arms.melee, fighter.arms.off_hand, fighter.arms.ranged), (melee, off_hand, ranged));
        assert_eq!((fighter.health, fighter.health_max, fighter.poise_max), (health, health, poise), "{kind:?}");
        assert_eq!(fighter.weight, weight, "{kind:?}");
        assert!((fighter.might - might).abs() < 1e-12 && (brain.might() - might).abs() < 1e-12, "{kind:?}");
        assert_eq!((fighter.body.x, fighter.body.y, fighter.body.facing, fighter.aim), (3.0, -4.0, 1.0, 1.0));
        assert_eq!(brain.kind, kind);
        assert_eq!(brain.target(), None, "a new foe has seen nobody yet");
    }
}

#[test]
fn a_kinds_number_and_name_read_back() {
    for kind in Kind::ALL {
        assert_eq!(Kind::from_number(kind as u8), Some(kind));
    }
    assert_eq!(Kind::from_number(0), None);
    assert_eq!(Kind::from_number(6), None);
    let names: Vec<&str> = Kind::ALL.iter().map(|kind| kind.name()).collect();
    assert_eq!(names, ["skirmisher", "swordsman", "brute", "archer", "captain"]);
}
