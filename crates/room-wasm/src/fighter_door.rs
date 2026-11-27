//! The door's half that steps a player's fighter in the browser without a room, by the room's own rules, to predict
//! it: the course and the ground it stands on, kept between calls, the step itself, and the fight's sizes and reaches
//! the page lays its numbers out by, with an item's fight numbers its page shows.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use crate::{floats_of, hand_over};
use combat::Fighter;
use combat::floats::{FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS};
use land::ground::Ground;
use movement::Block;
use movement::Heights;
use movement::floats::BLOCK_FLOATS;
use movement::heights::RIM_CELL_M;
use room::Floor;
use std::cell::RefCell;

thread_local! {
    pub(crate) static COURSE: RefCell<movement::Blocks> = RefCell::new(movement::Blocks::default());
    static FLOOR: RefCell<Floor> = const { RefCell::new(Floor::Flat) };
    /// The seals open and the slabs standing the course was last made for in a Breach's run, a bit each.
    static BREACH: std::cell::Cell<Option<(u8, u8)>> = const { std::cell::Cell::new(None) };
}

/// Keeps `blocks` as the course predicted on, a Breach's run's forgotten.
pub(crate) fn keep_course(blocks: movement::Blocks) {
    BREACH.with(|kept| kept.set(None));
    COURSE.with(|course| *course.borrow_mut() = blocks);
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
    keep_course(movement::Blocks::new(blocks.collect()));
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
    BREACH.with(|breach| breach.set(None));
    FLOOR.with(|kept_floor| *kept_floor.borrow_mut() = floor.unwrap_or(Floor::Flat));
    kept
}

/// Keeps a dungeon's ground for predicting a fighter without a room, from the JSON ask `room_dungeon` takes (a
/// patrol's id and name and its number, an Elite Dungeon's place, or a seed and a style), and its course: an Elite
/// Dungeon's Ascents' pads and any gallery's balustrades, as its room stands them; a dungeon's jambs and pillars are
/// its ground's own. Answers whether the ask was a dungeon.
pub fn set_dungeon(text: &[u8]) -> bool {
    let Some((seed, style, blocks)) = crate::dungeon_door::asked(text) else { return false };
    let laid = dungeon::Dungeon::forge_within(seed, style, blocks);
    let Some(floor) = Floor::of_dungeon(&laid) else { return false };
    let pads = crate::dungeon_door::pads_of(text, &laid);
    FLOOR.with(|kept_floor| *kept_floor.borrow_mut() = floor);
    keep_course(movement::Blocks::new(pads));
    true
}

/// Keeps a Breach's run for predicting a fighter without a room: the dark (`Floor::Dark`, never climbed) under its
/// blocks as they stand at `tick` with the seals `open` (`Plan::blocks_at`, as its room stands them), made anew only
/// when a seal or a slab changed. Answers whether the course was made anew.
pub fn set_breach(open: u8, tick: u64) -> bool {
    let plan = room::breach::plan::drowned_vale();
    let standing = |(number, slab): (usize, &room::breach::plan::Slab)| {
        u8::from(room::breach::plan::slab_stands(slab, tick)) << number
    };
    let key = (open, plan.slabs.iter().enumerate().map(standing).fold(0, |bits, bit| bits | bit));
    if BREACH.with(std::cell::Cell::get) == Some(key) {
        return false;
    }
    BREACH.with(|kept| kept.set(Some(key)));
    FLOOR.with(|floor| *floor.borrow_mut() = Floor::Dark);
    COURSE.with(|course| *course.borrow_mut() = movement::Blocks::new(plan.blocks_at(open, tick)));
    true
}

/// Keeps a passage zone's ground for predicting a fighter without a room, from the JSON ask `room_open_passage` takes
/// (its island, week and zone): under ground the Forge's floor and the pieces' solids, above ground the hollow's
/// heights and its blocks, as `Room::passage` stands bodies on them. Answers whether the ask named a zone.
pub fn set_passage(text: &[u8]) -> bool {
    let Some((floor, blocks)) = crate::passage_room_door::ground_of(text) else { return false };
    FLOOR.with(|kept_floor| *kept_floor.borrow_mut() = floor);
    COURSE.with(|course| *course.borrow_mut() = movement::Blocks::new(blocks));
    true
}

/// Keeps a ship's deck for predicting a fighter without a room, from its grid's numbers (`Heights::from_floats`), in
/// place of any ground: its deck room's own floor, to the bit. Numbers that are not a grid keep open ground; answers
/// whether they were one.
pub fn set_heights(bytes: &[u8]) -> bool {
    let deck = movement::Heights::from_floats(&floats_of(bytes));
    let kept = deck.is_some();
    BREACH.with(|breach| breach.set(None));
    FLOOR.with(|floor| *floor.borrow_mut() = deck.map_or(Floor::Flat, |deck| Floor::Deck(Box::new(deck))));
    kept
}

/// Keeps the rim round a course laid over the sea for predicting a fighter without a room, from its blocks' numbers,
/// six each: the floor the sea room holds its bodies by (`Floor::Sea`), so a fighter predicted at its edge is held
/// as the room holds it. Answers whether the numbers were blocks.
pub fn set_rim(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    if !floats.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks: Vec<Block> = floats
        .chunks_exact(BLOCK_FLOATS)
        .filter_map(|numbers| numbers.try_into().ok())
        .map(Block::from_floats)
        .collect();
    let rim = Heights::rim(&blocks, RIM_CELL_M);
    BREACH.with(|breach| breach.set(None));
    FLOOR.with(|floor| *floor.borrow_mut() = Floor::Sea(Box::new(rim)));
    true
}

/// One tick of a player's fighter as a room would take it, on the ground kept (open ground unless set), from its
/// numbers: the fighter,
/// the intent, the player's number, the arms their hands hold (taken up as the room takes them, `Fighter::holding`),
/// then every fighter it sees as a number and a glance. Answers the next fighter's
/// numbers, then, if the tick let a shot go, its weapon's number, where it left and its velocity (a ball's as its
/// whole line to where it stops among those seen, in a tick); or, if its swing's blow landed, how many it hits as the
/// room would judge them among those seen, and for each its number, the blow's damage before the gear's power, the
/// stroke and 1 for a crit (`hits_of`); or none when the numbers are not that.
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
    let mut hits = Vec::new();
    let (next, shot) = COURSE.with(|course| {
        FLOOR.with(|floor| {
            let (blocks, floor) = (course.borrow(), floor.borrow());
            let (next, happening) = combat::player_tick(whole(*id), &fighter, &intent, &view, &*blocks, &*floor);
            if let Some(combat::Happening::Struck(attack)) = &happening {
                hits = hits_of(whole(*id), &next, attack, &view, &blocks, &floor);
            }
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
    if !hits.is_empty() {
        floats.push((hits.len() / HIT_FLOATS) as f64);
        floats.extend(hits);
    }
    floats.iter().flat_map(|value| value.to_le_bytes()).collect()
}

/// The numbers `hits_of` gives each fighter a swing hits.
const HIT_FLOATS: usize = 4;

/// The fighters a player's swing hits among those it sees, as the room judges a player's blow (`Room::happened`):
/// those its sweep reaches, each a hit by `combat::judge` as seen, not blocked, parried or dodged. For each its
/// number, the blow's damage before the gear's power, the stroke, and 1 for a crit its statuses make.
fn hits_of(
    id: u32,
    striker: &Fighter,
    attack: &combat::fighter::Attack,
    view: &[(u32, Fighter)],
    blocks: &[Block],
    floor: &Floor,
) -> Vec<f64> {
    combat::strike::struck(id, striker, attack, view, blocks, floor)
        .into_iter()
        .filter_map(|defender| {
            let (_, then) = view.iter().find(|(other, _)| *other == defender)?;
            let blow = combat::judge::swing_blow(id, striker, attack, defender);
            let combat::Verdict::Hit { damage, .. } = combat::judge(&blow, then) else { return None };
            let crit = combat::status::crits(&blow, Some(striker), then);
            Some([f64::from(defender), damage, f64::from(attack.stroke as u8), f64::from(u8::from(crit))])
        })
        .flatten()
        .collect()
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

/// Keeps the rim round the blocks written at `address` for predicting; 1 if they were blocks, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_rim(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_rim(unsafe { std::slice::from_raw_parts(address, length) }))
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

/// Keeps the dungeon asked for by the JSON written at `address` for predicting (`set_dungeon`); 1 if it was one, 0 if
/// not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_dungeon(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_dungeon(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps the passage zone asked for by the JSON written at `address` for predicting (`set_passage`); 1 if it was one,
/// 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_passage(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(set_passage(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Keeps a Breach's run for predicting at room tick `tick` with the seals `open` (`set_breach`); 1 if made anew.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_breach(open: u32, tick: u32) -> u32 {
    u32::from(set_breach(u8::try_from(open).unwrap_or(u8::MAX), u64::from(tick)))
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

/// The parry window, in ticks, a press of the guard opens: a player's when `player` is 1, else a foe's.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_parry_window(player: u32) -> u32 {
    combat::tuning::parry_window(player == 1)
}

/// The half-width in radians of the arc stroke `stroke` (1 to 6) sweeps either side of its aim; 0 for no stroke.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_stroke_arc(stroke: u32) -> f64 {
    u8::try_from(stroke)
        .ok()
        .and_then(combat::Stroke::from_number)
        .map_or(0.0, |stroke| combat::arms::stroke_shape(stroke).half_arc)
}

/// An item's fight numbers (`room::stats`), `STATS_FLOATS` little-endian floats, for the text written at `address`:
/// its kind's number, then each trait it gives, a line each. Empty for a kind there is none of.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fighter_item_stats(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(item_stats(unsafe { std::slice::from_raw_parts(address, length) }))
}

fn item_stats(bytes: &[u8]) -> Vec<u8> {
    let text = std::str::from_utf8(bytes).unwrap_or_default();
    let mut lines = text.lines();
    let kind = lines.next().and_then(|number| number.parse().ok()).and_then(gear::Kind::from_number);
    let Some(kind) = kind else { return Vec::new() };
    let (stats, _) = room::stats::stats(kind, lines.filter(|line| !line.is_empty()));
    stats.to_floats().into_iter().flat_map(f64::to_le_bytes).collect()
}

/// How many numbers a fighter, an intent and a glance are, for the browser to lay them out: as one number, each in a
/// byte.
#[unsafe(no_mangle)]
pub extern "C" fn fighter_sizes() -> u32 {
    let byte = |size: usize| u32::try_from(size).unwrap_or_default() & 0xff;
    byte(FIGHTER_FLOATS) | byte(INTENT_FLOATS) << 8 | byte(GLANCE_FLOATS) << 16
}
