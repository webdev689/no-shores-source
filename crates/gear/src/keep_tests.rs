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
fn a_kept_named_item_follows_its_catalogue_entry_its_nodes_kept() {
    let mut character = Character::starting();
    let id = character.take_id();
    let entry = crate::catalogue::catalogue().named("harpooner").expect("Harpooner");
    let mut bow = crate::vestige::named_item(id, entry, Slot::Ranged);
    bow.xp = bow.xp_most();
    // Kept from before its perks changed: its first perk column offered other traits, both bought, the second chosen.
    bow.layout[1] = vec!["light_stock".to_owned(), "quick_hands".to_owned()];
    let (handling, perks) = (0, 2);
    for (column, node) in [(handling, 0), (perks, 0), (perks, 1)] {
        bow.bought |= bow.node_bit(column, node).expect("a node");
    }
    bow.chosen[perks] = 1;
    character.items.insert(id, (bow, At::Carried));
    let had = character.materials.clone();
    let read = Character::from_json(&character.to_json()).expect("a character");
    let bow = read.item(id).expect("kept");
    assert_eq!(bow.layout, entry.layout, "its traits are its entry's");
    assert!(bow.has(handling, 0) && bow.has(perks, 0) && bow.has(perks, 1), "every node it bought kept");
    assert_eq!(bow.chosen[perks], 1, "and its choice, now the entry's trait in that place");
    assert!(bow.active_traits().any(|active| active == entry.layout[1][1]));
    assert_eq!(read.materials, had, "nothing given back, nothing lost to a stock's cap");
}

#[test]
fn a_kept_rolled_item_offering_a_trait_now_gone_offers_another_of_its_pool() {
    let mut character = Character::starting();
    let id = character.take_id();
    let mut helm = Item::new(id, Kind::Head, Rarity::Rare, 10, Slot::Head);
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    helm.layout = vec![pair("long_gone", "hardy"), pair("unshaken", "scholar")];
    helm.xp = helm.xp_most();
    helm.bought |= helm.node_bit(0, 0).expect("a node");
    helm.chosen[0] = 0;
    character.items.insert(id, (helm, At::Carried));
    let had = character.materials.aurem;
    let read = Character::from_json(&character.to_json()).expect("a character");
    let helm = read.item(id).expect("kept");
    let first = helm.layout[0][0].as_str();
    assert!(crate::catalogue::catalogue().trait_fits(first, Kind::Head, None), "{first} fits a helm");
    assert!(!["hardy", "unshaken", "scholar"].contains(&first), "and is offered once");
    assert!(helm.has(0, 0) && helm.chosen[0] == 0, "bought and chosen as the trait it stands for was");
    assert_eq!(read.materials.aurem, had);
    assert!(helm.active_traits().any(|active| active == first), "and it gives its trait");
}

#[test]
fn a_kept_rolled_module_offering_a_merged_perk_offers_its_columns_first_one_it_lacks_bought_as_it_was() {
    let mut character = Character::starting();
    let id = character.take_id();
    let mut sails = Item::new(id, Kind::Sails, Rarity::Rare, 10, Slot::Sails);
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    sails.layout = vec![pair("topgallants", "storm_canvas"), pair("flying_jib", "lookout_yard")];
    sails.xp = sails.xp_most();
    sails.bought |= sails.node_bit(0, 0).expect("a node");
    sails.chosen[0] = 0;
    character.items.insert(id, (sails, At::Carried));
    let had = character.materials.aurem;
    let read = Character::from_json(&character.to_json()).expect("a character");
    let sails = read.item(id).expect("kept");
    // Storm Canvas, Flying Jib and Lookout Yard it offers already: the pool's next is Crowd of Sail.
    assert_eq!(sails.layout[0], pair("crowd_of_sail", "storm_canvas"));
    assert!(sails.has(0, 0) && sails.chosen[0] == 0, "its node kept, Crowd of Sail chosen where Topgallants was");
    assert_eq!(read.materials.aurem, had, "nothing given back, nothing lost");
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
