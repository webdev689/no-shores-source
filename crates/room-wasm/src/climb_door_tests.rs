//! A foe climbs alike wherever the room runs: on the Test Ground's course a player climbs the ledge, turns and asks for
//! a foe south of it, which goes up after them and fights them there. The run is fingerprinted here, natively, and by
//! the browser's test of the same run through WebAssembly (server/climb.test.ts holds the same script and
//! fingerprint).

use super::*;
use combat::{CombatInput, Stroke};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::Controls;
use protocol::wire::overlook::wire as messages;
use room::SpawnAsk;
use serde_json::Value;

/// Both tests hold this value; a change to the course, the bake, the foes or the fight changes it in both, on purpose.
pub const CLIMB_HASH: &str = "0d6dccae";

/// The script: ticks east, then ticks north into the ledge and up it, then facing south; the tick the player asks for
/// a swordsman, and how often they swing at it after; the run's length.
const EAST: u32 = 40;
const NORTH: u32 = 230;
const ASK_AT: u32 = 300;
const SWING_EVERY: u32 = 30;
const RUN_TICKS: u32 = 1200;
const SWORDSMAN: u8 = 14;

fn course_bytes() -> Vec<u8> {
    let course: Value = serde_json::from_str(include_str!("../../../content/testground/course.json")).unwrap();
    let number = |value: &Value, key: &str| value[key].as_f64().unwrap();
    let mut floats = vec![number(&course["start"], "x"), number(&course["start"], "y")];
    for block in course["blocks"].as_array().unwrap() {
        floats.extend(["minX", "minY", "maxX", "maxY", "top"].map(|key| number(block, key)));
    }
    floats.iter().flat_map(|value| value.to_le_bytes()).collect()
}

#[test]
fn a_foe_climbs_after_a_player_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly() {
    assert!(open(&course_bytes()));
    let player = room_join();
    let (mut hash, mut highest) = (0x811c_9dc5_u32, 0.0_f64);
    for tick in 1..=RUN_TICKS {
        let (forward, yaw) = if tick <= EAST {
            (1.0, FRAC_PI_2)
        } else if tick <= NORTH {
            (1.0, 0.0)
        } else {
            (0.0, PI)
        };
        let controls = Controls { forward, yaw, ..Controls::default() };
        let swing = tick > ASK_AT && tick % SWING_EVERY == 0;
        let combat = CombatInput { attack: swing.then_some(Stroke::Down), ..CombatInput::default() };
        let spawn = (tick == ASK_AT).then_some(SpawnAsk::Foe { foe_type: SWORDSMAN, rank: 2, shield: 0 });
        let input = room::Input {
            sequence: tick,
            intent: combat::Intent { controls, combat },
            seen: u64::from(tick - 1),
            spawn,
            ..room::Input::default()
        };
        assert_eq!(super::input(player, &protocol::input_bytes(&input)), TAKEN);
        room_tick();
        let bytes = snapshot();
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        for foe in seen.foes().unwrap() {
            highest = highest.max(foe.glance().unwrap().get(2));
        }
    }
    assert!(highest == 2.3, "the foe stood on the ledge: as high as {highest} m");
    assert_eq!(format!("{hash:08x}"), CLIMB_HASH);
}
