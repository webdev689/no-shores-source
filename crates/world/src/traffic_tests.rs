use super::routes::{coast_edges, leg_clear};
use super::*;
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
        let oldest = ((time_s - route.length_m / SPEED_M_S) / DEPARTURE_EVERY_S).floor().max(0.0) as u64;
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
fn a_route_joins_each_pair_of_bordering_waters() {
    let (layout, waters, traffic) = world();
    assert_eq!(traffic.routes.len(), 17);
    let index = |port: usize| {
        layout.continents.iter().position(|continent| continent.id == traffic.ports[port].continent).unwrap()
    };
    let joined: Vec<[usize; 2]> =
        traffic.routes.iter().map(|route| [index(route.from_port), index(route.to_port)]).collect();
    assert_eq!(joined, waters.borders());
    for route in &traffic.routes {
        let names = (&traffic.ports[route.from_port].name, &traffic.ports[route.to_port].name);
        eprintln!("{} to {}: {:.0} km, {} legs", names.0, names.1, route.length_m / 1_000.0, route.path.len() - 1);
    }
}

#[test]
fn no_leg_touches_land() {
    let (layout, _, traffic) = world();
    let coast = coast_edges(layout);
    for route in &traffic.routes {
        for leg in route.path.windows(2) {
            assert!(leg_clear(&coast, leg[0], leg[1]), "{:?} to {:?} touches land", leg[0], leg[1]);
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
fn a_ship_sails_five_metres_a_second_and_is_gone_once_she_arrives() {
    let (_, _, traffic) = world();
    let route = &traffic.routes[3];
    let departure = 1_500_000_u64;
    let left = departure as f64 * DEPARTURE_EVERY_S;
    for direction in 0..2 {
        let id = ship_id(3, direction, departure);
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
        assert!(traffic.ship(id, arrives - 1.0).is_some());
        assert_eq!(traffic.ship(id, arrives), None, "gone on arrival");
        let length = (start.direction[0] * start.direction[0] + start.direction[1] * start.direction[1]).sqrt();
        assert!((length - 1.0).abs() < 1e-12);
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
