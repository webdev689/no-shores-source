//! Blocks with an underside over the ground: slabs a body walks under, floors it stands on, ceilings its head meets.

use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, TUNING, standing, step_body};

const STILL: Controls =
    Controls { forward: 0.0, sideways: 0.0, yaw: 0.0, run: false, jump: false, crouch: false, mounted: false };
const NORTH: Controls = Controls { forward: 1.0, ..STILL };
const SOUTH: Controls = Controls { forward: -1.0, ..STILL };
const JUMP_NORTH: Controls = Controls { jump: true, ..NORTH };

/// A slab across x -2..2 and the given run of y, from `bottom` to `top`.
fn slab(min_y: f64, max_y: f64, bottom: f64, top: f64) -> Block {
    Block { min_x: -2.0, min_y, max_x: 2.0, max_y, top, bottom }
}

/// Every body of a run of `ticks` under `controls`.
fn run(body: Body, controls: Controls, ticks: usize, blocks: &[Block]) -> Vec<Body> {
    let mut bodies = vec![body];
    for _ in 0..ticks {
        let last = bodies[bodies.len() - 1];
        bodies.push(step_body(&last, &controls, blocks, &Flat, TICK_SECONDS));
    }
    bodies
}

fn last(bodies: &[Body]) -> Body {
    bodies[bodies.len() - 1]
}

#[test]
fn a_body_walks_under_a_slab_whose_bottom_is_over_its_head() {
    let bridge = slab(-4.0, -1.0, TUNING.height + 0.4, TUNING.height + 0.7);
    let bodies = run(standing(0.0, 0.0), NORTH, 90, &[bridge]);
    assert!(last(&bodies).y < -5.0, "it walked through to {:?}", last(&bodies));
    assert!(bodies.iter().all(|body| body.z == 0.0 && body.mode == Mode::Ground));
}

#[test]
fn a_slab_at_chest_height_stops_the_body_like_a_wall() {
    let rail = slab(-4.0, -1.0, 1.2, 1.5);
    let stopped = last(&run(standing(0.0, 0.0), NORTH, 90, &[rail]));
    assert!(stopped.y > -1.0 && stopped.y < -1.0 + TUNING.radius + 0.1, "{stopped:?}");
}

#[test]
fn a_jump_under_a_low_ceiling_stops_at_it_and_falls_back() {
    let ceiling = slab(-4.0, 4.0, 2.0, 2.3);
    let jump = Controls { jump: true, ..STILL };
    let first = step_body(&standing(0.0, 0.0), &jump, &[ceiling], &Flat, TICK_SECONDS);
    let bodies = run(first, STILL, 60, &[ceiling]);
    let highest = bodies.iter().fold(0.0_f64, |high, body| high.max(body.z));
    assert_eq!(highest, ceiling.bottom - TUNING.height, "the head meets the ceiling");
    let met = bodies.iter().position(|body| body.z == highest).unwrap_or(0);
    assert!(bodies[met].vz <= 0.0, "its upward speed ended: {:?}", bodies[met]);
    assert_eq!(last(&bodies).z, 0.0);
    assert_eq!(last(&bodies).mode, Mode::Ground);
}

#[test]
fn a_body_on_an_upper_floor_walks_off_its_edge_and_falls_to_the_ground_below() {
    let floor = slab(-2.0, 2.0, 3.0, 3.3);
    let on_top = Body { z: 3.3, ..standing(0.0, 0.0) };
    let bodies = run(on_top, NORTH, 150, &[floor]);
    assert!(bodies.iter().take(10).all(|body| body.z == 3.3 && body.mode == Mode::Ground));
    assert!(bodies.iter().any(|body| body.mode == Mode::Air));
    assert_eq!(last(&bodies).z, 0.0);
    assert!(last(&bodies).y < -2.0);
}

#[test]
fn a_crouched_body_under_a_low_ceiling_cannot_stand_until_it_is_clear() {
    let low = slab(-4.0, 4.0, 1.4, 1.7);
    let crouched = Body { crouched: true, crouch: 1.0, ..standing(0.0, 0.0) };
    let toggle = Controls { crouch: true, ..STILL };
    let tried = step_body(&crouched, &toggle, &[low], &Flat, TICK_SECONDS);
    assert!(tried.crouched, "there is no room to stand");
    let jumped = last(&run(crouched, Controls { jump: true, ..STILL }, 30, &[low]));
    assert!(jumped.crouched, "a jump does not stand it up into the ceiling");
    let clear = step_body(&crouched, &toggle, &[], &Flat, TICK_SECONDS);
    assert!(!clear.crouched);
}

#[test]
fn stairs_lead_up_to_a_slab_at_three_metres_and_down_again() {
    // Fourteen 0.2 m stairs from the ground, each 0.3 m deep going north, then the floor at 3 m beyond them.
    let mut course: Vec<Block> = (1..15_u32)
        .map(|stair| {
            let near = -0.3 * f64::from(stair);
            Block { min_x: -1.0, min_y: near - 0.3, max_x: 1.0, max_y: near, top: 0.2 * f64::from(stair), bottom: 0.0 }
        })
        .collect();
    course.push(slab(-12.0, -4.5, 2.7, 3.0));
    let up = last(&run(standing(0.0, 0.0), NORTH, 150, &course));
    assert_eq!(up.z, 3.0, "{up:?}");
    assert!(up.y < -4.5);
    let down = last(&run(up, SOUTH, 200, &course));
    assert_eq!(down.z, 0.0, "{down:?}");
    assert!(down.y > 0.0);
}

#[test]
fn hanging_and_climbing_never_take_hold_of_a_slabs_underside() {
    let low = slab(-4.0, -1.0, TUNING.height + 0.1, TUNING.height + 0.2);
    let high = slab(-4.0, -1.0, TUNING.height + 0.7, 6.0);
    for overhead in [low, high] {
        // Under the slab from the start, jumping and pressing on north until out from under it.
        let bodies = run(standing(0.0, -1.5), JUMP_NORTH, 120, &[overhead]);
        for body in bodies.iter().filter(|body| body.y > overhead.min_y - TUNING.radius) {
            assert!(matches!(body.mode, Mode::Ground | Mode::Air), "it took hold: {body:?}");
            assert!(body.z <= overhead.bottom - TUNING.height, "its head went into the slab: {body:?}");
        }
        assert!(last(&bodies).y < -4.0, "it went on under the slab: {:?}", last(&bodies));
    }
}
