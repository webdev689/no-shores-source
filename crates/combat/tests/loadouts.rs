//! What the loadouts bring to a fight: the greatsword, a long sword held on its hilt; the double pistolet, firing
//! right then left before it reloads; and the swap between loadouts, in which no blow or shot starts, and a click or a
//! pull made in it is kept for its end.

mod common;

use combat::arms::{Arms, HILT, OffHand, Ranged, WeaponClass, arms_of, swing_ticks, weapon};
use combat::fighter::Action;
use combat::shots::{BRACE_GAP, shot_numbers};
use combat::tuning::{FLINCH, SWAP_TICKS};
use combat::{CombatInput, Fighter, Happening, Intent, Stroke};
use common::{SWORD, asking, dodging, guarding, idle, player_at, run, script, swinging};

const BRACE: Arms = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::DoublePistolet), off_hand: OffHand::Empty };
const TRIGGER: CombatInput = CombatInput {
    attack: None,
    guard: false,
    dodge: false,
    shoot: true,
    pitch: 0.0,
    aim: false,
    mark: None,
    heal: false,
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

/// A player at rest, its other loadout just taken up: the swap to `arms` begun.
fn swapping_to(arms: Arms) -> Fighter {
    let from = if arms == SWORD { BRACE } else { SWORD };
    Fighter { arms: from, ..player_at(0.0, 0.0) }.holding(arms)
}

/// The tick a swap begun before the first ends on: the first a blow or a shot may start.
const SWAP_ENDS: usize = SWAP_TICKS as usize;

fn swung(happenings: &[(usize, Happening)]) -> Vec<(usize, Stroke)> {
    let swing = |(tick, happening): &(usize, Happening)| match happening {
        Happening::Swung(attack) => Some((*tick, attack.stroke)),
        _ => None,
    };
    happenings.iter().filter_map(swing).collect()
}

/// `first` on the swap's first tick, `then` three ticks on, and nothing more for well past its end.
fn pressed(first: Intent, then: Intent) -> Vec<Intent> {
    [vec![first, idle(0.0), idle(0.0), then], vec![idle(0.0); SWAP_ENDS + 60]].concat()
}

#[test]
fn a_click_at_any_tick_of_a_swap_swings_once_as_it_ends_with_its_stroke() {
    for at in [0, 5, SWAP_ENDS - 1] {
        let mut intents = vec![idle(0.0); SWAP_ENDS + 60];
        intents[at] = swinging(0.0, Stroke::Up);
        let (_, happenings) = script(swapping_to(SWORD), &intents);
        assert_eq!(swung(&happenings), [(SWAP_ENDS, Stroke::Up)], "clicked on the swap's tick {at}");
    }
    let held = [vec![swinging(0.0, Stroke::Up)], vec![swinging(0.0, Stroke::Down); 70]].concat();
    let (_, happenings) = script(swapping_to(SWORD), &held);
    let end = usize::try_from(swing_ticks(WeaponClass::Sword).1).unwrap_or(0);
    let again = SWAP_ENDS + end;
    assert_eq!(swung(&happenings), [(SWAP_ENDS, Stroke::Down), (again, Stroke::Down)], "held, it swings on");
}

#[test]
fn in_a_swap_the_latest_press_wins_and_a_blow_lets_a_click_go() {
    let click = swinging(0.0, Stroke::Up);
    let (_, guarded) = script(swapping_to(SWORD), &pressed(click, guarding(0.0)));
    assert!(guarded.contains(&(3, Happening::Guarded { window: true })), "{guarded:?}");
    assert!(swung(&guarded).is_empty(), "a guard pressed after the click wins: {guarded:?}");
    let (_, dodged) = script(swapping_to(SWORD), &pressed(click, dodging(0.0, 0.0, 1.0)));
    assert!(dodged.contains(&(3, Happening::Dodged)) && swung(&dodged).is_empty(), "so does a dodge: {dodged:?}");
    let (_, dodged) = script(swapping_to(SWORD), &pressed(dodging(0.0, 0.0, 1.0), click));
    assert_eq!(swung(&dodged), [(SWAP_ENDS, Stroke::Up)], "a click after the dodge swings as the swap ends");
    let (clicked, _) = script(swapping_to(SWORD), &[click]);
    let (_, back) = run(clicked.holding(BRACE), idle(0.0), SWAP_TICKS + 60, None);
    assert!(back.is_empty(), "swapped again, the click is let go: {back:?}");
    let struck = Fighter { action: Action::Flinch { left: FLINCH }, ..clicked };
    let (_, after) = run(struck, idle(0.0), SWAP_TICKS + 60, None);
    assert!(after.is_empty(), "struck in the swap, the click runs out as any press: {after:?}");
}

#[test]
fn a_pull_in_a_swap_to_a_gun_fires_as_it_ends_or_does_nothing_with_none_loaded() {
    let pulled = pressed(asking(0.0, TRIGGER), idle(0.0));
    let (kept, _) = script(swapping_to(BRACE), &pulled[..1]);
    assert_eq!(Fighter::from_floats(&kept.to_floats()), kept, "the pull kept crosses whole");
    let (_, happenings) = script(swapping_to(BRACE), &pulled);
    assert!(matches!(happenings.as_slice(), [(SWAP_ENDS, Happening::Loosed(_))]), "{happenings:?}");
    let empty = Fighter { ammo: Some(0), ..swapping_to(BRACE) };
    let (_, happenings) = script(empty, &pulled);
    assert!(happenings.is_empty(), "{happenings:?}");
}
