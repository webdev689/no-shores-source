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
fn a_kept_named_module_keeps_each_bought_perk_where_it_moved_and_never_takes_on_a_trade_off() {
    let mut character = Character::starting();
    let catalogue = crate::catalogue::catalogue();
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    let mut kept = |named: &str, slot: Slot, layout: Vec<Vec<String>>, bought: &[(usize, u8)], chosen: (usize, u8)| {
        let id = character.take_id();
        let mut item = crate::vestige::named_item(id, catalogue.named(named).expect("named"), slot);
        item.layout = layout;
        item.xp = item.xp_most();
        for &(column, node) in bought {
            item.bought |= item.node_bit(column, node).expect("a node");
        }
        item.chosen[chosen.0] = chosen.1;
        character.items.insert(id, (item, At::Carried));
        id
    };
    // Gallowglass Rigging kept from before the merge, Quick Braces bought and chosen in its first column's second place.
    let old = vec![
        pair("doubled_shrouds", "quick_braces"),
        pair("boarding_nets", "grapnels"),
        pair("running_blocks", "fighting_tops"),
    ];
    let rigging = kept("gallowglass_rigging", Slot::Rigging, old, &[(0, 1)], (0, 1));
    // Windmaiden's Canvas with Lookout Yard bought and chosen in its last column's second place, where it moved first.
    let old = vec![
        pair("storm_canvas", "flying_jib"),
        pair("trim_crew", "topgallants"),
        pair("patched_sails", "lookout_yard"),
    ];
    let sails = kept("windmaidens_canvas", Slot::Sails, old.clone(), &[(4, 1)], (4, 1));
    // And with Patched Sails, merged into a hull's perk: a plain perk stands in its place, Lookout Yard.
    let patched = kept("windmaidens_canvas", Slot::Sails, old, &[(4, 0)], (4, 0));
    let had = character.materials.ship;
    let read = Character::from_json(&character.to_json()).expect("a character");
    let rigging = read.item(rigging).expect("kept");
    assert!(rigging.has(0, 0) && !rigging.has(0, 1), "Quick Braces bought where it stands now");
    assert_eq!((rigging.chosen[0], rigging.traits_of(0)[0].as_str()), (0, "quick_braces"));
    let sails = read.item(sails).expect("kept");
    // Lookout Yard moved to the column's first place: bought and chosen there, not Backed Sails in its old place.
    assert!(sails.has(4, 0) && !sails.has(4, 1));
    assert_eq!(sails.traits_of(4)[usize::from(sails.chosen[4])], "lookout_yard");
    let patched = read.item(patched).expect("kept");
    assert!(patched.has(4, 0) && patched.chosen[4] == 0, "Lookout Yard bought where Patched Sails was");
    assert_eq!(read.materials.ship, had, "nothing given back where a perk had a place");
}

#[test]
fn a_kept_named_module_whose_bought_perk_has_only_a_trade_off_in_its_place_gives_it_back() {
    let mut character = Character::starting();
    let id = character.take_id();
    let entry = crate::catalogue::catalogue().named("the_long_nines").expect("The Long Nines");
    let mut guns = crate::vestige::named_item(id, entry, Slot::Guns);
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    guns.layout[3] = pair("powder_monkeys", "gunlayers_eye");
    guns.xp = guns.xp_most();
    let column = guns.columns().iter().enumerate().filter(|(_, kind)| kind.traits()).nth(3).expect("its last perks").0;
    guns.bought |= guns.node_bit(column, 1).expect("a node");
    guns.chosen[column] = 1;
    character.items.insert(id, (guns, At::Carried));
    // Topgallants, merged into Flying Jib in another column: only Reefed Sails, a trade-off, stands in its place.
    let sails_id = character.take_id();
    let entry = crate::catalogue::catalogue().named("windmaidens_canvas").expect("Windmaiden's Canvas");
    let mut sails = crate::vestige::named_item(sails_id, entry, Slot::Sails);
    sails.layout[1] = pair("trim_crew", "topgallants");
    sails.xp = sails.xp_most();
    sails.bought |= sails.node_bit(2, 1).expect("a node");
    sails.chosen[2] = 1;
    character.items.insert(sails_id, (sails, At::Carried));
    let had = character.materials.ship;
    let read = Character::from_json(&character.to_json()).expect("a character");
    let guns = read.item(id).expect("kept");
    assert!(!guns.has(column, 0) && !guns.has(column, 1), "Overcharged is never pressed on it");
    assert_eq!(guns.chosen[column], crate::item::NONE_CHOSEN);
    assert_ne!(read.materials.ship, had, "Gunlayer's Eye given back for what it cost");
    let sails = read.item(sails_id).expect("kept");
    assert!(!sails.has(2, 0) && !sails.has(2, 1) && sails.chosen[2] == crate::item::NONE_CHOSEN, "nor Reefed Sails");
}

#[test]
fn a_kept_named_item_of_another_rarity_than_its_entry_keeps_its_traits_and_takes_no_intrinsic() {
    let mut character = Character::starting();
    let id = character.take_id();
    let entry = crate::catalogue::catalogue().named("gullwing").expect("Gullwing");
    let mut legendary = Item::new(id, Kind::Bow, Rarity::Legendary, 20, Slot::Ranged);
    legendary.named = Some("gullwing".to_owned());
    legendary.layout = crate::catalogue::catalogue().named("stormpetrel").expect("a Legendary bow").layout.clone();
    character.items.insert(id, (legendary.clone(), At::Carried));
    let read = Character::from_json(&character.to_json()).expect("a character");
    let kept = read.item(id).expect("kept");
    assert_eq!(kept.layout, legendary.layout, "a Legendary's grid keeps a Legendary's traits");
    assert_ne!(kept.layout, entry.layout);
    assert!(kept.active_traits().all(|id| id != "storm_gull"), "and no Atheric's intrinsic");
}

#[test]
fn a_kept_rolled_module_offering_a_perk_in_a_column_it_has_left_offers_one_of_that_column() {
    let mut character = Character::starting();
    let id = character.take_id();
    let mut guns = Item::new(id, Kind::Guns, Rarity::Magic, 10, Slot::Guns);
    // Double Shotted was a perk when this was rolled; it is a finish now, and a Magic's guns have no finish.
    guns.layout = vec![vec!["quick_tackle".to_owned(), "steady_lay".to_owned()], vec!["double_shotted".to_owned()]];
    guns.xp = guns.xp_most();
    let perks =
        guns.columns().iter().position(|column| matches!(column, crate::grid::Column::Perk(_))).expect("a perk");
    guns.bought |= guns.node_bit(perks, 0).expect("a node");
    guns.chosen[perks] = 0;
    character.items.insert(id, (guns, At::Carried));
    let read = Character::from_json(&character.to_json()).expect("a character");
    let guns = read.item(id).expect("kept");
    let offered = guns.traits_of(perks)[0].as_str();
    let pool = crate::catalogue::catalogue().pool(crate::grid::Column::Perk(1), Kind::Guns);
    assert!(pool.iter().any(|found| found.id == offered && found.takes.is_none()), "{offered} a plain guns perk");
    assert!(guns.has(perks, 0) && guns.chosen[perks] == 0, "bought and chosen as it was");
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
    assert!(crate::catalogue::catalogue().trait_fits(first, Kind::Head, None, false), "{first} fits a helm");
    assert!(!["hardy", "unshaken", "scholar"].contains(&first), "and is offered once");
    assert!(helm.has(0, 0) && helm.chosen[0] == 0, "bought and chosen as the trait it stands for was");
    assert_eq!(read.materials.aurem, had);
    assert!(helm.active_traits().any(|active| active == first), "and it gives its trait");
}

#[test]
fn a_kept_rolled_module_offering_a_merged_perk_offers_what_it_merged_into_and_never_a_trade_off_it_did_not_choose() {
    let mut character = Character::starting();
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    let mut kept = |kind: Kind, slot: Slot, layout: Vec<Vec<String>>| {
        let id = character.take_id();
        let mut module = Item::new(id, kind, Rarity::Rare, 10, slot);
        module.layout = layout;
        module.xp = module.xp_most();
        module.bought |= module.node_bit(0, 0).expect("a node");
        module.chosen[0] = 0;
        character.items.insert(id, (module, At::Carried));
        id
    };
    // Topgallants merged into Flying Jib, which this sails does not offer: Flying Jib, bought as Topgallants was.
    let jib =
        kept(Kind::Sails, Slot::Sails, vec![pair("topgallants", "storm_canvas"), pair("lookout_yard", "reefed_sails")]);
    // Doubled Shrouds merged into Storm Canvas, a sails perk no rigging offers: the first plain rigging perk it lacks.
    let rigging = kept(
        Kind::Rigging,
        Slot::Rigging,
        vec![pair("doubled_shrouds", "quick_braces"), pair("boarding_nets", "taut_rigging")],
    );
    // Every plain sails perk offered already: only a trade-off is left, so its node is given back to choose again.
    let sails =
        kept(Kind::Sails, Slot::Sails, vec![pair("topgallants", "storm_canvas"), pair("flying_jib", "lookout_yard")]);
    let had = character.materials.aurem;
    let read = Character::from_json(&character.to_json()).expect("a character");
    let jib = read.item(jib).expect("kept");
    assert_eq!(jib.layout[0], pair("flying_jib", "storm_canvas"));
    assert!(jib.has(0, 0) && jib.chosen[0] == 0, "bought and chosen as Topgallants was");
    let rigging = read.item(rigging).expect("kept");
    assert_eq!(rigging.layout[0], pair("grapnels", "quick_braces"));
    assert!(rigging.has(0, 0) && rigging.chosen[0] == 0);
    let sails = read.item(sails).expect("kept");
    let offered = crate::catalogue::catalogue().trait_def(&sails.layout[0][0]).expect("a trait");
    assert!(offered.takes.is_some(), "only a trade-off is left to offer: {}", offered.id);
    assert!(!sails.has(0, 0) && sails.chosen[0] == crate::item::NONE_CHOSEN, "given back, not pressed on it");
    assert!(read.materials.aurem > had, "for what it cost");
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
