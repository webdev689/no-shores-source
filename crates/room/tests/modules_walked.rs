//! The Gullwing Vale's handcrafted modules (tools/modules) as the bake lays them, walked by the movement rules: up the
//! Old Stones' flights onto their upper tier, from the coven through the tunnel's mouth into the cavern and up the chamber's steps onto its shelf,
//! through the citadel's gate to its ward and its wall-walk, and over every stone bridge; and up every ledge's cliff
//! stair of Saltmere's three zones to the high place.

use city::solids::{Shape, Solid};
use movement::terrain::Terrain;
use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;
use std::sync::OnceLock;

/// How near a waypoint a body counts as there, metres.
const THERE_M: f64 = 1.2;

struct Vale {
    floor: Floor,
    blocks: Blocks,
    solids: Vec<Solid>,
    map: layout::spaces::Map,
}

/// Continent 1's layouts and node files as the bake makes them, once for every test.
fn laid_one() -> &'static (Vec<layout::Layout>, Vec<bake::NodeFile>) {
    static LAID: OnceLock<(Vec<layout::Layout>, Vec<bake::NodeFile>)> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let id = "continent-1";
        let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = layout.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
        let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("the continent generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("the continent bakes");
        (layouts, nodes)
    })
}

/// A zone of Saltmere as laid and baked: its ground, its boxes, its solids and its map.
fn zone(id: &str) -> Vale {
    let (layouts, nodes) = laid_one();
    let laid = layouts.iter().find(|laid| laid.id == id).expect("the zone lays out");
    let node = nodes.iter().find(|node| node.id == laid.id).expect("the node bakes");
    Vale {
        floor: Floor::Land(Box::new(node.ground.clone())),
        blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
        solids: laid.seating.solids.clone(),
        map: laid.map.clone(),
    }
}

fn vale() -> Vale {
    zone("gullwing-vale")
}

/// The first group's solid of the module of a name: the one standing its parts.
fn module_of<'a>(vale: &'a Vale, name: &str) -> &'a Solid {
    let number = city::modules::number_of(name).expect("the module is in the manifest");
    vale.solids
        .iter()
        .find(|solid| solid.shape == Shape::Module { module: number, group: 0 })
        .unwrap_or_else(|| panic!("the Vale stands {name}"))
}

/// A body walked from `from` through each waypoint in turn, steering at each tick toward the next; where it ends, and
/// how many waypoints it passed, stopping where it would climb rather than walk.
fn walked(vale: &Vale, from: [f64; 2], waypoints: &[[f64; 2]], seconds: f64) -> (movement::Body, usize) {
    let mut body = standing_on(&vale.floor, &vale.blocks, from[0], from[1]);
    let mut next = 0;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < THERE_M {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &vale.blocks, &vale.floor, TICK_SECONDS);
        // A body that climbs a face, or hangs or mantles, has not walked there: it stops short.
        if matches!(body.mode, movement::Mode::Climb | movement::Mode::Hang | movement::Mode::Mantle) {
            break;
        }
    }
    (body, next)
}

/// A point of a module's own frame in the world, on the ground plane.
fn at(solid: &Solid, [x, y]: [f64; 2]) -> [f64; 2] {
    let [east, south, _] = solid.place([x, y, 0.0]);
    [east, south]
}

#[test]
fn a_body_climbs_the_old_stones_by_their_east_and_west_flights_to_the_upper_tier() {
    let vale = vale();
    let stones = module_of(&vale, "old-stones");
    let module = &city::modules::all()[city::modules::number_of("old-stones").expect("named") as usize];
    for name in ["east", "west"] {
        let socket = module.sockets.iter().find(|socket| socket.name == name).expect("the socket");
        let [x, y] = [socket.at[0], socket.at[1]];
        let out = at(stones, [x + socket.facing[0] * 4.0, y + socket.facing[1] * 4.0]);
        // Up the lower tier's flight, across it and up the upper's, to the upper tier inside its edge.
        let inward = [-socket.facing[0], -socket.facing[1]];
        let upper = at(stones, [inward[0] * -8.0, inward[1] * -8.0]);
        let (body, passed) = walked(&vale, out, &[at(stones, [x, y]), upper], 40.0);
        assert!(
            passed == 2 && body.z >= stones.at[2] + 2.7,
            "from the {name} flight the body stops at {:.1},{:.1}, {:.2} m over the stones' foot",
            body.x - stones.at[0],
            body.y - stones.at[1],
            body.z - stones.at[2]
        );
    }
}

#[test]
fn a_body_walks_in_from_the_tunnel_and_up_the_chambers_steps_onto_its_shelf() {
    let vale = vale();
    let chamber = module_of(&vale, "cavern-chamber");
    let module = &city::modules::all()[city::modules::number_of("cavern-chamber").expect("named") as usize];
    let entry = module.sockets.iter().find(|socket| socket.name == "entry").expect("the entry");
    let out = at(chamber, [entry.at[0] + entry.facing[0] * 3.0, entry.at[1] + entry.facing[1] * 3.0]);
    // In along the lane, across to the foot of the steps at the west end, up them and along the shelf.
    let waypoints =
        [[0.0, 3.0], [-4.0, -1.0], [-11.0, -1.0], [-11.0, -7.5], [-7.0, -10.0]].map(|point| at(chamber, point));
    let (body, passed) = walked(&vale, out, &waypoints, 60.0);
    assert!(
        passed == waypoints.len() && body.z >= chamber.at[2] + 2.0,
        "the body stops at {:.1},{:.1} in the chamber, {:.2} m over its floor, past {passed} waypoints",
        body.x - chamber.at[0],
        body.y - chamber.at[1],
        body.z - chamber.at[2]
    );
}

#[test]
fn a_body_walks_from_the_coven_through_the_tunnels_mouth_to_the_chamber() {
    let vale = vale();
    let joined = layout::spaces::Joined::Tunnel;
    let tunnel = vale.map.connections.iter().find(|each| each.joined == joined).expect("the Vale has a tunnel");
    let [mouth, middle] = [tunnel.points[0], tunnel.points[1]];
    let length = layout::field::distance(mouth, middle);
    let way = [(middle[0] - mouth[0]) / length, (middle[1] - mouth[1]) / length];
    let from = [mouth[0] - way[0] * 6.0, mouth[1] - way[1] * 6.0];
    // From the coven's floor in under the mouth, along the tunnel to 3 m before the chamber's entry.
    let chamber = module_of(&vale, "cavern-chamber");
    let module = &city::modules::all()[city::modules::number_of("cavern-chamber").expect("named") as usize];
    let entry = module.sockets.iter().find(|socket| socket.name == "entry").expect("the entry");
    let out = at(chamber, [entry.at[0] + entry.facing[0] * 3.0, entry.at[1] + entry.facing[1] * 3.0]);
    let (body, passed) = walked(&vale, from, &[mouth, out], 60.0);
    assert!(
        passed == 2,
        "the body stops at {:.1},{:.1}, {:.1} m short of the chamber's entry, past {passed} waypoints",
        body.x,
        body.y,
        layout::field::distance(out, [body.x, body.y])
    );
}

#[test]
fn a_body_walks_up_the_citadels_ramp_through_its_gate_and_up_to_its_ward_and_its_wall_walk() {
    let vale = vale();
    let citadel = module_of(&vale, "keep-citadel");
    let module = &city::modules::all()[city::modules::number_of("keep-citadel").expect("named") as usize];
    let gate = module.sockets.iter().find(|socket| socket.name == "gate").expect("the gate");
    let out = at(citadel, [gate.at[0] + gate.facing[0] * 3.0, gate.at[1] + gate.facing[1] * 3.0]);
    // Up the ramp, through the gate, across the bailey and up the broad flight onto the upper ward.
    let ward = [[0.0, 36.0], [0.0, 26.0], [0.0, 6.0], [0.0, -6.0]].map(|point| at(citadel, point));
    let (body, passed) = walked(&vale, out, &ward, 60.0);
    assert!(
        passed == ward.len() && body.z >= citadel.at[2] + 3.5,
        "toward the ward the body stops {:.1},{:.1} from the citadel's middle, {:.2} m over its foot, past {passed}",
        body.x - citadel.at[0],
        body.y - citadel.at[1],
        body.z - citadel.at[2]
    );
    // From the bailey across to the foot of the east wall's flight, clear of the walls (a body walking into one
    // climbs it), and up the flight onto the wall-walk.
    let walk = [[0.0, 26.0], [0.0, 23.0], [23.5, 24.0], [26.4, 25.0], [26.4, 8.5]].map(|point| at(citadel, point));
    let (body, passed) = walked(&vale, out, &walk, 80.0);
    assert!(
        passed == walk.len() && body.z >= citadel.at[2] + 9.0,
        "toward the wall-walk the body stops {:.1},{:.1} from the citadel's middle, {:.2} m over its foot, past {passed}",
        body.x - citadel.at[0],
        body.y - citadel.at[1],
        body.z - citadel.at[2]
    );
}

#[test]
fn a_body_climbs_every_ledges_stair_of_saltmere_from_the_low_place_onto_the_high_one() {
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors"] {
        let vale = zone(id);
        let stairs: Vec<&layout::spaces::Connection> =
            vale.map.connections.iter().filter(|joined| joined.joined == layout::spaces::Joined::Stair).collect();
        assert!(!stairs.is_empty(), "{id} cuts a ledge");
        climbs_each(&vale, id, &stairs);
    }
}

#[test]
fn the_old_stones_and_the_citadel_stand_on_the_ground_at_every_edge() {
    let vale = vale();
    for name in ["old-stones", "keep-citadel"] {
        let module = &city::modules::all()[city::modules::number_of(name).expect("named") as usize];
        let solid = module_of(&vale, name);
        // Its foot on a 5 by 5 grid over its size, as it is turned: the ground there never lower than its foot.
        let [width, depth, _] = module.size;
        for east in -2..=2 {
            for south in -2..=2 {
                let local = [f64::from(east) * width / 4.0, f64::from(south) * depth / 4.0];
                let point = at(solid, local);
                let under = vale.floor.height_at(point[0], point[1]);
                assert!(
                    under >= solid.at[2] - 0.05,
                    "{name}'s foot stands {:.2} m over the ground at {local:?}",
                    solid.at[2] - under
                );
            }
        }
    }
}

#[test]
fn no_cliff_stair_stands_taller_than_it_was_baked() {
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors"] {
        for solid in &zone(id).solids {
            let Shape::Module { module, .. } = solid.shape else { continue };
            let baked = &city::modules::all()[module as usize];
            if baked.name.starts_with("cliff-stair") {
                assert!(
                    solid.size[2] <= baked.size[2] + 1e-9,
                    "{id}: {} stands {:.2} m tall, baked {:.2} m",
                    baked.name,
                    solid.size[2],
                    baked.size[2]
                );
            }
        }
    }
}

/// Walks up each of a zone's ledges' stairs from 3 m short of its slot onto the high floor past its top.
fn climbs_each(vale: &Vale, id: &str, stairs: &[&layout::spaces::Connection]) {
    for stair in stairs {
        let [start, edge] = [stair.points[0], stair.points[1]];
        let long = layout::field::distance(start, edge);
        let way = [(edge[0] - start[0]) / long, (edge[1] - start[1]) / long];
        let ahead = |from: [f64; 2], out: f64| [from[0] + way[0] * out, from[1] + way[1] * out];
        let (from, onto) = (ahead(start, -3.0), ahead(edge, layout::ledges::OVER_M + 3.0));
        let (body, passed) = walked(vale, from, &[ahead(start, 1.0), onto], 60.0);
        let high = vale.floor.height_at(onto[0], onto[1]);
        assert!(
            passed == 2 && (body.z - high).abs() < 0.5,
            "{id}: up the stair from {} to {} the body stops {:.1} m short at {:.2} m under the high floor",
            stair.from,
            stair.to,
            layout::field::distance([body.x, body.y], onto),
            high - body.z
        );
    }
}

#[test]
fn a_body_walks_over_every_stone_bridge_both_ways() {
    let vale = vale();
    let bridges: Vec<&Solid> = vale
        .solids
        .iter()
        .filter(|solid| match solid.shape {
            Shape::Module { module, group: 0 } => {
                city::modules::all()[module as usize].name.starts_with("stone-bridge")
            }
            _ => false,
        })
        .collect();
    assert!(!bridges.is_empty(), "the Vale's ways cross its river on stone");
    for bridge in bridges {
        let Shape::Module { module, .. } = bridge.shape else { continue };
        let sockets = &city::modules::all()[module as usize].sockets;
        let end = |name: &str| sockets.iter().find(|socket| socket.name == name).expect("the bridge's end");
        let [near, far] = [end("near"), end("far")];
        let past = |socket: &city::modules::Socket, out: f64| {
            at(bridge, [socket.at[0] + socket.facing[0] * out, socket.at[1] + socket.facing[1] * out])
        };
        // Its deck's top, as the bridge stands stretched, and its middle.
        let stretch = bridge.size[2] / city::modules::all()[module as usize].size[2];
        let deck = bridge.at[2] + near.at[2] * stretch;
        let middle = at(bridge, [0.0, 0.0]);
        for (from, to) in [(near, far), (far, near)] {
            // Over the deck, not through the river under it: at its middle the body stands on the deck.
            let (body, _) = walked(&vale, past(from, 3.0), &[past(from, -1.0), middle], 40.0);
            assert!(
                (body.z - deck).abs() < 0.4,
                "at the middle of the bridge at {:.0},{:.0} the body stands {:.2} m off its deck",
                bridge.at[0],
                bridge.at[1],
                body.z - deck
            );
            let onto = past(to, 3.0);
            let (body, passed) = walked(&vale, past(from, 3.0), &[past(from, -1.0), past(to, -1.0), onto], 40.0);
            let land = vale.floor.height_at(onto[0], onto[1]);
            assert!(
                passed == 3 && (body.z - land).abs() < 0.6,
                "over the bridge at {:.0},{:.0} from its {} end the body stops {:.1} m short, {:.2} m off the land",
                bridge.at[0],
                bridge.at[1],
                from.name,
                layout::field::distance([body.x, body.y], onto),
                body.z - land
            );
        }
    }
}

#[test]
fn a_body_walks_from_the_sunken_gates_way_to_each_mooring_onto_the_dais_and_up_each_ledge_to_its_perch() {
    let vale = vale();
    let gate = module_of(&vale, "breach-gate");
    let module = &city::modules::all()[city::modules::number_of("breach-gate").expect("named") as usize];
    let socket = |name: &str| module.sockets.iter().find(|socket| socket.name == name).expect("the socket");
    let way = socket("way");
    let from = at(gate, [way.at[0] + way.facing[0] * 3.0, way.at[1] + way.facing[1] * 3.0]);
    for name in ["mooring-south", "mooring-west", "mooring-east"] {
        let mooring = socket(name);
        let (body, passed) = walked(&vale, from, &[at(gate, [mooring.at[0], mooring.at[1]])], 40.0);
        assert!(
            passed == 1 && (body.z - gate.at[2] - mooring.at[2]).abs() < 0.05,
            "toward {name} the body stops {:.1},{:.1} from the gate's middle, {:.2} m over its foot",
            body.x - gate.at[0],
            body.y - gate.at[1],
            body.z - gate.at[2]
        );
    }
    let dais = [[0.0, 12.0], [0.0, 2.5]].map(|point| at(gate, point));
    let (body, passed) = walked(&vale, from, &dais, 40.0);
    assert!(passed == dais.len() && body.z >= gate.at[2] + 1.15, "the dais's top is walked up to");
    for name in ["perch-1", "perch-2"] {
        let perch = socket(name);
        let foot = [perch.at[0].signum() * 25.0, 26.0];
        let up = [[perch.at[0].signum() * 18.0, 26.0], foot, [foot[0], 10.0], [perch.at[0], perch.at[1]]]
            .map(|point| at(gate, point));
        let (body, passed) = walked(&vale, from, &up, 60.0);
        assert!(
            passed == up.len() && (body.z - gate.at[2] - perch.at[2]).abs() < 0.05,
            "toward {name} the body stops {:.1},{:.1} from the gate's middle, {:.2} m over its foot, past {passed}, {:?}",
            body.x - gate.at[0],
            body.y - gate.at[1],
            body.z - gate.at[2],
            body.mode
        );
    }
}
