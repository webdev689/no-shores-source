//! Overlook's hub pieces (tools/modules) as the manifest gives them: each lies inside its size and never carries its
//! parts on paving; every keeper stands behind a counter that stops a customer walking at it; every place a body is
//! set (a keeper, a musician, a smith) is clear of the pieces' parts; a body steps up onto the bandstand's stage and
//! walks through the range gate's passage, by the movement rules on the pieces' own boxes.

use city::modules::{Module, Socket, all};
use city::solids::Material;
use movement::{Block, Body, Controls, Flat, TICK_SECONDS, TUNING, standing, step_body};

/// Every hub piece, in the order the catalogue appends them.
const HUB: [&str; 37] = [
    "stall-mage",
    "stall-vault",
    "stall-weaponsmith",
    "stall-armorsmith",
    "stall-tailor",
    "stall-tack",
    "stall-harbourmaster",
    "stall-chandler",
    "chapel-stormcallers",
    "chapel-lamplighters",
    "chapel-veiled",
    "range",
    "range-gate",
    "sealed-gate",
    "war-table",
    "bandstand",
    "fountain",
    "market-stall-fish",
    "market-stall-fruit",
    "market-stall-pots",
    "crates-barrels",
    "lamp-post",
    "bench",
    "anvil-yard",
    "hay-cart",
    "bollards",
    "market-stall-cloth",
    "market-stall-bread",
    "market-stall-flowers",
    "court-tree",
    "lawn-bed",
    "table-benches",
    "parasol-table",
    "woodpile",
    "barrel-stack",
    "flower-cart",
    "bale-stack",
];

const NORTH: Controls =
    Controls { forward: 1.0, sideways: 0.0, yaw: 0.0, run: false, jump: false, crouch: false, mounted: false };

fn piece(name: &str) -> &'static Module {
    all().iter().find(|module| module.name == name).unwrap_or_else(|| panic!("{name} is in the manifest"))
}

fn socket<'a>(module: &'a Module, name: &str) -> &'a Socket {
    module.sockets.iter().find(|socket| socket.name == name).unwrap_or_else(|| panic!("{}: {name}", module.name))
}

fn blocks_of(module: &Module) -> Vec<Block> {
    module
        .parts
        .iter()
        .map(|&[min_x, min_y, bottom, max_x, max_y, top]| Block { min_x, min_y, max_x, max_y, top, bottom })
        .collect()
}

fn run(body: Body, ticks: usize, blocks: &[Block]) -> Vec<Body> {
    let mut bodies = vec![body];
    for _ in 0..ticks {
        let last = bodies[bodies.len() - 1];
        bodies.push(step_body(&last, &NORTH, blocks, &Flat, TICK_SECONDS));
    }
    bodies
}

fn sells(module: &Module) -> bool {
    module.sockets.iter().any(|socket| socket.name == "keeper")
}

#[test]
fn every_hub_piece_lies_inside_its_size_and_carries_its_parts_on_no_paving() {
    for name in HUB {
        let module = piece(name);
        let [width, depth, height] = module.size;
        assert!(module.groups[0].material != Material::Paving, "{name}: its first group is paving");
        assert!(!module.parts.is_empty(), "{name}: no parts");
        for &[x0, y0, z0, x1, y1, z1] in &module.parts {
            let inside = x0 >= -width / 2.0 - 0.01 && x1 <= width / 2.0 + 0.01 && y0 >= -depth / 2.0 - 0.01;
            assert!(inside && y1 <= depth / 2.0 + 0.01 && z0 >= -0.01 && z1 <= height + 0.01, "{name}: {x0} {y0} {z0}");
        }
    }
}

#[test]
fn every_keeper_stands_behind_a_counter_facing_the_customer() {
    let selling: Vec<&Module> = HUB.iter().map(|name| piece(name)).filter(|module| sells(module)).collect();
    assert_eq!(selling.len(), 17, "eight stalls, three chapels, six market stalls");
    for module in selling {
        let (counter, keeper) = (socket(module, "counter"), socket(module, "keeper"));
        let behind =
            (keeper.at[0] - counter.at[0]) * counter.facing[0] + (keeper.at[1] - counter.at[1]) * counter.facing[1];
        assert!(behind < -0.8, "{}: the keeper is {behind} m out from the counter", module.name);
        assert_eq!(keeper.facing, counter.facing, "{}: the keeper faces the customer", module.name);
        assert!(counter.at[2].abs() < 1e-9, "{}: the customer stands at the foot", module.name);
    }
}

#[test]
fn every_keepers_stall_has_a_sign_high_at_one_end_of_its_front_facing_along_it() {
    for module in HUB.iter().filter(|name| name.starts_with("stall-")).map(|name| piece(name)) {
        let (sign, counter) = (socket(module, "sign"), socket(module, "counter"));
        assert!((sign.at[2] - 3.6).abs() < 1e-6, "{}: its sign's bracket at 3.6 m", module.name);
        let along = sign.facing[0] * counter.facing[1] - sign.facing[1] * counter.facing[0];
        assert!(along.abs() > 0.99, "{}: the sign faces along the front", module.name);
        assert!((sign.at[0] - counter.at[0]) * sign.facing[0] > 1.0, "{}: away from the middle", module.name);
    }
}

#[test]
fn a_customer_walking_at_a_counter_is_stopped_by_it() {
    for module in HUB.iter().map(|name| piece(name)).filter(|module| sells(module)) {
        let counter = socket(module, "counter");
        assert_eq!(counter.facing, [0.0, 1.0], "{}: its counter faces its own south", module.name);
        let blocks = blocks_of(module);
        // The counter's part: the box just behind its front face, at a hip's height.
        let (x, y) = (counter.at[0], counter.at[1] - 0.6);
        let found = blocks.iter().find(|block| {
            block.min_x <= x && x <= block.max_x && block.min_y <= y && y <= block.max_y && block.bottom <= 0.5
        });
        let counter_box = found.unwrap_or_else(|| panic!("{}: no part at its counter", module.name));
        let start = standing(counter.at[0], counter.at[1] + 2.0);
        for body in run(start, 200, &blocks) {
            let inside_x = body.x > counter_box.min_x && body.x < counter_box.max_x;
            let inside_y = body.y > counter_box.min_y && body.y < counter_box.max_y;
            assert!(!(inside_x && inside_y && body.z < counter_box.top - 0.01), "{}: walked into it", module.name);
            assert!(
                body.y > counter_box.min_y - 0.01 || body.z >= counter_box.top - 0.01,
                "{}: through it",
                module.name
            );
        }
    }
}

#[test]
fn every_place_a_body_is_set_is_clear_of_the_parts() {
    let placed = ["keeper", "counter", "player-", "smith-", "seat-"];
    for module in HUB.iter().map(|name| piece(name)) {
        for socket in module.sockets.iter().filter(|socket| placed.iter().any(|kind| socket.name.starts_with(kind))) {
            let [x, y, z] = socket.at;
            for &[x0, y0, z0, x1, y1, z1] in &module.parts {
                let near = x > x0 - TUNING.radius
                    && x < x1 + TUNING.radius
                    && y > y0 - TUNING.radius
                    && y < y1 + TUNING.radius;
                // A part no higher than a step over the feet is stood on, not run into.
                let body_high = z0 < z + TUNING.height && z1 > z + TUNING.step;
                assert!(
                    !(near && body_high),
                    "{} {}: inside a part {:?}",
                    module.name,
                    socket.name,
                    [x0, y0, z0, x1, y1, z1]
                );
            }
        }
    }
}

#[test]
fn a_body_steps_up_onto_the_bandstand_stage() {
    let module = piece("bandstand");
    let front = socket(module, "front");
    let blocks = blocks_of(module);
    let bodies = run(standing(front.at[0] + 0.4, front.at[1] + 1.5), 160, &blocks);
    let middle = bodies.iter().min_by(|a, b| a.y.abs().total_cmp(&b.y.abs())).expect("it walked");
    assert!(middle.y.abs() < 0.2, "it walked to the stage's middle: {middle:?}");
    assert!((middle.z - 0.45).abs() < 0.01, "it stands on the stage there: {middle:?}");
}

#[test]
fn a_body_walks_through_the_range_gate() {
    let module = piece("range-gate");
    let ends: Vec<&Socket> = module.sockets.iter().filter(|socket| socket.name == "through").collect();
    assert_eq!(ends.len(), 2, "a socket at each end of its passage");
    let (south, north) = if ends[0].at[1] > ends[1].at[1] { (ends[0], ends[1]) } else { (ends[1], ends[0]) };
    assert!((south.at[0] - north.at[0]).abs() < 1e-6 && south.facing[1] > 0.9 && north.facing[1] < -0.9);
    let blocks = blocks_of(module);
    let bodies = run(standing(south.at[0], south.at[1] + 1.0), 400, &blocks);
    let end = bodies[bodies.len() - 1];
    assert!(end.y < north.at[1] - 1.0, "it walked through the passage: {end:?}");
    assert!(bodies.iter().all(|body| body.z.abs() < 0.01), "on the passage's floor all the way");
}
