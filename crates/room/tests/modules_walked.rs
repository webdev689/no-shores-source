//! The Gullwing Vale's handcrafted modules (tools/modules) as the bake lays them, walked by the movement rules: up the
//! Old Stones' flights onto their upper tier, and in from the cavern's tunnel and up the chamber's steps onto its shelf.

use city::solids::{Shape, Solid};
use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;

/// How near a waypoint a body counts as there, metres.
const THERE_M: f64 = 1.2;

struct Vale {
    floor: Floor,
    blocks: Blocks,
    solids: Vec<Solid>,
}

fn vale() -> Vale {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
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
    let laid = layouts.into_iter().find(|laid| laid.id == "gullwing-vale").expect("the Vale lays out");
    let node = nodes.iter().find(|node| node.id == laid.id).expect("the node bakes");
    Vale {
        floor: Floor::Land(Box::new(node.ground.clone())),
        blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
        solids: laid.seating.solids,
    }
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
/// how many waypoints it passed.
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
