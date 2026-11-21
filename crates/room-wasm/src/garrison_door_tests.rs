//! A node's room and its garrison agree to the bit wherever they run: this run of a player into a mission's garrison
//! and its fight is fingerprinted here, natively, and by the browser's test of the same run through WebAssembly
//! (server/garrison.test.ts holds the same node, script and fingerprint).

use super::*;
use combat::{CombatInput, Stroke};
use movement::Controls;
use protocol::wire::overlook::wire as messages;
use std::collections::BTreeMap;

/// The foes as a browser keeps them from its snapshots, each one's numbers: a snapshot names the foes that changed
/// since the last its screen showed, each whole or as its numbers that changed, and those gone; the rest stand.
#[derive(Debug, Default)]
pub struct FoesKept(pub BTreeMap<u32, Vec<f64>>);

impl FoesKept {
    pub fn take(&mut self, seen: &messages::Snapshot<'_>) {
        let middle: Vec<f64> = seen.middle().map(|middle| middle.iter().collect()).unwrap_or_default();
        if seen.base() == 0 {
            self.0.clear();
        }
        for gone in seen.gone_foes().iter().flatten() {
            self.0.remove(&gone);
        }
        for foe in seen.foes().iter().flatten() {
            let bytes = foe.packed().unwrap().bytes();
            let Some(bits) = foe.changed().map(|bits| bits.bytes()) else {
                let origin = [middle.first().copied().unwrap_or_default(), middle.get(1).copied().unwrap_or_default()];
                self.0.insert(foe.id(), protocol::pack::unpack(bytes, protocol::land::FOE_NUMBERS, origin).unwrap());
                continue;
            };
            let count = bits.iter().map(|byte| byte.count_ones() as usize).sum();
            let mut values = protocol::pack::unpack(bytes, count, [0.0; 2]).unwrap().into_iter();
            let numbers = self.0.get_mut(&foe.id()).unwrap();
            for (index, number) in numbers.iter_mut().enumerate() {
                if bits[index / 8] & (1 << (index % 8)) != 0 {
                    *number = values.next().unwrap() + middle.get(index).copied().unwrap_or_default();
                }
            }
        }
    }
}

/// A mission's node file: a section 400 m square on land rising 300 m a kilometre east and south, its two spawns near
/// its southern edge, and in the square its room bakes a wall from below the ground up and a roof 4 m or more over it.
pub const GARRISON_NODE: &str = r#"{ "id": "glade", "kind": "mission", "name": "The Glade", "continent": "square",
    "ring": [[-200, -200], [200, -200], [200, 200], [-200, 200]], "spawns": [[0, 180], [15, 185]],
    "bounds": [-300, -300, 300, 300],
    "boxes": [[-10, 152, 10, 153, 970, 900], [15, 145, 25, 160, 962.5, 962]],
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
pub const GARRISON_HASH: &str = "e2c810db";

/// Ticks the player runs north into the garrison, then stands and swings each SWING_EVERY ticks until RUN_TICKS.
const RUN_IN: u32 = 420;
const SWING_EVERY: u32 = 30;
const RUN_TICKS: u32 = 1500;

#[test]
fn a_node_s_garrison_fights_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly() {
    assert!(open_node(GARRISON_NODE.as_bytes()));
    let player = room_join();
    let (mut hash, mut most_alert, mut blows, mut kept) = (0x811c_9dc5_u32, 0, 0, FoesKept::default());
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
        let bytes = snapshot(player);
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        kept.take(&seen);
        let alertness = combat::floats::GLANCE_FLOATS + 5;
        let alert = kept.0.values().filter(|numbers| numbers[alertness] == 2.0).count();
        most_alert = most_alert.max(alert);
        blows += seen.events().map_or(0, |events| events.len());
    }
    assert!(most_alert >= 3 && blows > 0, "the garrison fights: {most_alert} alert at once, {blows} events");
    assert_eq!(format!("{hash:08x}"), GARRISON_HASH);
}

fn input_of(player: PlayerId, input: &room::Input) -> i32 {
    super::input(player, &protocol::input_bytes(input))
}

/// Both tests hold this value: two players in one node's room, the garrison's foes shared out between them.
pub const GARRISON_PAIR_HASH: &str = "09f02881";

#[test]
fn two_players_against_a_node_s_garrison_fight_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly() {
    assert!(open_node(GARRISON_NODE.as_bytes()));
    let players = [room_join(), room_join()];
    let (mut hash, mut struck) = (0x811c_9dc5_u32, [0, 0]);
    for tick in 1..=RUN_TICKS {
        for (index, player) in players.into_iter().enumerate() {
            // The second player swings half a beat of swings after the first.
            let running = tick <= RUN_IN;
            let swing = !running && (tick + 15 * u32::try_from(index).unwrap()) % SWING_EVERY == 0;
            let controls = Controls { forward: if running { 1.0 } else { 0.0 }, run: true, ..Controls::default() };
            let combat = CombatInput { attack: swing.then_some(Stroke::Down), ..CombatInput::default() };
            let intent = combat::Intent { controls, combat };
            let input = room::Input { sequence: tick, intent, seen: u64::from(tick - 1), ..room::Input::default() };
            assert_eq!(input_of(player, &input), TAKEN);
        }
        room_tick();
        let bytes = snapshot(players[0]);
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        hash = snapshot(players[1]).iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        for event in seen.events().iter().flatten() {
            if let Some(index) = players.iter().position(|player| *player == event.defender()) {
                struck[index] += u32::from(event.striker() != event.defender());
            }
        }
    }
    assert!(struck.iter().all(|blows| *blows > 0), "the garrison fights both players: {struck:?}");
    assert_eq!(format!("{hash:08x}"), GARRISON_PAIR_HASH);
}
