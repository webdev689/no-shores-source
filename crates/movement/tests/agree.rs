//! Movement agrees to the bit wherever it runs: this scripted run over a small course, through every way a body can be
//! held, is fingerprinted here, natively, and by the client's test of the same run through WebAssembly
//! (movementRules.test.ts lists the same course and script).

use movement::floats::fingerprint;
use movement::{Block, Body, Controls, Flat, Mode, TICK_SECONDS, standing, step_body};
use std::f64::consts::{FRAC_PI_2, PI};

/// Both tests hold this value; a change to the moves changes it in both, on purpose.
pub const RUN_HASH: &str = "1319303fd957617b";

/// A ledge to catch and climb, a low thin wall to vault, a tower to climb, and a step.
const COURSE: [Block; 4] = [
    Block { min_x: -5.0, min_y: -4.0, max_x: 5.0, max_y: -1.0, top: 2.3 },
    Block { min_x: -12.0, min_y: 6.0, max_x: -6.0, max_y: 6.3, top: 1.0 },
    Block { min_x: 8.0, min_y: 2.0, max_x: 9.0, max_y: 9.0, top: 4.0 },
    Block { min_x: -2.0, min_y: 3.0, max_x: 2.0, max_y: 5.0, top: 0.4 },
];

/// Ticks, then forward, sideways, yaw, run, jump and crouch (on the first tick only) and mounted.
type Phase = (usize, f64, f64, f64, bool, bool, bool, bool);

/// Walk to the ledge, jump and catch it on the seventh tick, shimmy and climb over; run off it onto the step; crouch
/// and walk west, stand and run on; vault the thin wall; run to the tower, edge along it, climb it and go over; then
/// gallop off it mounted, the jump refused.
const SCRIPT: [Phase; 14] = [
    (20, 1.0, 0.0, 0.05, false, false, false, false),
    (7, 1.0, 0.0, 0.05, false, true, false, false),
    (40, 0.0, 1.0, 0.05, false, false, false, false),
    (60, 1.0, 0.0, 0.05, false, false, false, false),
    (60, 1.0, 0.2, 3.1, true, false, false, false),
    (40, 1.0, 0.0, -FRAC_PI_2, false, false, true, false),
    (60, 1.0, 0.0, -FRAC_PI_2, true, false, true, false),
    (12, 1.0, 0.0, PI, false, false, false, false),
    (40, 1.0, 0.0, PI, false, true, false, false),
    (150, 1.0, 0.0, FRAC_PI_2, true, false, false, false),
    (20, 0.0, 1.0, FRAC_PI_2, false, false, false, false),
    (200, 1.0, 0.0, FRAC_PI_2, false, false, false, false),
    (30, 0.0, -1.0, FRAC_PI_2, false, false, false, false),
    (60, 1.0, 0.0, 0.7, true, true, false, true),
];

fn run_script() -> Vec<Body> {
    let mut bodies = Vec::new();
    let mut body = standing(0.3, 0.7);
    for (ticks, forward, sideways, yaw, run, jump, crouch, mounted) in SCRIPT {
        for tick in 0..ticks {
            let first = tick == 0;
            let controls =
                Controls { forward, sideways, yaw, run, jump: jump && first, crouch: crouch && first, mounted };
            body = step_body(&body, &controls, &COURSE, &Flat, TICK_SECONDS);
            bodies.push(body);
        }
    }
    bodies
}

#[test]
fn the_script_holds_the_body_every_way_it_can_be_held() {
    let bodies = run_script();
    for mode in [Mode::Ground, Mode::Air, Mode::Hang, Mode::Climb, Mode::Mantle, Mode::Vault] {
        assert!(bodies.iter().any(|body| body.mode == mode), "the script never puts the body in {mode:?}");
    }
}

#[test]
fn the_scripted_run_moves_to_its_fingerprint() {
    assert_eq!(format!("{:016x}", fingerprint(&run_script())), RUN_HASH);
}
