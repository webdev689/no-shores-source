use super::routes::Land;
use super::*;
use crate::geometry::Point;
use crate::layout::{Continent, Isle};
use crate::waters::tests::{Seeded, world_layout};
use std::sync::OnceLock;

/// The nine ports as the land files name their cities.
pub(crate) fn world_ports() -> Vec<Port> {
    (1..=9)
        .map(|n| {
            let id = format!("continent-{n}");
            let path = format!("{}/../../content/world/land/{id}.json", env!("CARGO_MANIFEST_DIR"));
            let file: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            let city = &file["city"];
            Port {
                id: city["id"].as_str().unwrap().to_owned(),
                name: city["name"].as_str().unwrap().to_owned(),
                continent: id,
                centre: [city["centre"][0].as_f64().unwrap(), city["centre"][1].as_f64().unwrap()],
            }
        })
        .collect()
}

fn world() -> &'static (Layout, Waters, Traffic) {
    static WORLD: OnceLock<(Layout, Waters, Traffic)> = OnceLock::new();
    WORLD.get_or_init(|| {
        let layout = world_layout();
        let waters = Waters::new(&layout);
        let traffic = Traffic::new(&layout, &waters, &world_ports());
        (layout, waters, traffic)
    })
}

/// Every live ship within the radius, found by placing each one sailing at this time.
fn brute_force(traffic: &Traffic, centre: [f64; 2], radius_m: f64, time_s: f64) -> Vec<u64> {
    let mut ids = Vec::new();
    for (route_index, route) in traffic.routes.iter().enumerate() {
        let since = time_s - route.start_s;
        let newest = (since / DEPARTURE_EVERY_S).floor() as u64;
        let longest = route.ways.iter().map(|way| way.length_m).fold(0.0, f64::max);
        let oldest = ((since - longest / SPEED_M_S - DWELL_S) / DEPARTURE_EVERY_S).floor().max(0.0) as u64;
        for departure in oldest..=newest {
            for direction in 0..2 {
                let Some(ship) = traffic.ship(ship_id(route_index, direction, departure), time_s) else { continue };
                let (dx, dy) = (ship.position[0] - centre[0], ship.position[1] - centre[1]);
                if dx * dx + dy * dy <= radius_m * radius_m {
                    ids.push(ship.id);
                }
            }
        }
    }
    ids.sort_unstable();
    ids
}

#[test]
fn a_route_joins_every_pair_of_the_three_port_cities() {
    let (_, _, traffic) = world();
    let ids: Vec<&str> = traffic.ports.iter().map(|port| port.id.as_str()).collect();
    assert_eq!(ids, crate::ports::MAIN_PORTS, "the desolate cities are no ports");
    let mut joined: Vec<[usize; 2]> = traffic.routes.iter().map(|route| [route.from_port, route.to_port]).collect();
    joined.dedup();
    assert_eq!(joined, [[0, 1], [0, 2], [1, 2]]);
    for pair in &joined {
        let courses = traffic.routes.iter().filter(|route| [route.from_port, route.to_port] == *pair).count();
        assert!((2..=3).contains(&courses), "{pair:?} has {courses} courses");
    }
    for port in 0..3 {
        let serving = joined.iter().filter(|pair| pair.contains(&port)).count();
        assert_eq!(serving, 2, "{} trades with both others", traffic.ports[port].name);
    }
}

#[test]
fn every_leg_keeps_clear_of_land() {
    let (layout, waters, traffic) = world();
    let land = Land::new(layout);
    for route in &traffic.routes {
        for leg in route.path.windows(2) {
            assert!(land.leg_clear(leg[0], leg[1]), "{:?} to {:?} comes near land", leg[0], leg[1]);
            let (from, to) = ([leg[0].x as f64, leg[0].y as f64], [leg[1].x as f64, leg[1].y as f64]);
            let steps = ((to[0] - from[0]).abs() + (to[1] - from[1]).abs()) / 100.0;
            for step in 0..=steps as usize {
                let along = step as f64 / steps;
                let point = [from[0] + along * (to[0] - from[0]), from[1] + along * (to[1] - from[1])];
                assert!(waters.clearance(point) > LEG_CLEAR_M, "{point:?} lies within 800 m of land");
            }
        }
    }
}

#[test]
fn a_route_sails_round_an_isle_in_its_way() {
    let (layout, _, traffic) = world();
    let route = &traffic.routes[0];
    let (from, to) = (route.path[0], route.path[1]);
    let middle = Point::new((from.x + to.x) / 2, (from.y + to.y) / 2);
    let mut with_isle = layout.clone();
    with_isle.isles.push(Isle { id: "rock".to_owned(), centre: middle, radius_m: 20_000, seed: 1, climate: None });
    let waters = Waters::new(&with_isle);
    let centre = [middle.x as f64, middle.y as f64];
    assert_eq!(waters.water_at(centre), None, "an isle is land");
    assert!((waters.clearance([centre[0] + 25_000.0, centre[1]]) - 5_000.0).abs() < 1.0, "and has a coast");
    let rerouted = Traffic::new(&with_isle, &waters, &world_ports());
    assert_eq!(rerouted.routes.len(), traffic.routes.len());
    assert_ne!(rerouted.routes[0].path, route.path, "the route changes for the isle");
    let land = Land::new(&with_isle);
    for leg in rerouted.routes.iter().flat_map(|route| route.path.windows(2)) {
        assert!(land.leg_clear(leg[0], leg[1]));
    }
}

#[test]
fn a_port_with_no_clear_roadstead_inside_the_frame_is_skipped() {
    let square = |west: i64, north: i64| {
        let side = 400_000;
        vec![
            Point::new(west, north),
            Point::new(west + side, north),
            Point::new(west + side, north + side),
            Point::new(west, north + side),
        ]
    };
    let continent = |id: &str, outline| Continent { id: id.to_owned(), outline, climate: None };
    let layout = Layout {
        continents: vec![
            continent("continent-1", square(0, 1_000_000)),
            continent("continent-4", square(2_000_000, 1_000_000)),
            continent("continent-9", square(3_000_000, 1_000_000)),
        ],
        isles: Vec::new(),
    };
    let port = |id: &str, continent: &str, centre| Port {
        id: id.to_owned(),
        name: id.to_owned(),
        continent: continent.to_owned(),
        centre,
    };
    let ports = [
        port("overlook", "continent-1", [10_000.0, 1_200_000.0]),
        port("sunspire", "continent-4", [2_390_000.0, 1_200_000.0]),
        port("rimeholt", "continent-9", [3_010_000.0, 1_200_000.0]),
        port("goldreach", "continent-4", [2_200_000.0, 1_390_000.0]),
    ];
    let traffic = Traffic::new(&layout, &Waters::new(&layout), &ports);
    let kept: Vec<&str> = traffic.ports.iter().map(|port| port.id.as_str()).collect();
    assert_eq!(kept, ["sunspire", "rimeholt"], "Overlook's way out leaves the frame; Goldreach is no port");
    assert!(traffic.routes.iter().all(|route| [route.from_port, route.to_port] == [0, 1]), "one pair");
    assert_eq!(traffic.routes.len(), 3, "its courses");
}

#[test]
fn a_way_off_a_berth_keeps_as_clear_of_land_as_the_lanes() {
    let (_, waters, traffic) = world();
    for way in traffic.routes.iter().flat_map(|route| &route.ways) {
        let last = way.path.len() - 1;
        for leg in [[way.path[0], way.path[1]], [way.path[last - 1], way.path[last]]] {
            let (from, to) = ([leg[0].x as f64, leg[0].y as f64], [leg[1].x as f64, leg[1].y as f64]);
            let steps = ((to[0] - from[0]).abs() + (to[1] - from[1]).abs()) / 50.0;
            for step in 0..=steps as usize {
                let along = step as f64 / steps;
                let point = [from[0] + along * (to[0] - from[0]), from[1] + along * (to[1] - from[1])];
                assert!(waters.clearance(point) > LEG_CLEAR_M, "{point:?} off a berth lies within 800 m of land");
            }
        }
    }
}

#[test]
fn each_route_runs_between_its_ports_roadsteads() {
    let (layout, waters, traffic) = world();
    for (port, &roadstead) in traffic.roadsteads.iter().enumerate() {
        let point = [roadstead.x as f64, roadstead.y as f64];
        assert!(waters.clearance(point) >= ROADSTEAD_CLEAR_M, "{} is clear of every coast", traffic.ports[port].name);
        let own = layout.continents.iter().position(|continent| continent.id == traffic.ports[port].continent);
        assert_eq!(
            waters.water_at(point).map(|water| water.continent),
            own,
            "{} lies in its own water",
            traffic.ports[port].name
        );
        let (dx, dy) = (point[0] - traffic.ports[port].centre[0], point[1] - traffic.ports[port].centre[1]);
        assert!((dx * dx + dy * dy).sqrt() < 100_000.0, "{} lies off its city", traffic.ports[port].name);
    }
    for route in &traffic.routes {
        assert_eq!(route.path.first(), Some(&traffic.roadsteads[route.from_port]));
        assert_eq!(route.path.last(), Some(&traffic.roadsteads[route.to_port]));
    }
}

#[test]
fn the_traffic_is_the_same_every_time() {
    let (layout, waters, traffic) = world();
    let again = Traffic::new(layout, waters, &world_ports());
    assert_eq!(again.routes, traffic.routes);
    let time = 1_795_000_000.0;
    assert_eq!(
        again.ships_near([2_800_000.0, 1_300_000.0], 400_000.0, time),
        traffic.ships_near([2_800_000.0, 1_300_000.0], 400_000.0, time)
    );
}

#[test]
fn ships_near_finds_exactly_the_live_ships_in_the_radius() {
    let (_, _, traffic) = world();
    let mut random = Seeded::new(5);
    let mut found = 0;
    for _ in 0..200 {
        let route = &traffic.routes[(random.next() * traffic.routes.len() as f64) as usize];
        let corner = route.path[(random.next() * route.path.len() as f64) as usize];
        let centre =
            [corner.x as f64 + (random.next() - 0.5) * 40_000.0, corner.y as f64 + (random.next() - 0.5) * 40_000.0];
        let radius = [5_000.0, 30_000.0, 250_000.0][(random.next() * 3.0) as usize];
        let time = 1_700_000_000.0 + random.next() * 200_000_000.0;
        let near: Vec<u64> = traffic.ships_near(centre, radius, time).iter().map(|ship| ship.id).collect();
        assert_eq!(near, brute_force(traffic, centre, radius, time), "round {centre:?} {radius} at {time}");
        found += near.len();
    }
    assert!(found > 200, "the check saw ships: {found}");
}

#[test]
fn a_ship_sails_sixty_metres_a_second_lies_at_its_destination_and_is_then_gone() {
    let (_, _, traffic) = world();
    let route = &traffic.routes[1];
    let departure = 600_000_u64;
    let left = route.start_s + departure as f64 * DEPARTURE_EVERY_S;
    for direction in 0..2 {
        let id = ship_id(1, direction, departure);
        let way = &route.ways[direction as usize];
        assert_eq!(traffic.ship(id, left - 0.5), None, "not yet left");
        let start = traffic.ship(id, left).unwrap();
        let start_port = if direction == 0 { route.from_port } else { route.to_port };
        assert_eq!(start.position, [way.path[0].x as f64, way.path[0].y as f64], "it leaves from its berth");
        assert!(off_roadstead(traffic, start_port, start.position) >= BERTH_M - 1.0, "off the roadstead");
        let later = traffic.ship(id, left + 100.0).unwrap();
        assert!((later.progress_m - start.progress_m - 6_000.0).abs() < 1e-6);
        let moved = {
            let (dx, dy) = (later.position[0] - start.position[0], later.position[1] - start.position[1]);
            (dx * dx + dy * dy).sqrt()
        };
        assert!(moved <= 6_000.0 + 1e-6 && moved > 0.0);
        let arrives = left + way.length_m / SPEED_M_S;
        let end_port = if direction == 0 { route.to_port } else { route.from_port };
        let berth = way.path[way.path.len() - 1];
        for lying in [arrives + 0.001, arrives + DWELL_S / 2.0, arrives + DWELL_S - 1.0] {
            let there = traffic.ship(id, lying).unwrap();
            assert_eq!(there.position, [berth.x as f64, berth.y as f64], "it lies at its berth");
            assert!(off_roadstead(traffic, end_port, there.position) >= BERTH_M - 1.0, "off the roadstead");
            assert_eq!(there.progress_m, way.length_m);
        }
        assert_eq!(traffic.ship(id, arrives + DWELL_S + 0.001), None, "gone once it has lain its while");
        let length = (start.direction[0] * start.direction[0] + start.direction[1] * start.direction[1]).sqrt();
        assert!((length - 1.0).abs() < 1e-12);
    }
}

#[test]
fn about_five_ships_are_in_view_of_overlook_and_leave_it_on_different_headings() {
    let (_, _, traffic) = world();
    let overlook = traffic.ports.iter().position(|port| port.id == "overlook").unwrap();
    let roadstead = traffic.roadsteads[overlook];
    let centre = [roadstead.x as f64, roadstead.y as f64];
    // A day's moments, each 86.4 s apart.
    let samples = 1_000;
    let seen: usize = (0..samples)
        .map(|step| traffic.ships_near(centre, 60_000.0, 1_795_000_000.0 + f64::from(step) * 86.4).len())
        .sum();
    let mean = seen as f64 / f64::from(samples);
    assert!((4.0..=6.0).contains(&mean), "{mean} ships within 60 km on the mean");
    // The way from Overlook's roadstead to where each of its courses lies 60 km out.
    let ways: Vec<[f64; 2]> = traffic
        .routes
        .iter()
        .filter(|route| route.from_port == overlook || route.to_port == overlook)
        .map(|route| {
            let out = if route.from_port == overlook { 60_000.0 } else { route.length_m - 60_000.0 };
            let (at, _) = route.ways[0].at(out);
            let (x, y) = (at[0] - centre[0], at[1] - centre[1]);
            let length = (x * x + y * y).sqrt();
            [x / length, y / length]
        })
        .collect();
    // Two ways within 5 degrees of each other: their cosine over 0.9962. Overlook's way out east is one narrow stretch
    // of sea, so two of its courses to Sunspire leave on one heading; no other two do.
    let mut alike = 0;
    for (index, one) in ways.iter().enumerate() {
        alike += ways[index + 1..].iter().filter(|two| one[0] * two[0] + one[1] * two[1] > 0.9962).count();
    }
    assert!(alike <= 1, "{alike} pairs of Overlook's {} courses leave on one heading: {ways:?}", ways.len());
}

#[test]
fn no_two_ships_sail_together_near_a_port() {
    let (_, _, traffic) = world();
    for (port, roadstead) in traffic.roadsteads.iter().enumerate() {
        let centre = [roadstead.x as f64, roadstead.y as f64];
        for step in 0..1_000 {
            let time = 1_795_000_000.0 + f64::from(step) * 86.4;
            let sailing: Vec<TrafficShip> = traffic
                .ships_near(centre, 60_000.0, time)
                .into_iter()
                .filter(|ship| ship.progress_m < ship.length_m)
                .collect();
            // Two ships sailing one way within 2 km of each other sail together: every course meets at the roadstead,
            // so ships coming and going pass nearer.
            for (index, one) in sailing.iter().enumerate() {
                for two in &sailing[index + 1..] {
                    let (dx, dy) = (one.position[0] - two.position[0], one.position[1] - two.position[1]);
                    let one_way = one.direction[0] * two.direction[0] + one.direction[1] * two.direction[1] > 0.9962;
                    let together = one_way && dx * dx + dy * dy < 2_000.0 * 2_000.0;
                    assert!(!together, "port {port}: {} and {} sail together at {time}", one.id, two.id);
                }
            }
        }
    }
}

/// How far a point lies from a port's roadstead, metres.
fn off_roadstead(traffic: &Traffic, port: usize, at: [f64; 2]) -> f64 {
    let roadstead = traffic.roadsteads[port];
    let (dx, dy) = (at[0] - roadstead.x as f64, at[1] - roadstead.y as f64);
    (dx * dx + dy * dy).sqrt()
}

#[test]
fn each_course_lies_and_leaves_at_berths_of_its_own_off_the_roadstead() {
    let (_, waters, traffic) = world();
    for (port, roadstead) in traffic.roadsteads.iter().enumerate() {
        let mut berths: Vec<[f64; 2]> = Vec::new();
        for route in traffic.routes.iter().filter(|route| route.from_port == port || route.to_port == port) {
            for (direction, way) in route.ways.iter().enumerate() {
                let leaves = (direction == 0) == (route.from_port == port);
                let end = if leaves { way.path[0] } else { way.path[way.path.len() - 1] };
                berths.push([end.x as f64, end.y as f64]);
            }
        }
        for (index, one) in berths.iter().enumerate() {
            let out = off_roadstead(traffic, port, *one);
            assert!((BERTH_M - 1.0..ROADSTEAD_CLEAR_M - 99.0).contains(&out), "port {port}: a berth {out} m out");
            assert!(waters.clearance(*one) > ROADSTEAD_CLEAR_M - out - 1.0, "port {port}: a berth in open water");
            for two in &berths[index + 1..] {
                let (dx, dy) = (one[0] - two[0], one[1] - two[1]);
                let apart = (dx * dx + dy * dy).sqrt();
                assert!(apart >= BERTH_APART_M - 2.0, "port {port} ({roadstead:?}): two berths {apart} m apart");
            }
        }
    }
}

#[test]
fn ships_at_a_port_lie_apart_and_clear_of_ships_passing_and_the_roadstead() {
    let (_, _, traffic) = world();
    // The least room round a lying ship, metres: two hulls as long as the sea's view draws one (75 m) side by side.
    let room = 150.0;
    for (port, roadstead) in traffic.roadsteads.iter().enumerate() {
        let centre = [roadstead.x as f64, roadstead.y as f64];
        let (mut lain, mut nearest_middle) = (0, f64::INFINITY);
        for step in 0..8_640 {
            let ships = traffic.ships_near(centre, 5_000.0, 1_795_000_000.0 + f64::from(step) * 10.0);
            for (index, one) in ships.iter().enumerate() {
                nearest_middle = nearest_middle.min(off_roadstead(traffic, port, one.position));
                if one.progress_m < one.length_m {
                    continue;
                }
                lain += 1;
                for two in ships.iter().enumerate().filter(|&(other, _)| other != index).map(|(_, two)| two) {
                    let (dx, dy) = (one.position[0] - two.position[0], one.position[1] - two.position[1]);
                    let apart = (dx * dx + dy * dy).sqrt();
                    assert!(apart >= room, "port {port}: {} lies {apart} m from {}", one.id, two.id);
                }
            }
        }
        assert!(lain > 1_000, "port {port}: ships lay there ({lain} moments)");
        assert!(nearest_middle >= BERTH_M * 0.75, "port {port}: a ship {nearest_middle} m from the roadstead");
    }
}

#[test]
fn hulls_come_in_their_shares() {
    let mut counts = [0_u32; 4];
    let total = 100_000;
    for departure in 0..total / 34 {
        for route in 0..17 {
            for direction in 0..2 {
                counts[usize::from(hull_of(ship_id(route, direction, departure)))] += 1;
            }
        }
    }
    let sum: u32 = counts.iter().sum();
    for (count, share) in counts.iter().zip([0.4, 0.3, 0.2, 0.1]) {
        assert!((f64::from(*count) / f64::from(sum) - share).abs() < 0.01, "{counts:?}");
    }
}

#[test]
fn a_time_that_is_no_number_finds_no_ship() {
    let (_, _, traffic) = world();
    for time in [f64::INFINITY, f64::NAN, 1e30] {
        assert!(traffic.ships_near([2_800_000.0, 1_300_000.0], 400_000.0, time).is_empty());
    }
    assert!(traffic.ships_near([2_800_000.0, 1_300_000.0], f64::INFINITY, 1_795_000_000.0).is_empty());
    assert!(
        traffic.ships_near([2_800_000.0, 1_300_000.0], -400_000.0, 1_795_000_000.0).is_empty(),
        "nor a negative radius"
    );
}

#[test]
fn a_port_listed_twice_sails_once() {
    let (layout, waters, _) = world();
    let mut ports = world_ports();
    ports.extend(world_ports());
    let traffic = Traffic::new(layout, waters, &ports);
    assert_eq!(traffic.ports.len(), 3);
    assert_eq!(traffic.routes, world().2.routes);
}

#[test]
fn the_nearest_port_by_sea_is_a_lookup_and_a_tie_goes_to_the_lower_port() {
    let text = r#"{ "continents": [{ "id": "far", "outline": [[4000000, 100000], [4010000, 100000], [4010000, 110000], [4000000, 110000]] }], "isles": [] }"#;
    let layout = crate::layout::parse(text).unwrap();
    let ports = [Point::new(102_500, 502_500), Point::new(302_500, 502_500)];
    let ways = SeaWays::new(&layout, &Waters::new(&layout), &ports);
    assert_eq!(ways.nearest(Point::new(202_500, 502_500)), Some(0), "twenty cells from each: the lower port");
    assert_eq!(ways.nearest(Point::new(207_500, 502_500)), Some(1));
    assert_eq!(ways.nearest(Point::new(100_000, 900_000)), Some(0));
}
