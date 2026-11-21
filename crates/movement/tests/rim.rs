//! A course of blocks laid over the open sea, held at its edge by the rim round it: walked, jumped and vaulted
//! anywhere over the blocks, never climbed and never left for the sea.

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
fn a_body_pressed_into_a_wall_of_the_course_never_takes_hold_of_it() {
    let blocks = vec![
        Block { min_x: -3.0, min_y: -1.5, max_x: 2.7, max_y: 1.5, top: 2.0, bottom: 0.0 },
        Block { min_x: 2.7, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 5.2, bottom: 0.0 },
    ];
    let rim = Heights::rim(&blocks, 0.3);
    let start = Body { z: 2.0, ..movement::standing(1.5, 0.0) };
    let climb = Controls { forward: 1.0, yaw: std::f64::consts::FRAC_PI_2, ..Controls::default() };
    let jump = Controls { jump: true, ..climb };
    let mut body = press(start, climb, &blocks, &rim, 300);
    for _ in 0..6 {
        body = press(body, jump, &blocks, &rim, 20);
        body = press(body, climb, &blocks, &rim, 60);
    }
    assert_eq!((body.mode, body.z), (Mode::Ground, 2.0), "on the deck at the wall's foot: {body:?}");
    assert!(body.x < 2.7, "{body:?}");
    // The same wall off the open sea is climbed.
    let mut free = start;
    let climbed = (0..300).any(|_| {
        free = press(free, climb, &blocks, &movement::Flat, 1);
        free.mode == Mode::Climb
    });
    assert!(climbed, "{free:?}");
}

#[test]
fn a_body_jumping_at_a_lip_goes_over_one_within_a_vault_of_the_deck_and_hangs_from_none() {
    // A deck 2 m over the sea, a crate on it 1 m high and a stack 1.6 m high, each too deep to vault.
    let course = |rise: f64| {
        vec![
            Block { min_x: -3.0, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 2.0, bottom: 0.0 },
            Block { min_x: 1.2, min_y: -1.5, max_x: 3.0, max_y: 1.5, top: 2.0 + rise, bottom: 0.0 },
        ]
    };
    let start = Body { z: 2.0, ..movement::standing(0.0, 0.0) };
    let east = Controls { forward: 1.0, yaw: std::f64::consts::FRAC_PI_2, ..Controls::default() };
    let jump = Controls { jump: true, ..east };
    let jumped = |blocks: &[Block], terrain: &dyn Terrain| {
        let mut body = press(start, east, blocks, terrain, 30);
        let (mut hung, mut highest) = (false, body.z);
        for _ in 0..4 {
            for controls in [jump, east] {
                for _ in 0..30 {
                    body = press(body, controls, blocks, terrain, 1);
                    hung |= matches!(body.mode, Mode::Hang | Mode::Climb);
                    highest = highest.max(body.z);
                }
            }
        }
        (body, hung, highest)
    };
    let crate_course = course(1.0);
    let (over, hung, _) = jumped(&crate_course, &Heights::rim(&crate_course, 0.3));
    assert!(over.z > 2.9 && !hung, "onto the crate: {over:?}");
    let stack = course(1.6);
    let (held, hung, _) = jumped(&stack, &Heights::rim(&stack, 0.3));
    assert!(held.z < 2.1 && !hung, "never up the stack: {held:?}");
    let (_, _, highest) = jumped(&stack, &movement::Flat);
    assert!(highest > 3.5, "off the sea the stack is climbed: {highest}");
}
