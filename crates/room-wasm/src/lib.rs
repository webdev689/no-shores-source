//! The room for its Cloudflare host and for a browser playing alone. Each WebAssembly instance keeps one room: a
//! course's, a node's, the sea's or a fleet's. The host opens it, lets players join and leave, hands it each player's input bytes
//! as they come, ticks it, and sends out the bytes it answers. A browser also steps its own player's fighter here, by
//! the same rules, to predict it. The rules stay in the combat and room crates and the messages in the protocol crate.
//! See the Server and Combat notes in the bible.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use combat::Fighter;
use combat::floats::{FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS};
use land::ground::Ground;
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use protocol::SeaInput;
use room::fleet::Fleet;
use room::sea::{CourseRefused, Sea};
use room::{Floor, FoeSeen, PlayerId, Refused, Room, Section, Seen};
use serde::Deserialize;
use std::cell::RefCell;

mod fleet_door;

/// The room an instance keeps: on land, with its node's id and window rect when it is a node's; the sea; or a fleet.
#[derive(Debug)]
enum Opened {
    Land { room: Box<Room>, node: Option<(String, [f64; 4])> },
    Sea(Box<Sea>),
    Fleet(Box<Fleet>),
}

thread_local! {
    static OPEN: RefCell<Option<Opened>> = const { RefCell::new(None) };
    static COURSE: RefCell<Vec<Block>> = const { RefCell::new(Vec::new()) };
}

/// What became of an input the host handed over.
pub const TAKEN: i32 = 0;
pub const NOT_AN_INPUT: i32 = 1;
pub const OUT_OF_ORDER: i32 = 2;
pub const NO_SUCH_PLAYER: i32 = 3;
/// At sea, a second course in one tick, dropped as a flood.
pub const TOO_SOON: i32 = 4;
/// A course that reads but the sea's law refuses: it crosses land, or its pace or points are not allowed.
pub const REFUSED: i32 = 5;

/// A node's file as the bake writes it; the room reads its section, window, rect and boxes.
#[derive(Debug, Deserialize)]
struct NodeFile {
    id: String,
    ring: Vec<[f64; 2]>,
    spawns: Vec<[f64; 2]>,
    bounds: [f64; 4],
    ground: Ground,
    boxes: Vec<[f64; 5]>,
}

fn floats_of(bytes: &[u8]) -> Vec<f64> {
    bytes.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default())).collect()
}

fn with_open<T>(use_open: impl FnOnce(&mut Opened) -> T) -> Option<T> {
    OPEN.with(|open| open.borrow_mut().as_mut().map(use_open))
}

fn keep(opened: Opened) {
    OPEN.with(|open| *open.borrow_mut() = Some(opened));
}

/// Opens a new room on a course: the spawn's x and y, then the blocks, five numbers each, little-endian floats.
/// Answers whether the numbers made a course.
pub fn open(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    let Some((spawn, blocks)) = floats.split_first_chunk::<2>() else { return false };
    if !blocks.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks =
        blocks.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    let blocks: Vec<Block> = blocks.collect();
    COURSE.with(|course| *course.borrow_mut() = blocks.clone());
    keep(Opened::Land { room: Box::new(Room::new(blocks, (spawn[0], spawn[1]))), node: None });
    true
}

/// Opens a new node's room from its file's text: its bodies stand on its window of the ground among its boxes, and
/// are judged against its section. Answers whether the text was a node with a section and a spawn.
pub fn open_node(text: &[u8]) -> bool {
    let Ok(node) = serde_json::from_slice::<NodeFile>(text) else { return false };
    if node.ring.len() < 3 || node.spawns.is_empty() {
        return false;
    }
    let blocks = node.boxes.iter().map(Block::from_floats);
    let section = Section { ring: node.ring, spawns: node.spawns };
    let mut room = Room::node(Floor::Land(Box::new(node.ground)), blocks.collect(), section);
    // A city's social space answers a social space's asks anywhere in it.
    room.social = node.id.ends_with("-social");
    keep(Opened::Land { room: Box::new(room), node: Some((node.id, node.bounds)) });
    true
}

/// Opens the sea round the continents of a layout file's text; answers whether the text was a layout.
pub fn open_sea(text: &[u8]) -> bool {
    let Some(layout) = std::str::from_utf8(text).ok().and_then(|text| world::layout::parse(text).ok()) else {
        return false;
    };
    keep(Opened::Sea(Box::new(Sea::new(&layout))));
    true
}

/// Opens a fleet room on the open sea.
pub fn open_fleet() {
    keep(Opened::Fleet(Box::new(Fleet::new())));
}

/// Keeps a course for predicting a fighter without a room: the blocks, five numbers each. Answers whether they made
/// one.
pub fn set_course(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    if !floats.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks =
        floats.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    COURSE.with(|course| *course.borrow_mut() = blocks.collect());
    true
}

/// One tick of a player's fighter as a course's room would take it, on open ground, from its numbers: the fighter,
/// the intent, the player's number, the arms their hands hold (taken up as the room takes them, `Fighter::holding`),
/// then every fighter it sees as a number and a glance. Answers the next fighter's
/// numbers, then, if the tick let a shot go, its weapon's number, where it left and its velocity (a ball's as its
/// whole line to where it stops among those seen, in a tick); or none when the numbers are not that.
#[must_use]
pub fn predict(bytes: &[u8]) -> Vec<u8> {
    let floats = floats_of(bytes);
    let Some((fighter, rest)) = floats.split_first_chunk::<FIGHTER_FLOATS>() else { return Vec::new() };
    let Some((intent, rest)) = rest.split_first_chunk::<INTENT_FLOATS>() else { return Vec::new() };
    let Some((id, rest)) = rest.split_first() else { return Vec::new() };
    let Some((arms, seen)) = rest.split_first() else { return Vec::new() };
    if !seen.len().is_multiple_of(GLANCE_FLOATS + 1) {
        return Vec::new();
    }
    let view: Vec<(u32, Fighter)> = seen
        .chunks_exact(GLANCE_FLOATS + 1)
        .filter_map(|each| {
            let (other, glance) = each.split_first()?;
            Some((whole(*other), Fighter::from_glance(glance.try_into().ok()?)))
        })
        .collect();
    let fighter = Fighter::from_floats(fighter).holding(combat::Arms::from_code(whole(*arms)));
    let intent = combat::Intent::from_floats(intent);
    let (next, shot) = COURSE.with(|course| {
        let blocks = course.borrow();
        let (next, happening) = combat::player_tick(whole(*id), &fighter, &intent, &view, &blocks, &movement::Flat);
        let Some(combat::Happening::Loosed(shot)) = happening else { return (next, None) };
        if combat::shots::shot_numbers(shot.ranged).0 > 0.0 {
            return (next, Some(shot));
        }
        let bodies: Vec<(u32, [f64; 3])> = view
            .iter()
            .filter(|(_, other)| other.side != fighter.side && !other.dead())
            .map(|(other, seen)| (*other, [seen.body.x, seen.body.y, seen.body.z]))
            .collect();
        let stop = match combat::shots::fly(&shot, &blocks, &bodies) {
            combat::shots::Flight::Stopped { at, .. } => at,
            combat::shots::Flight::Flying(flown) => flown.at,
        };
        (next, Some(combat::shots::line_of(&shot, stop)))
    });
    let mut floats = next.to_floats().to_vec();
    if let Some(shot) = shot {
        floats.push(f64::from(shot.ranged as u8));
        floats.extend(shot.at);
        floats.extend(shot.velocity);
    }
    floats.iter().flat_map(|value| value.to_le_bytes()).collect()
}

/// A fighter's number from a float, 0 for anything that is not one.
fn whole(number: f64) -> u32 {
    if number.is_finite() && (0.0..=f64::from(u32::MAX)).contains(&number) { number as u32 } else { 0 }
}

/// What a fighter's hands hold, as combat's arms code, from the right hand's forge layer, the left's, and whether they
/// are drawn, as text on three lines.
#[must_use]
pub fn arms_code(text: &[u8]) -> u32 {
    let text = String::from_utf8_lossy(text);
    let mut lines = text.split('\n');
    let (right, left) = (lines.next().unwrap_or_default(), lines.next().unwrap_or_default());
    combat::arms_of(right, left, lines.next() == Some("drawn")).code()
}

/// A player's input bytes, read and handed to the room: an input on land, a course at sea. One of the answers above.
pub fn input(player: PlayerId, bytes: &[u8]) -> i32 {
    let answer = with_open(|opened| match opened {
        Opened::Land { room, .. } => match protocol::read_input(bytes) {
            Err(_) => NOT_AN_INPUT,
            Ok(input) => match room.input(player, input) {
                Ok(()) => TAKEN,
                Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                Err(Refused::BadLook) => NOT_AN_INPUT,
                Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
            },
        },
        Opened::Sea(sea) => {
            let asked = match protocol::read_sea_input(bytes) {
                Err(_) => return NOT_AN_INPUT,
                Ok(SeaInput::Course(points, pace)) => sea.course(player, &points, pace),
                Ok(SeaInput::Orders(orders)) => sea.orders(player, orders),
            };
            match asked {
                Ok(()) => TAKEN,
                Err(CourseRefused::NoSuchPlayer) => NO_SUCH_PLAYER,
                Err(CourseRefused::TooSoon) => TOO_SOON,
                Err(_) => REFUSED,
            }
        }
        Opened::Fleet(fleet) => match protocol::fleet::read_orders(bytes) {
            Err(_) => NOT_AN_INPUT,
            Ok(orders) => match fleet.input(player, orders) {
                Ok(()) => TAKEN,
                Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                Err(Refused::BadLook) => NOT_AN_INPUT,
                Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
            },
        },
    });
    answer.unwrap_or(NO_SUCH_PLAYER)
}

/// Every player and foe after the room's last tick, the dresses changed and what happened in the fight since the last
/// snapshot, and the shots in flight with the balls just fired, as a snapshot's bytes; at sea, every ship. Empty with no room open.
#[must_use]
pub fn snapshot() -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            let changed = room.take_dress_changes();
            let events = room.take_events();
            let dressed: Vec<(PlayerId, &str)> =
                changed.iter().map(|(player, dress)| (*player, dress.as_str())).collect();
            let players: Vec<Seen> = room.seen().collect();
            let foes: Vec<FoeSeen> = room.foes_seen().collect();
            let tick = room.clock();
            let lines = room.take_lines();
            let shots: Vec<combat::Shot> = room.shots().iter().chain(&lines).copied().collect();
            let snapshot = protocol::Snapshot {
                tick,
                players: &players,
                dressed: &dressed,
                foes: &foes,
                events: &events,
                shots: &shots,
            };
            protocol::snapshot_bytes(&snapshot)
        }
        Opened::Sea(sea) => {
            let fights: Vec<(u32, Vec<f64>)> = sea.fight_views().collect();
            protocol::sea_snapshot_bytes(sea.clock(), &sea.ships().collect::<Vec<_>>(), sea.pirates(), &fights)
        }
        Opened::Fleet(fleet) => {
            let happened = fleet.take_events();
            let acknowledged = |ship| fleet.acknowledged(ship);
            protocol::fleet::fleet_snapshot_bytes(fleet.clock(), fleet.fight(), &acknowledged, &happened)
        }
    })
    .unwrap_or_default()
}

/// Lays out a course's stall and resource nodes: the stall's x and y (not numbers for none), then each node's x, y
/// and resource, little-endian floats. Answers whether a room on land is open and the numbers made a layout.
pub fn furnish(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    let Some((stall, nodes)) = floats.split_first_chunk::<2>() else { return false };
    if !nodes.len().is_multiple_of(3) || nodes.iter().any(|number| !number.is_finite()) {
        return false;
    }
    let stall = stall.iter().all(|number| number.is_finite()).then_some(*stall);
    let nodes = nodes.chunks_exact(3).map(|node| room::ResourceNode {
        x: node[0],
        y: node[1],
        resource: u8::try_from(node[2] as u32).unwrap_or_default(),
    });
    let nodes = nodes.collect();
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.furnish(stall, nodes);
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// A player's own gear, as its bytes, when it changed since it was last asked; empty when it did not, or in a room
/// that keeps no gear.
#[must_use]
pub fn gear(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            if room.take_gear_change(player) {
                protocol::gear_wire::gear_bytes(room, player)
            } else {
                None
            }
        }
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
    .unwrap_or_default()
}

/// A player's character as it is kept between sessions, as JSON's bytes; empty on land with no such player, and at
/// sea, where no one holds gear.
#[must_use]
pub fn character(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.kept_character(player),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
    .map(String::into_bytes)
    .unwrap_or_default()
}

/// Gives a player on land the character kept for them, from JSON's bytes; false if it is not one or they are not in.
pub fn restore_character(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.restore_character(player, text),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// The welcome's bytes for a player: their number, every dress in the room so far, and a node's id and rect.
#[must_use]
pub fn joined(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, node } => {
            let node = node.as_ref().map(|(id, bounds)| (id.as_str(), *bounds));
            protocol::joined_bytes(player, &room.dresses().collect::<Vec<_>>(), node)
        }
        Opened::Sea(_) | Opened::Fleet(_) => protocol::joined_bytes(player, &[], None),
    })
    .unwrap_or_default()
}

/// Hands bytes to JavaScript as one number: the address in the high 32 bits, the length in the low 32. WebAssembly's
/// addresses are 32 bits; anywhere else the packing would lose them, so it refuses.
fn hand_over(bytes: Vec<u8>) -> u64 {
    let bytes = bytes.into_boxed_slice();
    let length = u32::try_from(bytes.len()).expect("an answer fits in 4 GB");
    let address = u32::try_from(Box::into_raw(bytes).cast::<u8>() as usize).expect("WebAssembly addresses are 32 bits");
    (u64::from(address) << 32) | u64::from(length)
}

/// Reserves `length` bytes for JavaScript to write into.
#[unsafe(no_mangle)]
pub extern "C" fn reserve(length: usize) -> *mut u8 {
    Box::into_raw(vec![0_u8; length].into_boxed_slice()).cast::<u8>()
}

/// Gives back memory from `reserve`, or from an answer.
///
/// # Safety
/// `address` and `length` must be exactly what `reserve` returned, or what an answer's number held, and used once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn release(address: *mut u8, length: usize) {
    // SAFETY: the caller hands back a boxed slice this module made, with its own length, once.
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(address, length)) });
}

/// Opens a room on the course written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens a node's room from its file's text written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_node(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_node(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens the sea round the layout file's text written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_sea(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_sea(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens a fleet room on the open sea; always 1.
#[unsafe(no_mangle)]
pub extern "C" fn room_open_fleet() -> u32 {
    open_fleet();
    1
}

/// How long one of the room's ticks is, in seconds: its host ticks it that often.
#[unsafe(no_mangle)]
pub extern "C" fn room_tick_seconds() -> f64 {
    movement::TICK_SECONDS
}

/// A new player's number, or 0 with no room open or the room full.
#[unsafe(no_mangle)]
pub extern "C" fn room_join() -> PlayerId {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.join(),
        Opened::Sea(sea) => Some(sea.join()),
        Opened::Fleet(fleet) => fleet.join(),
    })
    .flatten()
    .unwrap_or(0)
}

/// The welcome's bytes for a player.
#[unsafe(no_mangle)]
pub extern "C" fn room_joined(player: PlayerId) -> u64 {
    hand_over(joined(player))
}

#[unsafe(no_mangle)]
pub extern "C" fn room_leave(player: PlayerId) {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.leave(player),
        Opened::Sea(sea) => sea.leave(player),
        Opened::Fleet(fleet) => fleet.leave(player),
    });
}

/// Hands the room the player's input written at `address`, `length` bytes long; answers what became of it.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_input(player: PlayerId, address: *const u8, length: usize) -> i32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    input(player, unsafe { std::slice::from_raw_parts(address, length) })
}

#[unsafe(no_mangle)]
pub extern "C" fn room_tick() {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.tick(),
        Opened::Sea(sea) => sea.tick(),
        Opened::Fleet(fleet) => fleet.tick(),
    });
}

/// The snapshot's bytes after the last tick.
#[unsafe(no_mangle)]
pub extern "C" fn room_snapshot() -> u64 {
    hand_over(snapshot())
}

/// A player's own gear's bytes, empty when it has not changed.
#[unsafe(no_mangle)]
pub extern "C" fn room_gear(player: PlayerId) -> u64 {
    hand_over(gear(player))
}

/// A player's character as kept, as JSON's bytes (`character`), packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_character(player: PlayerId) -> u64 {
    hand_over(character(player))
}

/// Gives a player the character written at `address` as JSON; 1 if it was one and they are in, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_restore_character(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(restore_character(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Lays out the course's stall and resource nodes written at `address`; 1 if laid, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_furnish(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(furnish(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the course written at `address` for predicting; 1 if it was one, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_course(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_course(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Steps the fighter whose numbers are written at `address` a tick, as `predict` says; answers the next fighter's
/// bytes.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_predict(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(predict(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// A fleet player's ship stepped by the helms written at `address`, as `fleet_door::predict` reads them; answers her
/// ship's and her pose's numbers.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fleet_predict(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let numbers = floats_of(unsafe { std::slice::from_raw_parts(address, length) });
    hand_over(fleet_door::predict(&numbers).iter().flat_map(|value| value.to_le_bytes()).collect())
}

/// A fleet player's lay for the look written at `address`, as `fleet_door::lay` reads it; answers its numbers.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fleet_lay(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let numbers = floats_of(unsafe { std::slice::from_raw_parts(address, length) });
    hand_over(fleet_door::lay(&numbers).iter().flat_map(|value| value.to_le_bytes()).collect())
}

/// The arms code for the hands written at `address`, as `arms_code` reads them.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_arms(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    arms_code(unsafe { std::slice::from_raw_parts(address, length) })
}

/// The farthest stroke `stroke` (1 to 6) of the melee weapon in arms code `arms` reaches, feet to a body's middle;
/// 0 for no stroke.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_reach(arms: u32, stroke: u32) -> f64 {
    let melee = combat::arms::Arms::from_code(arms).melee;
    u8::try_from(stroke)
        .ok()
        .and_then(combat::Stroke::from_number)
        .map_or(0.0, |stroke| combat::strike::stroke_reach(melee, stroke))
}

/// How many numbers a fighter, an intent and a glance are, for the browser to lay them out: as one number, each in a
/// byte.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_sizes() -> u32 {
    let byte = |size: usize| u32::try_from(size).unwrap_or_default() & 0xff;
    byte(FIGHTER_FLOATS) | byte(INTENT_FLOATS) << 8 | byte(GLANCE_FLOATS) << 16
}

#[cfg(test)]
#[path = "door_tests.rs"]
mod door_tests;

#[cfg(test)]
#[path = "fleet_door_tests.rs"]
mod fleet_door_tests;
