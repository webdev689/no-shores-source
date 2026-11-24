//! Two scripted players play a whole Fissure and a whole Grey Tithe raid through the room's door, reading only what
//! each snapshot says: they fell the event's foes, take the shards and carry them to the lip, break the growth, kill
//! the tithe-taker, strike the Collectors at the stores, and win each, heroic. The same script, run by the browser's
//! test through WebAssembly (server/public.test.ts), comes to the same fingerprint.

use super::*;
use combat::arms::{Arms, OffHand, WeaponClass};
use combat::{CombatInput, Stroke};
use core::f64::consts::FRAC_PI_4;
use movement::Controls;
use protocol::wire::overlook::wire as messages;

/// Saltgrass Downs as a node with no garrison, on level land 10 m up, its spawns between its two grounds.
pub const EVENTS_NODE: &str = r#"{ "id": "saltgrass-downs", "kind": "social", "name": "Saltgrass Downs",
    "continent": "continent-1", "ring": [[-200, -200], [200, -200], [200, 200], [-200, 200]],
    "spawns": [[30, -60], [34, -60]], "bounds": [-300, -300, 300, 300], "boxes": [],
    "grounds": { "fissure": { "at": [0, -100], "radius": 30, "growth": [17, -100] },
        "raid": { "at": [100, 0], "radius": 30, "stores": [[92, -4], [108, -4], [100, 10]], "approach": [100, -45],
            "banners": [[94, -36], [106, -36]] } },
    "ground": { "lake_level": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "rivers": [], "roads": [], "towns": [],
        "pads": [], "seed": 7,
        "land": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
        "coast": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
            5000, 5000] },
        "across": { "width": 4, "height": 4, "left_m": -2000, "top_m": -2000, "cell_m": 1000, "first_column": 0,
            "first_row": 0, "data": [-50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50, -50,
            -50] } } }"#;

/// The minutes a Fissure and a raid begin at in Saltgrass Downs, and the most ticks each is played: past an event's
/// whole countdown, so one that runs out its clock still shows its result.
pub const FISSURE_MINUTE: u32 = 15_000;
pub const RAID_MINUTE: u32 = 15_015;
const MOST_TICKS: u32 = 9 * 3_600;
/// Both tests hold these values; a change to the events, the foes or the fight changes them in both, on purpose.
pub const FISSURE_HASH: &str = "8549239b";
pub const RAID_HASH: &str = "4e522678";
/// Where each stood as its result first showed, which a change to the fingerprint must account for: the tick, its
/// stage (the Warden's; Marrow's wave) and its progress (the shards set; the stores' health left, per mille). The
/// players' swings take the room's chain whatever stroke is asked (`room::chain`).
pub const FISSURE_ENDED: [u32; 3] = [15_658, 2, 28];
pub const RAID_ENDED: [u32; 3] = [10_118, 2, 0];
/// A player strikes a foe within this, squared, swinging every SWING_EVERY ticks; walks to a point to within GOT.
const STRIKE: f64 = 1.5 * 1.5;
const SWING_EVERY: u32 = 20;
const GOT: f64 = 0.5 * 0.5;
/// tan 22.5°: a heading this near a compass point's axis takes that point.
const NEAR_AXIS: f64 = 0.414_213_562_373_095_1;
const SEASONED: u8 = 6;

/// The nearest of the eight compass points to a heading east and south of a player, as the movement rules turn a
/// body (0 north, clockwise): chosen by comparisons alone, so a browser chooses it to the bit.
fn yaw_toward(east: f64, south: f64) -> f64 {
    let north = -south;
    let point = if east.abs() < north.abs() * NEAR_AXIS {
        if north > 0.0 { 0 } else { 4 }
    } else if north.abs() < east.abs() * NEAR_AXIS {
        if east > 0.0 { 2 } else { 6 }
    } else {
        match (east > 0.0, north > 0.0) {
            (true, true) => 1,
            (true, false) => 3,
            (false, false) => 5,
            (false, true) => 7,
        }
    };
    f64::from(point) * FRAC_PI_4
}

/// What a scripted player reads of a snapshot: every player's feet, every foe standing (its number, faction, type,
/// feet), and the event's kind, phase, heroic task, ground and marks.
#[derive(Default)]
struct Read {
    players: Vec<(u32, [f64; 2])>,
    foes: Vec<(u32, u8, u8, [f64; 2])>,
    kind: u8,
    phase: u8,
    heroic: u8,
    stage: u8,
    progress: u16,
    ground: [f64; 2],
    marks: Vec<(u8, u32, [f64; 2], u8)>,
}

/// A viewer who is no player: the snapshot cut for them is whole, everyone and every foe packed.
const NO_VIEWER: PlayerId = 0;

/// Reads a whole snapshot (`NO_VIEWER`'s), as the browser's test reads the same one.
fn read(bytes: &[u8]) -> Read {
    let seen = messages::root_as_from_room(bytes).unwrap().snapshot().unwrap();
    let middle: Vec<f64> = seen.middle().unwrap().iter().collect();
    let middle = [middle[0], middle[1]];
    let unpacked = |packed: &[u8], count| protocol::pack::unpack(packed, count, middle).unwrap();
    let players = seen.players().unwrap().iter().map(|player| {
        let numbers = unpacked(player.packed().unwrap().bytes(), protocol::UNTRIMMED_FLOATS);
        (player.player(), [numbers[0], numbers[1]])
    });
    let glance = combat::floats::GLANCE_FLOATS;
    let foes = seen
        .foes()
        .unwrap()
        .iter()
        .map(|foe| (foe.id(), unpacked(foe.packed().unwrap().bytes(), protocol::land::FOE_NUMBERS)));
    // Standing: its health (the glance's eleventh) left. Its type and faction follow its glance and its role.
    let foes = foes
        .filter(|(_, numbers)| numbers[10] > 0.0)
        .map(|(id, numbers)| (id, numbers[glance + 3] as u8, numbers[glance + 1] as u8, [numbers[0], numbers[1]]));
    let event = seen.public_event().unwrap();
    let marks = event
        .marks()
        .unwrap()
        .iter()
        .map(|mark| (mark.kind(), mark.id(), [f64::from(mark.x()), f64::from(mark.y())], mark.state()));
    let ground = event.ground().unwrap();
    Read {
        players: players.collect(),
        foes: foes.collect(),
        kind: event.kind(),
        phase: event.phase(),
        heroic: event.heroic(),
        stage: event.stage(),
        progress: event.progress(),
        ground: [ground.get(0), ground.get(1)],
        marks: marks.collect(),
    }
}

fn apart(one: [f64; 2], two: [f64; 2]) -> f64 {
    (one[0] - two[0]) * (one[0] - two[0]) + (one[1] - two[1]) * (one[1] - two[1])
}

/// The nearest of `points` to `from`, the first of any as near.
fn nearest(from: [f64; 2], points: impl Iterator<Item = (u32, [f64; 2])>) -> Option<(u32, [f64; 2])> {
    points.fold(None, |best, (id, at)| match best {
        Some((_, near)) if apart(from, near) <= apart(from, at) => best,
        _ => Some((id, at)),
    })
}

/// What a scripted player does this tick: walk to a point, or strike a foe (guarding between swings), or stand.
fn decide(read: &Read, player: u32, tick: u32) -> (Controls, CombatInput) {
    let still = (Controls::default(), CombatInput::default());
    let Some(&(_, at)) = read.players.iter().find(|(id, _)| *id == player) else { return still };
    let mark = |kind: u8| read.marks.iter().filter(move |mark| mark.0 == kind);
    let foe_at = |id: u32| read.foes.iter().find(|foe| foe.0 == id).map(|foe| foe.3);
    let of = |faction: u8, of_type: u8| {
        read.foes
            .iter()
            .filter(move |foe| foe.1 == faction && (of_type == 0 || foe.2 == of_type))
            .map(|foe| (foe.0, foe.3))
    };
    let (walk, strike) = match (read.kind, read.phase) {
        (1, 1) if mark(5).any(|carried| carried.1 == player) => (Some(read.ground), None),
        (1, 1) if read.heroic == 1 && mark(2).next().is_some() => (None, mark(2).next().map(|growth| growth.1)),
        (1, 1) if mark(4).next().is_some() => {
            (nearest(at, mark(4).map(|shard| (shard.1, shard.2))).map(|(_, at)| at), None)
        }
        (1, 1) => (None, nearest(at, of(3, 0)).map(|(id, _)| id)),
        (2, 1) if mark(6).next().is_some() => (None, mark(6).next().map(|taker| taker.1)),
        (2, 1) => (None, nearest(at, of(1, 2)).or_else(|| nearest(at, of(1, 0))).map(|(id, _)| id)),
        _ => (None, None),
    };
    let goal = walk.or_else(|| strike.and_then(foe_at));
    let Some(goal) = goal else { return still };
    let yaw = yaw_toward(goal[0] - at[0], goal[1] - at[1]);
    let near = if strike.is_some() { STRIKE } else { GOT };
    if apart(at, goal) > near {
        return (Controls { forward: 1.0, yaw, run: true, ..Controls::default() }, CombatInput::default());
    }
    let swing = strike.is_some() && tick.is_multiple_of(SWING_EVERY);
    // Each swing asks the next of the six strokes; the room takes the swings' chain whatever is asked.
    let stroke = [Stroke::Down, Stroke::DownLeft, Stroke::Left, Stroke::Right, Stroke::DownRight, Stroke::Up]
        [(tick / SWING_EVERY) as usize % 6];
    let combat =
        CombatInput { attack: swing.then_some(stroke), guard: strike.is_some() && !swing, ..CombatInput::default() };
    (Controls { yaw, ..Controls::default() }, combat)
}

/// The character each scripted player plays: a kitted one at SEASONED, its gear Rare at that level, as a player who
/// comes to Saltmere's events (its foes at 1 to 4) is.
fn seasoned() -> String {
    let mut character = gear::Character::kitted();
    character.xp = gear::power::xp_for_level(SEASONED);
    for (item, _) in character.items.values_mut() {
        (item.level, item.rarity) = (SEASONED, gear::Rarity::Rare);
    }
    character.to_json()
}

/// Plays an event from `minute` with two scripted players until it is won or failed and its result has shown a
/// second: its fingerprint, the event as it stood when it ended (its kind, phase and heroic task), and the tick, stage
/// and progress it ended at.
fn play(minute: u32) -> (String, (u8, u8, u8), [u32; 3]) {
    assert!(open_node(EVENTS_NODE.as_bytes()));
    assert!(set_minute(minute));
    let players = [room_join(), room_join()];
    let character = seasoned();
    assert!(players.iter().all(|player| restore_character(*player, character.as_bytes())));
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty }.code();
    let (mut hash, mut last, mut ended) = (0x811c_9dc5_u32, Read::default(), None);
    for tick in 1..=MOST_TICKS {
        for player in players {
            let (controls, combat) = decide(&last, player, tick);
            let intent = combat::Intent { controls, combat };
            let sent = room::Input {
                sequence: tick,
                intent,
                seen: u64::from(tick - 1),
                arms: sword,
                ..room::Input::default()
            };
            assert_eq!(input(player, &protocol::input_bytes(&sent)), TAKEN);
        }
        room_tick();
        let bytes = snapshot(players[0]);
        hash = bytes.iter().fold(hash, |hash, &byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193));
        // The same tick's taken once: a second cut of it, for no one, changes nothing the room holds.
        last = read(&snapshot(NO_VIEWER));
        if last.phase >= 2 {
            let at = [tick, u32::from(last.stage), u32::from(last.progress)];
            ended = ended.or(Some((tick, (last.kind, last.phase, last.heroic), at)));
        }
        if ended.is_some_and(|(at, _, _)| tick >= at + 60) {
            break;
        }
    }
    let (event, at) = ended.map_or(((0, 0, 0), [0; 3]), |(_, event, at)| (event, at));
    (format!("{hash:08x}"), event, at)
}

#[test]
fn two_scripted_players_seal_a_heroic_fissure_to_the_same_fingerprint_natively_as_in_webassembly() {
    let (hash, event, at) = play(FISSURE_MINUTE);
    assert_eq!(event, (1, 2, 2), "the Fissure won, heroic");
    assert_eq!(at, FISSURE_ENDED, "the tick it was won at, the Warden's stage and the shards set");
    assert_eq!(hash, FISSURE_HASH);
}

#[test]
fn two_scripted_players_meet_a_raids_heroic_task_but_lose_its_stores_to_the_same_fingerprint_natively_as_in_webassembly()
 {
    let (hash, event, at) = play(RAID_MINUTE);
    assert_eq!(event, (2, 3, 2), "the raid failed, its heroic task met");
    assert_eq!(at, RAID_ENDED, "the tick its stores fell at, its wave and the stores left");
    assert_eq!(hash, RAID_HASH);
}

/// Whether a snapshot carries the zone's events.
fn carries_events(bytes: &[u8]) -> bool {
    messages::root_as_from_room(bytes).unwrap().snapshot().unwrap().public_event().is_some()
}

/// A player shows the last tick's snapshot and the room ticks on: the snapshot then cut for them.
fn after_showing(player: PlayerId, tick: u32) -> Vec<u8> {
    let sent = room::Input { sequence: tick, seen: u64::from(tick), ..room::Input::default() };
    assert_eq!(input(player, &protocol::input_bytes(&sent)), TAKEN);
    room_tick();
    snapshot(player)
}

#[test]
fn a_snapshot_carries_the_events_only_when_they_stand_otherwise_than_its_base_counted_on() {
    for minute in [FISSURE_MINUTE + 10, FISSURE_MINUTE] {
        assert!(open_node(EVENTS_NODE.as_bytes()));
        assert!(set_minute(minute));
        let player = room_join();
        room_tick();
        assert!(carries_events(&snapshot(player)), "{minute}: built on none, whole");
        // Waiting, or the Fissure's first wave pouring out: nothing changes but the countdowns.
        for tick in 1..30 {
            assert!(!carries_events(&after_showing(player, tick)), "{minute}: tick {tick} counted on");
        }
        assert!(carries_events(&snapshot(NO_VIEWER)), "{minute}: a page come now is sent them whole");
    }
}
