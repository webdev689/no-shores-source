//! The room for its Cloudflare host. Each WebAssembly instance keeps one room: a course's, a node's or the sea's. The
//! host opens it, lets players join and leave, hands it each player's input bytes as they come, ticks it, and sends
//! out the bytes it answers. The rules stay in the room crate and the messages in the protocol crate. See the Server
//! note in the bible.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use land::ground::Ground;
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use room::sea::{CourseRefused, Sea};
use room::{Floor, PlayerId, Refused, Room, Section, Seen};
use serde::Deserialize;
use std::cell::RefCell;

/// The room an instance keeps: on land, with its node's id and window rect when it is a node's, or the sea.
#[derive(Debug)]
enum Opened {
    Land { room: Room, node: Option<(String, [f64; 4])> },
    Sea(Sea),
}

thread_local! {
    static OPEN: RefCell<Option<Opened>> = const { RefCell::new(None) };
}

/// What became of an input the host handed over.
pub const TAKEN: i32 = 0;
pub const NOT_AN_INPUT: i32 = 1;
pub const OUT_OF_ORDER: i32 = 2;
/// Past the waiting limit on land; at sea, a second course in one tick. Either is dropped as a flood.
pub const TOO_MANY_WAITING: i32 = 3;
pub const NO_SUCH_PLAYER: i32 = 4;
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
    if blocks.len() % BLOCK_FLOATS != 0 {
        return false;
    }
    let blocks =
        blocks.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    keep(Opened::Land { room: Room::new(blocks.collect(), (spawn[0], spawn[1])), node: None });
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
    let room = Room::node(Floor::Land(Box::new(node.ground)), blocks.collect(), section);
    keep(Opened::Land { room, node: Some((node.id, node.bounds)) });
    true
}

/// Opens the sea round the continents of a layout file's text; answers whether the text was a layout.
pub fn open_sea(text: &[u8]) -> bool {
    let Some(layout) = std::str::from_utf8(text).ok().and_then(|text| world::layout::parse(text).ok()) else {
        return false;
    };
    keep(Opened::Sea(Sea::new(&layout)));
    true
}

/// A player's input bytes, read and handed to the room: an input on land, a course at sea. One of the answers above.
pub fn input(player: PlayerId, bytes: &[u8]) -> i32 {
    let answer = with_open(|opened| match opened {
        Opened::Land { room, .. } => match protocol::read_input(bytes) {
            Err(_) => NOT_AN_INPUT,
            Ok(input) => match room.input(player, input) {
                Ok(()) => TAKEN,
                Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                Err(Refused::TooManyWaiting) => TOO_MANY_WAITING,
                Err(Refused::BadLook) => NOT_AN_INPUT,
                Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
            },
        },
        Opened::Sea(sea) => match protocol::read_course(bytes) {
            Err(_) => NOT_AN_INPUT,
            Ok((points, pace)) => match sea.course(player, &points, pace) {
                Ok(()) => TAKEN,
                Err(CourseRefused::NoSuchPlayer) => NO_SUCH_PLAYER,
                Err(CourseRefused::TooSoon) => TOO_MANY_WAITING,
                Err(_) => REFUSED,
            },
        },
    });
    answer.unwrap_or(NO_SUCH_PLAYER)
}

/// Every player after the room's last tick, and the dresses changed since the last snapshot, as a snapshot's bytes;
/// at sea, every ship. Empty with no room open.
#[must_use]
pub fn snapshot() -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            let changed = room.take_dress_changes();
            let dressed: Vec<(PlayerId, &str)> =
                changed.iter().map(|(player, dress)| (*player, dress.as_str())).collect();
            protocol::snapshot_bytes(room.clock(), &room.seen().collect::<Vec<Seen>>(), &dressed)
        }
        Opened::Sea(sea) => protocol::sea_snapshot_bytes(sea.clock(), &sea.ships().collect::<Vec<_>>()),
    })
    .unwrap_or_default()
}

/// The welcome's bytes for a player: their number, every dress in the room so far, and a node's id and rect.
#[must_use]
pub fn joined(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, node } => {
            let node = node.as_ref().map(|(id, bounds)| (id.as_str(), *bounds));
            protocol::joined_bytes(player, &room.dresses().collect::<Vec<_>>(), node)
        }
        Opened::Sea(_) => protocol::joined_bytes(player, &[], None),
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

/// How long one of the room's ticks is, in seconds: its host ticks it that often.
#[unsafe(no_mangle)]
pub extern "C" fn room_tick_seconds() -> f64 {
    movement::TICK_SECONDS
}

/// A new player's number, or 0 with no room open.
#[unsafe(no_mangle)]
pub extern "C" fn room_join() -> PlayerId {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.join(),
        Opened::Sea(sea) => sea.join(),
    })
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
    });
}

/// The snapshot's bytes after the last tick.
#[unsafe(no_mangle)]
pub extern "C" fn room_snapshot() -> u64 {
    hand_over(snapshot())
}

#[cfg(test)]
#[path = "door_tests.rs"]
mod door_tests;
