//! What the loadouts bring to a fight: the greatsword, a long sword held on its hilt; the double pistolet, firing
//! right then left before it reloads; and the swap between loadouts, in which no blow or shot starts.

mod common;

use combat::arms::{Arms, HILT, OffHand, Ranged, WeaponClass, arms_of, swing_ticks, weapon};
use combat::fighter::Action;
use combat::shots::{BRACE_GAP, shot_numbers};
use combat::tuning::SWAP_TICKS;
use combat::{CombatInput, Fighter, Happening, Stroke};
use common::{SWORD, asking, idle, player_at, run, swinging};

const BRACE: Arms = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::DoublePistolet), off_hand: OffHand::Empty };
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

#[test]
fn a_greatsword_is_a_sword_held_on_its_hilt_with_its_own_numbers() {
    let arms = arms_of("sword_steel", HILT, true);
    assert_eq!(arms, Arms { melee: WeaponClass::Greatsword, ranged: None, off_hand: OffHand::Empty });
    assert_eq!(Arms::from_code(arms.code()), arms, "it crosses whole");
    let held = weapon(WeaponClass::Greatsword);
    assert_eq!((held.reach, held.damage, held.stamina, held.handling), (2.3, 24.0, 21.0, 1.06));
    assert!((held.weight - 1.3 * 1.15).abs() < 1e-12 && held.two_handed);
    assert!(swing_ticks(WeaponClass::Greatsword).1 > swing_ticks(WeaponClass::Sword).1, "it comes round slower");
    assert_eq!(arms_of("sword_steel", "", true).melee, WeaponClass::Sword, "one hand, a sword");
    assert_eq!(arms_of("mace_iron", HILT, true).melee, WeaponClass::Mace, "only a sword is held on its hilt");
}

#[test]
fn a_double_pistolet_fires_right_then_left_before_one_long_reload() {
    let arms = arms_of("pistolet_iron", "pistolet_iron_l", true);
    assert_eq!(arms, BRACE);
    assert_eq!(Arms::from_code(arms.code()), arms);
    let (_, damage, _, reload) = shot_numbers(Ranged::DoublePistolet);
    let (_, single, _, single_reload) = shot_numbers(Ranged::Pistolet);
    assert!((damage - single * 0.85).abs() < 1e-12 && reload == single_reload * 3 / 2);
    let mut gunner = player_at(0.0, 0.0);
    gunner.arms = BRACE;
    let ticks = BRACE_GAP + reload + 4;
    let (after, happenings) = run(gunner, asking(0.0, TRIGGER), ticks, None);
    let shots: Vec<u32> = happenings
        .iter()
        .filter_map(|(tick, happening)| matches!(happening, Happening::Loosed(_)).then_some(*tick))
        .collect();
    assert_eq!(shots, [0, BRACE_GAP + 1, BRACE_GAP + reload + 2], "right, left, then right once both are loaded");
    assert!(after.fired_right, "the right has fired again");
    let floats = after.to_floats();
    assert_eq!(Fighter::from_floats(&floats), after, "which hand fires next crosses whole");
}

#[test]
fn a_swap_holds_off_every_blow_and_shot_for_its_ticks() {
    let gunner = player_at(0.0, 0.0).holding(BRACE);
    assert_eq!(gunner.swap, SWAP_TICKS, "a new weapon held is a swap");
    assert_eq!(gunner.holding(BRACE).swap, SWAP_TICKS, "holding the same is none");
    let (_, none) = run(gunner, asking(0.0, TRIGGER), SWAP_TICKS, None);
    assert!(none.is_empty(), "no shot in the swap");
    let (_, shot) = run(gunner, asking(0.0, TRIGGER), SWAP_TICKS + 1, None);
    assert!(matches!(shot.as_slice(), [(_, Happening::Loosed(_))]), "one as it ends: {shot:?}");
    let swordsman = gunner.holding(SWORD);
    let (swapping, _) = run(swordsman, idle(0.0), 1, None);
    assert_eq!(Fighter::from_floats(&swapping.to_floats()).swap, SWAP_TICKS - 1, "the swap's ticks cross whole");
    let (_, early) = run(swordsman, swinging(0.0, Stroke::Down), SWAP_TICKS, None);
    assert!(early.is_empty(), "no blow in the swap");
    let (_, swung) = run(swordsman, swinging(0.0, Stroke::Down), SWAP_TICKS + 1, None);
    assert!(matches!(swung.first(), Some((_, Happening::Swung(_)))), "a swing as it ends");
    let bare = run(swordsman, idle(0.0), SWAP_TICKS, None).0.holding(combat::arms::BARE_HANDS);
    assert_eq!(bare.swap, SWAP_TICKS, "a weapon put away starts one");
    let (drawn, _) = run(bare, idle(0.0), 10, None);
    assert_eq!(drawn.holding(SWORD).swap, SWAP_TICKS - 10, "drawn again, it runs on");
    let mut fresh = player_at(0.0, 0.0);
    fresh.arms = combat::arms::BARE_HANDS;
    assert_eq!(fresh.holding(BRACE).swap, 0, "from bare hands a weapon is drawn at once");
    let mut busy = swordsman;
    busy.action = Action::Reload { left: 9 };
    assert_eq!(busy.holding(BRACE).arms, SWORD, "nothing is changed in the middle of what it does");
}
