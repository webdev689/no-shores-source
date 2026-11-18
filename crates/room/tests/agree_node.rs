//! A node's room and a browser predicting it step bodies alike on the node's window of the land: these runs over the
//! real windows and boxes of two nodes of the rainforest continent, Mistfall's social space on its city's terraces
//! and a patrol area on open land, are fingerprinted here, natively as the room steps them, and by the client's test
//! of the same runs through WebAssembly (nodeWindow.test.ts lists the same nodes, rects and scripts, and cuts each
//! window with the land's own door).

use movement::floats::fingerprint;
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::f64::consts::{FRAC_PI_2, PI};
use std::path::Path;

/// Both tests hold this value; a change to the land, the city or the moves changes it in both, on purpose.
pub const NODE_RUN_HASH: &str = "9ff3b96b28001f5a";

/// Ticks, then forward, sideways, yaw, run, and jump on the first tick only.
type Phase = (usize, f64, f64, f64, bool, bool);

/// A node, the rect the bake cuts its window to (its ring's bounds and 100 m past them), and the run over it from its
/// first spawn.
struct Run {
    node: &'static str,
    bounds: [f64; 4],
    script: &'static [Phase],
}

const RUNS: [Run; 2] = [
    // Across the plaza into its parapet; vault it onto the terrace beyond; jump; run east along the terrace.
    Run {
        node: "mistfall-social",
        bounds: [489_770.0, 2_270_350.0, 490_230.0, 2_270_670.0],
        script: &[
            (900, 1.0, 0.0, 0.0, true, false),
            (60, 1.0, 0.0, 0.0, false, true),
            (120, 1.0, 0.0, 0.0, false, false),
            (60, 1.0, 0.0, 0.0, false, true),
            (300, 1.0, 0.0, FRAC_PI_2, true, false),
        ],
    },
    // North over open land, east, a jump, then back south-west.
    Run {
        node: "emerald-tangle",
        bounds: [489_111.0, 2_279_145.0, 490_942.0, 2_280_864.0],
        script: &[
            (600, 1.0, 0.0, 0.0, true, false),
            (600, 1.0, 0.0, FRAC_PI_2, true, false),
            (60, 1.0, 0.0, FRAC_PI_2, false, true),
            (600, 1.0, 0.3, PI * 1.25, false, false),
        ],
    },
];

fn rainforest_nodes() -> Vec<bake::NodeFile> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("layout.json")).expect("the layout parses");
    let continent = layout.continents.iter().find(|continent| continent.id == "continent-6");
    let edits = land::edits::parse(&read("land/continent-6.json")).expect("the rainforest's edits parse");
    let blocks = city::rmb::Blocks::default();
    bake::nodes_of(continent.expect("the rainforest is continent-6"), edits, &blocks).expect("the rainforest bakes")
}

fn run_over(node: &bake::NodeFile, script: &[Phase]) -> Vec<Body> {
    let floor = Floor::Land(Box::new(node.ground.clone()));
    let blocks: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
    let [x, y] = node.spawns[0];
    let mut body = standing_on(&floor, &blocks, x, y);
    let mut bodies = vec![body];
    for &(ticks, forward, sideways, yaw, run, jump) in script {
        for tick in 0..ticks {
            let controls = Controls { forward, sideways, yaw, run, jump: jump && tick == 0, ..Controls::default() };
            body = step_body(&body, &controls, &blocks, &floor, TICK_SECONDS);
            bodies.push(body);
        }
    }
    bodies
}

#[test]
fn the_runs_over_two_nodes_windows_move_to_their_fingerprint() {
    let nodes = rainforest_nodes();
    let mut bodies = Vec::new();
    for run in &RUNS {
        let node = nodes.iter().find(|node| node.id == run.node).unwrap();
        assert_eq!(node.bounds, run.bounds, "{}'s rect", run.node);
        let ran = run_over(node, run.script);
        bodies.extend(ran);
    }
    for mode in [Mode::Ground, Mode::Vault, Mode::Air] {
        assert!(bodies.iter().any(|body| body.mode == mode), "the runs never put the body in {mode:?}");
    }
    assert_eq!(format!("{:016x}", fingerprint(&bodies)), NODE_RUN_HASH);
}
