//! A character kept between sessions comes back as it was.

use crate::Item;
use crate::character::{At, Character};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

#[test]
fn a_character_kept_as_json_comes_back_as_it_was() {
    let mut character = Character::starting();
    character.earn_xp(5_000, Some(Slot::MainHand));
    character.materials.add_aurem(1_234);
    let id = character.take_id();
    character.items.insert(id, (Item::new(id, Kind::Pistolet, Rarity::Legendary, 20, Slot::OffHand), At::Vault));
    assert_eq!(Character::from_json(&character.to_json()), Some(character));
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
