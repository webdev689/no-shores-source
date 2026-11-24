//! An item's fight numbers: a weapon's are its class's as combat swings or shoots it, its traits move them as they
//! trim a player wearing it, and armour has only its trim.

use super::*;
use crate::perks::trim_of;
use combat::arms::{PAIR_PACE, weapon};
use gear::{At, Item, Rarity, Slot};

const NONE: [&str; 0] = [];

#[test]
fn a_sword_fights_with_its_class_numbers() {
    let (sword, trim) = stats(Kind::Sword, NONE);
    let held = weapon(WeaponClass::Sword);
    assert_eq!(trim, Trim::PLAIN);
    assert_eq!(sword.loadout, Loadout::Melee);
    assert_eq!([sword.impact, sword.stamina], [held.damage, held.stamina]);
    assert_eq!(sword.reach, combat::strike::stroke_reach(WeaponClass::Sword, Stroke::DownLeft, true));
    assert!(sword.reach > held.reach, "a player's blow reaches past its class's own, to a body's middle");
    assert_eq!(sword.poise, held.weight * POISE_PER_WEIGHT);
    assert_eq!(sword.rate, 1.0 / (f64::from(swing_ticks(WeaponClass::Sword).1) * TICK_SECONDS));
    assert_eq!(sword.hands, Hands::Free, "a sword alone leaves the left hand for a torch");
    assert_eq!([sword.aimed, sword.ammo, sword.reload, sword.aim_pace], [0.0; 4], "a blade shoots nothing");
}

#[test]
fn traits_move_the_numbers_they_trim() {
    let (plain, _) = stats(Kind::Sword, NONE);
    let (light, trim) = stats(Kind::Sword, ["light_grip"]);
    assert_eq!(trim.swing_stamina, 0.85);
    assert!((light.stamina - plain.stamina * 0.85).abs() < 1e-9, "Light Grip costs 15% less a swing");
    let (heavy, _) = stats(Kind::Sword, ["heavy_head", "honed"]);
    assert!((heavy.impact - plain.impact * 1.12 * 1.05).abs() < 1e-9, "both strike harder, together");
    assert!(heavy.stamina > plain.stamina, "Heavy Head's cost stands beside its gain");
    let (weighted, _) = stats(Kind::Sword, ["weighted"]);
    assert!((weighted.poise - plain.poise * 1.2).abs() < 1e-9);
}

#[test]
fn a_pair_swings_faster_and_lighter_than_its_lone_blade() {
    let (lone, _) = stats(Kind::Sword, NONE);
    let (pair, _) = stats(Kind::DoubleSwords, NONE);
    assert_eq!(pair.hands, Hands::Pair);
    assert!((pair.impact - lone.impact * PAIR_DAMAGE).abs() < 1e-9);
    assert!(pair.rate > lone.rate && pair.rate <= lone.rate / PAIR_PACE + 0.1, "about 1 / PAIR_PACE as often");
    assert_eq!(stats(Kind::SwordAndShield, NONE).0.hands, Hands::Shield);
    assert_eq!(stats(Kind::Greatsword, NONE).0.hands, Hands::Both);
}

#[test]
fn a_gun_shoots_its_shot_and_carries_its_ammunition() {
    let (gun, _) = stats(Kind::Thunderlock, NONE);
    let (speed, damage, _, reload) = shot_numbers(Ranged::Thunderlock);
    assert_eq!(gun.loadout, Loadout::Ranged);
    assert_eq!(gun.impact, damage);
    assert_eq!(gun.aimed, damage * combat::shots::AIMED_POWER, "a gun aims at once to its full power");
    assert_eq!(gun.reload, f64::from(reload) * TICK_SECONDS);
    assert_eq!([gun.flight, gun.draw, gun.stamina, gun.reach], [speed, 0.0, 0.0, 0.0]);
    assert_eq!(gun.ammo, f64::from(gear::ammo::capacity(Kind::Thunderlock).expect("a gun carries shots")));
    let (quick, _) = stats(Kind::Thunderlock, ["quick_hands"]);
    assert!(quick.rate > gun.rate && quick.reload < gun.reload, "Quick Hands reloads sooner");
}

#[test]
fn a_bow_strikes_two_thirds_quick_and_draws_to_its_full_shot() {
    let (bow, _) = stats(Kind::Bow, NONE);
    let damage = shot_numbers(Ranged::Bow).1;
    assert!((bow.impact - damage * 2.0 / 3.0).abs() < 1e-9);
    assert!((bow.aimed - damage).abs() < 1e-9, "a full draw strikes the bow's whole shot");
    assert_eq!(bow.draw, f64::from(DRAW_FULL) * TICK_SECONDS);
    assert_eq!(bow.aim_pace, AIM_PACE);
    let (stocked, _) = stats(Kind::Bow, ["light_stock", "overdrawn"]);
    assert!((stocked.aim_pace - 2.0 / 3.0).abs() < 1e-9, "Light Stock keeps two thirds of the pace");
    assert!(stocked.aimed > bow.aimed && stocked.reload > bow.reload, "Overdrawn strikes harder, reloads slower");
}

#[test]
fn a_pair_of_pistolets_fires_twice_before_it_reloads() {
    let (pair, _) = stats(Kind::DoublePistolet, NONE);
    let reload = f64::from(shot_numbers(Ranged::DoublePistolet).3);
    assert_eq!(pair.hands, Hands::Pair);
    assert!((pair.rate - 2.0 / ((f64::from(BRACE_GAP) + reload) * TICK_SECONDS)).abs() < 1e-9);
}

#[test]
fn armour_has_no_weapon_numbers_but_moves_the_body_its_perks_trim() {
    let (plain, _) = stats(Kind::Head, NONE);
    let (helm, trim) = stats(Kind::Head, ["second_wind", "unshaken"]);
    assert_eq!(helm.loadout, Loadout::None);
    assert_eq!([helm.impact, helm.rate, helm.ammo], [0.0; 3]);
    assert!((trim.regen - 1.15).abs() < 1e-9 && (trim.poise_taken - 1.0 / 1.15).abs() < 1e-9);
    assert_eq!(plain.stamina_back, 45.0, "a body rests back 45 stamina a second");
    assert_eq!([plain.dodge_cost, plain.poise_held, plain.healing], [DODGE_STAMINA, PLAYER_POISE, DRINK_HEALS]);
    assert!((helm.stamina_back - 45.0 * 1.15).abs() < 1e-9, "Second Wind: back 15% faster");
    assert!((helm.poise_held - PLAYER_POISE * 1.15).abs() < 1e-9, "Unshaken: poise holds 15% more");
    assert_eq!(stats(Kind::Legs, ["sure_footing"]).0.dodge_cost, DODGE_STAMINA * 0.85);
    assert!((stats(Kind::Torso, ["lightbearer"]).0.healing - DRINK_HEALS * 1.15).abs() < 1e-9);
}

#[test]
fn an_items_trim_is_what_wearing_it_trims_a_player() {
    let mut character = gear::Character::kitted();
    let mut sword = Item::new(99, Kind::Sword, Rarity::Legendary, 20, Slot::Melee);
    // Its trait columns in order (handling, perk, finish); the grid's handling is column 0 and its finish column 4.
    sword.layout = vec![
        vec!["heavy_head".into(), "light_grip".into()],
        vec!["bloodletter".into(), "executioner".into()],
        vec!["honed".into(), "balanced".into()],
    ];
    for column in [0, 4] {
        sword.bought |= sword.node_bit(column, 0).expect("a node");
        sword.chosen[column] = 0;
    }
    let main = character.worn(Slot::Melee).expect("the starting sword").id;
    character.items.remove(&main);
    let traits: Vec<String> = sword.active_traits().map(str::to_owned).collect();
    character.items.insert(99, (sword, At::Worn(Slot::Melee)));
    let (_, trim) = stats(Kind::Sword, traits.iter().map(String::as_str));
    assert_eq!(traits, ["heavy_head", "honed"]);
    assert_eq!(trim, trim_of(&character, Slot::Melee), "the kit's armour gives nothing, so the sword's is all of it");
}
