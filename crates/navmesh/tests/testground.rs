//! The Test Ground's own course, as the server's rooms stand on it: up the stairs to the platform, round the tall
//! wall, onto the tops no step reaches by the movement rules' own moves, off the platform's far edge, and the same
//! path, to the bit, on every bake.

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
fn the_tops_no_step_reaches_are_climbed_onto_by_the_rules_own_moves() {
    let course = course();
    let navmesh = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    let reach = navmesh.reachable_from(course.start).unwrap();
    assert!(reach.contains(PLATFORM), "the platform, by the stairs");
    assert!(reach.contains([-12.5, -4.0, 0.75]), "the top step, by the steps");
    // The crate is mantled and the ledge caught on a jump; the tall wall is climbed, with no jump.
    for (top, jump) in [(1.1, true), (2.3, true), (4.0, false)] {
        let block = named(&course, top);
        let on_top = [(block.min_x + block.max_x) / 2.0, (block.min_y + block.max_y) / 2.0, top];
        assert!(reach.contains(on_top), "the {top} m top is reached");
        let route = path(&navmesh, course.start, on_top);
        let at = |point: [f64; 3], link_end: [f64; 3]| (0..3).all(|axis| (point[axis] - link_end[axis]).abs() < 1e-9);
        let up = navmesh.links().find(|link| {
            link.to[2] == top && route.windows(2).any(|pair| at(pair[0], link.from) && at(pair[1], link.to))
        });
        assert!(up.is_some_and(|link| link.jump == jump && link.from[2] == 0.0), "up a link onto {top} m: {route:?}");
    }
    let wall = named(&course, 1.0);
    let over = |link: &&navmesh::Link| link.jump && link.to[2] == 0.0 && link.from[1] > wall.max_y;
    assert!(navmesh.links().any(|link| over(&link) && link.to[1] < wall.min_y), "the thin wall is vaulted");
}

#[test]
fn a_walk_off_the_platform_s_far_edge_drops_rather_than_go_back_down_the_stairs() {
    let course = course();
    let navmesh = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    let below = [18.0, -11.0, 0.0];
    let route = path(&navmesh, PLATFORM, below);
    ends_at(&route, below);
    let drop = route.windows(2).position(|pair| pair[0][2] - pair[1][2] > 0.5);
    assert!(drop.is_some_and(|at| route[at][2] == 1.6 && route[at][1] < -7.5), "off its northern edge: {route:?}");
}

#[test]
fn the_course_bakes_and_paths_alike_every_time() {
    let course = course();
    let first = NavMesh::bake(&course.blocks, BOUNDS, &AGENT);
    assert_eq!(first, NavMesh::bake(&course.blocks, BOUNDS, &AGENT));
    let route = path(&first, course.start, PLATFORM);
    assert_eq!(fingerprint(&route), PATH_HASH, "{:x} for {route:?}", fingerprint(&route));
}
