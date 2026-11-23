use crate::catalogue::catalogue;
use crate::character::{Character, Vestige};
use crate::dice::Dice;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::source::Source;
use crate::vestige::make;
use crate::world::Difficulty;
use serde_json::Value;
use std::collections::BTreeMap;

/// The page's table of each source's armour sets and weapon metals, which the rules hold the catalogue to.
const LOOKS: &str = include_str!("../../../content/gear/looks.json");

fn looks() -> Vec<Value> {
    let parsed: Value = serde_json::from_str(LOOKS).expect("looks.json parses");
    parsed["sources"].as_array().expect("its sources").clone()
}

fn names(value: &Value) -> Vec<String> {
    value.as_array().expect("a list").iter().map(|name| name.as_str().expect("a name").to_owned()).collect()
}

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 3, player: 1 }
}

#[test]
fn the_looks_table_lists_every_source_in_its_order() {
    let keys: Vec<String> = looks().iter().map(|source| source["key"].as_str().expect("a key").to_owned()).collect();
    let wanted: Vec<String> = Source::ALL
        .iter()
        .map(|source| serde_json::to_value(source).expect("a key").as_str().unwrap().to_owned())
        .collect();
    assert_eq!(keys, wanted);
}

#[test]
fn every_set_and_metal_belongs_to_one_source() {
    let mut homes: BTreeMap<(bool, String), Vec<String>> = BTreeMap::new();
    for source in looks() {
        let key = source["key"].as_str().expect("a key").to_owned();
        for set in names(&source["armour"]) {
            homes.entry((true, set)).or_default().push(key.clone());
        }
        // A faction's weapon is told by its own colour, so its metal is shared with another source's.
        for metal in names(&source["metals"]).into_iter().filter(|_| key != "faction") {
            homes.entry((false, metal)).or_default().push(key.clone());
        }
    }
    let shared: Vec<_> = homes.iter().filter(|(_, owners)| owners.len() > 1).collect();
    assert!(shared.is_empty(), "a look in two sources: {shared:?}");
    // The factions' own sets and metals are the faction source's, as their file draws them.
    let file: Value = serde_json::from_str(include_str!("../../../content/gear/factions.json")).expect("factions");
    for faction in file["factions"].as_array().expect("its factions") {
        let (armour, metal) = (&faction["gear"]["armour"], &faction["gear"]["metal"]);
        let owners = |armour: bool, look: &Value| homes.get(&(armour, look.as_str().expect("a look").to_owned()));
        assert_eq!(owners(true, armour), Some(&vec!["faction".to_owned()]));
        assert!(owners(false, metal).is_some_and(|owners| owners.len() == 1), "{metal} has one other home");
    }
}

#[test]
fn every_named_piece_wears_a_look_of_its_own_source() {
    let table = looks();
    let home = |source: Source, armour: bool| names(&table[source as usize][if armour { "armour" } else { "metals" }]);
    let looked: Value = serde_json::from_str(include_str!("../../../content/gear/items.json")).expect("items");
    let mut checked = 0;
    for named in &catalogue().items {
        let entry = looked["items"].as_array().expect("items").iter().find(|each| each["id"] == named.id.as_str());
        let Some(look) = entry.and_then(|each| each["look"].as_str()) else { continue };
        // A gun's look is its finish, plain or gilded, which no source owns.
        if matches!(look, "plain" | "gilded") || named.faction.is_some() {
            continue;
        }
        let own = home(named.source(), named.kind.armour());
        assert!(own.iter().any(|each| each == look), "{} wears {look}, not of {:?}", named.id, named.source());
        checked += 1;
    }
    assert!(checked >= 30, "only {checked} named pieces were checked: is each entry's look still under \"look\"?");
}

#[test]
fn a_vestige_opens_to_its_own_sources_named_piece_where_it_has_one() {
    let from = |source: Source, seed: u64| {
        make(1, Rarity::Legendary, Slot::Torso, 20, source, &dice(seed)).expect("a Legendary torso").named
    };
    for seed in 0..40 {
        assert_eq!(from(Source::Sea, seed).as_deref(), Some("tithebreaker_plate"));
        assert_eq!(from(Source::Elite, seed).as_deref(), Some("saltwind_jerkin"));
    }
    // The world has no Legendary torso of its own, so its Vestige opens to another source's, which keeps its own.
    let opened: Vec<Item> =
        (0..40).filter_map(|seed| make(1, Rarity::Legendary, Slot::Torso, 20, Source::World, &dice(seed))).collect();
    assert!(opened.iter().all(|item| item.named.is_some() && item.source != Source::World));
}

#[test]
fn a_rolled_item_keeps_the_source_its_vestige_came_from() {
    for source in Source::ALL {
        let item = make(1, Rarity::Rare, Slot::Head, 9, source, &dice(2)).expect("a Rare helm");
        assert_eq!((item.named, item.source), (None, source));
    }
}

#[test]
fn a_kills_drops_and_items_come_from_the_content_it_was_in() {
    let mut character = Character::starting();
    let mut vestiges: Vec<Vestige> = Vec::new();
    for seed in 0..30 {
        vestiges.extend(character.loot_kill(5, 20, Difficulty::Abyss, Source::Elite, &dice(seed)));
    }
    assert!(!vestiges.is_empty());
    assert!(vestiges.iter().all(|vestige| vestige.source == Source::Elite));
    // A Boss leaves an item as itself; a rolled one is the Elite Dungeon's, a named one its own source's.
    let found: Vec<&Item> = character.items.values().map(|(item, _)| item).collect();
    assert!(found.iter().any(|item| item.named.is_none() && item.source == Source::Elite));
}

#[test]
fn first_clears_pay_vestiges_of_their_content() {
    let mut character = Character::starting();
    let day = character.clear_of_the_day(20_778, Difficulty::Elite, 12, &dice(1)).expect("the day's");
    assert_eq!(day.source, Source::Dungeon);
    let weekly = |weekly| Character::starting().clear_of_the_week(2_968, weekly, &dice(1)).expect("the week's").source;
    assert_eq!(weekly(crate::activities::Weekly::Elite), Source::Elite);
    assert_eq!(weekly(crate::activities::Weekly::Abyss), Source::Abyss);
    use crate::playlist::Playlist;
    for (playlist, source) in [(Playlist::Elite, Source::Elite), (Playlist::Abyss, Source::Abyss)] {
        let mut character = Character::starting();
        let daily = character.playlist_of_the_day(20_778, playlist, 22, &dice(1)).expect("the day's");
        assert_eq!(daily.source, source);
        let weekly: Vec<Vestige> =
            (0..3).flat_map(|_| character.playlist_of_the_week(2_968, playlist, 22, &dice(2))).collect();
        assert!(!weekly.is_empty() && weekly.iter().all(|vestige| vestige.source == source));
    }
}

#[test]
fn a_save_from_before_sources_reads_as_the_worlds_and_a_worlds_writes_none() {
    let item = Item::new(4, Kind::Sword, Rarity::Rare, 9, Slot::Melee);
    let written = serde_json::to_value(&item).expect("an item writes");
    assert!(written.get("source").is_none());
    let read: Item = serde_json::from_value(written).expect("reads back");
    assert_eq!(read.source, Source::World);
    let elite = Item { source: Source::Elite, ..item };
    let written = serde_json::to_value(&elite).expect("an item writes");
    assert_eq!(written["source"], "elite");
    assert_eq!(serde_json::from_value::<Item>(written).expect("reads back").source, Source::Elite);
    let vestige = Vestige::new(2, Rarity::Magic, Slot::Legs, 3).from(Source::Sea);
    let read: Vestige = serde_json::from_value(serde_json::to_value(&vestige).expect("writes")).expect("reads");
    assert_eq!(read.source, Source::Sea);
}

#[test]
fn a_source_a_later_build_names_reads_as_the_worlds_and_keeps_the_piece() {
    let item = Item { source: Source::Elite, ..Item::new(4, Kind::Sword, Rarity::Rare, 9, Slot::Melee) };
    let mut written = serde_json::to_value(&item).expect("an item writes");
    written["source"] = "raid".into();
    let read: Item = serde_json::from_value(written).expect("an item of a later source still reads");
    assert_eq!((read.id, read.source), (4, Source::World));
    let mut vestige = serde_json::to_value(Vestige::new(2, Rarity::Magic, Slot::Legs, 3).from(Source::Sea)).expect("");
    vestige["source"] = 9.into();
    assert_eq!(serde_json::from_value::<Vestige>(vestige).expect("reads").source, Source::World);
}

#[test]
fn a_named_piece_kept_before_sources_reads_as_its_entrys_content() {
    let mut character = Character::starting();
    let entry = catalogue().named("harbourwarden").expect("a named sword");
    let mut sword = crate::vestige::named_item(0, entry, Slot::Melee);
    sword.source = Source::World;
    let id = character.take_id();
    character.items.insert(id, (Item { id, ..sword }, crate::character::At::Carried));
    let read = Character::from_json(&character.to_json()).expect("reads");
    assert_eq!(read.items[&id].0.source, Source::Elite, "Harbourwarden, mithril, is the Elite Dungeons'");
}

#[test]
fn an_item_with_no_room_is_laid_as_a_vestige_of_the_content_it_dropped_in() {
    let mut character = Character::starting();
    for slot in Slot::VESTIGE {
        while character.carried_in(slot) < crate::character::CARRIED_MOST {
            let id = character.take_id();
            let kind = slot.kinds().next().expect("a kind");
            character.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, slot), crate::character::At::Carried));
        }
    }
    for stock in [crate::kinds::Stock::Weapon, crate::kinds::Stock::Armor] {
        while character.vaulted(stock) < crate::character::VAULT_MOST {
            let id = character.take_id();
            let (kind, slot) = if stock == crate::kinds::Stock::Weapon {
                (Kind::Sword, Slot::Melee)
            } else {
                (Kind::Head, Slot::Head)
            };
            character.items.insert(id, (Item::new(id, kind, Rarity::Normal, 1, slot), crate::character::At::Vault));
        }
    }
    let laid: Vec<Vestige> =
        (0..20).flat_map(|seed| character.loot_kill(5, 20, Difficulty::Normal, Source::Abyss, &dice(seed))).collect();
    assert!(laid.len() > 20, "a Boss's item each kill, laid for want of room: {}", laid.len());
    assert!(laid.iter().all(|vestige| vestige.source == Source::Abyss));
}

#[test]
fn what_others_see_of_a_worn_piece_carries_its_content() {
    let mut character = Character::starting();
    // The starting kit's own head piece is put away for the Abyss Dungeons' helm.
    for (_, at) in character.items.values_mut().filter(|(_, at)| *at == crate::character::At::Worn(Slot::Head)) {
        *at = crate::character::At::Carried;
    }
    let id = character.take_id();
    let helm = Item { id, source: Source::Abyss, ..Item::new(id, Kind::Head, Rarity::Rare, 20, Slot::Head) };
    character.items.insert(id, (helm, crate::character::At::Worn(Slot::Head)));
    let shown = character.shown();
    let piece = shown.worn.iter().find(|piece| piece.slot == Slot::Head as u8).expect("the helm worn");
    assert_eq!(piece.source, Source::Abyss as u8, "the inspect screen draws it in the Abyss Dungeons' sets");
    assert_eq!(piece.id, id, "and makes its look's choices by its own id, as on the player's figure");
}
