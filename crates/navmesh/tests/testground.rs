//! The Test Ground's own course, as the server's rooms stand on it: up the stairs to the platform, round the tall
//! wall, never onto a top no step reaches, and the same path, to the bit, on every bake.

mod common;

use common::{along, closest, ends_at, path};
use movement::Block;
use navmesh::{AGENT, Bounds, NavMesh};
use serde_json::Value;

/// The path's fingerprint below changes only when the navmesh's behaviour does, on purpose.
const PATH_HASH: u64 = 0xe63a_0f77_cfb4_7a5a;

/// Open ground around the course and the start, a few metres past both.
const BOUNDS: Bounds = Bounds { min_x: -24.0, min_y: -16.0, max_x: 30.0, max_y: 18.0 };

struct Course {
    start: [f64; 3],
    blocks: Vec<Block>,
}

fn course() -> Course {
    let json: Value =
        serde_json::from_str(include_str!("../../../content/testground/course.json")).expect("the course reads");
    let number = |value: &Value, key: &str| value[key].as_f64().expect("a number");
    let blocks = json["blocks"]
        .as_array()
        .expect("a list of blocks")
        .iter()
        .map(|block| Block {
            min_x: number(block, "minX"),
            min_y: number(block, "minY"),
            max_x: number(block, "maxX"),
            max_y: number(block, "maxY"),
            top: number(block, "top"),
        })
        .collect();
    Course { start: [number(&json["start"], "x"), number(&json["start"], "y"), 0.0], blocks }
}

/// The block the course names this way.
fn named(course: &Course, top: f64) -> Block {
    *course.blocks.iter().find(|block| block.top == top).expect("the course has it")
}

/// The tallest top under a point, edges included, else the open ground.
fn top_at(blocks: &[Block], x: f64, y: f64) -> f64 {
    blocks
        .iter()
        .filter(|block| x >= block.min_x && x <= block.max_x && y >= block.min_y && y <= block.max_y)
        .fold(0.0, |top, block| f64::max(top, block.top))
}

/// FNV-1a over every coordinate's bits.
fn fingerprint(route: &[[f64; 3]]) -> u64 {
    route
        .iter()
        .flatten()
        .flat_map(|value| value.to_bits().to_le_bytes())
        .fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

/// The middle of the platform the stairs climb to.
const PLATFORM: [f64; 3] = [18.0, -5.5, 1.6];

#[test]
fn the_stairs_lead_from_the_start_to_the_platform() {
    let course = course();
    let navmesh = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    let route = path(&navmesh, course.start, PLATFORM);
    ends_at(&route, PLATFORM);
    let tops: Vec<f64> = along(&route).into_iter().map(|(x, y)| top_at(&course.blocks, x, y)).collect();
    assert!(tops.windows(2).all(|pair| (pair[1] - pair[0]).abs() <= 0.5), "a stair at a time: {route:?}");
    assert!(tops.contains(&0.8), "up the stairs, not round them: {route:?}");
}

#[test]
fn the_far_side_of_the_tall_wall_is_reached_round_it() {
    let course = course();
    let navmesh = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    let wall = named(&course, 4.0);
    let beyond = [11.0, -6.0, 0.0];
    let route = path(&navmesh, course.start, beyond);
    ends_at(&route, beyond);
    assert!(route.len() >= 3, "it bends round the wall: {route:?}");
    assert!(closest(&route, &wall) >= AGENT.radius, "a body's radius off the wall: {route:?}");
}

#[test]
fn tops_no_step_reaches_are_off_the_mesh() {
    let course = course();
    let navmesh = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    let reach = navmesh.reachable_from(course.start).unwrap();
    assert!(reach.contains(PLATFORM), "the platform, by the stairs");
    assert!(reach.contains([-12.5, -4.0, 0.75]), "the top step, by the steps");
    for top in [1.1, 2.3, 4.0] {
        let block = named(&course, top);
        let on_top = [(block.min_x + block.max_x) / 2.0, (block.min_y + block.max_y) / 2.0, top];
        assert!(!reach.contains(on_top), "the {top} m top is not reached");
        assert_eq!(navmesh.find_path(course.start, on_top), None, "no path onto the {top} m top");
    }
}

#[test]
fn the_course_bakes_and_paths_alike_every_time() {
    let course = course();
    let first = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    assert_eq!(first, NavMesh::bake(&course.blocks, BOUNDS, &AGENT));
    let route = path(&first, course.start, PLATFORM);
    assert_eq!(fingerprint(&route), PATH_HASH, "{:x} for {route:?}", fingerprint(&route));
}
