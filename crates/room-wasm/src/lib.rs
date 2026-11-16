//! The room for its Cloudflare host and for a browser playing alone. Each WebAssembly instance keeps one room: the
//! host opens it on a course, lets players join and leave, hands it each player's input bytes as they come, ticks it,
//! and sends out the bytes it answers. A browser also steps its own player's fighter here, by the same rules, to
//! predict it. The rules stay in the combat and room crates and the messages in the protocol crate. See the Server and
//! Combat notes in the bible.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use combat::Fighter;
use combat::floats::{FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS};
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use room::{FoeSeen, PlayerId, Refused, Room, Seen};
use std::cell::RefCell;

thread_local! {
    static ROOM: RefCell<Option<Room>> = const { RefCell::new(None) };
    static COURSE: RefCell<Vec<Block>> = const { RefCell::new(Vec::new()) };
}

/// What became of an input the host handed over.
pub const TAKEN: i32 = 0;
pub const NOT_AN_INPUT: i32 = 1;
pub const OUT_OF_ORDER: i32 = 2;
pub const NO_SUCH_PLAYER: i32 = 3;

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
    if !blocks.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks =
        blocks.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    let blocks: Vec<Block> = blocks.collect();
    COURSE.with(|course| *course.borrow_mut() = blocks.clone());
    let room = Room::new(blocks, (spawn[0], spawn[1]));
    ROOM.with(|open| *open.borrow_mut() = Some(room));
    true
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

/// One tick of a player's fighter as the room would take it, from its numbers: the fighter, the intent, the player's
/// number, then every fighter it sees as a number and a glance. Answers the next fighter's numbers, or none when the
/// numbers are not that.
#[must_use]
pub fn predict(bytes: &[u8]) -> Vec<u8> {
    let floats = floats_of(bytes);
    let Some((fighter, rest)) = floats.split_first_chunk::<FIGHTER_FLOATS>() else { return Vec::new() };
    let Some((intent, rest)) = rest.split_first_chunk::<INTENT_FLOATS>() else { return Vec::new() };
    let Some((id, seen)) = rest.split_first() else { return Vec::new() };
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
    let fighter = Fighter::from_floats(fighter);
    let intent = combat::Intent::from_floats(intent);
    let (next, _) = COURSE.with(|course| combat::player_tick(whole(*id), &fighter, &intent, &view, &course.borrow()));
    next.to_floats().iter().flat_map(|value| value.to_le_bytes()).collect()
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

/// A player's input bytes, read and handed to the room: one of the answers above.
pub fn input(player: PlayerId, bytes: &[u8]) -> i32 {
    let Ok(input) = protocol::read_input(bytes) else { return NOT_AN_INPUT };
    match with_room(|room| room.input(player, input)) {
        Some(Ok(())) => TAKEN,
        Some(Err(Refused::OutOfOrder { .. })) => OUT_OF_ORDER,
        Some(Err(Refused::BadLook)) => NOT_AN_INPUT,
        Some(Err(Refused::NoSuchPlayer)) | None => NO_SUCH_PLAYER,
    }
}

/// Every player and foe after the room's last tick, the dresses changed and what happened in the fight since the last
/// snapshot, and the shots in flight, as a snapshot's bytes; empty with no room open.
#[must_use]
pub fn snapshot() -> Vec<u8> {
    with_room(|room| {
        let changed = room.take_dress_changes();
        let events = room.take_events();
        let dressed: Vec<(PlayerId, &str)> = changed.iter().map(|(player, dress)| (*player, dress.as_str())).collect();
        let players: Vec<Seen> = room.seen().collect();
        let foes: Vec<FoeSeen> = room.foes_seen().collect();
        let tick = room.clock();
        let snapshot = protocol::Snapshot {
            tick,
            players: &players,
            dressed: &dressed,
            foes: &foes,
            events: &events,
            shots: room.shots(),
        };
        protocol::snapshot_bytes(&snapshot)
    })
    .unwrap_or_default()
}

/// The welcome's bytes for a player: their number and every dress in the room so far.
#[must_use]
pub fn joined(player: PlayerId) -> Vec<u8> {
    with_room(|room| protocol::joined_bytes(player, &room.dresses().collect::<Vec<_>>())).unwrap_or_default()
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

/// A new player's number, or 0 with no room open or the room full.
#[unsafe(no_mangle)]
pub extern "C" fn room_join() -> PlayerId {
    with_room(Room::join).flatten().unwrap_or(0)
}

/// The welcome's bytes for a player.
#[unsafe(no_mangle)]
pub extern "C" fn room_joined(player: PlayerId) -> u64 {
    hand_over(joined(player))
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

    fn walk_input(sequence: u32, walk: &[f64; 7]) -> Vec<u8> {
        let controls = Controls::from_floats(walk);
        let intent = combat::Intent { controls, ..combat::Intent::default() };
        protocol::input_bytes(&room::Input { sequence, intent, ..room::Input::default() })
    }

    #[test]
    fn players_join_send_inputs_and_are_seen_as_the_movement_rules_step_them() {
        let ledge = [-5.0, -4.0, 5.0, -1.0, 2.3];
        assert!(open(&bytes_of(&[0.0, 2.0, ledge[0], ledge[1], ledge[2], ledge[3], ledge[4]])));
        let (first, second) = (room_join(), room_join());
        let walk = [1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0];
        assert_eq!(input(first, &walk_input(1, &walk)), TAKEN);
        assert_eq!(input(first, &walk_input(3, &walk)), OUT_OF_ORDER);
        assert_eq!(input(second, b"not an input"), NOT_AN_INPUT);
        assert_eq!(input(99, &walk_input(1, &walk)), NO_SUCH_PLAYER);
        room_tick();
        let course = [Block::from_floats(&ledge)];
        let walked = step_body(&standing(0.0, 2.0), &Controls::from_floats(&walk), &course, TICK_SECONDS);
        let bytes = snapshot();
        let message = players_in(&bytes);
        assert_eq!(message, vec![(first, 1, walked), (second, 0, standing(0.0, 2.0))]);
    }

    #[test]
    fn a_browser_predicts_a_fighter_exactly_as_the_room_steps_it_and_reads_its_arms() {
        assert!(set_course(&bytes_of(&[-5.0, -4.0, 5.0, -1.0, 2.3])));
        let fighter = combat::fighter::player(standing(0.0, 2.0), combat::arms::BARE_HANDS);
        let controls = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
        let intent = combat::Intent { controls, ..combat::Intent::default() };
        let mut numbers: Vec<f64> = fighter.to_floats().to_vec();
        numbers.extend(intent.to_floats());
        numbers.push(1.0);
        let course = [Block::from_floats(&[-5.0, -4.0, 5.0, -1.0, 2.3])];
        let (expected, _) = combat::player_tick(1, &fighter, &intent, &[], &course);
        let next = floats_of(&predict(&bytes_of(&numbers)));
        assert_eq!(Fighter::from_floats(next.as_slice().try_into().unwrap()), expected);
        assert!(predict(&bytes_of(&[1.0, 2.0])).is_empty());
        let sword = combat::arms_of("sword_iron", "shield_kite_steel", true).code();
        assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\ndrawn"), sword);
        assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\nworn"), combat::arms::BARE_HANDS.code());
    }

    /// The players in a snapshot, read back through the protocol crate's generated code.
    fn players_in(bytes: &[u8]) -> Vec<(PlayerId, u32, movement::Body)> {
        let message = protocol::wire::overlook::wire::root_as_from_room(bytes).unwrap();
        let players = message.snapshot().unwrap().players().unwrap();
        players
            .iter()
            .map(|seen| {
                let numbers: Vec<f64> = seen.fighter().unwrap().iter().take(22).collect();
                (seen.player(), seen.acknowledged(), protocol::body_of(&numbers).unwrap())
            })
            .collect()
    }
}
