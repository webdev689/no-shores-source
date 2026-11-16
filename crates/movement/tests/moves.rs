//! The body's moves, as the player plays them: paces, the jump, steps and walls, vaults and mantles, hanging and
//! climbing. Each runs at the server's tick.

use movement::{Block, Body, Controls, Mode, TICK_SECONDS, TUNING, standing, step_body};
use std::f64::consts::FRAC_PI_2;

const STILL: Controls =
    Controls { forward: 0.0, sideways: 0.0, yaw: 0.0, run: false, jump: false, crouch: false, mounted: false };

/// Controls held for every tick.
fn holding(change: impl Fn(&mut Controls)) -> Controls {
    let mut controls = STILL;
    change(&mut controls);
    controls
}

/// Runs the body for `seconds` with `held` controls, `first` on the first tick only.
fn run(body: Body, held: Controls, seconds: f64, blocks: &[Block], first: Option<Controls>) -> Body {
    let ticks = (seconds / TICK_SECONDS).round() as usize;
    (0..ticks).fold(body, |now, tick| {
        let controls = if tick == 0 { first.unwrap_or(held) } else { held };
        step_body(&now, &controls, blocks, TICK_SECONDS)
    })
}

fn close(actual: f64, expected: f64, within: f64) {
    assert!((actual - expected).abs() < within, "{actual} is not within {within} of {expected}");
}

fn block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top }
}

const FORWARD: fn(&mut Controls) = |controls| controls.forward = 1.0;

#[test]
fn the_body_walks_runs_and_crouches_at_dfos_paces_forward_being_where_it_looks() {
    let walked = run(standing(0.0, 0.0), holding(FORWARD), 1.0, &[], None);
    close(walked.y, -TUNING.walk, 0.01);
    close(walked.x, 0.0, 1e-9);
    let running = holding(|controls| {
        controls.forward = 1.0;
        controls.run = true;
    });
    close(run(standing(0.0, 0.0), running, 1.0, &[], None).y, -TUNING.run, 0.01);
    let crouching = holding(|controls| {
        controls.forward = 1.0;
        controls.crouch = true;
    });
    let crouched = run(standing(0.0, 0.0), holding(FORWARD), 1.0, &[], Some(crouching));
    assert!(crouched.crouched);
    close(crouched.y, -TUNING.crouch, 0.01);
    let east = holding(|controls| {
        controls.forward = 1.0;
        controls.yaw = FRAC_PI_2;
    });
    close(run(standing(0.0, 0.0), east, 1.0, &[], None).x, TUNING.walk, 0.01);
}

#[test]
fn a_jump_rises_about_half_a_metre_and_lands_again() {
    let mut body = step_body(&standing(0.0, 0.0), &holding(|controls| controls.jump = true), &[], TICK_SECONDS);
    assert_eq!(body.mode, Mode::Air);
    let mut highest: f64 = 0.0;
    for _ in 0..120 {
        if body.mode != Mode::Air {
            break;
        }
        body = step_body(&body, &STILL, &[], TICK_SECONDS);
        highest = highest.max(body.z);
    }
    close(highest, TUNING.jump * TUNING.jump / (2.0 * TUNING.gravity), 0.03);
    assert_eq!(body.mode, Mode::Ground);
    assert_eq!(body.z, 0.0);
}

#[test]
fn the_body_steps_up_onto_a_block_no_higher_than_a_step_and_is_stopped_by_a_taller_one() {
    let step = block(-1.0, -10.0, 1.0, -1.0, 0.4);
    close(run(standing(0.0, 0.0), holding(FORWARD), 1.0, &[step], None).z, 0.4, 1e-9);
    let wall = Block { top: 3.0, ..step };
    let stopped = run(standing(0.0, 0.0), holding(FORWARD), 1.0, &[wall], None);
    close(stopped.y, -1.0 + TUNING.radius, 0.08);
}

#[test]
fn jumping_at_a_low_thin_wall_vaults_it_and_at_a_low_deep_one_mantles_onto_it() {
    let jumping = holding(|controls| {
        controls.forward = 1.0;
        controls.jump = true;
    });
    let thin = block(-2.0, -1.3, 2.0, -1.0, 1.0);
    let mut body = run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[thin], None);
    body = run(body, holding(FORWARD), 1.5, &[thin], Some(jumping));
    assert_eq!(body.mode, Mode::Ground);
    assert!(body.y < -1.3, "{} is past the wall", body.y);
    assert_eq!(body.z, 0.0);
    let deep = Block { min_y: -4.0, ..thin };
    body = run(run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[deep], None), STILL, 1.5, &[deep], Some(jumping));
    assert_eq!(body.z, 1.0);
}

#[test]
fn a_lip_in_reach_from_the_ground_is_mantled_straight_over() {
    let jumping = holding(|controls| {
        controls.forward = 1.0;
        controls.jump = true;
    });
    let crate_block = block(-5.0, -4.0, 5.0, -1.0, 1.7);
    let mut body = run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[crate_block], None);
    body = run(body, STILL, 1.5, &[crate_block], Some(jumping));
    assert_eq!(body.mode, Mode::Ground);
    assert_eq!(body.z, 1.7);
}

#[test]
fn hanging_from_a_lip_sideways_shimmies_forward_climbs_over_and_crouch_lets_go() {
    let ledge = block(-5.0, -4.0, 5.0, -1.0, 2.3);
    let jumping = holding(|controls| {
        controls.forward = 1.0;
        controls.jump = true;
    });
    let mut body = run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[ledge], None);
    body = step_body(&body, &jumping, &[ledge], TICK_SECONDS);
    for _ in 0..60 {
        if body.mode != Mode::Air {
            break;
        }
        body = step_body(&body, &holding(FORWARD), &[ledge], TICK_SECONDS);
    }
    assert_eq!(body.mode, Mode::Hang);
    close(body.z, 2.3 - TUNING.hang, 1e-9);
    let shimmied = run(body, holding(|controls| controls.sideways = 1.0), 1.0, &[ledge], None);
    close(shimmied.x - body.x, TUNING.shimmy, 0.02);
    assert_eq!(shimmied.mode, Mode::Hang);
    let over = run(run(body, holding(FORWARD), 0.2, &[ledge], None), STILL, 1.0, &[ledge], None);
    assert_eq!(over.mode, Mode::Ground);
    assert_eq!(over.z, 2.3);
    let dropped = run(body, STILL, 1.0, &[ledge], Some(holding(|controls| controls.crouch = true)));
    assert_eq!(dropped.mode, Mode::Ground);
    assert_eq!(dropped.z, 0.0);
}

#[test]
fn pressing_into_a_wall_too_high_to_grab_climbs_it_to_its_lip_and_over() {
    let tower = block(-5.0, -4.0, 5.0, -1.0, 4.0);
    let mut body = run(standing(0.0, 0.0), holding(FORWARD), 0.5, &[tower], None);
    assert_eq!(body.mode, Mode::Climb);
    body = run(run(body, holding(FORWARD), 2.6, &[tower], None), STILL, 1.5, &[tower], None);
    assert_eq!(body.mode, Mode::Ground);
    assert_eq!(body.z, 4.0);
}

#[test]
fn mounted_the_body_rides_at_the_horses_paces_and_does_not_jump() {
    let riding = holding(|controls| {
        controls.forward = 1.0;
        controls.mounted = true;
    });
    close(run(standing(0.0, 0.0), riding, 1.0, &[], None).y, -TUNING.ride_walk, 0.01);
    let galloping = Controls { run: true, ..riding };
    close(run(standing(0.0, 0.0), galloping, 1.0, &[], None).y, -TUNING.ride_gallop, 0.01);
    let jumped = step_body(&standing(0.0, 0.0), &Controls { jump: true, ..riding }, &[], TICK_SECONDS);
    assert_eq!(jumped.mode, Mode::Ground);
}
