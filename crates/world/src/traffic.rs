//! Friendly traffic: ships sailing between the port cities all the time. One route joins every pair of them, planned
//! round land, so each port trades with both others and the lanes cross the most waters. On each route a ship leaves
//! each end every 1,200 s of world time, sails at 5 m/s and is gone when she arrives. World time is seconds since the
//! Unix epoch, so every machine computes the same ships for the same time, and a ship's place comes in closed form
//! from her departure, never by stepping her.

use crate::geometry::Point;
use crate::layout::Layout;
use crate::ports::is_main_port;
use crate::waters::Waters;
use serde::Deserialize;
use std::collections::BTreeSet;

#[path = "traffic_routes.rs"]
mod routes;

/// A ship leaves each end of each route this often, seconds.
pub const DEPARTURE_EVERY_S: f64 = 1_200.0;
/// Every friendly ship sails at this speed, metres a second.
pub const SPEED_M_S: f64 = 5.0;
/// A roadstead lies this far out to sea from its port's nearest coast, metres, and farther if it must be.
pub const ROADSTEAD_OUT_M: f64 = 3_000.0;
/// A roadstead stays at least this clear of every coast, metres.
pub const ROADSTEAD_CLEAR_M: f64 = 1_000.0;
/// How far a roadstead moves out each time it is not yet clear, metres.
pub const ROADSTEAD_STEP_M: f64 = 500.0;
/// The sea mask the routes are planned on: cells this wide, metres.
pub const MASK_CELL_M: f64 = 5_000.0;
/// A mask cell is open sea when its middle is at least this clear of every coast, metres.
pub const MASK_CLEAR_M: f64 = 3_000.0;
/// Every leg stays more than this clear of every coast and isle, metres, so a hull drawn on it stays off the land.
pub const LEG_CLEAR_M: f64 = 800.0;

/// The bits of a ship's id below her departure number: her route in bits 1 to 7, her direction in bit 0.
const DEPARTURE_SHIFT: u32 = 8;
const ROUTE_BITS: u64 = (1 << (DEPARTURE_SHIFT - 1)) - 1;

/// A port city: `id` is its city's id, `continent` its continent's id in the layout.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Port {
    pub id: String,
    pub name: String,
    pub continent: String,
    pub centre: [f64; 2],
}

/// A route between two ports: its path from the first port's roadstead to the second's, in whole metres.
#[derive(Debug, Clone, PartialEq)]
pub struct Route {
    /// Indices into the ports the traffic was made with.
    pub from_port: usize,
    pub to_port: usize,
    pub path: Vec<Point>,
    pub length_m: f64,
    /// How far along the path each of its points lies, metres.
    along: Vec<f64>,
}

impl Route {
    fn new(from_port: usize, to_port: usize, path: Vec<Point>) -> Self {
        let mut along = vec![0.0];
        for leg in path.windows(2) {
            let (dx, dy) = ((leg[1].x - leg[0].x) as f64, (leg[1].y - leg[0].y) as f64);
            along.push(along[along.len() - 1] + (dx * dx + dy * dy).sqrt());
        }
        Self { from_port, to_port, length_m: along[along.len() - 1], path, along }
    }

    fn corner(&self, index: usize) -> [f64; 2] {
        [self.path[index].x as f64, self.path[index].y as f64]
    }

    /// The point `distance` metres along the path from its start, and the unit way the path runs there.
    fn at(&self, distance: f64) -> ([f64; 2], [f64; 2]) {
        let leg = self.along.partition_point(|&along| along <= distance).clamp(1, self.path.len() - 1) - 1;
        let (from, to) = (self.corner(leg), self.corner(leg + 1));
        let length = self.along[leg + 1] - self.along[leg];
        let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let past = distance - self.along[leg];
        ([from[0] + past * way[0], from[1] + past * way[1]], way)
    }

    /// The stretches of the path, as distances from its start, that come within `radius_m` of `centre`.
    fn stretches_near(&self, centre: [f64; 2], radius_m: f64) -> Vec<[f64; 2]> {
        let mut stretches = Vec::new();
        for leg in 0..self.path.len() - 1 {
            let (from, to) = (self.corner(leg), self.corner(leg + 1));
            let length = self.along[leg + 1] - self.along[leg];
            let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
            let off = [centre[0] - from[0], centre[1] - from[1]];
            let ahead = off[0] * way[0] + off[1] * way[1];
            let aside_squared = off[0] * off[0] + off[1] * off[1] - ahead * ahead;
            let reach_squared = radius_m * radius_m - aside_squared;
            if reach_squared < 0.0 {
                continue;
            }
            let reach = reach_squared.sqrt();
            let (start, end) = ((ahead - reach).max(0.0), (ahead + reach).min(length));
            if start <= end {
                stretches.push([self.along[leg] + start, self.along[leg] + end]);
            }
        }
        stretches
    }
}

/// A friendly ship at one moment of world time.
#[derive(Debug, Clone, PartialEq)]
pub struct TrafficShip {
    /// Her departure number, route and direction: `n << 8 | route << 1 | direction`.
    pub id: u64,
    pub route: usize,
    /// Indices into the ports the traffic was made with.
    pub from_port: usize,
    pub to_port: usize,
    /// 0 sloop, 1 schooner, 2 brig, 3 frigate.
    pub hull: u8,
    pub position: [f64; 2],
    /// The unit way she sails, along her leg.
    pub direction: [f64; 2],
    /// How far she has sailed, metres.
    pub progress_m: f64,
    /// Her route's length, metres.
    pub length_m: f64,
}

/// A ship's id from her route, her direction (0 from the route's first port, 1 back) and her departure number.
#[must_use]
pub fn ship_id(route: usize, direction: u8, departure: u64) -> u64 {
    debug_assert!(route as u64 <= ROUTE_BITS, "a route number fits in its seven bits");
    (departure << DEPARTURE_SHIFT) | ((route as u64) << 1) | u64::from(direction & 1)
}

/// A ship's hull from a fixed hash of her id: a sloop four times in ten, a schooner three, a brig two, a frigate one.
#[must_use]
pub fn hull_of(id: u64) -> u8 {
    let mut hash = id.wrapping_add(0x9e37_79b9_7f4a_7c15);
    hash = (hash ^ (hash >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    hash = (hash ^ (hash >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    match (hash ^ (hash >> 31)) % 10 {
        0..=3 => 0,
        4..=6 => 1,
        7..=8 => 2,
        _ => 3,
    }
}

/// The sea's ways to a world's ports, planned round land as the traffic's routes are: each cell of open water knows
/// its nearest port by the way a ship sails there, found once when they are made.
pub struct SeaWays {
    land: routes::Land,
    mask: routes::Mask,
    nearest: Vec<u8>,
}

impl SeaWays {
    /// The ways to `ports` (each a point of open water, at most 254 of them).
    #[must_use]
    pub fn new(layout: &Layout, waters: &Waters, ports: &[Point]) -> Self {
        let (land, mask) = (routes::Land::new(layout), routes::Mask::new(waters));
        let nearest = mask.nearest_ports(&land, ports);
        Self { land, mask, nearest }
    }

    /// The number of the port nearest `at` by the sea's way, among those the ways were made to; none where no port's
    /// way reaches it.
    #[must_use]
    pub fn nearest(&self, at: Point) -> Option<usize> {
        let port = self.nearest[self.mask.start_cell(&self.land, at)?];
        (port != routes::NO_PORT).then_some(usize::from(port))
    }
}

impl std::fmt::Debug for SeaWays {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SeaWays")
    }
}

/// The traffic of a world: its ports and the routes between them.
#[derive(Debug, Clone)]
pub struct Traffic {
    pub ports: Vec<Port>,
    pub routes: Vec<Route>,
    /// Each port's roadstead, in the ports' order.
    pub roadsteads: Vec<Point>,
}

impl Traffic {
    /// Keeps the first port of each id that is a port city (`ports::is_main_port`), on a continent the layout holds and with a clear
    /// roadstead, in the order given, then plans a route between every pair of them, first with second, first with
    /// third, second with third. A pair no path joins gets none.
    #[must_use]
    pub fn new(layout: &Layout, waters: &Waters, ports: &[Port]) -> Self {
        let continent_of = |port: &Port| layout.continents.iter().position(|continent| continent.id == port.continent);
        let (kept, roadsteads): (Vec<Port>, Vec<Point>) = ports
            .iter()
            .enumerate()
            .filter(|&(index, port)| {
                is_main_port(&port.id) && ports[..index].iter().all(|earlier| earlier.id != port.id)
            })
            .map(|(_, port)| port)
            .filter_map(|port| Some((port.clone(), routes::roadstead(waters, continent_of(port)?, port.centre)?)))
            .unzip();
        let land = routes::Land::new(layout);
        let mask = routes::Mask::new(waters);
        let mut planned = Vec::new();
        for from in 0..kept.len() {
            for to in from + 1..kept.len() {
                if let Some(path) = mask.route(&land, roadsteads[from], roadsteads[to]) {
                    planned.push(Route::new(from, to, path));
                }
            }
        }
        Self { ports: kept, routes: planned, roadsteads }
    }

    /// The ship with this id at this world time; none if she has not left yet, has arrived, or never sails.
    #[must_use]
    pub fn ship(&self, id: u64, time_s: f64) -> Option<TrafficShip> {
        let direction = (id & 1) as u8;
        let route_index = ((id >> 1) & ROUTE_BITS) as usize;
        let route = self.routes.get(route_index)?;
        let sailed = SPEED_M_S * (time_s - (id >> DEPARTURE_SHIFT) as f64 * DEPARTURE_EVERY_S);
        if !(0.0..route.length_m).contains(&sailed) {
            return None;
        }
        let (position, way) = if direction == 0 { route.at(sailed) } else { route.at(route.length_m - sailed) };
        let (from_port, to_port) =
            if direction == 0 { (route.from_port, route.to_port) } else { (route.to_port, route.from_port) };
        let heading = if direction == 0 { way } else { [-way[0], -way[1]] };
        Some(TrafficShip {
            id,
            route: route_index,
            from_port,
            to_port,
            hull: hull_of(id),
            position,
            direction: heading,
            progress_m: sailed,
            length_m: route.length_m,
        })
    }

    /// Every ship within `radius_m` of `centre` at this world time, by id. Per route, the stretches of its path within
    /// the radius give the distances sailed that put a ship there, and those give the departures: never a walk over
    /// every departure since 1970. Each candidate is then placed and judged exactly, as `ship` places her. A time or
    /// radius that is not a finite number, a negative radius, or a time past the last departure an id holds, finds
    /// none.
    #[must_use]
    pub fn ships_near(&self, centre: [f64; 2], radius_m: f64, time_s: f64) -> Vec<TrafficShip> {
        let most_departures = (1_u64 << (64 - DEPARTURE_SHIFT)) as f64;
        let usable = [centre[0], centre[1], radius_m, time_s].iter().all(|number| number.is_finite())
            && radius_m >= 0.0
            && time_s / DEPARTURE_EVERY_S < most_departures;
        if !usable {
            return Vec::new();
        }
        let mut ids = BTreeSet::new();
        for (route_index, route) in self.routes.iter().enumerate() {
            for [start, end] in route.stretches_near(centre, radius_m) {
                for direction in 0..2_u8 {
                    let (low, high) =
                        if direction == 0 { (start, end) } else { (route.length_m - end, route.length_m - start) };
                    // A metre either side, so rounding never loses a ship at the edge; the exact judging below drops
                    // any that fall outside.
                    let first = ((time_s - (high + 1.0) / SPEED_M_S) / DEPARTURE_EVERY_S).ceil().max(0.0);
                    let last = ((time_s - (low - 1.0) / SPEED_M_S) / DEPARTURE_EVERY_S).floor();
                    if last >= first {
                        for departure in first as u64..=last as u64 {
                            ids.insert(ship_id(route_index, direction, departure));
                        }
                    }
                }
            }
        }
        ids.into_iter()
            .filter_map(|id| self.ship(id, time_s))
            .filter(|ship| {
                let (dx, dy) = (ship.position[0] - centre[0], ship.position[1] - centre[1]);
                dx * dx + dy * dy <= radius_m * radius_m
            })
            .collect()
    }
}

#[cfg(test)]
#[path = "traffic_tests.rs"]
mod tests;
