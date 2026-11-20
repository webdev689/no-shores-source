//! A character kept between sessions comes back as it was.

use crate::Item;
use crate::character::{At, Character};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

#[test]
fn a_character_kept_as_json_comes_back_as_it_was() {
    let mut character = Character::starting();
    character.earn_xp(5_000, Some(Slot::Melee));
    character.materials.add_aurem(1_234);
    let id = character.take_id();
    character.items.insert(id, (Item::new(id, Kind::Pistolet, Rarity::Legendary, 20, Slot::Ranged), At::Vault));
    assert_eq!(Character::from_json(&character.to_json()), Some(character));
}

#[test]
fn a_bought_node_whose_trait_no_longer_fits_its_piece_is_given_back_once_as_it_is_read() {
    let mut character = Character::starting();
    let id = character.take_id();
    let mut helm = Item::new(id, Kind::Head, Rarity::Rare, 10, Slot::Head);
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    helm.layout = vec![pair("bulwark", "hardy"), pair("unshaken", "scholar")];
    helm.xp = helm.xp_most();
    for node in [0, 1] {
        helm.bought |= helm.node_bit(0, node).expect("the first column's nodes");
    }
    helm.chosen[0] = 0;
    let cost = helm.cost_of(0);
    character.items.insert(id, (helm, At::Carried));
    let had = character.materials.clone();
    let read = Character::from_json(&character.to_json()).expect("a character");
    let helm = read.item(id).expect("kept");
    assert!(!helm.has(0, 0) && helm.has(0, 1), "a shield's Bulwark on a helm is given back, Hardy kept");
    assert_eq!(helm.chosen[0], crate::item::NONE_CHOSEN, "its choice cleared");
    assert_eq!(read.materials.aurem, had.aurem + cost.aurem);
    assert_eq!(read.materials.armor_fragments, had.armor_fragments + cost.fragments);
    let again = Character::from_json(&read.to_json()).expect("a character");
    assert_eq!(again.materials, read.materials, "given back once");
}

#[test]
fn a_kept_character_gains_new_resources_and_never_reuses_a_number() {
    let mut character = Character::starting();
    character.materials.resources.truncate(2);
    character.next_id = 1;
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(back.materials.resources.len(), crate::catalogue::catalogue().resources.len());
    assert!(back.next_id > *back.items.keys().max().expect("its starting kit"));
    assert_eq!(Character::from_json("{\"xp\":"), None);
    assert_eq!(Character::from_json("null"), None);
}

#[test]
fn a_kept_character_however_broken_is_made_whole_and_no_ask_fails_on_it() {
    use crate::asks::{Ask, Here};
    use crate::character::{AUREM_MOST, STOCK_MOST};
    use crate::dice::Dice;
    let mut character = Character::starting();
    let id = character.take_id();
    let mut item = Item::new(id, Kind::Sword, Rarity::Legendary, 20, Slot::Melee);
    item.xp = u32::MAX;
    item.chosen.clear();
    item.bought = u32::MAX;
    item.id = 999;
    character.items.insert(id, (item, At::Worn(Slot::Head)));
    character.materials.aurem = u32::MAX;
    character.materials.weapon_essence = u16::MAX;
    let back = Character::from_json(&character.to_json()).expect("a character");
    let (kept, at) = &back.items[&id];
    assert_eq!(kept.id, id, "an item's number is its key");
    assert_eq!(*at, At::Carried, "a sword is not worn on the head");
    assert_eq!(kept.chosen.len(), kept.columns().len());
    assert!(kept.xp <= kept.xp_most());
    assert!(kept.bought.count_ones() as usize <= kept.columns().iter().map(|column| usize::from(column.nodes())).sum());
    assert_eq!(back.materials.aurem, AUREM_MOST);
    assert_eq!(back.materials.weapon_essence, STOCK_MOST);
    let mut asked = back;
    let dice = Dice { seed: 1, tick: 1, player: 1 };
    for column in 0..12 {
        for node in 0..6 {
            let _ = asked.ask(Ask::Buy { item: id, column, node }, Here::default(), &dice);
            let _ = asked.ask(Ask::Choose { item: id, column, node }, Here::default(), &dice);
        }
    }
}

#[test]
fn a_fresh_number_is_never_one_held() {
    let mut character = Character::starting();
    let held = *character.items.keys().next().expect("its starting kit");
    character.next_id = held;
    let fresh = character.take_id();
    assert!(!character.items.contains_key(&fresh));
    character.next_id = u32::MAX;
    let _ = character.take_id();
    assert_ne!(character.next_id, 0, "never 0, the number for none");
}

#[test]
fn a_new_character_is_kept_short_of_the_prologue_and_one_kept_before_the_story_past_it() {
    let new = Character::starting();
    assert!(!new.story.prologue);
    let kept = Character::from_json(&new.to_json()).expect("a character");
    assert!(!kept.story.prologue, "its first save keeps it short of the prologue");
    let old = Character::from_json(include_str!("old_saves/sword_and_shield.json")).expect("a character");
    assert!(old.story.prologue, "kept before the story was: past it");
    assert_eq!(old.activity, crate::activity::Activity::default());
}

#[test]
fn a_kept_activity_holds_only_the_boards_bounties() {
    let mut character = Character::starting();
    character.activity.today(20_778).bounties.extend([(0, 1), (5, 2), (6, 3), (200, 4)]);
    let mut read = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(read.activity.today(20_778).bounties, std::collections::BTreeMap::from([(0, 1), (5, 2)]));
}

#[test]
fn keys_a_room_does_not_know_are_kept_through_a_read_and_a_write() {
    let mut character = Character::starting();
    let id = character.take_id();
    character.vestiges.insert(id, (crate::character::Vestige::new(id, Rarity::Rare, Slot::Head, 4), false));
    let mut kept: serde_json::Value = serde_json::from_str(&character.to_json()).expect("a character");
    let later = serde_json::json!({ "from": "a later room" });
    kept["later"] = later.clone();
    for nested in ["materials", "arts", "allegiance", "cosmetics"] {
        kept[nested]["later"] = later.clone();
    }
    let items = kept["items"].as_object_mut().expect("the items");
    let first = items.values_mut().next().expect("an item");
    first[0]["later"] = later.clone();
    let vestiges = kept["vestiges"].as_object_mut().expect("the Vestiges");
    vestiges.values_mut().next().expect("a Vestige")[0]["later"] = later.clone();
    let read = Character::from_json(&kept.to_string()).expect("a newer save reads");
    let written: serde_json::Value = serde_json::from_str(&read.to_json()).expect("written");
    assert_eq!(written["later"], later, "top level");
    for nested in ["materials", "arts", "allegiance", "cosmetics"] {
        assert_eq!(written[nested]["later"], later, "{nested}");
    }
    let items = written["items"].as_object().expect("the items");
    assert_eq!(items.values().next().map(|item| &item[0]["later"]), Some(&later), "an item");
    let vestiges = written["vestiges"].as_object().expect("the Vestiges");
    assert_eq!(vestiges.values().next().map(|vestige| &vestige[0]["later"]), Some(&later), "a Vestige");
    assert_eq!(Character::from_json(&read.to_json()), Some(read), "and read again, the same");
}

#[test]
fn a_save_holding_more_shapes_than_a_stock_keeps_reads_with_a_full_stock() {
    let mut character = Character::starting();
    character.materials.shapes = 999;
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(back.materials.shapes, crate::character::STOCK_MOST);
}
