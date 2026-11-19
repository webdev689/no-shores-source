//! The movement rules find a body's blocks through a grid (`movement::Blocks`) so a patrol area's thousands of boxes
//! cost a tick no more than a few: these runs over the Saltgrass Downs' boxes, as the bake lays them, step bodies
//! once over the plain list and once over the grid, and every tick must agree to the bit.

use movement::{Block, Blocks, Body, Controls, Mode, Near, TICK_SECONDS, Terrain, step_body};
use room::{Floor, Room, standing_on};
use std::path::Path;

/// A patrol area laid out with walk-in buildings, rock, walls and great works.
const NODE: &str = "saltgrass-downs";

fn saltgrass() -> bake::NodeFile {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = layout.continents.iter().find(|continent| continent.id == "continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let nodes = bake::nodes_of(continent.expect("continent-1"), edits, &city, &builders);
    nodes.expect("continent-1 bakes").into_iter().find(|node| node.id == NODE).expect("the Saltgrass Downs bake")
}

/// Where the runs start: the node's spawns, and every box's centre one in fifty, so bodies start among buildings.
fn starts(node: &bake::NodeFile) -> Vec<(f64, f64)> {
    let spawns = node.spawns.iter().map(|&[x, y]| (x, y));
    let among =
        node.boxes.iter().step_by(50).map(|floats| ((floats[0] + floats[2]) / 2.0, (floats[1] + floats[3]) / 2.0));
    spawns.chain(among).collect()
}

/// A run from (x, y): forward, running every other second, jumping now and then, turning all the while, so the body
/// walks into walls, up stairs and over what it can.
fn run<B: Near + ?Sized>(blocks: &B, floor: &Floor, start: Body, ticks: usize) -> Vec<Body> {
    let mut body = start;
    (0..ticks)
        .map(|tick| {
            let controls = Controls {
                forward: 1.0,
                sideways: if tick % 200 < 50 { 0.5 } else { 0.0 },
                yaw: tick as f64 * 0.013,
                run: tick % 120 < 60,
                jump: tick % 97 == 0,
                crouch: tick % 300 > 280,
                ..Controls::default()
            };
            body = step_body(&body, &controls, blocks, floor, TICK_SECONDS);
            body
        })
        .collect()
}

#[test]
fn bodies_among_a_patrol_areas_boxes_step_alike_with_and_without_the_grid() {
    let node = saltgrass();
    let floor = Floor::Land(Box::new(node.ground.clone()));
    let list: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
    assert!(list.len() > 1_000, "the Saltgrass Downs hold {} boxes", list.len());
    let grid = Blocks::new(list.clone());
    let mut modes = Vec::new();
    let mut on_blocks = 0;
    for (x, y) in starts(&node) {
        let start = standing_on(&floor, &list, x, y);
        let plain = run(&list, &floor, start, 600);
        let gridded = run(&grid, &floor, start, 600);
        for (tick, (plain, gridded)) in plain.iter().zip(&gridded).enumerate() {
            assert_eq!(plain.to_floats(), gridded.to_floats(), "from ({x}, {y}), tick {tick}");
        }
        on_blocks += plain.iter().filter(|body| body.z > floor.height_at(body.x, body.y) + 0.1).count();
        modes.extend(plain.iter().map(|body| body.mode));
    }
    assert!(on_blocks > 1_000, "the runs stood on blocks only {on_blocks} ticks");
    for mode in [Mode::Ground, Mode::Air, Mode::Hang] {
        assert!(modes.contains(&mode), "the runs never put a body in {mode:?}");
    }
}

/// A tick's cost over the Saltgrass Downs' boxes, plain and through the grid: `cargo test --release -p room --test
/// near_blocks -- --ignored --nocapture`. Movement.md quotes it.
#[test]
#[ignore = "a measurement, not a check"]
#[allow(clippy::disallowed_methods, clippy::print_stdout, reason = "it times the ticks and reports them")]
fn a_ticks_cost_among_a_patrol_areas_boxes() {
    let node = saltgrass();
    let floor = Floor::Land(Box::new(node.ground.clone()));
    let list: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
    let started = std::time::Instant::now();
    let grid = Blocks::new(list.clone());
    let built = started.elapsed();
    let starts: Vec<Body> = starts(&node).into_iter().map(|(x, y)| standing_on(&floor, &list, x, y)).collect();
    let time = |each: &dyn Fn(Body) -> Vec<Body>| {
        let started = std::time::Instant::now();
        let ticks: usize = starts.iter().map(|&start| each(start).len()).sum();
        started.elapsed().as_secs_f64() * 1e6 / ticks as f64
    };
    let plain = time(&|start| run(&list, &floor, start, 600));
    let gridded = time(&|start| run(&grid, &floor, start, 600));
    println!(
        "{} boxes: a tick {plain:.2} µs plain, {gridded:.2} µs through the grid, built in {:.2} ms",
        list.len(),
        built.as_secs_f64() * 1e3
    );
}

/// A node room's bake, with the Saltgrass Downs' boxes and without them, the quickest of three each, its first spawn
/// moved to where the boxes stand thickest so its square holds the most of them: `cargo test --release -p room --test
/// near_blocks -- --ignored --nocapture`. Navmesh.md quotes it. Its boxes may cost the bake no more than as much again.
#[test]
#[ignore = "a measurement, not a check"]
#[allow(clippy::disallowed_methods, clippy::print_stdout, reason = "it times the bakes and reports them")]
fn a_node_rooms_bake_among_its_boxes_costs_at_most_twice_its_bake_without() {
    let node = saltgrass();
    let floor = Floor::Land(Box::new(node.ground.clone()));
    let list: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
    let near = |(x, y): (f64, f64)| {
        list.iter().filter(|block| (block.min_x - x).abs() < 35.0 && (block.min_y - y).abs() < 35.0).count()
    };
    let thickest = starts(&node).into_iter().max_by_key(|&start| near(start)).expect("the node has starts");
    let section = reach::Section { ring: node.ring.clone(), spawns: vec![[thickest.0, thickest.1]] };
    let time = |blocks: &[Block]| {
        (0..3)
            .map(|_| {
                let started = std::time::Instant::now();
                drop(Room::node(floor.clone(), blocks.to_vec(), section.clone()));
                started.elapsed().as_secs_f64() * 1e3
            })
            .fold(f64::INFINITY, f64::min)
    };
    let (bare, boxed) = (time(&[]), time(&list));
    println!("a node room opens in {bare:.1} ms bare, {boxed:.1} ms among the {} boxes by its spawn", near(thickest));
    assert!(boxed <= 2.0 * bare, "{boxed:.1} ms among its boxes against {bare:.1} ms bare");
}
