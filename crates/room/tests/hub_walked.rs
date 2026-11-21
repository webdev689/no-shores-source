//! Overlook's hub as the city plans it and the bake cuts it, walked by the movement rules: from the arrivals through
//! the ranges' passages into the side courts, along the Beacon Walk, up the portico and through the great door into
//! the Hall of the Arts, to every keeper's counter; and every keeper, Shape's every place and every arrival standing
//! on the floor, clear, inside the hub's ring.

use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;
use std::sync::OnceLock;

/// How near a waypoint a body counts as there, metres.
const THERE_M: f64 = 1.2;

struct Hub {
    plan: city::Plan,
    floor: Floor,
    blocks: Blocks,
    boxes: Vec<[f64; 6]>,
}

impl Hub {
    /// A point `toward` metres seaward of the plaza's middle and `across` metres across it.
    fn at(&self, toward: f64, across: f64) -> [f64; 2] {
        let [west, north, east, south] = self.plan.social.bounds;
        let middle = [(west + east) / 2.0, (north + south) / 2.0];
        // Overlook looks north: seaward is -y, across is +x.
        [middle[0] + across, middle[1] - toward]
    }
}

fn hub() -> &'static Hub {
    static HUB: OnceLock<Hub> = OnceLock::new();
    HUB.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let id = "continent-1";
        let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = layout.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
        let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("the continent generates");
        let plan = city::settle(&mut landmass, &blocks).expect("its city settles").expect("Saltmere has a city");
        let nodes = bake::nodes_of(&continent, edits, &blocks, &builders).expect("the continent bakes");
        let node = nodes.into_iter().find(|node| node.id == "overlook-social").expect("Overlook's hub bakes");
        Hub {
            plan,
            floor: Floor::Land(Box::new(node.ground.clone())),
            blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
            boxes: node.boxes,
        }
    })
}

/// A body walked from `from` through each waypoint in turn; where it ends and how many waypoints it passed, stopping
/// where it would climb rather than walk.
fn walked(hub: &Hub, from: [f64; 2], waypoints: &[[f64; 2]], seconds: f64) -> (movement::Body, usize) {
    let mut body = standing_on(&hub.floor, &hub.blocks, from[0], from[1]);
    let mut next = 0;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < THERE_M {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &hub.blocks, &hub.floor, TICK_SECONDS);
        if matches!(body.mode, movement::Mode::Climb | movement::Mode::Hang | movement::Mode::Mantle) {
            break;
        }
    }
    (body, next)
}

/// How far a point stands from the nearest box reaching from the floor up past a body's knee, metres.
fn clear_of_boxes(hub: &Hub, point: [f64; 2], floor: f64) -> f64 {
    hub.boxes
        .iter()
        .filter(|&&[_, _, _, _, top, bottom]| top > floor + 0.5 && bottom < floor + 1.8)
        .map(|&[west, north, east, south, _, _]| {
            let dx = (west - point[0]).max(point[0] - east).max(0.0);
            let dy = (north - point[1]).max(point[1] - south).max(0.0);
            libm::hypot(dx, dy)
        })
        .fold(f64::INFINITY, f64::min)
}

#[test]
fn every_keeper_stands_in_a_stall_of_their_own_behind_its_counter_inside_the_ring() {
    let hub = hub();
    let social = &hub.plan.social;
    let kinds: Vec<_> = social.stations.iter().map(|station| station.kind).collect();
    assert_eq!(social.stations.len(), 12, "eleven kinds of keeper, the vault twice: {kinds:?}");
    for station in &social.stations {
        let apart = libm::hypot(station.counter[0] - station.keeper[0], station.counter[1] - station.keeper[1]);
        assert!((0.6..=4.0).contains(&apart), "{:?}'s keeper stands {apart:.2} m from the counter", station.kind);
        assert!(room_inside(&social.ring, station.counter), "{:?}'s counter is in the hub", station.kind);
    }
}

#[test]
fn every_arrival_and_every_place_of_shape_stands_clear_inside_the_ring() {
    let hub = hub();
    let social = &hub.plan.social;
    assert_eq!(social.visitor_spots.len(), 8, "Shape keeps eight places");
    for point in social.spawns.iter().chain(&social.visitor_spots) {
        assert!(room_inside(&social.ring, *point), "{point:?} is in the hub");
        let clear = clear_of_boxes(hub, *point, social.level);
        assert!(clear >= 1.0, "{point:?} stands {clear:.2} m from a solid");
    }
}

#[test]
fn a_body_walks_from_the_arrivals_through_each_range_into_the_side_courts() {
    let hub = hub();
    let from = hub.plan.social.spawns[1];
    for side in [-1.0, 1.0] {
        for passage in [18.0, -18.0] {
            // Along the hub's ways, which the courts' pieces keep clear: down the court's side to the passage.
            let down = [hub.at(54.0, side * 25.0), hub.at(36.0, side * 30.0), hub.at(8.0, side * 30.0)];
            let turn = if passage > 0.0 { None } else { Some(hub.at(-16.0, side * 36.0)) };
            let through = [hub.at(passage, side * 50.0), hub.at(passage, side * 70.0), hub.at(passage, side * 75.0)];
            let path: Vec<[f64; 2]> = down.into_iter().chain(turn).chain(through).collect();
            let (body, passed) = walked(hub, from, &path, 60.0);
            assert_eq!(
                passed,
                path.len(),
                "through the passage at {passage} on the {side} side: stops at {:.1},{:.1}",
                body.x,
                body.y
            );
        }
    }
}

#[test]
fn a_body_walks_up_the_portico_through_the_great_door_into_the_hall() {
    let hub = hub();
    let from = hub.plan.social.spawns[1];
    // Along the hub's ways, which the courts' pieces keep clear: round the obelisk and down the court to the portico.
    let path = [
        hub.at(36.0, 0.0),
        hub.at(21.0, 0.0),
        hub.at(8.0, 13.0),
        hub.at(-5.0, 0.0),
        hub.at(-30.0, 0.0),
        hub.at(-52.0, 0.0),
        hub.at(-80.0, 0.0),
        hub.at(-100.0, 0.0),
        hub.at(-115.0, 0.0),
        hub.at(-121.0, -8.0),
        hub.at(-130.0, -8.0),
    ];
    let (body, passed) = walked(hub, from, &path, 90.0);
    assert_eq!(passed, path.len(), "into the Hall: stops at {:.1},{:.1} at {:.2} m", body.x, body.y, body.z);
    assert!((body.z - hub.plan.social.level).abs() < 0.1, "on the Hall's floor");
}

fn room_inside(ring: &[[f64; 2]], point: [f64; 2]) -> bool {
    reach::inside(ring, point[0], point[1])
}
