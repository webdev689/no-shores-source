//! The body's moves, as the player plays them: paces, the jump, steps and walls, vaults and mantles, hanging and
//! climbing. Each runs at the server's tick.

use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, TUNING, standing, step_body};
use std::f64::consts::{FRAC_PI_2, FRAC_PI_4};

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
        step_body(&now, &controls, blocks, &Flat, TICK_SECONDS)
    })
}

fn close(actual: f64, expected: f64, within: f64) {
    assert!((actual - expected).abs() < within, "{actual} is not within {within} of {expected}");
}

fn block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top, bottom: 0.0 }
}

const FORWARD: fn(&mut Controls) = |controls| controls.forward = 1.0;

/// A body that walked up to the ledge and caught it on a jump.
fn hanging_from(ledge: Block) -> Body {
    let jumping = holding(|controls| {
        controls.forward = 1.0;
        controls.jump = true;
    });
    let mut body = run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[ledge], None);
    body = step_body(&body, &jumping, &[ledge], &Flat, TICK_SECONDS);
    for _ in 0..60 {
        if body.mode != Mode::Air {
            break;
        }
        body = step_body(&body, &holding(FORWARD), &[ledge], &Flat, TICK_SECONDS);
    }
    body
}

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
    let mut body = step_body(&standing(0.0, 0.0), &holding(|controls| controls.jump = true), &[], &Flat, TICK_SECONDS);
    assert_eq!(body.mode, Mode::Air);
    let mut highest: f64 = 0.0;
    for _ in 0..120 {
        if body.mode != Mode::Air {
            break;
        }
        body = step_body(&body, &STILL, &[], &Flat, TICK_SECONDS);
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
    let body = hanging_from(ledge);
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
fn pressing_into_a_tall_wall_off_square_climbs_it_squared_within_45_degrees_and_slides_on_past_them() {
    let tower = block(-5.0, -4.0, 5.0, -1.0, 4.0);
    let degrees = std::f64::consts::PI / 180.0;
    let pressed = |angle: f64| {
        let held = holding(move |controls| {
            controls.forward = 1.0;
            controls.yaw = angle * degrees;
        });
        run(standing(0.0, 0.0), held, 0.8, &[tower], None)
    };
    for angle in [0.5, 20.0, 44.0, -30.0] {
        let body = pressed(angle);
        assert_eq!(body.mode, Mode::Climb, "{angle} degrees off square takes hold");
        close(body.facing, 0.0, 1e-9);
    }
    assert_eq!(pressed(50.0).mode, Mode::Ground, "past 45 degrees it slides on along the wall");
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
    let jumped = step_body(&standing(0.0, 0.0), &Controls { jump: true, ..riding }, &[], &Flat, TICK_SECONDS);
    assert_eq!(jumped.mode, Mode::Ground);
    // Crouching does not slow the horse, and a rider does not climb.
    let crouching = Controls { crouch: true, ..riding };
    close(run(standing(0.0, 0.0), riding, 1.0, &[], Some(crouching)).y, -TUNING.ride_walk, 0.01);
    let tower = block(-5.0, -4.0, 5.0, -1.0, 4.0);
    assert_eq!(run(standing(0.0, 0.0), riding, 1.0, &[tower], None).mode, Mode::Ground);
}

#[test]
fn a_crouched_jump_leaves_at_four_fifths_of_the_speed_and_stands_the_body_up() {
    let crouched =
        step_body(&standing(0.0, 0.0), &holding(|controls| controls.crouch = true), &[], &Flat, TICK_SECONDS);
    assert!(crouched.crouched);
    let jumped = step_body(&crouched, &holding(|controls| controls.jump = true), &[], &Flat, TICK_SECONDS);
    assert_eq!(jumped.mode, Mode::Air);
    close(jumped.vz, TUNING.jump * TUNING.crouched_jump, 1e-9);
    assert!(!jumped.crouched);
}

#[test]
fn a_jump_waits_until_the_feet_have_settled() {
    let jumping = holding(|controls| controls.jump = true);
    let landed = Body { grounded: 0.0, ..standing(0.0, 0.0) };
    assert_eq!(step_body(&landed, &jumping, &[], &Flat, TICK_SECONDS).mode, Mode::Ground);
    let settled = run(landed, STILL, TUNING.grounded_to_jump, &[], None);
    assert_eq!(step_body(&settled, &jumping, &[], &Flat, TICK_SECONDS).mode, Mode::Air);
    // Landing from a jump starts the wait again, so jumps cannot be chained without a pause.
    let mut body = step_body(&settled, &jumping, &[], &Flat, TICK_SECONDS);
    while body.mode == Mode::Air {
        body = step_body(&body, &STILL, &[], &Flat, TICK_SECONDS);
    }
    assert_eq!(step_body(&body, &jumping, &[], &Flat, TICK_SECONDS).mode, Mode::Ground);
}

#[test]
fn a_jump_held_from_landing_lifts_once_the_feet_have_stood_its_tenth_of_a_second() {
    let jumping = holding(|controls| controls.jump = true);
    let mut body = Body { grounded: 0.0, ..standing(0.0, 0.0) };
    let mut ticks = 0;
    while body.mode == Mode::Ground && ticks < 60 {
        body = step_body(&body, &jumping, &[], &Flat, TICK_SECONDS);
        ticks += 1;
    }
    assert_eq!(f64::from(ticks), (TUNING.grounded_to_jump / TICK_SECONDS).round(), "lifted on tick {ticks}");
}

#[test]
fn on_a_wall_a_jump_kicks_off_away_from_it_but_from_a_lip_it_does_nothing() {
    let tower = block(-5.0, -4.0, 5.0, -1.0, 4.0);
    let jumping = holding(|controls| controls.jump = true);
    let climbing = run(standing(0.0, 0.0), holding(FORWARD), 0.5, &[tower], None);
    let kicked = step_body(&climbing, &jumping, &[tower], &Flat, TICK_SECONDS);
    assert_eq!(kicked.mode, Mode::Air);
    assert!(kicked.vy > 0.0, "it kicks off south, away from the wall, not at {}", kicked.vy);
    let ledge = Block { top: 2.3, ..tower };
    let hanging = hanging_from(ledge);
    assert_eq!(step_body(&hanging, &jumping, &[ledge], &Flat, TICK_SECONDS).mode, Mode::Hang);
}

#[test]
fn shimmying_stops_where_the_lip_ends_and_climbing_down_stops_at_the_ground() {
    let ledge = block(-5.0, -4.0, 1.0, -1.0, 2.3);
    let shimmied = run(hanging_from(ledge), holding(|controls| controls.sideways = 1.0), 5.0, &[ledge], None);
    assert_eq!(shimmied.mode, Mode::Hang);
    assert!(shimmied.x < ledge.max_x + TUNING.radius, "it hangs on past the lip's end, at x {}", shimmied.x);
    let tower = block(-5.0, -4.0, 5.0, -1.0, 4.0);
    let climbing = run(standing(0.0, 0.0), holding(FORWARD), 0.5, &[tower], None);
    let down = run(climbing, holding(|controls| controls.forward = -1.0), 2.0, &[tower], None);
    assert_eq!((down.mode, down.z), (Mode::Climb, 0.0));
}

#[test]
fn in_the_air_a_lip_is_caught_only_while_pressing_forward() {
    let ledge = block(-5.0, -4.0, 5.0, -1.0, 2.3);
    let near = run(standing(0.0, 0.0), holding(FORWARD), 0.3, &[ledge], None);
    let sideways = holding(|controls| controls.sideways = 1.0);
    let jumped = run(near, sideways, 1.0, &[ledge], Some(Controls { jump: true, ..sideways }));
    assert_eq!((jumped.mode, jumped.z), (Mode::Ground, 0.0));
}

#[test]
fn walking_into_a_corner_the_body_stops_at_its_face() {
    let wall = block(0.5, -3.0, 3.0, -1.0, 3.0);
    let northeast = holding(|controls| {
        controls.forward = 1.0;
        controls.yaw = FRAC_PI_4;
    });
    let stepped = step_body(&standing(0.1, -0.62), &northeast, &[wall], &Flat, TICK_SECONDS);
    assert!(stepped.x > 0.1, "it moves east along the face");
    close(stepped.y, -0.62, 1e-12);
}

#[test]
fn controls_out_of_range_are_held_to_it_and_a_control_that_is_not_a_number_counts_as_none() {
    let pushed = holding(|controls| controls.forward = 1e200);
    close(run(standing(0.0, 0.0), pushed, 1.0, &[], None).y, -TUNING.walk, 0.01);
    let broken = Controls { forward: f64::NAN, sideways: f64::INFINITY, yaw: f64::NAN, ..STILL };
    let body = run(standing(0.0, 0.0), broken, 1.0, &[], None);
    assert_eq!((body.x, body.y), (0.0, 0.0));
}
