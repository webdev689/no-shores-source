//! The door's half that steps a player's fighter in the browser without a room, by the room's own rules, to predict
//! it: the course and the ground it stands on, kept between calls, the step itself, and the fight's sizes and reaches
//! the page lays its numbers out by.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use crate::{floats_of, hand_over};
use combat::Fighter;
use combat::floats::{FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS};
use land::ground::Ground;
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use room::Floor;
use std::cell::RefCell;

thread_local! {
    pub(crate) static COURSE: RefCell<movement::Blocks> = RefCell::new(movement::Blocks::default());
    static FLOOR: RefCell<Floor> = const { RefCell::new(Floor::Flat) };
}

/// Keeps a course for predicting a fighter without a room: the blocks, six numbers each (`BLOCK_FLOATS`). Answers whether they made
/// one.
pub fn set_course(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    if !floats.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks =
        floats.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    COURSE.with(|course| *course.borrow_mut() = movement::Blocks::new(blocks.collect()));
    true
}

/// Keeps a node's window of the ground for predicting a fighter without a room, from its JSON as the land's worker cuts
/// it; empty text keeps open ground. Answers whether the text was ground or empty.
pub fn set_ground(text: &[u8]) -> bool {
    let floor = if text.is_empty() {
        Some(Floor::Flat)
    } else {
        serde_json::from_slice::<Ground>(text).ok().map(|ground| Floor::Land(Box::new(ground)))
    };
    let kept = floor.is_some();
    FLOOR.with(|kept_floor| *kept_floor.borrow_mut() = floor.unwrap_or(Floor::Flat));
    kept
}

/// Keeps a ship's deck for predicting a fighter without a room, from its grid's numbers (`Heights::from_floats`), in
/// place of any ground: its deck room's own floor, to the bit. Numbers that are not a grid keep open ground; answers
/// whether they were one.
pub fn set_heights(bytes: &[u8]) -> bool {
    let deck = movement::Heights::from_floats(&floats_of(bytes));
    let kept = deck.is_some();
    FLOOR.with(|floor| *floor.borrow_mut() = deck.map_or(Floor::Flat, |deck| Floor::Deck(Box::new(deck))));
    kept
}

/// One tick of a player's fighter as a room would take it, on the ground kept (open ground unless set), from its
/// numbers: the fighter,
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
        FLOOR.with(|floor| {
            let (blocks, floor) = (course.borrow(), floor.borrow());
            let (next, happening) = combat::player_tick(whole(*id), &fighter, &intent, &view, &*blocks, &*floor);
            let Some(combat::Happening::Loosed(shot)) = happening else { return (next, None) };
            if combat::shots::shot_numbers(shot.ranged).0 > 0.0 {
                return (next, Some(shot));
            }
            let bodies: Vec<(u32, [f64; 3])> = view
                .iter()
                .filter(|(_, other)| other.side != fighter.side && !other.dead())
                .map(|(other, seen)| (*other, [seen.body.x, seen.body.y, seen.body.z]))
                .collect();
            let stop = match combat::shots::fly(&shot, &blocks, &*floor, &bodies) {
                combat::shots::Flight::Stopped { at, .. } => at,
                combat::shots::Flight::Flying(flown) => flown.at,
            };
            (next, Some(combat::shots::line_of(&shot, stop)))
        })
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

/// Keeps the course written at `address` for predicting; 1 if it was one, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_course(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_course(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the ground written at `address` for predicting; 1 if it was ground or empty, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_ground(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_ground(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the deck whose grid's numbers are written at `address` for predicting; 1 if they were a grid, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_heights(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_heights(unsafe { std::slice::from_raw_parts(address, length) }))
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

/// The farthest stroke `stroke` (1 to 6) of the melee weapon in arms code `arms` reaches, feet to a body's middle,
/// in a player's hands when `player` is 1; 0 for no stroke.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_reach(arms: u32, stroke: u32, player: u32) -> f64 {
    let melee = combat::arms::Arms::from_code(arms).melee;
    u8::try_from(stroke)
        .ok()
        .and_then(combat::Stroke::from_number)
        .map_or(0.0, |stroke| combat::strike::stroke_reach(melee, stroke, player == 1))
}

/// The half-width in radians of the arc stroke `stroke` (1 to 6) sweeps either side of its aim; 0 for no stroke.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_stroke_arc(stroke: u32) -> f64 {
    u8::try_from(stroke)
        .ok()
        .and_then(combat::Stroke::from_number)
        .map_or(0.0, |stroke| combat::arms::stroke_shape(stroke).half_arc)
}

/// How many numbers a fighter, an intent and a glance are, for the browser to lay them out: as one number, each in a
/// byte.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_sizes() -> u32 {
    let byte = |size: usize| u32::try_from(size).unwrap_or_default() & 0xff;
    byte(FIGHTER_FLOATS) | byte(INTENT_FLOATS) << 8 | byte(GLANCE_FLOATS) << 16
}
