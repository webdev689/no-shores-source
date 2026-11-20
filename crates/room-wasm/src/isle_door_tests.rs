use super::{heights_bytes, hold_ashore, open_island, plan_json, sea_island};
use crate::{Opened, with_open};
use isle::{Kind, Plan};

fn seed_of(kind: Kind) -> u64 {
    (0..).find(|&seed| Kind::of(seed) == kind).unwrap_or(0)
}

#[test]
fn the_page_is_given_the_islands_plan_and_the_ground_its_room_stands_on() {
    let seed = seed_of(Kind::Ruin);
    let plan = Plan::new(seed, "tundra").expect("tundra dresses islands");
    let json: serde_json::Value = serde_json::from_str(&plan_json(seed, "tundra")).expect("JSON");
    assert_eq!(json["kind"], "ruin");
    assert_eq!(json["dungeon"], "crypt");
    assert_eq!(json["placements"].as_array().map(Vec::len), Some(plan.placements.len()));
    assert_eq!(json["wrecks"].as_array().map(Vec::len), Some(plan.sites.wrecks.len()));
    let floats: Vec<f64> = heights_bytes(seed, "tundra")
        .chunks_exact(8)
        .map(|bytes| f64::from_le_bytes(bytes.try_into().expect("8 bytes")))
        .collect();
    let ground = movement::Heights::from_floats(&floats).expect("a grid");
    assert_eq!(ground, plan.ground, "the page predicts on the room's own ground");
    assert!(plan_json(seed, "temperate-coast").is_empty() && heights_bytes(seed, "moon").is_empty());
}

#[test]
fn an_islands_room_opens_on_the_seas_word_with_its_guards() {
    let seed = seed_of(Kind::Quarry);
    let word = format!(r#"{{"seed":"{seed}","climate":"steppe","guards":1,"levels":[4,8]}}"#);
    assert!(open_island(word.as_bytes()));
    let foes = with_open(|opened| match opened {
        Opened::Land { room, .. } => room.foes_seen().count(),
        _ => 0,
    });
    assert!(foes.unwrap_or(0) >= 6, "an isle's guards stand");
    assert!(!open_island(br#"{"seed":"x","climate":"steppe","guards":0,"levels":null}"#));
    assert!(!open_island(br#"{"seed":"5","climate":"temperate-coast","guards":0,"levels":null}"#));
}

#[test]
fn with_no_sea_open_there_is_no_word_on_an_island() {
    assert!(open_island(br#"{"seed":"5","climate":"desert","guards":0,"levels":null}"#));
    assert!(sea_island(1).is_empty());
    assert!(!hold_ashore(1));
}
