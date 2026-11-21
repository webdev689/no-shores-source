//! Movement for the browser. JavaScript hands over the course's blocks once, and a node's window of the land to stand
//! them on if it has one, or a ship's deck as a grid of heights, then steps a body one tick at a time: it writes the
//! body's and the controls' numbers into memory this module reserved for it, and reads the next body's numbers back
//! from the same place, little-endian 64-bit floats in the movement crate's order. The rules stay there.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use land::ground::Ground;
use movement::blocks::ground_at;
use movement::floats::{BLOCK_FLOATS, BODY_FLOATS, CONTROLS_FLOATS};
use movement::heights::RIM_CELL_M;
use movement::{Block, Blocks, Body, Controls, Heights, TICK_SECONDS, TUNING, Terrain, standing, step_body};
use std::cell::RefCell;

pub mod reach_door;

/// The numbers one step reads: a body, then its controls. The next body is written over the first of them.
pub const STEP_FLOATS: usize = BODY_FLOATS + CONTROLS_FLOATS;

thread_local! {
    static COURSE: RefCell<Blocks> = RefCell::new(Blocks::default());
    static LAND: RefCell<OnLand> = const { RefCell::new(OnLand::Open) };
}

/// The terrain under the course: open ground at 0 m, a window of the land once one is set, or a ship's deck, as the
/// room's.
#[derive(Debug)]
pub enum OnLand {
    Open,
    Land(Box<Ground>),
    Deck(Heights),
}

impl Terrain for OnLand {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            OnLand::Open => 0.0,
            OnLand::Land(ground) => ground.height_at(x, y),
            OnLand::Deck(deck) => deck.height_at(x, y),
        }
    }

    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        matches!(self, OnLand::Deck(deck) if deck.walled(from, to))
    }

    fn climbs(&self) -> bool {
        !matches!(self, OnLand::Deck(deck) if !deck.climbs())
    }
}

/// The numbers in little-endian bytes.
fn floats_of(bytes: &[u8]) -> impl Iterator<Item = f64> {
    bytes.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default()))
}

/// Keeps the course's blocks, five numbers each, with the grid that finds the ones near a body, for every step after;
/// answers how many it kept.
pub fn set_course(bytes: &[u8]) -> usize {
    let floats: Vec<f64> = floats_of(bytes).collect();
    let blocks: Vec<Block> = floats
        .chunks_exact(BLOCK_FLOATS)
        .map(|numbers| Block::from_floats(numbers.try_into().unwrap_or(&[0.0; BLOCK_FLOATS])))
        .collect();
    let kept = blocks.len();
    COURSE.with(|course| *course.borrow_mut() = Blocks::new(blocks));
    kept
}

/// Keeps the window of the land a node's room stands its bodies on, from its JSON, for every step after: the same
/// ground, to the bit, as the room's. Text that is not a window leaves open ground; answers whether it was one.
pub fn set_ground(text: &[u8]) -> bool {
    let ground = serde_json::from_slice::<Ground>(text).ok();
    let kept = ground.is_some();
    LAND.with(|land| *land.borrow_mut() = ground.map_or(OnLand::Open, |ground| OnLand::Land(Box::new(ground))));
    kept
}

/// Keeps a ship's deck, from a grid's numbers (`Heights::from_floats`), for every step after, in place of any ground:
/// the same heights, to the bit, as the sea room's. Numbers that are not a grid leave open ground; answers whether
/// they were one.
pub fn set_heights(bytes: &[u8]) -> bool {
    let deck = Heights::from_floats(&floats_of(bytes).collect::<Vec<_>>());
    let kept = deck.is_some();
    LAND.with(|land| *land.borrow_mut() = deck.map_or(OnLand::Open, OnLand::Deck));
    kept
}

/// Keeps the rim round a course laid over the sea, from its blocks' numbers, five each, for every step after, in place
/// of any ground: the rim the sea room holds its bodies by (`Heights::rim`), to the bit. Answers whether the numbers
/// were blocks.
pub fn set_rim(bytes: &[u8]) -> bool {
    let floats: Vec<f64> = floats_of(bytes).collect();
    if !floats.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks: Vec<Block> = floats
        .chunks_exact(BLOCK_FLOATS)
        .map(|numbers| Block::from_floats(numbers.try_into().unwrap_or(&[0.0; BLOCK_FLOATS])))
        .collect();
    LAND.with(|land| *land.borrow_mut() = OnLand::Deck(Heights::rim(&blocks, RIM_CELL_M)));
    true
}

/// Steps the body in `bytes` by one tick under its controls on the kept course, and writes the next body over it.
pub fn step(bytes: &mut [u8; STEP_FLOATS * 8]) {
    let mut floats = [0.0; STEP_FLOATS];
    floats.iter_mut().zip(floats_of(bytes.as_slice())).for_each(|(slot, value)| *slot = value);
    let (body_floats, controls_floats) = floats.split_at(BODY_FLOATS);
    let body = Body::from_floats(body_floats.try_into().unwrap_or(&[0.0; BODY_FLOATS]));
    let controls = Controls::from_floats(controls_floats.try_into().unwrap_or(&[0.0; CONTROLS_FLOATS]));
    let next = COURSE
        .with(|course| LAND.with(|land| step_body(&body, &controls, &*course.borrow(), &*land.borrow(), TICK_SECONDS)));
    for (chunk, value) in bytes.chunks_exact_mut(8).zip(next.to_floats()) {
        chunk.copy_from_slice(&value.to_le_bytes());
    }
}

/// Writes a body standing at the (x, y) the first two numbers in `bytes` hold, over them: at 0 m, or on a kept window
/// of the land, on its ground or a block's top within a step of it, as a node's room stands a body.
pub fn stand(bytes: &mut [u8; STEP_FLOATS * 8]) {
    let (x, y) = {
        let mut place = floats_of(&bytes[..16]);
        (place.next().unwrap_or_default(), place.next().unwrap_or_default())
    };
    let body = LAND.with(|land| {
        let land = land.borrow();
        match &*land {
            OnLand::Open => standing(x, y),
            OnLand::Land(ground) => {
                let floor = COURSE.with(|course| ground_at(&*course.borrow(), &*land, x, y, ground.height_at(x, y)));
                Body { z: floor, ..standing(x, y) }
            }
            OnLand::Deck(deck) => deck.standing(x, y),
        }
    });
    for (chunk, value) in bytes.chunks_exact_mut(8).zip(body.to_floats()) {
        chunk.copy_from_slice(&value.to_le_bytes());
    }
}

/// The numbers a browser needs beside the steps, as JSON: the tick, and the eye's height standing and crouched.
#[must_use]
pub fn tuning_json() -> String {
    format!(
        r#"{{ "tick_seconds": {}, "step_floats": {STEP_FLOATS}, "body_floats": {BODY_FLOATS}, "eye": {}, "crouched_eye": {} }}"#,
        TICK_SECONDS, TUNING.eye, TUNING.crouched_eye
    )
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

/// The tuning a browser needs, as JSON text.
#[unsafe(no_mangle)]
pub extern "C" fn movement_tuning() -> u64 {
    hand_over(tuning_json().into_bytes())
}

/// Keeps the blocks written at `address`, `length` bytes long, as the course; answers how many.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_set_course(address: *const u8, length: usize) -> usize {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    set_course(unsafe { std::slice::from_raw_parts(address, length) })
}

/// Keeps the window of the land written at `address`, `length` bytes of JSON; 1 if it was one, 0 for open ground.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_set_ground(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_ground(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the deck written at `address`, `length` bytes of a grid's numbers; 1 if it was one, 0 for open ground.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_set_heights(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_heights(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the rim round the blocks written at `address`, `length` bytes; 1 if they were blocks, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_set_rim(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_rim(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the section written at `address`, `length` bytes of JSON; 1 if it was one, 0 cleared.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_set_section(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(reach_door::set_section(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// One tick of a body with its feet at (x, y, z), in the air for `aloft` 1, against the kept section, as
/// `reach_door::packed` numbers it.
#[unsafe(no_mangle)]
pub extern "C" fn movement_reach_tick(x: f64, y: f64, z: f64, aloft: u32) -> u32 {
    reach_door::tick(reach::Place { x, y, z, aloft: aloft != 0 })
}

/// Respawns a body that died at (x, y) once allowed, writing the spawn's two numbers at `address`; 1 if it did.
///
/// # Safety
/// `address` must point at 16 writable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_respawn(x: f64, y: f64, address: *mut u8) -> u32 {
    let Some([east, south]) = reach_door::respawn(x, y) else { return 0 };
    // SAFETY: the caller reserved 16 bytes at `address`, which nothing else views.
    let out = unsafe { std::slice::from_raw_parts_mut(address, 16) };
    out[..8].copy_from_slice(&east.to_le_bytes());
    out[8..].copy_from_slice(&south.to_le_bytes());
    1
}

/// The `length` bytes at `address` as one step's numbers, or nothing when they are too few.
///
/// # Safety
/// `address` must point at `length` bytes from `reserve`, readable and writable, with no other view of them held.
unsafe fn step_bytes<'memory>(address: *mut u8, length: usize) -> Option<&'memory mut [u8; STEP_FLOATS * 8]> {
    // SAFETY: the caller reserved `length` bytes at `address`; only the first STEP_FLOATS * 8 of them are viewed.
    (length >= STEP_FLOATS * 8).then(|| unsafe { &mut *address.cast::<[u8; STEP_FLOATS * 8]>() })
}

/// Steps the body written at `address` one tick, writing the next body over it. Fewer than a step's bytes are left
/// alone.
///
/// # Safety
/// `address` must point at `length` bytes from `reserve`, readable and writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_step(address: *mut u8, length: usize) {
    // SAFETY: the caller's promise, passed on.
    if let Some(bytes) = unsafe { step_bytes(address, length) } {
        step(bytes);
    }
}

/// Writes a body standing at the (x, y) written at `address` over them. Fewer than a step's bytes are left alone.
///
/// # Safety
/// `address` must point at `length` bytes from `reserve`, readable and writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn movement_standing(address: *mut u8, length: usize) {
    // SAFETY: the caller's promise, passed on.
    if let Some(bytes) = unsafe { step_bytes(address, length) } {
        stand(bytes);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use movement::{Flat, Mode};

    fn bytes_of(floats: &[f64]) -> Vec<u8> {
        floats.iter().flat_map(|value| value.to_le_bytes()).collect()
    }

    #[test]
    fn a_step_through_the_door_is_the_movement_crates_step() {
        let ledge = Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 2.3, bottom: 0.0 };
        assert_eq!(
            set_course(&bytes_of(&[ledge.min_x, ledge.min_y, ledge.max_x, ledge.max_y, ledge.top, ledge.bottom])),
            1
        );
        let controls = Controls { forward: 1.0, yaw: 0.3, run: true, ..Controls::default() };
        let mut body = standing(0.5, 0.2);
        for _ in 0..30 {
            let mut numbers = [0.0; STEP_FLOATS];
            numbers[..BODY_FLOATS].copy_from_slice(&body.to_floats());
            numbers[BODY_FLOATS..].copy_from_slice(&[1.0, 0.0, 0.3, 1.0, 0.0, 0.0, 0.0]);
            let mut bytes: [u8; STEP_FLOATS * 8] = bytes_of(&numbers).try_into().unwrap();
            step(&mut bytes);
            let expected = step_body(&body, &controls, &[ledge], &Flat, TICK_SECONDS);
            let stepped: Vec<f64> = floats_of(&bytes[..BODY_FLOATS * 8]).collect();
            assert_eq!(Body::from_floats(stepped.as_slice().try_into().unwrap()), expected);
            body = expected;
        }
        assert_eq!(body.mode, Mode::Climb, "run into a ledge too high to grab, 17 degrees off square, it takes hold");
        assert!(body.y > ledge.max_y, "the ledge stops the body, at {}", body.y);
    }

    #[test]
    fn a_body_stands_where_it_is_asked() {
        let mut bytes = [0_u8; STEP_FLOATS * 8];
        bytes[..16].copy_from_slice(&bytes_of(&[3.5, -2.25]));
        stand(&mut bytes);
        let stood: Vec<f64> = floats_of(&bytes[..BODY_FLOATS * 8]).collect();
        assert_eq!(Body::from_floats(stood.as_slice().try_into().unwrap()), standing(3.5, -2.25));
    }

    /// Land 10 m up with a grain, round a terrace 20 m square at 12 m: a window as a node's room is handed one.
    const WINDOW: &str = r#"{ "land": { "width": 2, "height": 2, "left_m": -1000.0, "top_m": -1000.0, "cell_m": 1000.0,
        "first_column": 0, "first_row": 0, "data": [10, 10, 10, 10] }, "lake_level": [0, 0, 0, 0],
        "rivers": [], "roads": [], "towns": [],
        "coast": { "width": 2, "height": 2, "left_m": -1000.0, "top_m": -1000.0, "cell_m": 1000.0, "first_column": 0,
            "first_row": 0, "data": [5000, 5000, 5000, 5000] },
        "across": { "width": 2, "height": 2, "left_m": -1000.0, "top_m": -1000.0, "cell_m": 1000.0, "first_column": 0,
            "first_row": 0, "data": [-50, -50, -50, -50] },
        "pads": [{ "bounds": [-10.0, -10.0, 10.0, 10.0], "level": 12.0 }], "seed": 7 }"#;

    fn stood_at(x: f64, y: f64) -> Body {
        let mut bytes = [0_u8; STEP_FLOATS * 8];
        bytes[..16].copy_from_slice(&bytes_of(&[x, y]));
        stand(&mut bytes);
        let stood: Vec<f64> = floats_of(&bytes[..BODY_FLOATS * 8]).collect();
        Body::from_floats(stood.as_slice().try_into().unwrap())
    }

    #[test]
    fn on_a_window_of_the_land_a_body_stands_and_walks_on_its_ground() {
        set_course(&[]);
        assert!(set_ground(WINDOW.as_bytes()));
        let ground: Ground = serde_json::from_str(WINDOW).unwrap();
        assert_eq!(stood_at(0.0, 0.0).z, 12.0, "on the terrace");
        let mut body = stood_at(30.0, -40.0);
        assert_eq!(body.z.to_bits(), ground.height_at(30.0, -40.0).to_bits());
        let controls = Controls { forward: 1.0, yaw: 2.0, ..Controls::default() };
        for _ in 0..60 {
            let mut numbers = [0.0; STEP_FLOATS];
            numbers[..BODY_FLOATS].copy_from_slice(&body.to_floats());
            numbers[BODY_FLOATS..].copy_from_slice(&[1.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0]);
            let mut bytes: [u8; STEP_FLOATS * 8] = bytes_of(&numbers).try_into().unwrap();
            step(&mut bytes);
            let expected = step_body(&body, &controls, &[], &OnLand::Land(Box::new(ground.clone())), TICK_SECONDS);
            let stepped: Vec<f64> = floats_of(&bytes[..BODY_FLOATS * 8]).collect();
            body = Body::from_floats(stepped.as_slice().try_into().unwrap());
            assert_eq!(body, expected);
            assert_eq!(body.z.to_bits(), ground.height_at(body.x, body.y).to_bits(), "feet on the ground");
        }
        assert!(!set_ground(b"not a window"), "anything else is open ground");
        assert_eq!(stood_at(30.0, -40.0), standing(30.0, -40.0));
    }

    #[test]
    fn on_a_ships_deck_a_body_stands_and_walks_its_heights_as_the_movement_crate_steps_it() {
        // A wall one cell thick across it, thinner than a run's tick, at 0.0 to 0.1 m.
        let heights = (0..800).map(|index| if index / 20 == 20 { None } else { Some(0.8) }).collect();
        let deck = Heights::new(-1.0, -2.0, 0.1, 20, 40, heights).unwrap();
        set_course(&[]);
        assert!(set_heights(&bytes_of(&deck.to_floats())));
        assert_eq!(stood_at(0.25, 1.0), deck.standing(0.25, 1.0), "on its planks, facing its bow");
        let controls = Controls { forward: 1.0, run: true, ..Controls::default() };
        let mut body = stood_at(0.25, 1.0);
        for _ in 0..120 {
            let mut numbers = [0.0; STEP_FLOATS];
            numbers[..BODY_FLOATS].copy_from_slice(&body.to_floats());
            numbers[BODY_FLOATS..].copy_from_slice(&controls.to_floats());
            let mut bytes: [u8; STEP_FLOATS * 8] = bytes_of(&numbers).try_into().unwrap();
            step(&mut bytes);
            let expected = step_body(&body, &controls, &[], &deck, TICK_SECONDS);
            let stepped: Vec<f64> = floats_of(&bytes[..BODY_FLOATS * 8]).collect();
            body = Body::from_floats(stepped.as_slice().try_into().unwrap());
            assert_eq!(body, expected, "to the bit, as the sea room steps it");
        }
        assert!(body.y >= 0.1, "stopped at the wall, not through it: {}", body.y);
        assert!(!set_heights(&[]), "no grid is open ground");
        assert_eq!(stood_at(0.25, 1.0), standing(0.25, 1.0));
    }

    #[test]
    fn the_tuning_names_the_tick() {
        assert!(tuning_json().contains(&format!(r#""tick_seconds": {TICK_SECONDS}"#)));
    }
}
