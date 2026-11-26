use super::{heights_bytes, hold_ashore, isle_landing, open_island, plan_json, sea_dungeon, sea_island, sea_landed};
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
    assert_eq!(json["nodes"].as_array().map(Vec::len), Some(plan.sites.nodes.len()), "where its nodes stand");
    let at = [512_000.5, 301_000.25];
    let floats: Vec<f64> = heights_bytes(seed, "tundra", at)
        .chunks_exact(8)
        .map(|bytes| f64::from_le_bytes(bytes.try_into().expect("8 bytes")))
        .collect();
    let ground = movement::Heights::from_floats(&floats).expect("a grid");
    assert_eq!(ground, plan.ground_at(at), "the page predicts on the room's own ground");
    assert!(plan_json(seed, "moon").is_empty() && heights_bytes(seed, "moon", at).is_empty());
    for nowhere in [[f64::NAN, 0.0], [0.0, f64::INFINITY]] {
        assert!(heights_bytes(seed, "tundra", nowhere).is_empty(), "no ground for a middle no number names");
    }
    assert!(!heights_bytes(seed, "tundra", at).is_empty(), "and the door answers on");
}

#[test]
fn an_islands_room_opens_on_the_seas_word_with_its_guards() {
    let seed = seed_of(Kind::Quarry);
    let word = format!(r#"{{"seed":"{seed}","climate":"steppe","at":[400000,300000],"guards":1,"levels":[4,8]}}"#);
    assert!(open_island(word.as_bytes()));
    let foes = with_open(|opened| match opened {
        Opened::Land { room, .. } => room.foes_seen().count(),
        _ => 0,
    });
    assert!(foes.unwrap_or(0) >= 6, "an isle's guards stand");
    // As a newcomer finds them: every node standing, none yet gathered.
    let nodes = || {
        let count = with_open(|opened| match opened {
            Opened::Land { room, .. } => room.nodes_for(u32::MAX).filter(|(_, node)| node.resource == 6).count(),
            _ => 0,
        });
        count.unwrap_or(0)
    };
    assert_eq!(nodes(), 0, "with no resource in its word, no node stands");
    let word =
        format!(r#"{{"seed":"{seed}","climate":"steppe","at":[400000,300000],"guards":0,"levels":null,"resource":6}}"#);
    assert!(open_island(word.as_bytes()));
    let plan = Plan::new(seed, "steppe").expect("steppe dresses islands");
    assert_eq!(nodes(), plan.sites.nodes.len(), "its water's resource stands in each of its nodes");
    assert!(!open_island(br#"{"seed":"x","climate":"steppe","at":[0,0],"guards":0,"levels":null}"#));
    assert!(!open_island(br#"{"seed":"5","climate":"moon","at":[0,0],"guards":0,"levels":null}"#));
}

#[test]
fn with_no_sea_open_there_is_no_word_on_an_island() {
    assert!(open_island(br#"{"seed":"5","climate":"desert","at":[0,0],"guards":0,"levels":null}"#));
    assert!(sea_island(1).is_empty());
    assert!(!hold_ashore(1, 5));
}

/// The plans of a cove and a quarry, pinned: server/isle.test.ts pins the same of the page's WebAssembly, so every
/// module, block and post stands where the room has it on every machine, not only the ground.
const PLANS_PINNED: [(u64, &str); 2] = [(41, "desert"), (QUARRY_SEED, "rainforest")];
const QUARRY_SEED: u64 = 2;
const PLANS: &str = "b34441b512d89694";

#[test]
fn the_plans_bits_are_the_ones_the_page_pins() {
    assert_eq!(QUARRY_SEED, seed_of(Kind::Quarry), "the first quarry's seed");
    let text: String = PLANS_PINNED.iter().map(|&(seed, climate)| plan_json(seed, climate)).collect();
    let hash = text
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3));
    assert_eq!(format!("{hash:016x}"), PLANS);
}

#[test]
fn an_islands_room_checks_landings_and_only_a_sea_answers_one() {
    assert!(open_island(br#"{"seed":"5","climate":"desert","at":[0,0],"guards":0,"levels":null}"#));
    assert!(isle_landing(None), "an island's room checks landings");
    assert!(isle_landing(Some(("anchored", 1))));
    assert_eq!(sea_landed(1, 5, "anchored"), 0, "an island's room is no sea");
}

#[test]
fn the_sea_gives_its_word_on_an_island_by_its_dungeons_room_alone() {
    let layout = r#"{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(crate::open_sea(layout.as_bytes(), 7));
    let player = crate::room_join();
    assert_eq!(crate::input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), crate::TAKEN);
    let standing = || {
        with_open(|opened| match opened {
            Opened::Sea(sea) => sea.islands().standing().next().map(|island| (island.id, island.seed)),
            _ => None,
        })
        .flatten()
    };
    while standing().is_none() {
        crate::room_tick();
    }
    let (id, seed) = standing().unwrap_or_default();
    let word: serde_json::Value =
        serde_json::from_str(&sea_dungeon(&room::sea::islands::dungeon_room(seed, "continent-4")))
            .expect("the island's word");
    assert_eq!((word["id"].as_u64(), word["seed"].as_str()), (Some(u64::from(id)), Some(seed.to_string().as_str())));
    assert!(sea_dungeon(&room::sea::islands::dungeon_room(seed, "continent-3")).is_empty(), "another water's");
    assert!(sea_dungeon(&room::sea::islands::dungeon_room(seed ^ (1 << 40), "continent-4")).is_empty(), "another seed");
}
