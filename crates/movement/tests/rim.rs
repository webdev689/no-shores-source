//! A course of blocks laid over the open sea, held at its edge by the rim round it: walked, jumped, vaulted and
//! climbed anywhere over the blocks, never off them.

use movement::{Block, Body, Controls, Heights, Mode, TICK_SECONDS, Terrain, step_body};

/// A deck 6 m by 3 m, 2 m over the sea, laid in squares of 0.3 m from x -3, with a rail along its east edge 1 m high
/// and 0.3 m thick, as a bulwark measured from a wreck is: low and thin enough to vault.
fn deck() -> Vec<Block> {
    vec![
        Block { min_x: -3.0, min_y: -1.5, max_x: 2.7, max_y: 1.5, top: 2.0, bottom: 0.0 },
        Block { min_x: 2.7, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 3.0, bottom: 0.0 },
    ]
}

fn press(from: Body, controls: Controls, blocks: &[Block], terrain: &dyn Terrain, ticks: usize) -> Body {
    (0..ticks).fold(from, |body, _| step_body(&body, &controls, blocks, terrain, TICK_SECONDS))
}

#[test]
fn the_rim_is_open_where_a_block_covers_a_cell_and_a_wall_everywhere_else() {
    let rim = Heights::rim(&deck(), 0.3);
    assert!(rim.stands_at(-2.85, -1.35) && rim.stands_at(2.85, 1.35), "the corner cells, rail and all");
    assert!(!rim.stands_at(3.05, 0.0) && !rim.stands_at(-3.05, 0.0) && !rim.stands_at(0.0, 1.55));
    assert_eq!(rim.height_at(0.0, 0.0), 0.0, "open under the blocks, which stand bodies on their tops");
    assert!(rim.height_at(5.0, 0.0) >= 10.0, "the sea is a wall");
    let none = Heights::rim(&[], 0.3);
    assert!(!none.stands_at(0.0, 0.0), "no blocks hold no ground");
}

#[test]
fn a_body_running_and_jumping_at_the_rail_is_held_on_the_deck_never_vaulted_into_the_sea() {
    let blocks = deck();
    let rim = Heights::rim(&blocks, 0.3);
    let start = Body { z: 2.0, ..movement::standing(1.5, 0.0) };
    let east = std::f64::consts::FRAC_PI_2;
    let run = Controls { forward: 1.0, yaw: east, run: true, ..Controls::default() };
    let jump = Controls { jump: true, ..run };
    let mut body = press(start, run, &blocks, &rim, 30);
    for _ in 0..8 {
        body = press(body, jump, &blocks, &rim, 20);
        body = press(body, run, &blocks, &rim, 40);
    }
    assert!(body.x < 3.0, "never over the rail: {body:?}");
    assert!(body.z >= 2.0, "never fallen: {body:?}");
    // Without the rim, the open sea under it, the same run vaults the rail and drops into the sea.
    let mut free = press(start, run, &blocks, &movement::Flat, 30);
    for _ in 0..8 {
        free = press(free, jump, &blocks, &movement::Flat, 20);
        free = press(free, run, &blocks, &movement::Flat, 40);
    }
    assert!(free.x > 3.0 && free.z < 1.0, "the rail alone holds no one: {free:?}");
}

#[test]
fn a_body_climbing_the_rail_from_the_deck_goes_no_further_than_its_top() {
    let blocks = vec![
        Block { min_x: -3.0, min_y: -1.5, max_x: 2.7, max_y: 1.5, top: 2.0, bottom: 0.0 },
        Block { min_x: 2.7, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 5.2, bottom: 0.0 },
    ];
    let rim = Heights::rim(&blocks, 0.3);
    let start = Body { z: 2.0, ..movement::standing(1.5, 0.0) };
    let climb = Controls { forward: 1.0, yaw: std::f64::consts::FRAC_PI_2, ..Controls::default() };
    let body = press(start, climb, &blocks, &rim, 900);
    assert!(body.x <= 3.0 && rim.stands_at(body.x, body.y), "held at the wall's top, over the deck: {body:?}");
    assert_ne!(body.mode, Mode::Air, "never let go over the sea");
}

#[test]
fn a_body_climbing_a_wall_shimmies_along_it_no_further_than_the_rim() {
    // A deck with a tall wall along its north edge, both ending at x 3: the wall's end stands at the rim's.
    let blocks = vec![
        Block { min_x: -3.0, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 2.0, bottom: 0.0 },
        Block { min_x: -3.0, min_y: -1.8, max_x: 3.0, max_y: -1.5, top: 5.2, bottom: 0.0 },
    ];
    let rim = Heights::rim(&blocks, 0.3);
    let start = Body { z: 2.0, ..movement::standing(2.5, -1.0) };
    let north = Controls { forward: 1.0, yaw: 0.0, ..Controls::default() };
    let mut body = start;
    for _ in 0..120 {
        if body.mode == Mode::Climb {
            break;
        }
        body = press(body, north, &blocks, &rim, 1);
    }
    assert_eq!(body.mode, Mode::Climb, "on the wall: {body:?}");
    let east = Controls { sideways: 1.0, yaw: 0.0, ..Controls::default() };
    body = press(body, east, &blocks, &rim, 240);
    assert!(rim.stands_at(body.x, body.y), "held over the deck: {body:?}");
    let down = Controls { crouch: true, yaw: 0.0, ..Controls::default() };
    body = press(body, down, &blocks, &rim, 120);
    assert!(body.z >= 2.0 && rim.stands_at(body.x, body.y), "let go onto the deck, not the sea: {body:?}");
}
