//! A body never ends a tick inside a block: walked, run, crept, hopped and jumped off and past every edge and corner
//! of the Test Ground's course, at every bearing, its feet never stand lower than a step under a block its radius
//! overlaps, so it never sticks there. Each runs at the server's tick.

use movement::blocks::ground_at;
use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, TUNING, standing, step_body};
use serde_json::Value;
use std::f64::consts::PI;

fn course() -> Vec<Block> {
    let json: Value =
        serde_json::from_str(include_str!("../../../content/testground/course.json")).expect("the course reads");
    let number = |value: &Value, key: &str| value[key].as_f64().expect("a number");
    let blocks = json["blocks"].as_array().expect("a list of blocks");
    let block = |value: &Value| Block {
        min_x: number(value, "minX"),
        min_y: number(value, "minY"),
        max_x: number(value, "maxX"),
        max_y: number(value, "maxY"),
        top: number(value, "top"),
        bottom: number(value, "bottom"),
    };
    blocks.iter().map(block).collect()
}

/// The block a body stands inside, if any: one standing more than a step over its feet whose footprint its radius
/// overlaps, as the rules judge a block in the way.
fn inside(blocks: &[Block], body: &Body) -> Option<Block> {
    let radius = TUNING.radius;
    blocks.iter().copied().find(|block| {
        block.top > body.z + TUNING.step
            && body.x > block.min_x - radius
            && body.x < block.max_x + radius
            && body.y > block.min_y - radius
            && body.y < block.max_y + radius
    })
}

/// How the body sets off: at a pace with the controls held, or in a dodge's hop with none.
#[derive(Clone, Copy, Debug)]
enum Going {
    Walk,
    Run,
    Crouch,
    Slow,
    Jump,
    Hop,
}

/// The body at `start` set going along `yaw`, and the controls it holds.
fn set_off(start: Body, yaw: f64, going: Going) -> (Body, Controls) {
    let held = Controls { forward: 1.0, yaw, ..Controls::default() };
    match going {
        Going::Walk => (start, held),
        Going::Run => (start, Controls { run: true, ..held }),
        Going::Crouch => (Body { crouched: true, crouch: 1.0, ..start }, held),
        Going::Slow => (start, Controls { forward: 0.3, ..held }),
        Going::Jump => (start, Controls { run: true, jump: true, ..held }),
        // The fight's dodge: a hop fast and low the way it goes, its controls held still.
        Going::Hop => {
            let (vx, vy) = (libm::sin(yaw) * 10.0, -libm::cos(yaw) * 10.0);
            (Body { mode: Mode::Air, vx, vy, vz: 3.0, grounded: 0.0, ..start }, Controls { yaw, ..Controls::default() })
        }
    }
}

/// Points round a block, on its top and on the ground beside it, near each edge and corner.
fn round(block: &Block) -> Vec<(f64, f64, f64)> {
    let radius = TUNING.radius;
    let across = |low: f64, high: f64| {
        let middle = f64::midpoint(low, high);
        [low - radius - 0.25, low - radius - 0.01, low + 0.05, low + 0.3, middle, high - 0.3, high - 0.05]
            .into_iter()
            .chain([high + radius + 0.01, high + radius + 0.25])
            .collect::<Vec<_>>()
    };
    let (xs, ys) = (across(block.min_x, block.max_x), across(block.min_y, block.max_y));
    xs.iter().flat_map(|&x| ys.iter().map(move |&y| (x, y, block.top))).collect()
}

/// Each start, bearing and way of going whose body ends a tick inside a block, with the first such tick.
fn sweep(blocks: &[Block], ticks: usize) -> Vec<String> {
    let yaws: Vec<f64> = (0..16).map(|eighth| f64::from(eighth) * PI / 8.0).chain([1.147, -1.147]).collect();
    let goings = [Going::Walk, Going::Run, Going::Crouch, Going::Slow, Going::Jump, Going::Hop];
    let mut found = Vec::new();
    for (x, y, top) in blocks.iter().flat_map(round) {
        let start = Body { z: ground_at(blocks, &Flat, x, y, top), ..standing(x, y) };
        if inside(blocks, &start).is_some() {
            continue;
        }
        for &yaw in &yaws {
            for going in goings {
                let (mut body, held) = set_off(Body { facing: yaw, ..start }, yaw, going);
                for tick in 0..ticks {
                    let controls = if tick == 0 { held } else { Controls { jump: false, ..held } };
                    body = step_body(&body, &controls, blocks, &Flat, TICK_SECONDS);
                    let free = matches!(body.mode, Mode::Ground | Mode::Air);
                    if let Some(block) = inside(blocks, &body).filter(|_| free) {
                        found.push(format!(
                            "{going:?} from ({x}, {y}, {}) at yaw {yaw:.3}: tick {tick} {body:?} in {block:?}",
                            start.z
                        ));
                        break;
                    }
                }
            }
        }
    }
    found
}

#[test]
fn off_every_edge_and_corner_of_the_test_ground_the_body_never_ends_inside_a_block() {
    let found = sweep(&course(), 60);
    assert!(
        found.is_empty(),
        "{} runs end inside a block, the first: {:#?}",
        found.len(),
        &found[..found.len().min(6)]
    );
}

/// Every tick of `ticks` from `start` with `held` controls, each on its feet or in the air checked clear of the blocks.
fn ticks(start: Body, held: Controls, blocks: &[Block], ticks: usize) -> Vec<Body> {
    let mut bodies = vec![start];
    for tick in 0..ticks {
        let body = step_body(&bodies[tick], &held, blocks, &Flat, TICK_SECONDS);
        let free = matches!(body.mode, Mode::Ground | Mode::Air);
        assert_eq!(inside(blocks, &body).filter(|_| free), None, "tick {tick} ends inside a block: {body:?}");
        bodies.push(body);
    }
    bodies
}

#[test]
fn stepping_down_off_a_stair_beside_a_taller_ones_corner_the_body_is_held_clear_of_it_and_walks_on() {
    let course = course();
    // Off the 0.4 m stair east-north-east past the 0.8 m one's corner, and off the 0.5 m step west-north-west past
    // the 0.75 m one's: the feet would drop a step to the ground inside the taller one's corner, so it holds them.
    for (x, y, yaw) in [(17.0, -0.4, 1.147), (-13.6, -2.5, -1.147)] {
        let start = Body { z: ground_at(&course, &Flat, x, y, 1.0), facing: yaw, ..standing(x, y) };
        for run in [true, false] {
            let bodies = ticks(start, Controls { forward: 1.0, yaw, run, ..Controls::default() }, &course, 60);
            let stopped = bodies.windows(2).position(|pair| (pair[0].x, pair[0].y) == (pair[1].x, pair[1].y));
            assert_eq!(stopped, None, "from ({x}, {y}) it sticks: {:?}", bodies.last());
        }
    }
}

#[test]
fn edging_slowly_off_a_ledge_almost_along_it_the_body_is_pushed_clear_as_it_falls_and_walks_away() {
    let platform = Block { min_x: 15.0, min_y: -8.0, max_x: 21.0, max_y: -3.0, top: 1.6, bottom: 0.0 };
    let start = Body { z: 1.6, ..standing(20.95, -6.0) };
    // Sideways, a little east of north, too slowly to be clear of the ledge before the feet sink past its top.
    let creeping = Controls { sideways: 0.3, yaw: 0.15 - PI / 2.0, ..Controls::default() };
    let fallen = ticks(start, creeping, &[platform], 90);
    let landed = fallen.last().copied().expect("a body");
    assert_eq!((landed.mode, landed.z), (Mode::Ground, 0.0));
    let east = ticks(landed, Controls { forward: 1.0, yaw: PI / 2.0, ..Controls::default() }, &[platform], 30);
    assert!(east[30].x > landed.x + 2.0, "it walks away east from {landed:?} only to {:?}", east[30]);
}

#[test]
fn a_vault_met_slantwise_lands_past_the_wall_not_in_it() {
    let thin = Block { min_x: -2.0, min_y: -1.3, max_x: 2.0, max_y: -1.0, top: 1.0, bottom: 0.0 };
    let forward = Controls { forward: 1.0, yaw: 0.7, ..Controls::default() };
    let near = ticks(standing(-0.5, 0.0), forward, &[thin], 30)[30];
    let over = ticks(near, Controls { jump: true, ..forward }, &[thin], 40);
    assert!(over.iter().any(|body| body.mode == Mode::Vault), "it vaults the wall");
    let landed = over.iter().find(|body| body.mode == Mode::Ground && body.y < thin.min_y).expect("it lands past it");
    assert!(landed.y < thin.min_y - TUNING.radius, "it lands clear of the wall, not at y {}", landed.y);
}

#[test]
fn a_body_set_down_overlapping_a_block_is_pushed_out_the_shortest_way_and_walks_on() {
    let stair = Block { min_x: 16.0, min_y: -2.0, max_x: 18.0, max_y: -1.0, top: 0.8, bottom: 0.0 };
    let set_down = standing(18.04, -0.87);
    assert!(inside(&[stair], &set_down).is_some());
    let pushed = ticks(set_down, Controls::default(), &[stair], 1)[1];
    assert_eq!(
        (pushed.x, pushed.y),
        (18.04, stair.max_y + TUNING.radius),
        "pushed straight south, its nearest way out"
    );
    // North is the stair's face; every other way is open.
    for yaw in [PI / 2.0, PI, -PI / 2.0] {
        let walked = ticks(set_down, Controls { forward: 1.0, yaw, ..Controls::default() }, &[stair], 20);
        assert!(
            (walked[20].x, walked[20].y) != (walked[1].x, walked[1].y),
            "facing {yaw} it sticks at {:?}",
            walked[1]
        );
    }
}

#[test]
fn blocks_that_tile_a_deck_hold_every_point_of_it_their_seams_and_outer_edges_too() {
    // Two half-metre squares of deck laid side by side, as a ship's deck is, far from the origin where a sum lands
    // on a seam exactly; and a step between two heights, where the higher holds the seam.
    let (east, south) = (23817.0, -4120.0);
    let deck = [
        Block { min_x: east, min_y: south, max_x: east + 0.5, max_y: south + 0.5, top: 2.2, bottom: 0.0 },
        Block { min_x: east + 0.5, min_y: south, max_x: east + 1.0, max_y: south + 0.5, top: 2.2, bottom: 0.0 },
        Block { min_x: east + 1.0, min_y: south, max_x: east + 1.5, max_y: south + 0.5, top: 2.4, bottom: 0.0 },
    ];
    for x in [east, east + 0.5, east + 0.25, east + 1.0, east + 1.5] {
        for y in [south, south + 0.25, south + 0.5] {
            let ground = ground_at(&deck, &Flat, x, y, f64::INFINITY);
            assert!(ground >= 2.2, "the deck holds ({x}, {y}), not the sea under it: {ground}");
        }
    }
    assert_eq!(ground_at(&deck, &Flat, east + 1.0, south + 0.25, f64::INFINITY), 2.4, "the higher holds a seam");
}
