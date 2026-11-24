//! A Breach's door: its run opens from its ask at either tier and refuses what names none, a joined player stands at
//! the Descent's top and is sent the Breach, the page reads its plan and the host how far its company has come, a
//! patrol's node file with a gate stands it and hears the host's words, and the predictor stands the run's blocks.

use super::*;
use crate::{open_node, room_join, room_tick, snapshot};
use protocol::wire::overlook::wire as messages;

fn ask(zone: &str, tier: usize) -> Vec<u8> {
    json!({ "zone": zone, "tier": tier, "minute": 29_919_420_u64 }).to_string().into_bytes()
}

/// A patrol's node file as the bake writes one standing the Sunken Gate at its middle on open land.
fn gated_patrol() -> Value {
    let grid = |value: f64| {
        json!({ "width": 4, "height": 4, "left_m": -2000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": vec![value; 16] })
    };
    json!({ "id": "gullwing-vale", "kind": "patrol", "name": "Gullwing Vale", "continent": "continent-1",
        "ring": [[-150.0, -150.0], [150.0, -150.0], [150.0, 150.0], [-150.0, 150.0]], "spawns": [[0.0, 90.0]],
        "bounds": [-250.0, -250.0, 250.0, 250.0],
        "ground": { "land": grid(10.0), "lake_level": vec![0.0; 16], "rivers": [], "roads": [], "towns": [],
            "coast": grid(5000.0), "across": grid(-50.0), "pads": [], "seed": 7 },
        "boxes": [], "breach": [[0.0, 0.0, 10.0], 1] })
}

#[test]
fn a_run_opens_from_its_ask_at_either_tier_and_sends_each_player_its_breach() {
    for tier in [0, 1] {
        assert!(open_breach(&ask("gullwing-vale", tier)));
        let player = room_join();
        assert_ne!(player, 0);
        room_tick();
        let bytes = snapshot(player);
        let message = messages::root_as_from_room(&bytes).expect("it reads");
        let seen = protocol::breach_wire::breach_of(&message.snapshot().expect("a snapshot")).expect("its Breach");
        assert!(!seen.gate);
        assert_eq!(usize::from(seen.tier), tier);
        assert_eq!(seen.phases, [2, 0, 0, 0, 0, 0], "the Waking won outside, the rest waiting");
        let progress: Value = serde_json::from_str(&progress_json()).expect("JSON");
        assert_eq!(progress, json!({ "tier": tier, "encounter": 1 }));
    }
    assert!(!open_breach(&ask("saltgrass-downs", 0)), "no Breach's gate there");
    assert!(!open_breach(&ask("gullwing-vale", 2)), "no third tier");
    assert!(!open_breach(b"not an ask"));
}

#[test]
fn the_page_reads_the_drowned_vales_plan_and_its_tiers() {
    let plan: Value = serde_json::from_str(&breach_json()).expect("JSON");
    assert_eq!(plan["id"], "drowned-vale");
    assert_eq!(plan["spaces"].as_array().map(Vec::len), Some(drowned_vale().spaces.len()));
    assert_eq!(
        plan["spaces"][0],
        json!({ "key": "descent", "module": "breach-descent", "at": [0.0, 0.0, 60.0], "turn": 0 })
    );
    assert_eq!(plan["seals"].as_array().map(Vec::len), Some(3));
    assert!(plan["seals"].as_array().expect("seals").iter().all(|seal| seal["at"].is_array()));
    assert_eq!(plan["slabs"].as_array().map(Vec::len), Some(6));
    assert_eq!([&plan["slabCycle"], &plan["slabStands"]], [&json!(660), &json!(420)]);
    assert_eq!(plan["encounters"][0]["outside"], true, "the Waking is fought in the patrol zone");
    assert_eq!(plan["encounters"][1]["space"], "mending");
    assert_eq!(plan["tiers"][0]["revives"], Value::Null);
    assert_eq!(plan["tiers"][1], json!({ "key": "hard", "name": "Hard", "level": 30, "opens": 28, "revives": 5 }));
    assert_eq!(plan["horse"], "drowned");
}

#[test]
fn a_patrols_node_file_with_a_gate_stands_it_and_hears_the_hosts_words() {
    assert!(open_node(gated_patrol().to_string().as_bytes()));
    let player = room_join();
    room_tick();
    let seen = |player| {
        let bytes = snapshot(player);
        let message = messages::root_as_from_room(&bytes).expect("it reads");
        protocol::breach_wire::breach_of(&message.snapshot().expect("a snapshot"))
    };
    assert!(seen(player).is_some_and(|seen| seen.gate), "the zone is sent its gate");
    let word = json!({ "run": "breach-drowned-vale--hard--run-1", "tier": 1 }).to_string();
    assert!(breach_company(player, word.as_bytes()));
    assert!(!breach_company(player, b"no word"));
    assert!(!breach_opened(b"breach-drowned-vale--hard--run-1"), "shut until its Spire wakes");
    let inside = json!({ "run": "run-2", "tier": 0, "name": "Wenna", "encounter": 3 }).to_string();
    assert!(breach_inside(inside.as_bytes()));
    room_tick();
    assert_eq!(seen(player).expect("the gate").inside, [("Wenna".to_owned(), 0, 3)]);
    assert_eq!(progress_json(), "null", "no run of its own");
    let mut ungated = gated_patrol();
    ungated.as_object_mut().expect("an object").remove("breach");
    assert!(open_node(ungated.to_string().as_bytes()));
    assert!(!breach_company(room_join(), word.as_bytes()), "no gate to hold them");
}

#[test]
fn the_predictor_stands_the_runs_blocks_as_its_room_does_and_makes_them_anew_only_as_they_change() {
    assert!(crate::fighter_door::set_breach(0, 0));
    assert!(!crate::fighter_door::set_breach(0, 1), "nothing came or went");
    let shut = crate::fighter_door::COURSE.with(|course| course.borrow().len());
    assert_eq!(shut, drowned_vale().blocks_at(0, 0).len());
    assert!(crate::fighter_door::set_breach(0b1, 1), "a seal opened");
    let open = crate::fighter_door::COURSE.with(|course| course.borrow().len());
    assert!(open < shut, "its blocks gone: {open} of {shut}");
    let changed = (2..room::breach::plan::SLAB_CYCLE).find(|tick| crate::fighter_door::set_breach(0b1, *tick));
    assert!(changed.is_some(), "a slab comes or goes within its cycle");
}
