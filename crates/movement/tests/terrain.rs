//! A body on terrain under the blocks: up and down slopes with its feet on the ground, stopped by a rise too steep to
//! walk, landing where the ground is, and the blocks standing on it. Each runs at the server's tick.

use movement::blocks::ground_at;
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, TUNING, Terrain, standing, step_body};
use std::f64::consts::{FRAC_1_SQRT_2, FRAC_PI_4, PI};

/// Terrain shaped by a function of (x, y).
struct Shaped(fn(f64, f64) -> f64);

impl Terrain for Shaped {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        (self.0)(x, y)
    }
}

/// Rising northward (toward -y) at half a metre a metre, about 27°.
const GENTLE: Shaped = Shaped(|_, y| -0.5 * y);
/// Rising northward at a metre a metre, 45°.
const STEEP: Shaped = Shaped(|_, y| -y);
/// Level at 0 m south of y = -1, rising northward past it at 2 m a metre, about 63°.
const CLIFF: Shaped = Shaped(|_, y| if y < -1.0 { (-1.0 - y) * 2.0 } else { 0.0 });
/// Rising northward at 1.5 m a metre, about 56°: too steep to walk straight up, not slantwise.
const SCARP: Shaped = Shaped(|_, y| -1.5 * y);

const STILL: Controls = Controls {
    forward: 0.0,
    sideways: 0.0,
    yaw: 0.0,
    run: false,
    jump: false,
    crouch: false,
    mounted: false,
    boost: false,
};

fn heading(yaw: f64, run: bool) -> Controls {
    Controls { forward: 1.0, yaw, run, ..STILL }
}

/// Every tick of `seconds` with `held` controls, `first` on the first tick only.
fn ticks(body: Body, held: Controls, seconds: f64, terrain: &Shaped, first: Option<Controls>) -> Vec<Body> {
    let count = (seconds / TICK_SECONDS).round() as usize;
    let mut bodies = vec![body];
    for tick in 0..count {
        let controls = if tick == 0 { first.unwrap_or(held) } else { held };
        let now = bodies[bodies.len() - 1];
        bodies.push(step_body(&now, &controls, &[], terrain, TICK_SECONDS));
    }
    bodies.split_off(1)
}

/// A body standing on the terrain at (x, y).
fn standing_on(terrain: &Shaped, x: f64, y: f64) -> Body {
    Body { z: terrain.height_at(x, y), ..standing(x, y) }
}

fn on_the_ground(bodies: &[Body], terrain: &Shaped) {
    for body in bodies {
        assert_eq!(body.mode, Mode::Ground, "at ({}, {})", body.x, body.y);
        assert_eq!(body.z.to_bits(), terrain.height_at(body.x, body.y).to_bits(), "feet on the ground at {}", body.y);
    }
}

#[test]
fn walking_up_a_slope_within_the_limit_the_feet_follow_the_ground() {
    for (terrain, run) in [(&GENTLE, false), (&STEEP, false), (&STEEP, true)] {
        let bodies = ticks(standing_on(terrain, 0.0, 0.0), heading(0.0, run), 1.0, terrain, None);
        on_the_ground(&bodies, terrain);
        let pace = if run { TUNING.run } else { TUNING.walk };
        let last = bodies[bodies.len() - 1];
        assert!((last.y + pace).abs() < 0.01, "a slope does not slow the pace: {}", last.y);
    }
}

#[test]
fn walking_down_a_slope_the_feet_stay_on_the_ground() {
    for (terrain, run) in [(&GENTLE, true), (&STEEP, false), (&STEEP, true)] {
        let bodies = ticks(standing_on(terrain, 0.0, -10.0), heading(PI, run), 1.0, terrain, None);
        on_the_ground(&bodies, terrain);
        assert!(bodies[bodies.len() - 1].y > -6.0, "it walked down");
    }
}

#[test]
fn a_rise_steeper_than_the_limit_stops_the_body_like_a_wall() {
    let bodies = ticks(standing(0.0, 0.0), heading(0.0, true), 1.0, &CLIFF, None);
    on_the_ground(&bodies, &CLIFF);
    let last = bodies[bodies.len() - 1];
    let stride = TUNING.run * TICK_SECONDS;
    assert!((last.y + 1.0).abs() < stride, "stopped within a stride of the foot, at {}", last.y);
    assert!(last.z <= TUNING.slope * stride, "it did not climb: {}", last.z);
}

#[test]
fn pressed_into_a_rise_too_steep_at_an_angle_the_body_slides_along_it() {
    let at_the_foot = standing(0.0, -1.0);
    let bodies = ticks(at_the_foot, heading(FRAC_PI_4, false), 1.0, &CLIFF, None);
    on_the_ground(&bodies, &CLIFF);
    let last = bodies[bodies.len() - 1];
    assert_eq!(last.y, -1.0, "it gains nothing up the rise");
    assert!((last.x - TUNING.walk * FRAC_1_SQRT_2).abs() < 0.01, "it slides along the foot: {}", last.x);
}

#[test]
fn a_rise_too_steep_to_walk_straight_up_is_climbed_slantwise_as_steeply_as_the_path_rises() {
    let straight = ticks(standing_on(&SCARP, 0.0, 0.0), heading(0.0, false), 1.0, &SCARP, None);
    assert_eq!(straight[straight.len() - 1].y, 0.0, "straight up, it is stopped");
    // Sixty degrees off the fall line, the path rises at half the slope: 0.75 m a metre.
    let slantwise = ticks(standing_on(&SCARP, 0.0, 0.0), heading(PI / 3.0, false), 1.0, &SCARP, None);
    on_the_ground(&slantwise, &SCARP);
    let last = slantwise[slantwise.len() - 1];
    assert!((last.y + TUNING.walk / 2.0).abs() < 0.01, "it climbs as it walks: {}", last.y);
}

#[test]
fn a_block_sunk_into_a_slope_is_walked_onto_and_off_again() {
    let sunk = Block { min_x: -1.0, min_y: -4.0, max_x: 1.0, max_y: -2.0, top: 1.2, bottom: 0.0 };
    let mut body = standing_on(&GENTLE, 0.0, 0.0);
    let mut on_the_block = false;
    for _ in 0..120 {
        body = step_body(&body, &heading(0.0, false), &[sunk], &GENTLE, TICK_SECONDS);
        assert_eq!(body.mode, Mode::Ground);
        on_the_block |= body.z == sunk.top && GENTLE.height_at(body.x, body.y) < sunk.top;
    }
    assert!(on_the_block, "it stood on the block's top");
    assert_eq!(body.z, GENTLE.height_at(body.x, body.y), "past it, on the slope again at {}", body.y);
}

#[test]
fn just_within_the_limit_a_rise_is_walked_and_just_past_it_is_not() {
    let within = Shaped(|_, y| -y * 1.18);
    let past = Shaped(|_, y| -y * 1.2);
    let walked = ticks(standing_on(&within, 0.0, 0.0), heading(0.0, false), 0.5, &within, None);
    assert!(walked[walked.len() - 1].y < -2.0);
    let refused = ticks(standing_on(&past, 0.0, 0.0), heading(0.0, false), 0.5, &past, None);
    assert_eq!(refused[refused.len() - 1].y, 0.0);
}

#[test]
fn a_fall_lands_on_the_slope_where_the_body_comes_down() {
    let falling = Body { mode: Mode::Air, z: 6.0, vy: -3.0, ..standing(0.0, 0.0) };
    let bodies = ticks(falling, STILL, 2.0, &GENTLE, None);
    let landed = bodies.iter().find(|body| body.mode == Mode::Ground).unwrap();
    assert_eq!(landed.z.to_bits(), GENTLE.height_at(landed.x, landed.y).to_bits());
    assert!(landed.y < -1.0, "it carried on north as it fell");
    let jumping = Controls { jump: true, ..heading(0.0, false) };
    let jumped = ticks(standing_on(&GENTLE, 0.0, 0.0), heading(0.0, false), 1.0, &GENTLE, Some(jumping));
    assert!(jumped.iter().any(|body| body.mode == Mode::Air), "it jumped");
    on_the_ground(&jumped[jumped.len() - 30..], &GENTLE);
}

#[test]
fn walking_off_a_drop_higher_than_a_step_the_body_falls_to_the_ground_below() {
    let ledge = Shaped(|_, y| if y < -1.0 { 0.0 } else { 3.0 });
    let bodies = ticks(standing_on(&ledge, 0.0, 0.0), heading(0.0, false), 1.5, &ledge, None);
    assert!(bodies.iter().any(|body| body.mode == Mode::Air), "it fell");
    on_the_ground(&bodies[bodies.len() - 10..], &ledge);
}

#[test]
fn the_ground_is_the_higher_of_the_terrain_and_a_block_within_a_step() {
    let block = Block { min_x: -1.0, min_y: -1.0, max_x: 1.0, max_y: 1.0, top: 1.0, bottom: 0.0 };
    assert_eq!(ground_at(&[block], &Shaped(|_, _| 2.0), 0.0, 0.0, 2.0), 2.0, "a buried block");
    assert_eq!(ground_at(&[block], &Shaped(|_, _| 0.5), 0.0, 0.0, 0.5), 1.0, "a block on the ground");
    assert_eq!(ground_at(&[block], &Shaped(|_, _| 0.2), 0.0, 0.0, 0.2), 0.2, "a block more than a step up");
}

#[test]
fn a_body_on_raised_ground_climbs_down_a_wall_no_lower_than_the_ground() {
    let raised = Shaped(|_, _| 1.0);
    let tower = Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 5.0, bottom: 0.0 };
    let mut body = standing_on(&raised, 0.0, 0.0);
    for _ in 0..30 {
        body = step_body(&body, &heading(0.0, false), &[tower], &raised, TICK_SECONDS);
    }
    assert_eq!(body.mode, Mode::Climb);
    for _ in 0..120 {
        body = step_body(&body, &Controls { forward: -1.0, ..STILL }, &[tower], &raised, TICK_SECONDS);
    }
    assert_eq!((body.mode, body.z), (Mode::Climb, 1.0));
}
