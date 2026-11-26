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
/// off, its spawns and the bearing a player landed faces, its door, landmark, guards' posts, camp, wrecks and resource nodes, its
/// section's ring, every module set on it as [its number in the contract, x, y, z, turn, scale, lift], and the blocks
/// its modules' solids stand as [west, north, east, south, top]. Empty for a climate the contract does not dress.
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
        let blocks: Vec<[f64; 5]> =
            plan.blocks.iter().map(|block| [block.min_x, block.min_y, block.max_x, block.max_y, block.top]).collect();
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
            "nodes": sites.nodes,
            "ring": plan.ring,
            "placements": placements,
            "blocks": blocks,
        })
        .to_string()
    };
    with_plan(seed, climate, json).unwrap_or_default()
}

/// An island's ground as `movement::Heights::to_floats` gives it, little-endian, its middle at `at` in the world: what
/// the page predicts its body on, to the bit. Empty for a climate the contract does not dress, or a middle that is no
/// finite number, which no grid can be moved to.
#[must_use]
pub fn heights_bytes(seed: u64, climate: &str, at: [f64; 2]) -> Vec<u8> {
    if !at.iter().all(|value| value.is_finite()) {
        return Vec::new();
    }
    let floats = with_plan(seed, climate, |plan| plan.ground_at(at).to_floats()).unwrap_or_default();
    floats.iter().flat_map(|number| number.to_le_bytes()).collect()
}

/// The sea's word an island's room opens on: its seed as a decimal (JSON's numbers cannot hold 64 bits), its climate,
/// where its middle lies, whose guards stand on it (the foes' faction number, 0 for none), its water's band of levels,
/// and the resource its nodes give (its place in the gear's catalogue; none stand without it).
#[derive(Deserialize)]
struct IslandRequest {
    seed: String,
    climate: String,
    at: [f64; 2],
    guards: u8,
    levels: Option<(u8, u8)>,
    #[serde(default)]
    resource: Option<u8>,
}

/// Opens an island's room from the sea's word on it; false for words that do not make an island.
#[must_use]
pub fn open_island(text: &[u8]) -> bool {
    let Ok(request) = serde_json::from_slice::<IslandRequest>(text) else { return false };
    let Ok(seed) = request.seed.parse::<u64>() else { return false };
    let Some(room) = with_plan(seed, &request.climate, |plan| {
        Room::island(
            plan,
            request.at,
            (request.guards != 0).then_some(request.guards),
            request.levels,
            request.resource,
        )
    }) else {
        return false;
    };
    // Its numbers are the world's, packed from its middle in whole metres (`pack::middle_of`).
    let sent = Box::new(crate::sent::Sent::around(request.at.map(f64::floor)));
    keep(Opened::Land { room: Box::new(room), node: None, refusal: None, sent });
    true
}

/// The open sea's word on its island `id`, as `open_island` takes it, with where it lies and where a ship anchors off
/// it; empty if no sea is open or the island does not stand.
#[must_use]
pub fn sea_island(id: u32) -> String {
    let word = with_open(|opened| {
        let Opened::Sea(sea) = opened else { return None };
        let island = sea.islands().by_id(id)?;
        let levels = island.levels;
        Some(
            serde_json::json!({
                "id": island.id,
                "seed": island.seed.to_string(),
                "climate": island.climate,
                "guards": island.guards.unwrap_or(0),
                "levels": levels,
                "resource": island.resource,
                "kind": island.kind.name(),
                "at": island.at,
                "anchorage": island.anchorage,
            })
            .to_string(),
        )
    });
    word.flatten().unwrap_or_default()
}

/// The open sea's word on the standing island whose door leads into the dungeon room `room` (its name at Normal,
/// `room::sea::islands::dungeon_room`), as `sea_island` gives it; empty if none does.
#[must_use]
pub fn sea_dungeon(room: &str) -> String {
    let id = with_open(|opened| match opened {
        Opened::Sea(sea) => sea.island_behind(room).map(|island| island.id),
        _ => None,
    });
    id.flatten().map(sea_island).unwrap_or_default()
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

/// An island's ground's numbers (`heights_bytes`), from its seed's halves, its middle and its climate's name at
/// `address`.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_isle_heights(
    low: u32,
    high: u32,
    x: f64,
    y: f64,
    address: *const u8,
    length: usize,
) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let climate = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    hand_over(heights_bytes(seed_of(low, high), &climate, [x, y]))
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

/// The open sea's word on the island behind the dungeon room named at `address` (`sea_dungeon`).
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_sea_dungeon(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let room = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    hand_over(sea_dungeon(&room).into_bytes())
}

/// The number of the open sea's landing of `account` on its standing island `id` of `seed` (its ship at rest at that
/// island's anchorage when last at sea), or 0 if it is not landed there.
#[must_use]
pub fn sea_landed(id: u32, seed: u64, account: &str) -> u32 {
    let landed =
        with_open(|opened| if let Opened::Sea(sea) = opened { sea.islands().landed(id, seed, account) } else { None });
    landed.flatten().unwrap_or(0)
}

/// Turns on the open island room's check of landings (`Room::check_landings`), or lands `account` on it once checked
/// by its landing's number (`Room::land`): whether an island's room is open.
#[must_use]
pub fn isle_landing(account: Option<(&str, u32)>) -> bool {
    let open = with_open(|opened| match (opened, account) {
        (Opened::Land { room, .. }, Some((account, landing))) => room.land(account, landing),
        (Opened::Land { room, .. }, None) => room.check_landings(),
        _ => false,
    });
    open.unwrap_or(false)
}

/// The number of the open sea's landing of the account written at `address` on its island `id` of the seed whose
/// halves are given (`sea_landed`), or 0 if it is not landed there.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_sea_landed(id: u32, low: u32, high: u32, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let account = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    sea_landed(id, seed_of(low, high), &account)
}

/// Turns on the open island room's check of landings (`isle_landing`); 1 if an island's room is open.
#[unsafe(no_mangle)]
pub extern "C" fn room_isle_check_landings() -> u32 {
    u32::from(isle_landing(None))
}

/// Lands the account written at `address` on the open island room by its landing's number (`isle_landing`); 1 if an
/// island's room is open.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_isle_land(address: *const u8, length: usize, landing: u32) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let account = String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned();
    u32::from(isle_landing(Some((&account, landing))))
}

#[cfg(test)]
#[path = "isle_door_tests.rs"]
mod isle_door_tests;
