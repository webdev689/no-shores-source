//! A node's room and its garrison agree to the bit wherever they run: this run of a player into a mission's garrison
//! and its fight is fingerprinted here, natively, and by the browser's test of the same run through WebAssembly
//! (server/garrison.test.ts holds the same node, script and fingerprint).

use super::*;
use combat::{CombatInput, Stroke};
use movement::Controls;
use protocol::wire::overlook::wire as messages;

/// A mission's node file: a section 400 m square on land rising 300 m a kilometre east and south, its two spawns near
/// its southern edge.
pub const GARRISON_NODE: &str = r#"{ "id": "glade", "kind": "mission", "name": "The Glade", "continent": "square",
    "ring": [[-200, -200], [200, -200], [200, 200], [-200, 200]], "spawns": [[0, 180], [15, 185]],
    "bounds": [-300, -300, 300, 300], "boxes": [],
    "ground": { "lake_level": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "rivers": [], "roads": [], "towns": [],
        "pads": [], "seed": 7,
        "land": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [0, 300, 600, 900, 300, 600, 900, 1200, 600, 900, 1200, 1500, 900, 1200, 1500,
            1800] },
        "coast": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
            5000, 5000] },
        "across": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [-50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50,
            -50] } } }"#;

/// Both tests hold this value; a change to the garrison, the foes or the fight changes it in both, on purpose.
pub const GARRISON_HASH: &str = "4f56e6a5";

/// Ticks the player runs north into the garrison, then stands and swings each SWING_EVERY ticks until RUN_TICKS.
const RUN_IN: u32 = 420;
const SWING_EVERY: u32 = 30;
const RUN_TICKS: u32 = 1500;

#[test]
fn a_node_s_garrison_fights_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly() {
    assert!(open_node(GARRISON_NODE.as_bytes()));
    let player = room_join();
    let (mut hash, mut most_alert, mut blows) = (0x811c_9dc5_u32, 0, 0);
    for tick in 1..=RUN_TICKS {
        let running = tick <= RUN_IN;
        let controls = Controls { forward: if running { 1.0 } else { 0.0 }, run: true, ..Controls::default() };
        let swing = !running && tick % SWING_EVERY == 0;
        let combat = CombatInput { attack: swing.then_some(Stroke::Down), ..CombatInput::default() };
        let input = room::Input {
            sequence: tick,
            intent: combat::Intent { controls, combat },
            seen: u64::from(tick - 1),
            ..room::Input::default()
        };
        assert_eq!(input_of(player, &input), TAKEN);
        room_tick();
        let bytes = snapshot();
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        let alert = seen.foes().unwrap().iter().filter(|foe| foe.alert() == 2).count();
        most_alert = most_alert.max(alert);
        blows += seen.events().map_or(0, |events| events.len());
    }
    assert!(most_alert >= 3 && blows > 0, "the garrison fights: {most_alert} alert at once, {blows} events");
    assert_eq!(format!("{hash:08x}"), GARRISON_HASH);
}

fn input_of(player: PlayerId, input: &room::Input) -> i32 {
    super::input(player, &protocol::input_bytes(input))
}
