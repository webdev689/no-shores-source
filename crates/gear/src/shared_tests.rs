//! The vault and Aurem part from a character and join it again, whole and without a number held twice.

use crate::character::{AUREM_MOST, At, Character, Vestige};
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::shared::Shared;

/// A character with one item and one Vestige carried and one of each in the vault, and 1,234 Aurem.
fn holding() -> Character {
    let mut character = Character::starting();
    character.materials.add_aurem(1_234);
    for at in [At::Carried, At::Vault] {
        let id = character.take_id();
        character.items.insert(id, (Item::new(id, Kind::Head, Rarity::Rare, 10, Slot::Head), at));
    }
    for vaulted in [false, true] {
        let id = character.take_id();
        character.vestiges.insert(id, (Vestige::new(id, Rarity::Legendary, Slot::Melee, 12), vaulted));
    }
    character
}

#[test]
fn parting_takes_the_vault_and_aurem_and_leaves_the_rest() {
    let mut character = holding();
    let carried = character.items.values().filter(|(_, at)| *at != At::Vault).count();
    let shared = character.part_shared();
    assert_eq!((shared.items.len(), shared.vestiges.len(), shared.aurem), (1, 1, 1_234));
    assert_eq!(character.materials.aurem, 0);
    assert!(character.items.values().all(|(_, at)| *at != At::Vault));
    assert_eq!(character.items.len(), carried);
    assert!(character.vestiges.values().all(|(_, vaulted)| !vaulted));
    assert_eq!(character.vestiges.len(), 1);
}

#[test]
fn parted_then_joined_the_character_is_as_it_was() {
    let mut character = holding();
    let before = character.clone();
    let shared = Shared::from_json(&character.part_shared().to_json()).expect("kept");
    character.join_shared(shared);
    assert_eq!(character, before);
}

#[test]
fn a_shared_number_the_character_holds_takes_a_new_one_and_nothing_is_lost() {
    let mut first = holding();
    let shared = first.part_shared();
    // Another character holds the very same numbers, and an item, a Vestige and Aurem of its own.
    let mut other = holding();
    let held: Vec<u32> = other.items.keys().chain(other.vestiges.keys()).copied().collect();
    let (items, vestiges) = (other.items.len(), other.vestiges.len());
    other.join_shared(shared.clone());
    assert_eq!(other.items.len(), items + shared.items.len());
    assert_eq!(other.vestiges.len(), vestiges + shared.vestiges.len());
    assert_eq!(other.materials.aurem, 2 * 1_234);
    for (id, (item, _)) in &other.items {
        assert_eq!(item.id, *id);
    }
    for (id, (vestige, _)) in &other.vestiges {
        assert_eq!(vestige.id, *id);
    }
    let joined = other.items.keys().chain(other.vestiges.keys()).filter(|id| !held.contains(id)).count();
    assert_eq!(joined, 2, "each joined one under a number of its own");
    assert!(other.items.keys().chain(other.vestiges.keys()).all(|id| *id < other.next_id));
}

#[test]
fn a_shared_number_clear_of_the_character_keeps_it_and_next_id_passes_it() {
    let mut character = Character::starting();
    let shared = Shared {
        items: vec![Item::new(900, Kind::Head, Rarity::Rare, 10, Slot::Head)],
        vestiges: vec![Vestige::new(901, Rarity::Rare, Slot::Head, 10)],
        aurem: AUREM_MOST,
        ..Shared::default()
    };
    character.materials.add_aurem(10);
    character.join_shared(shared);
    assert_eq!(character.items.get(&900).map(|(_, at)| *at), Some(At::Vault));
    assert_eq!(character.vestiges.get(&901).map(|(_, vaulted)| *vaulted), Some(true));
    assert_eq!(character.next_id, 902);
    assert_eq!(character.materials.aurem, AUREM_MOST);
}

#[test]
fn a_later_rooms_keys_in_the_shared_part_come_back_as_it_parts() {
    let mut character = Character::starting();
    let shared = Shared::from_json(r#"{"items":[],"vestiges":[],"aurem":5,"later":[1,2]}"#).expect("kept");
    character.join_shared(shared.clone());
    let back = Character::from_json(&character.to_json()).expect("kept").part_shared();
    assert_eq!(back, shared);
}
