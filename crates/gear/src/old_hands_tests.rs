//! Characters kept before the loadouts, written by the gear rules of that time (`old_saves/`), read into the Melee and
//! Ranged loadouts with nothing lost.

use crate::asks::{Ask, Done, Here, Refusal};
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use serde_json::Value;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };

/// The old character from a fixture, as text and as read now.
fn read(text: &str) -> (Value, Character) {
    let old: Value = serde_json::from_str(text).expect("an old character");
    (old, Character::from_json(text).expect("read into loadouts"))
}

fn kind_at(character: &Character, id: u32) -> (Kind, At) {
    let (item, at) = &character.items[&id];
    (item.kind, *at)
}

/// Every piece of the old character that was no shield is still held, as it was but for its kind, slot and place:
/// its rarity, level, XP, name, traits, nodes and element.
fn kept_whole(old: &Value, character: &Character) {
    for (key, entry) in old["items"].as_object().expect("items") {
        let item = &entry[0];
        if item["kind"] == "shield" {
            continue;
        }
        let id: u32 = key.parse().expect("a number");
        let now = serde_json::to_value(character.item(id).expect("kept")).expect("json");
        for field in ["rarity", "level", "xp", "name", "named", "layout", "bought", "chosen", "resource", "breach"] {
            assert_eq!(now[field], item[field], "item {id}'s {field}");
        }
        assert_eq!(now.get("element"), item.get("element"), "item {id}'s element");
    }
    assert_eq!(Character::from_json(&character.to_json()).as_ref(), Some(character), "read once, kept as read");
}

#[test]
fn a_sword_with_a_shield_becomes_a_sword_and_shield_and_the_shield_is_refunded() {
    let (old, character) = read(include_str!("old_saves/sword_and_shield.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 1), (Kind::SwordAndShield, At::Worn(Slot::Melee)));
    assert_eq!(character.item(1).map(|item| item.xp), Some(1_000));
    assert!(character.item(6).is_none() && character.worn(Slot::Ranged).is_none());
    assert_eq!((character.materials.aurem, character.materials.armor_fragments), (3_210 + 100, 7 + 2), "a Rare's");
    let slots: Vec<(Slot, bool)> =
        character.vestiges.values().map(|(vestige, vaulted)| (vestige.slot, *vaulted)).collect();
    assert_eq!(slots, [(Slot::Melee, false), (Slot::Melee, true)], "a Vestige for either hand is Melee's");
}

#[test]
fn a_dagger_with_a_shield_becomes_a_dagger_and_shield() {
    let (old, character) = read(include_str!("old_saves/dagger_and_shield.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::DaggerAndShield, At::Worn(Slot::Melee)));
    assert_eq!(kind_at(&character, 1), (Kind::Sword, At::Carried));
    assert_eq!(character.materials.aurem, 3_210 + 20, "a Normal shield's dismantle");
}

#[test]
fn two_daggers_become_their_pair_and_the_off_hands_is_carried_as_one_too() {
    let (old, character) = read(include_str!("old_saves/pair_of_daggers.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::DoubleDaggers, At::Worn(Slot::Melee)));
    assert_eq!(kind_at(&character, 7), (Kind::DoubleDaggers, At::Carried), "the off hand's, with its XP");
    assert_eq!(character.item(7).map(|item| item.xp), Some(700));
    assert_eq!(kind_at(&character, 8), (Kind::GreatAxe, At::Carried), "an axe is a Great axe");
    assert_eq!(kind_at(&character, 10), (Kind::Flail, At::Carried));
    assert!(character.item(9).is_none(), "the vaulted shield is refunded");
    assert_eq!((character.materials.aurem, character.materials.armor_fragments), (3_210 + 50, 7 + 1), "a Magic's");
    assert!(character.items.values().all(|(item, _)| item.bucket == item.kind.slot()));
}

#[test]
fn a_lone_dagger_becomes_double_daggers_and_named_shields_their_sword_and_shields() {
    let (old, character) = read(include_str!("old_saves/lone_dagger_and_named_shields.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::DoubleDaggers, At::Worn(Slot::Melee)), "Brinewhisper, its nodes kept");
    assert_eq!(kind_at(&character, 9), (Kind::Sword, At::Carried), "an off hand's sword");
    let reef = character.item(7).expect("The Reefwall");
    assert_eq!(
        (reef.kind, reef.rarity, reef.named.as_deref()),
        (Kind::SwordAndShield, Rarity::Atheric, Some("the_reefwall"))
    );
    assert_eq!((reef.bought, reef.xp), (0, 90_000.min(reef.xp_most())), "its XP kept, its nodes to buy again");
    assert!(reef.layout.iter().flatten().any(|id| id == "riptide"), "its own node, as the catalogue has it");
    assert_eq!(character.at(7), Some(At::Carried));
    assert_eq!(kind_at(&character, 8), (Kind::SwordAndShield, At::Vault), "Seawall stays in the vault");
    let materials = &character.materials;
    // Two perks, its own node and three upgrades, at what each costs now.
    assert_eq!((materials.aurem, materials.armor_fragments, materials.armor_essence), (3_210 + 8_600, 7 + 8, 25));
    assert_eq!(materials.resource(7), 20, "the Reefwall's nodes cost back, Bog Pearl and all");
}

#[test]
fn a_pistolet_takes_ranged_and_the_off_hands_mace_is_carried() {
    let (old, character) = read(include_str!("old_saves/pistolet_and_mace.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::Pistolet, At::Worn(Slot::Ranged)));
    assert_eq!(kind_at(&character, 7), (Kind::Mace, At::Carried));
    assert!(character.worn(Slot::Melee).is_none());
    assert_eq!(kind_at(&character, 8), (Kind::GreatAxe, At::Carried), "Wreckbreaker");
    assert_eq!(character.item(9).map(|item| item.bucket), Some(Slot::Ranged));
    assert_eq!(kind_at(&character, 1), (Kind::Sword, At::Vault));
}

#[test]
fn a_named_mace_with_a_named_shield_keeps_its_kind_and_the_shield_becomes_its_loadout() {
    let (old, character) = read(include_str!("old_saves/mace_and_seawall.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::Mace, At::Worn(Slot::Melee)), "Anchorhead keeps its own kind");
    let seawall = character.item(7).expect("Seawall");
    assert_eq!((seawall.kind, seawall.named.as_deref()), (Kind::SwordAndShield, Some("seawall")));
    assert_eq!(character.at(7), Some(At::Carried));
    let materials = &character.materials;
    assert_eq!((materials.aurem, materials.armor_fragments, materials.armor_essence), (3_210 + 4_600, 7 + 4, 12));
    assert_eq!(materials.resource(1), 10, "Cairn Iron");
}

#[test]
fn two_swords_become_their_pair_and_slots_read_past_nine_only_empty() {
    let (old, mut character) = read(include_str!("old_saves/two_swords_full.json"));
    kept_whole(&old, &character);
    assert_eq!(kind_at(&character, 6), (Kind::Sword, At::Worn(Slot::Melee)), "Harbourwarden keeps its own kind");
    assert_eq!(kind_at(&character, 7), (Kind::Sword, At::Carried));
    assert_eq!((character.carried_in(Slot::Melee), character.carried_in(Slot::Ranged)), (13, 3));
    assert_eq!(character.materials.aurem, crate::character::AUREM_MOST, "three Normal shields, at the most held");
    assert_eq!(character.ask(Ask::TakeOff { slot: Slot::Melee }, AFIELD, &DICE), Err(Refusal::CarriedFull));
    assert_eq!(character.ask(Ask::Wear { item: 20, slot: Slot::Melee }, AFIELD, &DICE), Ok(Done::Done), "a swap");
    assert_eq!(character.ask(Ask::Dismantle { item: 6 }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.carried_in(Slot::Melee), 12);
}

#[test]
fn a_character_kept_since_the_loadouts_reads_as_it_was() {
    let mut character = Character::starting();
    let id = character.take_id();
    let item = crate::Item::new(id, Kind::DoublePistolet, Rarity::Rare, 1, Slot::Ranged);
    character.items.insert(id, (item, At::Worn(Slot::Ranged)));
    assert_eq!(Character::from_json(&character.to_json()), Some(character));
}
