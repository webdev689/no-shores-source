//! The room's numbers the page keeps its own copies of, written for the page's tests to compare with: so a page test
//! reads what the rules hold from this file, never the rules' source.

use crate::judging::EventKind;
use crate::public::{fissure, raid, seen};
use gear::Refusal;
use gear::mail::Source;
use gear::vendor::Vendor;

#[test]
fn the_rooms_numbers_are_written_for_the_page() {
    let events = [
        EventKind::PublicBegun,
        EventKind::PublicStage,
        EventKind::ShardTaken,
        EventKind::ShardSet,
        EventKind::HeroicMet,
        EventKind::HeroicMissed,
        EventKind::PublicWon,
        EventKind::PublicFailed,
        EventKind::StorePlundered,
        EventKind::ChestOpened,
    ];
    let sources = [
        Source::LeftLying,
        Source::LeftBehind,
        Source::Clear,
        Source::Flotsam,
        Source::Salvage,
        Source::Found,
        Source::Gift,
    ];
    // The page's test holds every event from PublicBegun to ChestOpened: numbered in a run, none left out between.
    let numbers = events.map(|event| event as u8);
    assert!(numbers.windows(2).all(|pair| pair[1] == pair[0] + 1), "{numbers:?}");
    // Every source, so one added fails the build here until the page has words for it.
    let numbered = |source: Source| match source {
        Source::LeftLying
        | Source::LeftBehind
        | Source::Clear
        | Source::Flotsam
        | Source::Salvage
        | Source::Found
        | Source::Gift => source as u8,
    };
    let starter =
        [Vendor::Armorsmith, Vendor::Weaponsmith, Vendor::Shipwright].map(|vendor| vendor.starter_kinds().len());
    let written = serde_json::json!({
        "climaxes": [fissure::WARDEN_NAME, raid::MARROW_NAME],
        "spires": fissure::SPIRES,
        "spireSunk": fissure::SPIRE_SUNK,
        "events": events.map(|event| (format!("{event:?}"), event as u8)),
        "marks": {
            "fissure": seen::FISSURE, "growth": seen::GROWTH, "store": seen::STORE, "shard": seen::SHARD,
            "carried": seen::CARRIED, "titheTaker": seen::TITHE_TAKER, "banner": seen::BANNER,
            "approach": seen::APPROACH,
        },
        "growth": {
            "rising": seen::RISING, "standing": seen::STANDING, "sinking": seen::SINKING, "broken": seen::BROKEN,
        },
        "store": { "whole": seen::WHOLE, "plundered": seen::PLUNDERED },
        "growthRiseTicks": fissure::GROWTH_RISE,
        "growthSinkTicks": fissure::GROWTH_SINK,
        "dropTicks": crate::drops::DROP_TICKS,
        "nodeReach": crate::asks::NODE_REACH,
        "gatherTicks": crate::asks::GATHER_TICKS,
        "gatherStirM": crate::asks::GATHER_STIR_M,
        "stockMost": gear::character::STOCK_MOST,
        "chestOffWallM": crate::finds::OFF_WALL_M,
        "chestHalfDeepM": crate::finds::CHEST_HALF_DEEP_M,
        "chestReach": crate::find_holds::CHEST_REACH,
        "searchReach": crate::find_holds::SEARCH_REACH,
        "findHeight": crate::find_holds::FIND_HEIGHT,
        "openTicks": crate::find_holds::OPEN_TICKS,
        "searchTicks": crate::find_holds::SEARCH_TICKS,
        "paces": crate::sea::PACES,
        "mailSources": sources.map(|source| (format!("{source:?}"), numbered(source))),
        "wares": gear::vendor::WARES,
        "starterPieces": starter,
        "passageRefusals": [Refusal::NoDive as u8, Refusal::FoesNear as u8],
        "burstS": naval::boost::BURST_S,
        "rechargeS": naval::boost::RECHARGE_S,
        "runOutS": naval::captain::aim::RUN_OUT_S,
        "runInDeg": naval::captain::aim::RUN_IN_DEG,
    });
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/room-numbers.json"), written.to_string()).expect("written");
}
