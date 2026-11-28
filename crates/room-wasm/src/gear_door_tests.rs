//! A kept character through the door with the account's shared part apart: the vault and Aurem parted out as it is
//! read, and joined in as it is given back.

use crate::gear_door::{kept, restore_joined};
use crate::room_join;
use serde_json::{Value, json};

/// A course's room open with one player in it.
fn joined() -> u32 {
    let spawn: Vec<u8> = [0.0_f64, 0.0].iter().flat_map(|value| value.to_le_bytes()).collect();
    assert!(crate::open(&spawn));
    room_join()
}

fn read(player: u32) -> (gear::Character, gear::shared::Shared) {
    let answered: Value = serde_json::from_slice(&kept(player)).expect("JSON");
    let body = gear::Character::from_json(answered["body"].as_str().expect("a body")).expect("a character");
    let vault = gear::shared::Shared::from_json(answered["vault"].as_str().expect("a vault")).expect("shared");
    (body, vault)
}

#[test]
fn a_character_given_with_the_accounts_vault_is_read_back_with_it_apart() {
    let player = joined();
    let mut body = gear::Character::starting();
    body.materials.add_aurem(40);
    let id = body.take_id();
    body.items.insert(
        id,
        (gear::Item::new(id, gear::Kind::Head, gear::Rarity::Rare, 10, gear::Slot::Head), gear::At::Carried),
    );
    let vault = gear::shared::Shared {
        items: vec![gear::Item::new(id, gear::Kind::Head, gear::Rarity::Legendary, 12, gear::Slot::Head)],
        aurem: 500,
        ..Default::default()
    };
    let given = json!({ "body": body.to_json(), "vault": vault.to_json() });
    assert!(restore_joined(player, given.to_string().as_bytes()));
    let (body, shared) = read(player);
    assert_eq!(body.materials.aurem, 0, "every Aurem is the account's");
    assert!(body.items.values().all(|(_, at)| *at != gear::At::Vault));
    assert_eq!(shared.aurem, 540);
    assert_eq!(shared.items.len(), 1);
    assert_ne!(shared.items[0].id, id, "the vault's item took a number of its own");
}

#[test]
fn a_character_kept_before_with_no_vault_row_parts_its_own_vault_and_aurem() {
    let player = joined();
    let mut body = gear::Character::starting();
    body.materials.add_aurem(70);
    let id = body.take_id();
    body.items
        .insert(id, (gear::Item::new(id, gear::Kind::Head, gear::Rarity::Rare, 10, gear::Slot::Head), gear::At::Vault));
    assert!(restore_joined(player, json!({ "body": body.to_json(), "vault": null }).to_string().as_bytes()));
    let (body, shared) = read(player);
    assert_eq!((body.materials.aurem, shared.aurem, shared.items.len()), (0, 70, 1));
}

#[test]
fn what_is_no_character_or_no_shared_part_is_refused() {
    let player = joined();
    let body = gear::Character::starting().to_json();
    assert!(!restore_joined(player, b"not json"));
    assert!(!restore_joined(player, json!({ "body": "{}", "vault": null }).to_string().as_bytes()));
    assert!(!restore_joined(player, json!({ "body": body, "vault": "[1]" }).to_string().as_bytes()));
}

#[test]
fn at_sea_the_patrol_zone_a_kept_character_came_from_puts_its_ship_off_that_zones_region() {
    assert!(crate::open_sea(include_bytes!("../../../content/world/layout.json"), 7));
    let player = room_join();
    let mut body = gear::Character::starting();
    assert!(body.give_first_ship(), "a ship the sea lets in");
    // Kept off the Weirlands' anchorage, back from the Saltgrass Downs on the Beacon Shore.
    body.ship_at = Some([2_334_343, 1_824_977]);
    let given = json!({ "body": body.to_json(), "vault": null, "from": "node-saltgrass-downs" });
    assert!(restore_joined(player, given.to_string().as_bytes()));
    let at = crate::with_open(|opened| {
        let crate::Opened::Sea(sea) = opened else { panic!("a sea is open") };
        sea.ships().find(|(each, _)| *each == player).map(|(_, ship)| (ship.x, ship.y))
    });
    assert_eq!(at, Some(Some((2_805_282.0, 1_196_621.0))), "at the Beacon Shore's anchorage, off the Saltgrass Downs");
}
