use crate::ammo::{AMMO_FULL, CRATE_PRICE, CRATES_MOST, box_chance, capacity, drops_crate};
use crate::asks::{Ask, Done, Here, Refusal};
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const AFIELD: Here = Here { social: false, day: 0, week: 0 };
const AT_THE_COUNTER: Here = Here { social: true, day: 0, week: 0 };

/// A starting character wearing a level 1 Normal Ranged loadout of this kind.
fn wearing(kind: Kind) -> Character {
    let mut character = Character::starting();
    let id = character.take_id();
    character.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, Slot::Ranged), At::Carried));
    assert_eq!(character.ask(Ask::Wear { item: id, slot: Slot::Ranged }, AFIELD, &DICE), Ok(Done::Done));
    character
}

#[test]
fn each_ranged_kind_carries_its_own_capacity_and_starts_full() {
    let kinds = [Kind::Bow, Kind::Crossbow, Kind::Pistolet, Kind::DoublePistolet, Kind::Thunderlock];
    let carried: Vec<u16> = kinds.iter().map(|kind| wearing(*kind).shots()).collect();
    assert_eq!(carried, [60, 30, 24, 36, 16]);
    for kind in kinds {
        let most = capacity(kind).expect("a Ranged kind");
        assert_eq!(AMMO_FULL % most, 0, "{kind:?}: a shot is a whole number of parts");
    }
    assert_eq!(capacity(Kind::Sword), None);
    assert_eq!(Character::starting().shots(), 0, "no Ranged worn, no shots");
}

#[test]
fn a_shot_spends_one_and_another_ranged_weapon_keeps_the_share() {
    let mut character = wearing(Kind::Bow);
    for _ in 0..30 {
        character.spend_shot();
    }
    assert_eq!(character.shots(), 30, "half the bow's 60");
    let crossbow = character.take_id();
    character
        .items
        .insert(crossbow, (Item::new(crossbow, Kind::Crossbow, Rarity::Normal, 1, Slot::Ranged), At::Carried));
    assert_eq!(character.ask(Ask::Wear { item: crossbow, slot: Slot::Ranged }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.shots(), 15, "half the crossbow's 30");
    for _ in 0..20 {
        character.spend_shot();
    }
    assert_eq!((character.shots(), character.ammo), (0, 0), "none left, and never below none");
}

#[test]
fn an_ammo_box_gives_back_a_quarter_and_is_left_lying_when_full() {
    let mut character = wearing(Kind::Thunderlock);
    assert!(!character.take_ammo_box(), "full: the box stays where it lies");
    character.ammo = 0;
    assert!(character.take_ammo_box());
    assert_eq!(character.shots(), 4, "a quarter of 16");
    for kind in [Kind::Bow, Kind::Crossbow, Kind::Pistolet, Kind::DoublePistolet, Kind::Thunderlock] {
        let mut empty = wearing(kind);
        empty.ammo = 0;
        assert!(empty.take_ammo_box());
        assert!(empty.shots() >= 1, "{kind:?}: at least one shot");
    }
    character.ammo = AMMO_FULL - 10;
    assert!(character.take_ammo_box());
    assert_eq!(character.ammo, AMMO_FULL, "never past full");
}

#[test]
fn an_ammo_crate_fills_the_ranged_weapon_and_five_are_carried_at_most() {
    let mut character = wearing(Kind::Pistolet);
    assert_eq!(character.ask(Ask::UseCrate, AFIELD, &DICE), Err(Refusal::NoCrate));
    for _ in 0..CRATES_MOST {
        assert!(character.take_crate());
    }
    assert!(!character.take_crate(), "a sixth is left lying");
    assert_eq!(character.ask(Ask::UseCrate, AFIELD, &DICE), Err(Refusal::AmmoFull), "full, it is kept");
    character.ammo = 30;
    assert_eq!(character.ask(Ask::UseCrate, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!((character.shots(), character.materials.crates), (24, CRATES_MOST - 1));
}

#[test]
fn an_ammo_crate_is_refused_with_no_ranged_weapon_worn_and_kept() {
    let mut character = Character::starting();
    assert!(character.worn(Slot::Ranged).is_none(), "the starting kit wears none");
    assert!(character.take_crate());
    character.ammo = 30;
    assert_eq!(character.ask(Ask::UseCrate, AFIELD, &DICE), Err(Refusal::NoRanged));
    assert_eq!((character.ammo, character.materials.crates), (30, 1), "nothing spent");
    assert_eq!(crate::asks::Refusal::NoRanged as u8 + 1, 120, "the room's answer 120");
}

#[test]
fn the_quartermaster_sells_crates_at_the_counter_for_their_price() {
    let mut character = wearing(Kind::Bow);
    character.materials.aurem = CRATE_PRICE * 2;
    assert_eq!(character.ask(Ask::BuyCrate, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::BuyCrate, AT_THE_COUNTER, &DICE), Ok(Done::Done));
    assert_eq!((character.materials.aurem, character.materials.crates), (CRATE_PRICE, 1));
    character.materials.crates = CRATES_MOST;
    assert_eq!(character.ask(Ask::BuyCrate, AT_THE_COUNTER, &DICE), Err(Refusal::CratesFull));
    character.materials.crates = 0;
    character.materials.aurem = CRATE_PRICE - 1;
    assert_eq!(character.ask(Ask::BuyCrate, AT_THE_COUNTER, &DICE), Err(Refusal::Short));
}

#[test]
fn a_kill_drops_a_box_by_rank_and_a_crate_from_a_miniboss_or_a_boss() {
    assert_eq!([1, 2, 3, 4, 5].map(box_chance), [0.2, 0.35, 0.6, 1.0, 1.0]);
    assert_eq!([1, 2, 3, 4, 5].map(drops_crate), [false, false, false, true, true]);
}

#[test]
fn a_character_kept_before_ammunition_reads_full_and_a_kept_one_keeps_its_share() {
    let mut character = wearing(Kind::Crossbow);
    character.ammo = 240;
    character.materials.crates = 3;
    let kept = Character::from_json(&character.to_json()).expect("read back");
    assert_eq!((kept.shots(), kept.materials.crates), (10, 3));
    let mut old: serde_json::Value = serde_json::from_str(&character.to_json()).expect("json");
    old.as_object_mut().expect("an object").remove("ammo");
    old["materials"].as_object_mut().expect("materials").remove("crates");
    let read = Character::from_json(&old.to_string()).expect("an old save reads");
    assert_eq!((read.shots(), read.materials.crates), (30, 0));
    old["ammo"] = serde_json::json!(9_000);
    old["materials"]["crates"] = serde_json::json!(40);
    let broken = Character::from_json(&old.to_string()).expect("a broken one is made whole");
    assert_eq!((broken.ammo, broken.materials.crates), (AMMO_FULL, CRATES_MOST));
}
