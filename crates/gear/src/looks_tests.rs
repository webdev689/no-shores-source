use crate::character::{At, Character};
use crate::item::Item;
use crate::kinds::Kind;
use crate::rarity::Rarity;
use crate::source::Source;
use serde_json::{Value, json};

/// A character wearing only `worn`, each a piece of a kind, rarity and content at level 20, named or rolled.
fn wearing(worn: &[(Kind, Rarity, Source, Option<&str>)]) -> Character {
    let mut character = Character::starting();
    character.items.clear();
    for (id, &(kind, rarity, source, named)) in (1..).zip(worn) {
        let mut item = Item::new(id, kind, rarity, 20, kind.slot());
        item.source = source;
        item.named = named.map(str::to_owned);
        character.items.insert(id, (item, At::Worn(kind.slot())));
    }
    character
}

/// The outfit of a male figure's `outfit` as the room relays it for `character`.
fn relayed(outfit: &Value, character: &Character) -> Value {
    let sent = json!({ "body": "male", "outfit": outfit }).to_string();
    let dress = crate::cosmetics::dressed(&sent, character).expect("a dress that reads");
    serde_json::from_str::<Value>(&dress).expect("a dress")["outfit"].clone()
}

#[test]
fn a_world_rare_helm_sent_in_another_contents_set_loses_it() {
    let helm = wearing(&[(Kind::Head, Rarity::Rare, Source::World, None)]);
    assert_eq!(relayed(&json!({ "armour": { "helm": "daedric" } }), &helm)["armour"], json!({}));
    assert_eq!(relayed(&json!({ "armour": { "helm": "chain" } }), &helm)["armour"], json!({ "helm": "chain" }));
    // A world Rare piece starts past the world's Magic leather.
    assert_eq!(relayed(&json!({ "armour": { "helm": "leather" } }), &helm)["armour"], json!({}));
    let magic = wearing(&[(Kind::Head, Rarity::Magic, Source::World, None)]);
    assert_eq!(relayed(&json!({ "armour": { "helm": "leather" } }), &magic)["armour"], json!({ "helm": "leather" }));
    assert_eq!(
        relayed(&json!({ "armour": { "helm": "chain" } }), &magic)["armour"],
        json!({}),
        "a Magic one's lightest"
    );
}

#[test]
fn a_sword_sent_in_another_contents_metal_loses_it() {
    let sword = wearing(&[(Kind::Sword, Rarity::Rare, Source::World, None)]);
    assert_eq!(relayed(&json!({ "right": "sword_ebony" }), &sword)["right"], Value::Null);
    assert_eq!(relayed(&json!({ "right": "sword_steel" }), &sword)["right"], json!("sword_steel"));
    let plain = wearing(&[(Kind::Sword, Rarity::Normal, Source::Abyss, None)]);
    assert_eq!(relayed(&json!({ "right": "sword_ebony" }), &plain)["right"], Value::Null, "a Normal one is steel");
    assert_eq!(relayed(&json!({ "right": "sword_steel" }), &plain)["right"], json!("sword_steel"));
    let hushguard = wearing(&[(Kind::DaggerAndShield, Rarity::Legendary, Source::Faction, Some("hushguard"))]);
    assert_eq!(relayed(&json!({ "right": "dagger_ebony" }), &hushguard)["right"], json!("dagger_ebony"));
    assert_eq!(relayed(&json!({ "right": "dagger_elven" }), &hushguard)["right"], Value::Null, "another faction's");
    let abyss = wearing(&[(Kind::Sword, Rarity::Rare, Source::Abyss, None)]);
    assert_eq!(relayed(&json!({ "right": "sword_ebony" }), &abyss)["right"], json!("sword_ebony"));
}

#[test]
fn a_factions_and_a_named_pieces_own_look_stays() {
    let veiled = wearing(&[(Kind::Head, Rarity::Legendary, Source::Faction, Some("veiled_cowl"))]);
    let sent = json!({ "armour": { "helm": "brotherhood", "cuirass": "brotherhood" } });
    assert_eq!(relayed(&sent, &veiled)["armour"], json!({ "helm": "brotherhood" }), "its own piece alone");
    assert_eq!(relayed(&json!({ "armour": { "helm": "mages" } }), &veiled)["armour"], json!({}), "another's set");
    let helm = wearing(&[(Kind::Head, Rarity::Legendary, Source::Sea, Some("tithebreaker_helm"))]);
    assert_eq!(relayed(&json!({ "armour": { "helm": "dwarven" } }), &helm)["armour"], json!({ "helm": "dwarven" }));
    assert_eq!(relayed(&json!({ "armour": { "helm": "elven" } }), &helm)["armour"], json!({}), "not as written");
    let seawall = wearing(&[(Kind::SwordAndShield, Rarity::Legendary, Source::Sea, Some("seawall"))]);
    let shown = relayed(&json!({ "right": "sword_dwarven", "left": "shield_tower_dwarven" }), &seawall);
    assert_eq!((&shown["right"], &shown["left"]), (&json!("sword_dwarven"), &json!("shield_tower_dwarven")));
    let shown = relayed(&json!({ "right": "sword_dwarven", "left": "shield_kite_dwarven" }), &seawall);
    assert_eq!(shown["left"], Value::Null, "a shield of another make");
}

#[test]
fn an_abyss_crossbow_keeps_the_nearest_metal_the_forge_draws() {
    let crossbow = wearing(&[(Kind::Crossbow, Rarity::Rare, Source::Abyss, None)]);
    assert_eq!(relayed(&json!({ "right": "crossbow_mithril" }), &crossbow)["right"], json!("crossbow_mithril"));
    assert_eq!(relayed(&json!({ "right": "crossbow_dwarven" }), &crossbow)["right"], Value::Null);
}

#[test]
fn a_figure_of_no_body_the_forge_draws_holds_nothing() {
    let sword = wearing(&[(Kind::Sword, Rarity::Rare, Source::World, None)]);
    let sent = json!({ "body": "giant", "outfit": { "right": "sword_steel" } }).to_string();
    let dress: Value =
        serde_json::from_str(&crate::cosmetics::dressed(&sent, &sword).expect("reads")).expect("a dress");
    assert_eq!(dress["outfit"]["right"], Value::Null);
}

#[test]
fn a_gun_a_normal_blade_and_a_normal_shield_keep_only_their_own_rungs() {
    let rare_gun = wearing(&[(Kind::Pistolet, Rarity::Rare, Source::World, None)]);
    assert_eq!(
        relayed(&json!({ "right": "pistolet_gilded" }), &rare_gun)["right"],
        Value::Null,
        "gilded from Legendary"
    );
    assert_eq!(relayed(&json!({ "right": "pistolet" }), &rare_gun)["right"], json!("pistolet"));
    let legendary_gun = wearing(&[(Kind::Pistolet, Rarity::Legendary, Source::World, None)]);
    assert_eq!(relayed(&json!({ "right": "pistolet_gilded" }), &legendary_gun)["right"], json!("pistolet_gilded"));
    // A Normal sword is iron to level 10 and steel past it; worn here at 20.
    let plain = wearing(&[(Kind::Sword, Rarity::Normal, Source::World, None)]);
    assert_eq!(relayed(&json!({ "right": "sword_iron" }), &plain)["right"], Value::Null, "iron only to level 10");
    // A Normal shield is plain or iron to level 10, its weapon's metal past it.
    let mut shielded = wearing(&[(Kind::SwordAndShield, Rarity::Normal, Source::World, None)]);
    for (item, _) in shielded.items.values_mut() {
        item.level = 15;
    }
    assert_eq!(relayed(&json!({ "left": "shield_kite_plain" }), &shielded)["left"], Value::Null, "plain only to 10");
    for (item, _) in shielded.items.values_mut() {
        item.level = 8;
    }
    assert_eq!(relayed(&json!({ "left": "shield_kite_plain" }), &shielded)["left"], json!("shield_kite_plain"));
}
