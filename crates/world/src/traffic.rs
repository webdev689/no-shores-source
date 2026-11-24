//! Friendly traffic: ships sailing between the port cities all the time. Up to three courses join every pair of them,
//! planned round land, so each port trades with both others, its ships leave it different ways and the lanes cross the
//! most waters. On each course a ship leaves each end every 3,000 s of world time, sails at 60 m/s, lies 600 s at its
//! destination's roadstead and is then gone.
//! World time is seconds since the Unix epoch, so every machine computes the same ships for the same time, and a
//! ship's place comes in closed form from its departure, never by stepping it.

use crate::geometry::Point;
use crate::layout::Layout;
use crate::ports::is_main_port;
use crate::waters::Waters;
use serde::Deserialize;
use std::collections::BTreeSet;

#[path = "traffic_routes.rs"]
mod routes;

/// A ship leaves each end of each course this often, seconds: so about five friendly ships are within 60 km of
/// Overlook's roadstead at once, counting those lying there, the owner's five.
pub const DEPARTURE_EVERY_S: f64 = 3_000.0;
/// Every friendly ship sails at this speed, metres a second: the pace dial's slowest step, the owner's.
pub const SPEED_M_S: f64 = 60.0;
/// A ship lies at its destination's roadstead this long once it arrives, seconds, then is gone.
pub const DWELL_S: f64 = 600.0;
/// A pair's other two courses leave each port 30 degrees off the shortest course's heading (its sine; its cosine is
/// the square root of three over two) to a point this far out, metres, so they part near both ports; one longer than
/// the shortest by more than this share is left out.
const TURN_SINE: f64 = 0.5;
const TURN_OUT_M: f64 = 100_000.0;
const LONGEST: f64 = 1.3;
/// A roadstead lies this far out to sea from its port's nearest coast, metres, and farther if it must be.
pub const ROADSTEAD_OUT_M: f64 = 3_000.0;
/// A roadstead stays at least this clear of every coast, metres.
pub const ROADSTEAD_CLEAR_M: f64 = 1_000.0;
/// How far a roadstead moves out each time it is not yet clear, metres.
pub const ROADSTEAD_STEP_M: f64 = 500.0;
/// A course's ships lie at, and leave from, berths of its own off each port's roadstead, square to its last leg there:
/// its arrivals this far to starboard of the roadstead, its departures as far to the other side, metres, so no two lie
/// together, none lies where another sets out, and the roadstead itself, where a player's new ship puts in, is left
/// clear. A berth that would come within BERTH_APART_M of another course's at that port moves out by BERTH_STEP_M, up
/// to BERTH_LEVELS places out, all within the roadstead's ROADSTEAD_CLEAR_M of open water.
pub const BERTH_M: f64 = 300.0;
pub const BERTH_STEP_M: f64 = 200.0;
pub const BERTH_APART_M: f64 = 200.0;
const BERTH_LEVELS: u32 = 4;
/// The sea mask the routes are planned on: cells this wide, metres.
pub const MASK_CELL_M: f64 = 5_000.0;
/// A mask cell is open sea when its middle is at least this clear of every coast, metres.
pub const MASK_CLEAR_M: f64 = 3_000.0;
/// Every leg stays more than this clear of every coast and isle, metres, so a hull drawn on it stays off the land.
pub const LEG_CLEAR_M: f64 = 800.0;

/// The bits of a ship's id below its departure number: its route in bits 1 to 7, its direction in bit 0.
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

/// A course between two ports: its path from the first port's roadstead to the second's, in whole metres, when its
/// first ships leave, and the two ways its ships sail it, berth to berth.
#[derive(Debug, Clone, PartialEq)]
pub struct Route {
    /// Indices into the ports the traffic was made with.
    pub from_port: usize,
    pub to_port: usize,
    pub path: Vec<Point>,
    pub length_m: f64,
    /// World time its departure 0 leaves, seconds: each course of a pair a share of the gap after the one before, so
    /// a port's ships leave on its courses in turn.
    pub start_s: f64,
    /// How its ships sail it: from the first port (direction 0), then back from the second (direction 1).
    pub ways: [Way; 2],
}

impl Route {
    fn new(from_port: usize, to_port: usize, path: Vec<Point>, start_s: f64) -> Self {
        let back: Vec<Point> = path.iter().rev().copied().collect();
        let ways = [Way::new(path.clone()), Way::new(back)];
        Self { from_port, to_port, length_m: ways[0].length_m, start_s, path, ways }
    }
}

/// One way a course is sailed: from the berth its ships leave at, along the course, to the berth they lie at, in whole
/// metres. Each end is a berth of the course's own off its port's roadstead (`berths`), never the roadstead itself.
#[derive(Debug, Clone, PartialEq)]
pub struct Way {
    pub path: Vec<Point>,
    pub length_m: f64,
    /// How far along the path each of its points lies, metres.
    along: Vec<f64>,
}

impl Way {
    fn new(path: Vec<Point>) -> Self {
        let mut along = vec![0.0];
        for leg in path.windows(2) {
            let (dx, dy) = ((leg[1].x - leg[0].x) as f64, (leg[1].y - leg[0].y) as f64);
            along.push(along[along.len() - 1] + (dx * dx + dy * dy).sqrt());
        }
        Self { length_m: along[along.len() - 1], path, along }
    }

    fn corner(&self, index: usize) -> [f64; 2] {
        [self.path[index].x as f64, self.path[index].y as f64]
    }

    /// The point `distance` metres along the path from its start, and the unit way the path runs there; at its end,
    /// the berth itself.
    fn at(&self, distance: f64) -> ([f64; 2], [f64; 2]) {
        let leg = self.along.partition_point(|&along| along <= distance).clamp(1, self.path.len() - 1) - 1;
        let (from, to) = (self.corner(leg), self.corner(leg + 1));
        let length = self.along[leg + 1] - self.along[leg];
        let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        if distance >= self.length_m {
            return (to, way);
        }
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
    /// Its departure number, route and direction: `n << 8 | route << 1 | direction`.
    pub id: u64,
    pub route: usize,
    /// Indices into the ports the traffic was made with.
    pub from_port: usize,
    pub to_port: usize,
    /// 0 sloop, 1 schooner, 2 brig, 3 frigate.
    pub hull: u8,
    pub position: [f64; 2],
    /// The unit way it sails, along its leg.
    pub direction: [f64; 2],
    /// How far it has sailed, metres.
    pub progress_m: f64,
    /// Its way's length, berth to berth, metres.
    pub length_m: f64,
}

/// A ship's id from its route, its direction (0 from the route's first port, 1 back) and its departure number.
#[must_use]
pub fn ship_id(route: usize, direction: u8, departure: u64) -> u64 {
    debug_assert!(route as u64 <= ROUTE_BITS, "a route number fits in its seven bits");
    (departure << DEPARTURE_SHIFT) | ((route as u64) << 1) | u64::from(direction & 1)
}

/// A ship's hull from a fixed hash of its id: a sloop four times in ten, a schooner three, a brig two, a frigate one.
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
    /// The ports `roadsteads` keeps, then up to three courses between every pair of them, first with second, first
    /// with third, second with third: the shortest, and one to either side, leaving each port 30 degrees off the
    /// shortest's heading to the clear water TURN_OUT_M out, each stretch planned round land as the shortest is, so
    /// ships leaving a port head different ways. A pair no path joins gets none; a side course no clear water makes,
    /// or LONGEST times the shortest's length, is left out. The courses' departures are staggered across all of them,
    /// so ships on two courses that share a stretch out of a port never leave it together.
    #[must_use]
    pub fn new(layout: &Layout, waters: &Waters, ports: &[Port]) -> Self {
        let (kept, roadsteads) = Self::roadsteads(layout, waters, ports);
        let land = routes::Land::new(layout);
        let mask = routes::Mask::new(waters);
        let mut planned = Vec::new();
        for from in 0..kept.len() {
            for to in from + 1..kept.len() {
                let (start, end) = (roadsteads[from], roadsteads[to]);
                let Some(shortest) = mask.route(&land, start, end) else { continue };
                // The way from `from` toward `toward` turned by the angle whose sine is `sine`, TURN_OUT_M out.
                let out = |from: Point, toward: Point, sine: f64| {
                    let (x, y) = ((toward.x - from.x) as f64, (toward.y - from.y) as f64);
                    let (length, cosine) = ((x * x + y * y).sqrt(), 3.0_f64.sqrt() / 2.0);
                    let (x, y) = ((x * cosine - y * sine) / length, (x * sine + y * cosine) / length);
                    let at =
                        Point::new(from.x + (x * TURN_OUT_M).round() as i64, from.y + (y * TURN_OUT_M).round() as i64);
                    mask.clear_near(at)
                };
                let last = shortest.len() - 1;
                let length = |path: &[Point]| Route::new(from, to, path.to_vec(), 0.0).length_m;
                let beside = [-TURN_SINE, TURN_SINE].into_iter().filter_map(|turn| {
                    // Turned one way leaving the first port and the other arriving, the course keeps to one side.
                    let (near, far) = (out(start, shortest[1], turn)?, out(end, shortest[last - 1], -turn)?);
                    let mut path = vec![start];
                    for (from, to) in [(start, near), (near, far), (far, end)] {
                        path.extend(&mask.route(&land, from, to)?[1..]);
                    }
                    (length(&path) <= LONGEST * length(&shortest)).then_some(path)
                });
                let beside: Vec<Vec<Point>> = beside.collect();
                let courses: Vec<Vec<Point>> = std::iter::once(shortest).chain(beside).collect();
                planned.extend(courses.into_iter().map(|path| Route::new(from, to, path, 0.0)));
            }
        }
        let count = planned.len() as f64;
        for (index, route) in planned.iter_mut().enumerate() {
            route.start_s = DEPARTURE_EVERY_S * index as f64 / count;
        }
        routes::berth(&mut planned, &roadsteads);
        Self { ports: kept, routes: planned, roadsteads }
    }

    /// Keeps the first port of each id that is a port city (`ports::is_main_port`), on a continent the layout holds and
    /// with a clear roadstead, in the order given, with its roadstead; no route is planned.
    #[must_use]
    pub fn roadsteads(layout: &Layout, waters: &Waters, ports: &[Port]) -> (Vec<Port>, Vec<Point>) {
        let continent_of = |port: &Port| layout.continents.iter().position(|continent| continent.id == port.continent);
        ports
            .iter()
            .enumerate()
            .filter(|&(index, port)| {
                is_main_port(&port.id) && ports[..index].iter().all(|earlier| earlier.id != port.id)
            })
            .map(|(_, port)| port)
            .filter_map(|port| Some((port.clone(), routes::roadstead(waters, continent_of(port)?, port.centre)?)))
            .unzip()
    }

    /// The ship with this id at this world time; none if it has not left yet, has lain its `DWELL_S` at the end, or
    /// never sails. Arrived, it lies at its berth at the way's end, heading as it came in.
    #[must_use]
    pub fn ship(&self, id: u64, time_s: f64) -> Option<TrafficShip> {
        let direction = (id & 1) as u8;
        let route_index = ((id >> 1) & ROUTE_BITS) as usize;
        let route = self.routes.get(route_index)?;
        let way = &route.ways[usize::from(direction)];
        let since = time_s - route.start_s - (id >> DEPARTURE_SHIFT) as f64 * DEPARTURE_EVERY_S;
        if !(0.0..way.length_m / SPEED_M_S + DWELL_S).contains(&since) {
            return None;
        }
        let sailed = (SPEED_M_S * since).min(way.length_m);
        let (position, heading) = way.at(sailed);
        let (from_port, to_port) =
            if direction == 0 { (route.from_port, route.to_port) } else { (route.to_port, route.from_port) };
        Some(TrafficShip {
            id,
            route: route_index,
            from_port,
            to_port,
            hull: hull_of(id),
            position,
            direction: heading,
            progress_m: sailed,
            length_m: way.length_m,
        })
    }

    /// Every ship within `radius_m` of `centre` at this world time, by id. Per way, the stretches of its path within
    /// the radius give the distances sailed that put a ship there, and those give the departures: never a walk over
    /// every departure since 1970. Each candidate is then placed and judged exactly, as `ship` places it. A time or
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
            let time_s = time_s - route.start_s;
            for (direction, way) in (0..2_u8).zip(&route.ways) {
                for [low, high] in way.stretches_near(centre, radius_m) {
                    // A metre either side, so rounding never loses a ship at the edge; the exact judging below drops
                    // any that fall outside.
                    // A stretch reaching the way's end also holds the ships lying there.
                    let lying = if high + 1.0 >= way.length_m { DWELL_S } else { 0.0 };
                    let first = ((time_s - (high + 1.0) / SPEED_M_S - lying) / DEPARTURE_EVERY_S).ceil().max(0.0);
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
