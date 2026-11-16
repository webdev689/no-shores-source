//! The room for its Cloudflare host. Each WebAssembly instance keeps one room: the host opens it on a course, lets
//! players join and leave, hands it each player's input bytes as they come, ticks it, and sends out the bytes it
//! answers. The rules stay in the room crate and the messages in the protocol crate. See the Server note in the bible.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use movement::Block;
use movement::floats::BLOCK_FLOATS;
use room::{PlayerId, Refused, Room, Seen};
use std::cell::RefCell;

thread_local! {
    static ROOM: RefCell<Option<Room>> = const { RefCell::new(None) };
}

/// What became of an input the host handed over.
pub const TAKEN: i32 = 0;
pub const NOT_AN_INPUT: i32 = 1;
pub const OUT_OF_ORDER: i32 = 2;
pub const TOO_MANY_WAITING: i32 = 3;
pub const NO_SUCH_PLAYER: i32 = 4;

fn floats_of(bytes: &[u8]) -> Vec<f64> {
    bytes.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default())).collect()
}

fn with_room<T>(use_room: impl FnOnce(&mut Room) -> T) -> Option<T> {
    ROOM.with(|room| room.borrow_mut().as_mut().map(use_room))
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
    let room = Room::new(blocks.collect(), (spawn[0], spawn[1]));
    ROOM.with(|open| *open.borrow_mut() = Some(room));
    true
}

/// A player's input bytes, read and handed to the room: one of the answers above.
pub fn input(player: PlayerId, bytes: &[u8]) -> i32 {
    let Ok((sequence, controls)) = protocol::read_input(bytes) else { return NOT_AN_INPUT };
    match with_room(|room| room.input(player, sequence, controls)) {
        Some(Ok(())) => TAKEN,
        Some(Err(Refused::OutOfOrder { .. })) => OUT_OF_ORDER,
        Some(Err(Refused::TooManyWaiting)) => TOO_MANY_WAITING,
        Some(Err(Refused::NoSuchPlayer)) | None => NO_SUCH_PLAYER,
    }
}

/// Every player after the room's last tick, as a snapshot's bytes; empty with no room open.
#[must_use]
pub fn snapshot() -> Vec<u8> {
    with_room(|room| protocol::snapshot_bytes(room.clock(), &room.seen().collect::<Vec<Seen>>())).unwrap_or_default()
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

/// How long one of the room's ticks is, in seconds: its host ticks it that often.
#[unsafe(no_mangle)]
pub extern "C" fn room_tick_seconds() -> f64 {
    movement::TICK_SECONDS
}

/// A new player's number, or 0 with no room open.
#[unsafe(no_mangle)]
pub extern "C" fn room_join() -> PlayerId {
    with_room(Room::join).unwrap_or(0)
}

/// The welcome's bytes for a player.
#[unsafe(no_mangle)]
pub extern "C" fn room_joined(player: PlayerId) -> u64 {
    hand_over(protocol::joined_bytes(player))
}

#[unsafe(no_mangle)]
pub extern "C" fn room_leave(player: PlayerId) {
    with_room(|room| room.leave(player));
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
    with_room(Room::tick);
}

/// The snapshot's bytes after the last tick.
#[unsafe(no_mangle)]
pub extern "C" fn room_snapshot() -> u64 {
    hand_over(snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;
    use movement::{Controls, TICK_SECONDS, standing, step_body};

    fn bytes_of(floats: &[f64]) -> Vec<u8> {
        floats.iter().flat_map(|value| value.to_le_bytes()).collect()
    }

    #[test]
    fn a_course_that_is_not_whole_blocks_does_not_open() {
        assert!(!open(&bytes_of(&[1.0])));
        assert!(!open(&bytes_of(&[0.0, 0.0, 1.0, 2.0])));
        assert!(open(&bytes_of(&[0.0, 2.0, -5.0, -4.0, 5.0, -1.0, 2.3])));
    }

    #[test]
    fn players_join_send_inputs_and_are_seen_as_the_movement_rules_step_them() {
        let ledge = [-5.0, -4.0, 5.0, -1.0, 2.3];
        assert!(open(&bytes_of(&[0.0, 2.0, ledge[0], ledge[1], ledge[2], ledge[3], ledge[4]])));
        let (first, second) = (room_join(), room_join());
        let walk = [1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0];
        assert_eq!(input(first, &protocol::input_bytes(1, &walk)), TAKEN);
        assert_eq!(input(first, &protocol::input_bytes(3, &walk)), OUT_OF_ORDER);
        assert_eq!(input(second, b"not an input"), NOT_AN_INPUT);
        assert_eq!(input(99, &protocol::input_bytes(1, &walk)), NO_SUCH_PLAYER);
        room_tick();
        let course = [Block::from_floats(&ledge)];
        let walked = step_body(&standing(0.0, 2.0), &Controls::from_floats(&walk), &course, TICK_SECONDS);
        let bytes = snapshot();
        let message = players_in(&bytes);
        assert_eq!(message, vec![(first, 1, walked), (second, 0, standing(0.0, 2.0))]);
    }

    /// The players in a snapshot, read back through the protocol crate's generated code.
    fn players_in(bytes: &[u8]) -> Vec<(PlayerId, u32, movement::Body)> {
        let message = protocol::wire::overlook::wire::root_as_from_room(bytes).unwrap();
        let players = message.snapshot().unwrap().players().unwrap();
        players
            .iter()
            .map(|seen| {
                let numbers: Vec<f64> = seen.body().unwrap().iter().collect();
                (seen.player(), seen.acknowledged(), protocol::body_of(&numbers).unwrap())
            })
            .collect()
    }
}
