//! Hanging from a lip and climbing a wall keep the body clear of every block: shimmied along a lip caught off square or
//! into a block meeting the wall, climbed down a wall standing on a block, and climbed up a face of blocks stacked
//! flush. Each runs at the server's tick.

use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, TUNING, standing, step_body};

/// The block a body stands inside, if any: one whose height range it overlaps by more than a step and whose footprint
/// its radius overlaps.
fn inside(blocks: &[Block], body: &Body) -> Option<Block> {
    let radius = TUNING.radius;
    blocks.iter().copied().find(|block| {
        block.top > body.z + TUNING.step
            && block.bottom < body.z + body.height()
            && body.x > block.min_x - radius
            && body.x < block.max_x + radius
            && body.y > block.min_y - radius
            && body.y < block.max_y + radius
    })
}

/// Every tick of `seconds` from `start` with `held` controls, each checked clear of the blocks but while going over a
/// lip, whose path rounds its edge; the last body.
fn clear_for(start: Body, held: Controls, blocks: &[Block], seconds: f64) -> Body {
    let ticks = (seconds / TICK_SECONDS).round() as usize;
    (0..ticks).fold(start, |body, tick| {
        let next = step_body(&body, &held, blocks, &Flat, TICK_SECONDS);
        let over = matches!(next.mode, Mode::Mantle | Mode::Vault);
        assert_eq!(inside(blocks, &next).filter(|_| !over), None, "tick {tick} ends inside a block: {next:?}");
        next
    })
}

fn block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, bottom: f64, top: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top, bottom }
}

/// The body run up to the ledge north of it and leaping at it looking along `yaw`, until it hangs.
fn caught(ledge: &[Block], yaw: f64) -> Body {
    let forward = Controls { forward: 1.0, ..Controls::default() };
    let mut body = (0..18).fold(standing(0.0, 0.0), |body, _| step_body(&body, &forward, ledge, &Flat, TICK_SECONDS));
    let leap = Controls { forward: 1.0, jump: true, yaw, ..Controls::default() };
    body = step_body(&body, &leap, ledge, &Flat, TICK_SECONDS);
    for _ in 0..60 {
        if body.mode != Mode::Air {
            break;
        }
        body = step_body(&body, &Controls { jump: false, ..leap }, ledge, &Flat, TICK_SECONDS);
    }
    assert_eq!(body.mode, Mode::Hang, "the lip is caught");
    body
}

#[test]
fn shimmying_along_a_lip_caught_off_square_never_moves_into_the_ledge() {
    let ledge = [block(-5.0, -4.0, 5.0, -1.0, 0.0, 2.3)];
    let hanging = caught(&ledge, 0.6);
    for sideways in [-1.0, 1.0] {
        clear_for(hanging, Controls { sideways, yaw: 0.6, ..Controls::default() }, &ledge, 2.0);
    }
}

#[test]
fn shimmying_along_a_lip_into_a_block_meeting_the_wall_stops_short_of_it() {
    let ledge = block(-5.0, -4.0, 5.0, -1.0, 0.0, 2.3);
    let pillar = block(1.0, -1.0, 2.0, 0.0, 0.0, 4.0);
    let blocks = [ledge, pillar];
    let hanging = caught(&blocks, 0.0);
    let shimmied = clear_for(hanging, Controls { sideways: 1.0, ..Controls::default() }, &blocks, 2.0);
    assert_eq!(shimmied.mode, Mode::Hang);
}

#[test]
fn climbing_down_a_wall_standing_on_a_block_stops_on_that_block() {
    let platform = block(-6.0, -6.0, 6.0, 6.0, 0.0, 3.0);
    let tower = block(-5.0, -4.0, 5.0, -1.0, 3.0, 8.0);
    let blocks = [platform, tower];
    let start = Body { z: 3.0, ..standing(0.0, 0.0) };
    let climbing = clear_for(start, Controls { forward: 1.0, ..Controls::default() }, &blocks, 0.5);
    assert_eq!(climbing.mode, Mode::Climb);
    let down = clear_for(climbing, Controls { forward: -1.0, ..Controls::default() }, &blocks, 4.0);
    assert_eq!((down.mode, down.z), (Mode::Climb, 3.0));
}

#[test]
fn a_face_of_two_blocks_stacked_flush_is_climbed_past_the_seam_to_the_top() {
    let lower = block(-5.0, -4.0, 5.0, -1.0, 0.0, 4.0);
    let upper = block(-5.0, -4.0, 5.0, -1.0, 4.0, 8.0);
    let blocks = [lower, upper];
    let climbing = clear_for(standing(0.0, 0.0), Controls { forward: 1.0, ..Controls::default() }, &blocks, 6.6);
    let climbed = clear_for(climbing, Controls::default(), &blocks, 1.5);
    assert_eq!((climbed.mode, climbed.z), (Mode::Ground, 8.0));
}

#[test]
fn a_short_block_stacked_flush_on_a_wall_is_climbed_onto_from_the_hang_whichever_is_listed_first() {
    let lower = block(-5.0, -4.0, 5.0, -1.0, 0.0, 4.0);
    let upper = block(-5.0, -4.0, 5.0, -1.0, 4.0, 5.0);
    for blocks in [[lower, upper], [upper, lower]] {
        // Pressed on until it goes over the top, then let be.
        let climbing = clear_for(standing(0.0, 0.0), Controls { forward: 1.0, ..Controls::default() }, &blocks, 4.0);
        let climbed = clear_for(climbing, Controls::default(), &blocks, 1.5);
        assert_eq!((climbed.mode, climbed.z), (Mode::Ground, 5.0));
    }
}

#[test]
fn a_hold_caught_at_a_seam_climbs_on_to_the_walls_top_and_never_jumps_up_it() {
    let lower = block(-5.0, -4.0, 5.0, -1.0, 0.0, 4.0);
    let upper = block(-5.0, -4.0, 5.0, -1.0, 4.0, 8.0);
    let blocks = [lower, upper];
    let seam = Body { mode: Mode::Hang, z: 2.2, lip: 4.0, facing: 0.0, ..standing(0.0, -0.6) };
    let held = step_body(&seam, &Controls::default(), &blocks, &Flat, TICK_SECONDS);
    assert_eq!((held.mode, held.z), (Mode::Climb, 2.2));
}

#[test]
fn a_taller_block_beside_a_wall_is_not_taken_for_a_block_stacked_on_it() {
    let wall = block(-5.0, -4.0, 1.0, -1.0, 0.0, 2.3);
    let tower = block(1.0, -4.0, 2.0, -1.0, 0.0, 8.0);
    let blocks = [wall, tower];
    let start = standing(0.8, 0.0);
    let climbing = clear_for(start, Controls { forward: 1.0, ..Controls::default() }, &blocks, 0.5);
    assert_eq!((climbing.mode, climbing.lip), (Mode::Climb, 2.3));
}
