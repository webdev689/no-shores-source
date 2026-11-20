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
        let newest = (time_s / DEPARTURE_EVERY_S).floor() as u64;
        let oldest = ((time_s - route.length_m / SPEED_M_S - DWELL_S) / DEPARTURE_EVERY_S).floor().max(0.0) as u64;
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
    let joined: Vec<[usize; 2]> = traffic.routes.iter().map(|route| [route.from_port, route.to_port]).collect();
    assert_eq!(joined, [[0, 1], [0, 2], [1, 2]]);
    for port in 0..3 {
        let serving = joined.iter().filter(|pair| pair.contains(&port)).count();
        assert_eq!(serving, 2, "{} trades with both others", traffic.ports[port].name);
    }
    for route in &traffic.routes {
        let names = (&traffic.ports[route.from_port].name, &traffic.ports[route.to_port].name);
        eprintln!("{} to {}: {:.1} km, {} legs", names.0, names.1, route.length_m / 1_000.0, route.path.len() - 1);
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
    assert_eq!(rerouted.routes.len(), 3);
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
    assert_eq!(traffic.routes.len(), 1);
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
fn a_ship_sails_five_metres_a_second_lies_at_its_destination_and_is_then_gone() {
    let (_, _, traffic) = world();
    let route = &traffic.routes[1];
    let departure = 1_500_000_u64;
    let left = departure as f64 * DEPARTURE_EVERY_S;
    for direction in 0..2 {
        let id = ship_id(1, direction, departure);
        assert_eq!(traffic.ship(id, left - 0.5), None, "not yet left");
        let start = traffic.ship(id, left).unwrap();
        let start_port = if direction == 0 { route.from_port } else { route.to_port };
        let roadstead = traffic.roadsteads[start_port];
        assert_eq!(start.position, [roadstead.x as f64, roadstead.y as f64]);
        let later = traffic.ship(id, left + 100.0).unwrap();
        assert!((later.progress_m - start.progress_m - 500.0).abs() < 1e-6);
        let moved = {
            let (dx, dy) = (later.position[0] - start.position[0], later.position[1] - start.position[1]);
            (dx * dx + dy * dy).sqrt()
        };
        assert!(moved <= 500.0 + 1e-6 && moved > 0.0);
        let arrives = left + route.length_m / SPEED_M_S;
        let end_port = if direction == 0 { route.to_port } else { route.from_port };
        let end = traffic.roadsteads[end_port];
        for lying in [arrives, arrives + DWELL_S / 2.0, arrives + DWELL_S - 1.0] {
            let there = traffic.ship(id, lying).unwrap();
            assert_eq!(there.position, [end.x as f64, end.y as f64], "it lies at its destination's roadstead");
            assert_eq!(there.progress_m, route.length_m);
        }
        assert_eq!(traffic.ship(id, arrives + DWELL_S), None, "gone once it has lain its while");
        let length = (start.direction[0] * start.direction[0] + start.direction[1] * start.direction[1]).sqrt();
        assert!((length - 1.0).abs() < 1e-12);
    }
}

#[test]
fn about_one_ship_lies_at_each_port_roadstead_at_any_moment() {
    let (_, _, traffic) = world();
    let start = 1_795_000_000.0;
    let samples = 240;
    for (port, roadstead) in traffic.roadsteads.iter().enumerate() {
        let centre = [roadstead.x as f64, roadstead.y as f64];
        let mut lying = 0;
        for step in 0..samples {
            let time = start + f64::from(step) * DEPARTURE_EVERY_S / f64::from(samples);
            let here = traffic.ships_near(centre, 1.0, time);
            let arrived = here.iter().filter(|ship| ship.to_port == port && ship.progress_m == ship.length_m).count();
            assert!(arrived <= 2, "port {port}: {arrived} lie there at {time}");
            lying += arrived;
        }
        let mean = lying as f64 / f64::from(samples);
        assert!((mean - 1.0).abs() < 0.05, "port {port}: {mean} ships lie there on the mean");
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
    assert_eq!(traffic.routes.len(), 3);
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
