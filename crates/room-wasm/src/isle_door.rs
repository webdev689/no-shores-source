//! The islands' doors: an island's plan as the page draws it and its ground as it predicts on, both built from the
//! seed by the `isle` crate exactly as the island's room builds them; an island's room opened from the sea's word on
//! it; and the sea's word on one of its islands, for the host of that island's room.

use crate::{Opened, hand_over, keep, with_open};
use isle::Plan;
use room::Room;
use serde::Deserialize;
use std::cell::RefCell;

thread_local! {
    /// The last island built: the page asks for its plan and its ground in turn.
    static BUILT: RefCell<Option<Plan>> = const { RefCell::new(None) };
}

/// The island a seed and climate make, built once for both asks.
fn with_plan<T>(seed: u64, climate: &str, use_plan: impl FnOnce(&Plan) -> T) -> Option<T> {
    BUILT.with(|built| {
        let mut built = built.borrow_mut();
        if built.as_ref().is_none_or(|plan| plan.seed != seed || plan.climate != climate) {
            *built = Plan::new(seed, climate);
        }
        built.as_ref().map(use_plan)
    })
}

/// A seed from its two halves, as JavaScript's numbers hand it.
fn seed_of(low: u32, high: u32) -> u64 {
    (u64::from(high) << 32) | u64::from(low)
}

/// An island's plan as JSON: its kind and its dungeon's style, its radius and reach, where it is landed and anchored
/// off, its spawns and the bearing a player landed faces, its door, landmark, guards' posts, camp and wrecks, its
/// section's ring, and every module set on it as [its number in the contract, x, y, z, turn, scale, lift]. Empty for
/// a climate the contract does not dress.
#[must_use]
pub fn plan_json(seed: u64, climate: &str) -> String {
    let json = |plan: &Plan| {
        let sites = &plan.sites;
        let placements: Vec<[f64; 7]> = plan
            .placements
            .iter()
            .map(|each| {
                let [x, y, z] = each.at;
                [f64::from(each.module), x, y, z, each.turn, each.scale, each.lift]
            })
            .collect();
        let wrecks: Vec<[f64; 3]> = sites.wrecks.iter().map(|wreck| [wreck.at[0], wreck.at[1], wreck.lies]).collect();
        serde_json::json!({
            "kind": plan.kind.name(),
            "dungeon": plan.kind.dungeon(),
            "radius": plan.shape.radius,
            "reach": plan.shape.reach(),
            "landing": plan.shape.landing,
            "anchorage": sites.anchorage,
            "spawns": sites.spawns,
            "facing": sites.facing,
            "door": { "at": sites.door.at, "facing": sites.door.facing, "style": sites.door.style },
            "landmark": sites.landmark,
            "guards": sites.guards,
            "camp": sites.camp,
            "wrecks": wrecks,
            "ring": plan.ring,
            "placements": placements,
        })
        .to_string()
    };
    with_plan(seed, climate, json).unwrap_or_default()
}

/// An island's ground as `movement::Heights::to_floats` gives it, little-endian: what the page predicts its body on,
/// to the bit. Empty for a climate the contract does not dress.
#[must_use]
pub fn heights_bytes(seed: u64, climate: &str) -> Vec<u8> {
    let floats = with_plan(seed, climate, |plan| plan.ground.to_floats()).unwrap_or_default();
    floats.iter().flat_map(|number| number.to_le_bytes()).collect()
}

/// The sea's word an island's room opens on: its seed as a decimal (JSON's numbers cannot hold 64 bits), its climate,
/// whose guards stand on it (the foes' faction number, 0 for none), and its water's band of levels.
#[derive(Deserialize)]
struct IslandRequest {
    seed: String,
    climate: String,
    guards: u8,
    levels: Option<(u8, u8)>,
}

/// Opens an island's room from the sea's word on it; false for words that do not make an island.
#[must_use]
pub fn open_island(text: &[u8]) -> bool {
    let Ok(request) = serde_json::from_slice::<IslandRequest>(text) else { return false };
    let Ok(seed) = request.seed.parse::<u64>() else { return false };
    let Some(room) = with_plan(seed, &request.climate, |plan| {
        Room::island(plan, (request.guards != 0).then_some(request.guards), request.levels)
    }) else {
        return false;
    };
    keep(Opened::Land { room: Box::new(room), node: None });
    true
}

/// The open sea's word on its island `id`, as `open_island` takes it, with where it lies and where a ship anchors off
/// it; empty if no sea is open or the island does not stand.
#[must_use]
pub fn sea_island(id: u32) -> String {
    let word = with_open(|opened| {
        let Opened::Sea(sea) = opened else { return None };
        let island = sea.islands().by_id(id)?;
        let levels = gear::world::island_levels(&format!("continent-{}", island.continent + 1));
        Some(
            serde_json::json!({
                "id": island.id,
                "seed": island.seed.to_string(),
                "climate": island.climate,
                "guards": island.guards.unwrap_or(0),
                "levels": levels,
                "kind": island.kind.name(),
                "at": island.at,
                "anchorage": island.anchorage,
            })
            .to_string(),
        )
    });
    word.flatten().unwrap_or_default()
}

/// Holds the open sea's island `id` while players stand ashore on it: whether it stands.
#[must_use]
pub fn hold_ashore(id: u32) -> bool {
    with_open(|opened| if let Opened::Sea(sea) = opened { sea.hold_ashore(id) } else { false }).unwrap_or(false)
}

/// An island's plan's JSON (`plan_json`), from its seed's halves and its climate's name written at `address`.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_isle_plan(low: u32, high: u32, address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let climate = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    hand_over(plan_json(seed_of(low, high), &climate).into_bytes())
}

/// An island's ground's numbers (`heights_bytes`), from its seed's halves and its climate's name at `address`.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_isle_heights(low: u32, high: u32, address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let climate = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    hand_over(heights_bytes(seed_of(low, high), &climate))
}

/// Opens an island's room from the sea's word written at `address` (`open_island`); 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_island(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_island(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// The open sea's word on its island `id` (`sea_island`).
#[unsafe(no_mangle)]
pub extern "C" fn room_sea_island(id: u32) -> u64 {
    hand_over(sea_island(id).into_bytes())
}

/// Holds the open sea's island `id` while players stand ashore (`hold_ashore`); 1 if it stands, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_hold_ashore(id: u32) -> u32 {
    u32::from(hold_ashore(id))
}

#[cfg(test)]
#[path = "isle_door_tests.rs"]
mod isle_door_tests;
