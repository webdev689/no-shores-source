//! Friendly traffic: ships sailing between the ports all the time. One route joins each pair of ports whose waters
//! border, planned round land. On each route a ship leaves each end every 1,200 s of world time, sails at 5 m/s and is
//! gone when she arrives. World time is seconds since the Unix epoch, so every machine computes the same ships for the
//! same time, and a ship's place comes in closed form from her departure, never by stepping her.

use crate::geometry::Point;
use crate::layout::Layout;
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

/// The bits of a ship's id below her departure number: her route in bits 1 to 7, her direction in bit 0.
const DEPARTURE_SHIFT: u32 = 8;
const MOST_ROUTES: usize = 1 << (DEPARTURE_SHIFT - 1);

/// A port: one an island, its city. `continent` is its continent's id in the layout.
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

/// The traffic of a world: its ports and the routes between them.
#[derive(Debug, Clone)]
pub struct Traffic {
    pub ports: Vec<Port>,
    pub routes: Vec<Route>,
    /// Each port's roadstead, in the ports' order.
    pub roadsteads: Vec<Point>,
}

impl Traffic {
    /// Plans a route between each pair of ports whose waters border, in the order of the waters' borders. A port whose
    /// continent the layout does not hold, or a pair no path joins, gets none.
    #[must_use]
    pub fn new(layout: &Layout, waters: &Waters, ports: &[Port]) -> Self {
        let continent_of = |port: &Port| layout.continents.iter().position(|continent| continent.id == port.continent);
        let roadsteads: Vec<Point> = ports
            .iter()
            .map(|port| {
                continent_of(port).map_or_else(
                    || Point::new(port.centre[0].round() as i64, port.centre[1].round() as i64),
                    |continent| routes::roadstead(waters, continent, port.centre),
                )
            })
            .collect();
        let coast = routes::coast_edges(layout);
        let mask = routes::Mask::new(waters);
        let port_on = |continent: usize| ports.iter().position(|port| continent_of(port) == Some(continent));
        let mut planned = Vec::new();
        for [first, second] in waters.borders() {
            let (Some(from), Some(to)) = (port_on(first), port_on(second)) else { continue };
            if planned.len() < MOST_ROUTES
                && let Some(path) = mask.route(&coast, roadsteads[from], roadsteads[to])
            {
                planned.push(Route::new(from, to, path));
            }
        }
        Self { ports: ports.to_vec(), routes: planned, roadsteads }
    }

    /// The ship with this id at this world time; none if she has not left yet, has arrived, or never sails.
    #[must_use]
    pub fn ship(&self, id: u64, time_s: f64) -> Option<TrafficShip> {
        let direction = (id & 1) as u8;
        let route_index = ((id >> 1) as usize) & (MOST_ROUTES - 1);
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
    /// every departure since 1970. Each candidate is then placed and judged exactly, as `ship` places her.
    #[must_use]
    pub fn ships_near(&self, centre: [f64; 2], radius_m: f64, time_s: f64) -> Vec<TrafficShip> {
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
                    let mut departure = first;
                    while departure <= last {
                        ids.insert(ship_id(route_index, direction, departure as u64));
                        departure += 1.0;
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
