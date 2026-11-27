//! A passage zone's room agrees to the bit wherever it runs: this run of a player through an Ambush's three waves,
//! standing where they came in and swinging at the nearest foe until the deal is done, is fingerprinted here natively; a browser's test of the
//! same run through WebAssembly holds the same ask, script and fingerprint.

use super::*;
use crate::garrison_door_tests::FoesKept;
use crate::{Opened, TAKEN, restore_character, room_join, room_tick, snapshot, with_open};
use combat::{CombatInput, Stroke};
use movement::Controls;
use protocol::wire::overlook::wire as messages;

/// The zone the run opens: Saltmere's first Ambush of the week of 2_900 and the minute it opens at, in that week.
pub const PASSAGE_ASK: &str =
    r#"{ "island": "continent-1", "week": 2900, "zone": ZONE, "route": "public", "minute": 29230000 }"#;
/// Both tests hold this value; a change to the passages' rooms, the foes or the fight changes it in both, on purpose.
pub const PASSAGE_HASH: &str = "f711b19e";
/// The tick the deal was done at, in both.
pub const PASSAGE_DONE: u32 = 6_183;
const RUN_TICKS: u32 = 7_000;
const SWING_EVERY: u32 = 20;
/// A glance's health's place among a foe's numbers, and how near a foe stands to be swung at (m).
const HEALTH: usize = 10;
const REACH_M: f64 = 2.6;

/// The player's own fighter as a browser keeps it from its snapshots: whole, or the numbers changed, a bit each.
fn keep_own(own: &mut Vec<f64>, seen: &messages::Snapshot<'_>, player: room::PlayerId) {
    let Some(mine) = seen.players().iter().flatten().find(|each| each.player() == player) else { return };
    let Some(numbers) = mine.fighter() else { return };
    let numbers: Vec<f64> = numbers.iter().collect();
    let Some(bits) = mine.changed().map(|bits| bits.bytes()) else {
        *own = numbers;
        return;
    };
    let mut values = numbers.into_iter();
    for (index, number) in own.iter_mut().enumerate() {
        if bits.get(index / 8).is_some_and(|byte| byte & (1 << (index % 8)) != 0) {
            *number = values.next().unwrap_or(*number);
        }
    }
}

/// The ask with the week's first Ambush's number in it.
pub fn passage_ask() -> String {
    let web = passage::Web::of(passage::island("continent-1").unwrap(), 2_900);
    let ambush = web.zones.iter().find(|zone| zone.deal == passage::Deal::Mission(passage::Mission::Ambush)).unwrap();
    PASSAGE_ASK.replace("ZONE", &ambush.number.to_string())
}

/// The character the run plays: kitted, level 20, past the prologue, on a dive in the zone.
pub fn diver(zone: u16) -> String {
    let mut character = gear::Character::kitted();
    character.story.prologue = true;
    character.earn_xp(10_000_000, None);
    let start = gear::dive::Start {
        island: "continent-1",
        week: 2_900,
        route: gear::dive::Route::Public,
        mouth: 0,
        zone,
        depth: 1,
        lamp: None,
        seas: gear::Difficulty::Normal,
    };
    character.begin_dive(&start).unwrap();
    character.to_json()
}

#[test]
fn a_passage_zones_room_fights_its_deal_done_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly() {
    let ask = passage_ask();
    assert!(open_passage(ask.as_bytes()));
    assert_eq!(crate::refusal(), None, "its week");
    let zone: serde_json::Value = serde_json::from_str(&ask).unwrap();
    let player = room_join();
    let character = diver(zone["zone"].as_u64().unwrap() as u16);
    assert!(restore_character(player, character.as_bytes()));
    // The hands hold the sword the gear names first, as a page's do (`Gear.arms`).
    let arms = room::arms_allowed(&gear::Character::from_json(&character).unwrap())[0].code();
    let (mut hash, mut kept, mut done_at) = (0x811c_9dc5_u32, FoesKept::default(), 0);
    let mut own: Vec<f64> = Vec::new();
    for tick in 1..=RUN_TICKS {
        // It runs at the nearest living foe as its snapshots show them, and swings once it is near: within reach along
        // the ground and in height, so a body that climbed a rock above a foe goes on rather than swinging at it.
        let (at, height) = if own.len() >= 3 { ([own[0], own[1]], own[2]) } else { ([0.0, 0.0], 0.0) };
        let living = kept.0.values().filter(|numbers| numbers[HEALTH] > 0.0);
        let nearest = living.map(|numbers| [numbers[0], numbers[1], numbers[2]]).min_by(|one, two| {
            combat::sight::apart(at, [one[0], one[1]]).total_cmp(&combat::sight::apart(at, [two[0], two[1]]))
        });
        let yaw = nearest.map_or(0.0, |foe| combat::sight::bearing(at, [foe[0], foe[1]]));
        let near = nearest.is_some_and(|foe| {
            combat::sight::apart(at, [foe[0], foe[1]]) <= REACH_M && (foe[2] - height).abs() <= REACH_M
        });
        let forward = if nearest.is_some() && !near { 1.0 } else { 0.0 };
        let controls = Controls { yaw, forward, run: true, ..Controls::default() };
        let swing = near && tick % SWING_EVERY == 0;
        let combat = CombatInput { attack: swing.then_some(Stroke::Down), ..CombatInput::default() };
        let input = room::Input {
            sequence: tick,
            intent: combat::Intent { controls, combat },
            seen: u64::from(tick - 1),
            respawn: true,
            arms,
            ..room::Input::default()
        };
        assert_eq!(crate::input(player, &protocol::input_bytes(&input)), TAKEN);
        room_tick();
        let bytes = snapshot(player);
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        let seen = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        kept.take(&seen);
        keep_own(&mut own, &seen, player);
        let passage = seen.passage().expect("a passage zone's deal crosses in its snapshot");
        if passage.done() && done_at == 0 {
            done_at = tick;
            assert!(passage.open(), "the mouths open with it");
        }
    }
    let open = with_open(|opened| matches!(opened, Opened::Land { .. }));
    assert_eq!(open, Some(true));
    assert_eq!((format!("{hash:08x}"), done_at), (PASSAGE_HASH.to_owned(), PASSAGE_DONE));
}

#[test]
fn a_passage_zone_refuses_a_bad_ask_and_its_week_once_turned() {
    assert!(!open_passage(b"not an ask"));
    assert!(!open_passage(br#"{ "island": "continent-9", "week": 2900, "zone": 0 }"#), "no passages there yet");
    assert!(!open_passage(br#"{ "island": "continent-1", "week": 2900, "zone": 9999 }"#), "no such zone");
    let later = passage_ask().replace("29230000", "29240000");
    assert!(open_passage(later.as_bytes()));
    assert_eq!(crate::refusal().as_deref(), Some(SHIFTED));
}

#[test]
fn a_room_opened_in_its_week_refuses_a_join_once_the_week_turns_on_its_clock() {
    assert!(open_passage(passage_ask().as_bytes()));
    assert_ne!(room_join(), 0, "its week");
    assert!(crate::gear_door::set_minute(29_240_000), "a minute of the next week");
    assert_eq!(crate::refusal().as_deref(), Some(SHIFTED));
    assert_eq!(room_join(), 0, "the week turned while it stood open");
}

/// The week's first zone of each ground, under ground then above it, by its number.
fn zone_of_each_ground() -> [u16; 2] {
    let web = passage::Web::of(passage::island("continent-1").unwrap(), 2_900);
    let first = |under: bool| {
        let laid = |zone: &&passage::Zone| {
            passage::Plan::of(&web, zone.number)
                .is_some_and(|plan| matches!(plan.ground, passage::Laid::Under(_)) == under)
        };
        web.zones.iter().find(laid).expect("a zone of that ground").number
    };
    [first(true), first(false)]
}

/// The player's fighter as the room holds it now, its numbers whole.
fn fighter_now(player: room::PlayerId) -> Vec<f64> {
    let found = with_open(|opened| match opened {
        Opened::Land { room, .. } => room.fighters().into_iter().find(|(id, _)| *id == player).map(|(_, held)| held),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    });
    found.flatten().expect("the player's fighter").to_floats().to_vec()
}

#[test]
fn a_walk_predicted_on_a_passage_zones_own_ground_is_stepped_by_its_room_to_the_bit() {
    for zone in zone_of_each_ground() {
        let ask = PASSAGE_ASK.replace("ZONE", &zone.to_string());
        assert!(open_passage(ask.as_bytes()));
        assert!(!crate::fighter_door::set_passage(b"not an ask"), "anything else is no zone");
        assert!(crate::fighter_door::set_passage(ask.as_bytes()), "the page's ground for zone {zone}");
        let player = room_join();
        let character = diver(zone);
        assert!(restore_character(player, character.as_bytes()));
        let arms = room::arms_allowed(&gear::Character::from_json(&character).unwrap())[0].code();
        let (mut blocked, mut climbed) = (false, false);
        for tick in 1..=240_u32 {
            // Ahead, turning a quarter each 60 ticks, so it walks into the walls and the pieces.
            let yaw = f64::from(tick / 60) * std::f64::consts::FRAC_PI_2;
            let controls = Controls { yaw, forward: 1.0, run: true, ..Controls::default() };
            let intent = combat::Intent { controls, ..combat::Intent::default() };
            let before = fighter_now(player);
            let mut numbers = before.clone();
            numbers.extend(intent.to_floats());
            numbers.extend([f64::from(player), f64::from(arms)]);
            let bytes: Vec<u8> = numbers.iter().flat_map(|number| number.to_le_bytes()).collect();
            let predicted = crate::floats_of(&crate::fighter_door::predict(&bytes));
            let input =
                room::Input { sequence: tick, intent, seen: u64::from(tick - 1), arms, ..room::Input::default() };
            assert_eq!(crate::input(player, &protocol::input_bytes(&input)), TAKEN);
            room_tick();
            let after = fighter_now(player);
            let bits = |numbers: &[f64]| numbers.iter().map(|number| number.to_bits()).collect::<Vec<_>>();
            let body = movement::floats::BODY_FLOATS;
            assert_eq!(bits(&predicted[..body]), bits(&after[..body]), "zone {zone}, tick {tick}: the body");
            // A foe come near strikes, which a page predicting alone does not see: the walk ends there.
            if bits(&predicted) != bits(&after) {
                assert!(tick > 120, "zone {zone}: struck at tick {tick}, before the walk had gone far");
                break;
            }
            let moved = combat::sight::apart([before[0], before[1]], [after[0], after[1]]);
            blocked |= tick % 60 > 5 && moved < 0.01;
            climbed |= (after[2] - before[2]).abs() > 1e-6;
        }
        assert!(blocked, "zone {zone}: the walk met a wall");
        if zone == zone_of_each_ground()[1] {
            assert!(climbed, "zone {zone}: the walk rose or fell on the hollow's heights");
        }
    }
}
