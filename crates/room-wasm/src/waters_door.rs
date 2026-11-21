//! The sea's waters and its friendly traffic for a browser. The page opens them once with the layout and the nine
//! ports it already holds, then asks: the water at a point, the waters judged over the frame as bytes for the held map,
//! and the friendly ships near a point at a world time. The rules stay in the world crate; this keeps the opened
//! waters between calls.

use crate::hand_over;
use serde::Deserialize;
use serde_json::{Value, json};
use std::cell::RefCell;
use world::layout::Layout;
use world::traffic::{Port, Traffic, TrafficShip};
use world::waters::{Waters, name_of};

/// `waters_at`'s answer when no waters are open.
pub const NOT_OPEN: u32 = 256;
/// The finest grid `waters_grid` judges, metres a cell, so a page cannot ask for more cells than memory holds.
pub const FINEST_GRID_M: f64 = 1_000.0;
/// The numbers `waters_ships` packs for each ship.
pub const SHIP_FLOATS: usize = 11;

thread_local! {
    static OPEN: RefCell<Option<(Waters, Traffic)>> = const { RefCell::new(None) };
}

#[derive(Deserialize)]
struct OpenRequest {
    layout: Layout,
    ports: Vec<Port>,
}

/// Opens the waters and the traffic from `{ "layout": <layout file>, "ports": [{ "id", "name", "continent",
/// "centre": [x, y] }] }` and answers their table as JSON:
/// `{ "waters": [{ "continent": <layout index>, "id", "name", "holder", "levels": [low, high] or null }],
///    "borders": [[a, b]], "main_ports": [<city id>], "ports": [{ "id", "name", "roadstead": [x, y] }],
///    "routes": [{ "from_port", "to_port", "length_m", "path": [[x, y]] }] }`, or `{ "error" }`.
/// A holder is "home", "contested", "grey-tithe" or "pirates" (home for a continent the table does not name).
/// `main_ports` names the port cities; `ports` holds only those of the given ports that are, in the order given, and a
/// ship's or route's port is an index into it. A layout that breaks the world's rules is refused.
#[must_use]
pub fn open_waters(request: &[u8]) -> String {
    let request: OpenRequest = match serde_json::from_slice(request) {
        Ok(request) => request,
        Err(error) => return json!({ "error": error.to_string() }).to_string(),
    };
    if let Some(problem) = world::check::check(&request.layout).first() {
        return json!({ "error": problem.to_string() }).to_string();
    }
    let waters = Waters::new(&request.layout);
    let traffic = Traffic::new(&request.layout, &waters, &request.ports);
    let table = table_of(&request.layout, &waters, &traffic);
    OPEN.with(|open| *open.borrow_mut() = Some((waters, traffic)));
    table.to_string()
}

fn table_of(layout: &Layout, waters: &Waters, traffic: &Traffic) -> Value {
    let table: Vec<Value> = layout
        .continents
        .iter()
        .enumerate()
        .map(|(index, continent)| {
            json!({
                "continent": index,
                "id": continent.id,
                "name": name_of(&continent.id),
                "holder": waters.holder(index).name(),
                "levels": gear::world::island_levels(&continent.id).map(|(low, high)| [low, high]),
            })
        })
        .collect();
    let ports: Vec<Value> = traffic
        .ports
        .iter()
        .zip(&traffic.roadsteads)
        .map(|(port, roadstead)| json!({ "id": port.id, "name": port.name, "roadstead": [roadstead.x, roadstead.y] }))
        .collect();
    let routes: Vec<Value> = traffic
        .routes
        .iter()
        .map(|route| {
            let path: Vec<[i64; 2]> = route.path.iter().map(|point| [point.x, point.y]).collect();
            json!({ "from_port": route.from_port, "to_port": route.to_port, "length_m": route.length_m, "path": path })
        })
        .collect();
    let main_ports = world::ports::MAIN_PORTS;
    json!({
        "waters": table,
        "borders": waters.borders(),
        "main_ports": main_ports,
        "ports": ports,
        "routes": routes,
        "friendly_speed_m_s": world::traffic::SPEED_M_S,
        "sea": sea_facts(),
    })
}

/// What the page reads of the sea's rules beside its waters: the reach a hostile ship meets a player within, the
/// furthest one may hold a voyage, metres; the reach of a port city's repairs; and each ship's name, by its faction's
/// number (0 to the captains' last) and then its hull's.
fn sea_facts() -> Value {
    let factions = 0..=naval::ranks::CAPTAIN_FACTIONS.into_iter().max().unwrap_or(0);
    let names: Vec<Vec<&str>> = factions
        .map(|faction| sailing::HullKind::ALL.iter().map(|hull| naval::ranks::ship_name(faction, *hull)).collect())
        .collect();
    json!({
        "engage_m": naval::captain::ENGAGE_RANGE,
        "hold_reach_m": room::threat::hold_reach_m(),
        "repair_reach_m": room::harbour::REPAIR_REACH_M,
        "ship_names": names,
    })
}

/// The water at a point as one grid byte: its continent's layout index, with 0x80 set on the contested seam; 255 on
/// land; `NOT_OPEN` before the waters are opened.
#[must_use]
pub fn water_byte(x: f64, y: f64) -> u32 {
    OPEN.with(|open| {
        open.borrow().as_ref().map_or(NOT_OPEN, |(waters, _)| match waters.water_at([x, y]) {
            None => u32::from(world::waters::LAND_CELL),
            Some(water) => water.continent as u32 | if water.seam { u32::from(world::waters::SEAM_BIT) } else { 0 },
        })
    })
}

/// The waters judged at the middle of each `cell_m` cell over the frame: its columns and rows as little-endian u32s,
/// then one byte a cell, row by row from the north-west, as `water_byte` answers. Empty before the waters are opened
/// or for a cell that is not a finite number of at least `FINEST_GRID_M`.
#[must_use]
pub fn grid_bytes(cell_m: f64) -> Vec<u8> {
    if !(cell_m.is_finite() && cell_m >= FINEST_GRID_M) {
        return Vec::new();
    }
    OPEN.with(|open| {
        open.borrow().as_ref().and_then(|(waters, _)| waters.grid(cell_m)).map_or_else(Vec::new, |grid| {
            let mut bytes = Vec::with_capacity(8 + grid.cells.len());
            for count in [grid.columns, grid.rows] {
                bytes.extend_from_slice(&u32::try_from(count).unwrap_or(u32::MAX).to_le_bytes());
            }
            bytes.extend_from_slice(&grid.cells);
            bytes
        })
    })
}

/// Ships packed as little-endian f64s, `SHIP_FLOATS` each: id, route, from port, to port, hull (0 sloop, 1 schooner,
/// 2 brig, 3 frigate), x, y, the unit way it sails (x, y), metres sailed, and its route's length.
fn ship_bytes(ships: &[TrafficShip]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(ships.len() * SHIP_FLOATS * 8);
    for ship in ships {
        let numbers = [
            ship.id as f64,
            ship.route as f64,
            ship.from_port as f64,
            ship.to_port as f64,
            f64::from(ship.hull),
            ship.position[0],
            ship.position[1],
            ship.direction[0],
            ship.direction[1],
            ship.progress_m,
            ship.length_m,
        ];
        for number in numbers {
            bytes.extend_from_slice(&number.to_le_bytes());
        }
    }
    bytes
}

/// What `use_open` makes of the open waters and their traffic; none before they are opened.
pub(crate) fn with_waters<T>(use_open: impl FnOnce(&Waters, &Traffic) -> T) -> Option<T> {
    OPEN.with(|open| open.borrow().as_ref().map(|(waters, traffic)| use_open(waters, traffic)))
}

/// The friendly ships within `radius_m` of `(x, y)` at world time `time_s` (seconds since the Unix epoch), by id,
/// packed as `ship_bytes` says; empty before the waters are opened.
#[must_use]
pub fn ships_near_bytes(x: f64, y: f64, radius_m: f64, time_s: f64) -> Vec<u8> {
    OPEN.with(|open| {
        open.borrow()
            .as_ref()
            .map_or_else(Vec::new, |(_, traffic)| ship_bytes(&traffic.ships_near([x, y], radius_m, time_s)))
    })
}

/// One friendly ship by its id at world time `time_s`, packed as `ship_bytes` says; empty when it is not sailing then.
#[must_use]
pub fn ship_by_id_bytes(id: u64, time_s: f64) -> Vec<u8> {
    OPEN.with(|open| {
        let found = open.borrow().as_ref().and_then(|(_, traffic)| traffic.ship(id, time_s));
        ship_bytes(found.as_slice())
    })
}

/// Opens the waters from the request written at `address`, `length` bytes long (`open_waters`); answers the table's
/// JSON text.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn waters_open(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(open_waters(unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
}

/// The water at a point as one grid byte (`water_byte`).
#[unsafe(no_mangle)]
pub extern "C" fn waters_at(x: f64, y: f64) -> u32 {
    water_byte(x, y)
}

/// The waters over the frame as bytes (`grid_bytes`).
#[unsafe(no_mangle)]
pub extern "C" fn waters_grid(cell_m: f64) -> u64 {
    hand_over(grid_bytes(cell_m))
}

/// The friendly ships near a point at a world time, packed (`ships_near_bytes`).
#[unsafe(no_mangle)]
pub extern "C" fn waters_ships(x: f64, y: f64, radius_m: f64, time_s: f64) -> u64 {
    hand_over(ships_near_bytes(x, y, radius_m, time_s))
}

/// One friendly ship by its id at a world time, packed (`ship_by_id_bytes`).
#[unsafe(no_mangle)]
pub extern "C" fn waters_ship(id: u64, time_s: f64) -> u64 {
    hand_over(ship_by_id_bytes(id, time_s))
}

#[cfg(test)]
#[path = "waters_door_tests.rs"]
mod tests;
