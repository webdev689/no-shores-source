use crate::catalogue::catalogue;
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::item::NAMED_LEVEL;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::source::Source;
use crate::vestige::make;
use serde_json::Value;

/// The page's table of each content's looks and the set name each look carries.
const LOOKS: &str = include_str!("../../../content/gear/looks.json");

fn dice(seed: u64) -> Dice {
    Dice { seed, tick: 5, player: 2 }
}

fn looks() -> Value {
    serde_json::from_str(LOOKS).expect("looks.json parses")
}

#[test]
fn a_legendary_vestige_opens_to_a_rolled_piece_of_its_own_content() {
    // A faction's pieces are its named ones; no room rolls a piece of a faction's content.
    for source in Source::ALL.into_iter().filter(|source| *source != Source::Faction) {
        for slot in Slot::VESTIGE {
            for seed in 0..12 {
                let item = make(4, Rarity::Legendary, slot, 18, source, &dice(seed)).expect("a Legendary");
                assert_eq!(item.named, None, "{source:?} {slot:?}: a Legendary drop is never a named piece");
                assert_eq!((item.rarity, item.level, item.source), (Rarity::Legendary, NAMED_LEVEL, source));
                assert!(item.kind.fits(slot), "{:?} in {slot:?}", item.kind);
                let resource = item.resource.map(usize::from).expect("its nodes ask for an island's resource");
                assert!(resource < catalogue().resources.len());
                assert_eq!(item.breach, source == Source::Breach && item.kind.armour());
                let offered: Vec<&String> = item.layout.iter().flatten().collect();
                let mut distinct = offered.clone();
                distinct.sort();
                distinct.dedup();
                assert_eq!(distinct.len(), offered.len(), "never one trait twice: {:?}", item.layout);
                for (column, traits) in item.columns().iter().filter(|column| column.traits()).zip(&item.layout) {
                    assert_eq!(traits.len(), usize::from(column.nodes()), "{:?}", item.kind);
                }
            }
        }
    }
}

#[test]
fn a_rolled_legendarys_armour_carries_a_legendarys_prestige() {
    let full = |source: Source| {
        let mut item = make(1, Rarity::Legendary, Slot::Head, 20, source, &dice(3)).expect("a Legendary helm");
        // Every node bought: the bits past its last node are never read.
        item.bought = u32::MAX;
        item
    };
    assert_eq!(
        make(1, Rarity::Legendary, Slot::Head, 20, Source::Abyss, &dice(3)).map(|item| item.prestige()),
        Some(18)
    );
    assert_eq!(full(Source::Abyss).prestige(), 27);
    assert_eq!(full(Source::Breach).prestige(), 30);
}

#[test]
fn an_atheric_vestige_opens_to_a_named_atheric() {
    for seed in 0..20 {
        let item = make(4, Rarity::Atheric, Slot::Melee, 20, Source::Elite, &dice(seed)).expect("an Atheric");
        let named = item.named.as_deref().and_then(|named| catalogue().named(named)).expect("a named piece");
        assert_eq!(named.rarity, Rarity::Atheric);
    }
}

#[test]
fn a_rolled_legendary_and_a_kept_named_one_are_read_back_whole() {
    let mut character = Character::starting();
    let rolled_id = character.take_id();
    let rolled = make(rolled_id, Rarity::Legendary, Slot::Ranged, 20, Source::Sea, &dice(9)).expect("a Legendary");
    let named_id = character.take_id();
    let entry = catalogue().named("harbourwarden").expect("a named Legendary kept");
    let named = crate::vestige::named_item(named_id, entry, Slot::Melee);
    character.items.insert(rolled_id, (rolled.clone(), At::Carried));
    character.items.insert(named_id, (named.clone(), At::Vault));
    let read = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(read.item(rolled_id), Some(&rolled));
    assert_eq!(read.item(named_id).and_then(|item| item.named.as_deref()), Some("harbourwarden"));
    assert_eq!(read.item(named_id), Some(&named));
}

#[test]
fn every_look_of_every_content_carries_a_set_name_and_none_is_a_metals() {
    let table = looks();
    let metals = ["elven", "dwarven", "orcish", "mithril", "adamantium", "ebony", "daedric"];
    let named = |name: &str| !name.is_empty() && !metals.iter().any(|metal| name.to_lowercase().contains(metal));
    assert!(table["normal"].as_str().is_some_and(named), "a Normal piece's set");
    for source in table["sources"].as_array().expect("sources") {
        let sets = &source["sets"];
        let key = source["key"].as_str().expect("a key");
        if key == "faction" {
            for faction in &crate::factions::factions().factions {
                assert!(sets[&faction.key].as_str().is_some_and(named), "{} has a set name", faction.key);
            }
            continue;
        }
        for list in ["armour", "metals"] {
            for look in source[list].as_array().expect("looks") {
                let look = look.as_str().expect("a look");
                assert!(sets[look].as_str().is_some_and(named), "{key}'s {look} has a set name");
            }
        }
    }
    assert_eq!(table["sources"][Source::Breach as usize]["sets"]["daedric"], "Lattice");
}

#[test]
fn every_armour_and_weapon_kind_has_its_word() {
    for kind in crate::kinds::Kind::ALL.into_iter().filter(|kind| kind.weapon() || kind.armour()) {
        assert!(catalogue().kind_word(kind).is_some_and(|word| !word.is_empty()), "{kind:?}");
    }
}

#[test]
fn a_factions_pieces_are_named_by_their_factions_set() {
    let table = looks();
    let sets = &table["sources"][Source::Faction as usize]["sets"];
    let mut checked = 0;
    for named in
        catalogue().items.iter().filter(|named| named.faction.is_some() && named.kind != crate::kinds::Kind::Cloak)
    {
        let set = sets[named.faction.as_deref().expect("a faction")].as_str().expect("its set name");
        let word = catalogue().kind_word(named.kind).expect("its kind's word");
        assert_eq!(named.name, format!("{set} {word}"), "{}", named.id);
        checked += 1;
    }
    assert_eq!(checked, 18);
}
