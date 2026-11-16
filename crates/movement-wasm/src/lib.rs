//! Movement for the browser. JavaScript hands over the course's blocks once, then steps a body one tick at a time: it
//! writes the body's and the controls' numbers into memory this module reserved for it, and reads the next body's
//! numbers back from the same place, little-endian 64-bit floats in the movement crate's order. The rules stay there.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use movement::floats::{BLOCK_FLOATS, BODY_FLOATS, CONTROLS_FLOATS};
use movement::{Block, Body, Controls, Flat, TICK_SECONDS, TUNING, standing, step_body};
use std::cell::RefCell;

/// The numbers one step reads: a body, then its controls. The next body is written over the first of them.
pub const STEP_FLOATS: usize = BODY_FLOATS + CONTROLS_FLOATS;

thread_local! {
    static COURSE: RefCell<Vec<Block>> = const { RefCell::new(Vec::new()) };
}

/// The numbers in little-endian bytes.
fn floats_of(bytes: &[u8]) -> impl Iterator<Item = f64> {
    bytes.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default()))
}

/// Keeps the course's blocks, five numbers each, for every step after; answers how many it kept.
pub fn set_course(bytes: &[u8]) -> usize {
    let floats: Vec<f64> = floats_of(bytes).collect();
    let blocks: Vec<Block> = floats
        .chunks_exact(BLOCK_FLOATS)
        .map(|numbers| Block::from_floats(numbers.try_into().unwrap_or(&[0.0; BLOCK_FLOATS])))
        .collect();
    let kept = blocks.len();
    COURSE.with(|course| *course.borrow_mut() = blocks);
    kept
}

/// Steps the body in `bytes` by one tick under its controls on the kept course, and writes the next body over it.
pub fn step(bytes: &mut [u8; STEP_FLOATS * 8]) {
    let mut floats = [0.0; STEP_FLOATS];
    floats.iter_mut().zip(floats_of(bytes.as_slice())).for_each(|(slot, value)| *slot = value);
    let (body_floats, controls_floats) = floats.split_at(BODY_FLOATS);
    let body = Body::from_floats(body_floats.try_into().unwrap_or(&[0.0; BODY_FLOATS]));
    let controls = Controls::from_floats(controls_floats.try_into().unwrap_or(&[0.0; CONTROLS_FLOATS]));
    let next = COURSE.with(|course| step_body(&body, &controls, &course.borrow(), &Flat, TICK_SECONDS));
    for (chunk, value) in bytes.chunks_exact_mut(8).zip(next.to_floats()) {
        chunk.copy_from_slice(&value.to_le_bytes());
    }
}

/// Writes a body standing at the (x, y) the first two numbers in `bytes` hold, over them.
pub fn stand(bytes: &mut [u8; STEP_FLOATS * 8]) {
    let (x, y) = {
        let mut place = floats_of(&bytes[..16]);
        (place.next().unwrap_or_default(), place.next().unwrap_or_default())
    };
    for (chunk, value) in bytes.chunks_exact_mut(8).zip(standing(x, y).to_floats()) {
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
    use movement::Mode;

    fn bytes_of(floats: &[f64]) -> Vec<u8> {
        floats.iter().flat_map(|value| value.to_le_bytes()).collect()
    }

    #[test]
    fn a_step_through_the_door_is_the_movement_crates_step() {
        let ledge = Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 2.3 };
        assert_eq!(set_course(&bytes_of(&[ledge.min_x, ledge.min_y, ledge.max_x, ledge.max_y, ledge.top])), 1);
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
        assert_eq!(body.mode, Mode::Ground);
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

    #[test]
    fn the_tuning_names_the_tick() {
        assert!(tuning_json().contains(&format!(r#""tick_seconds": {TICK_SECONDS}"#)));
    }
}
