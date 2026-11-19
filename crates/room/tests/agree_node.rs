//! A node's room and a browser predicting it step bodies alike on the node's window of the land: these runs over the
//! real windows and boxes of two nodes of the rainforest continent, Mistfall's social space on its city's terraces
//! and a patrol area on its carved land, and of the Saltgrass Downs, a patrol zone of continent 1 with its runs cut
//! into its rock, are fingerprinted here, natively as the room steps them, and by the client's test
//! of the same runs through WebAssembly (nodeWindow.test.ts lists the same nodes, rects and scripts, and cuts each
//! window with the land's own door).

use movement::floats::fingerprint;
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::f64::consts::{FRAC_PI_2, PI};
use std::path::Path;

/// Both tests hold this value; a change to the land, the city or the moves changes it in both, on purpose.
pub const NODE_RUN_HASH: &str = "4ac014c80571d057";

/// Ticks, then forward, sideways, yaw, run, and jump on the first tick only.
type Phase = (usize, f64, f64, f64, bool, bool);

/// A node, the rect the bake cuts its window to (its ring's bounds and 100 m past them), and the run over it from its
/// first spawn.
struct Run {
    continent: &'static str,
    node: &'static str,
    bounds: [f64; 4],
    script: &'static [Phase],
}

const RUNS: [Run; 3] = [
    // Across the plaza into its parapet; vault it onto the terrace beyond; jump; run east along the terrace.
    Run {
        continent: "continent-6",
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
        continent: "continent-6",
        node: "emerald-tangle",
        bounds: [489_189.5, 2_279_231.5, 490_895.5, 2_280_066.0],
        script: &[
            (600, 1.0, 0.0, 0.0, true, false),
            (600, 1.0, 0.0, FRAC_PI_2, true, false),
            (60, 1.0, 0.0, FRAC_PI_2, false, true),
            (600, 1.0, 0.3, PI * 1.25, false, false),
        ],
    },
    // From the landing inland, north, a jump, then on east toward the zone's runs.
    Run {
        continent: "continent-1",
        node: "saltgrass-downs",
        bounds: [2_806_393.0, 1_206_627.5, 2_808_235.5, 1_208_301.0],
        script: &[
            (900, 1.0, 0.0, PI * 1.5, true, false),
            (600, 1.0, 0.0, 0.0, true, false),
            (60, 1.0, 0.0, 0.0, false, true),
            (900, 1.0, 0.2, FRAC_PI_2, true, false),
        ],
    },
];

/// The rainforest's nodes as the bake makes them with no city blocks and no briefs, and continent 1's with both.
fn nodes_of(continent: &str) -> Vec<bake::NodeFile> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let found = layout.continents.iter().find(|each| each.id == continent).expect("the continent is drawn");
    let edits = land::edits::parse(&read(&format!("content/world/land/{continent}.json"))).expect("its edits parse");
    let (blocks, builders) = if continent == "continent-6" {
        (city::rmb::Blocks::default(), bake::Builders::default())
    } else {
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        (blocks, bake::builders(&root).expect("the builders read"))
    };
    bake::nodes_of(found, edits, &blocks, &builders).expect("the continent bakes")
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
fn the_runs_over_three_nodes_windows_move_to_their_fingerprint() {
    let nodes: Vec<bake::NodeFile> = ["continent-6", "continent-1"].into_iter().flat_map(nodes_of).collect();
    let mut bodies = Vec::new();
    for run in &RUNS {
        let node = nodes.iter().find(|node| node.id == run.node).unwrap();
        assert!(run.continent == "continent-6" || !node.boxes.is_empty(), "{} is laid out", run.node);
        assert_eq!(node.bounds, run.bounds, "{}'s rect", run.node);
        let ran = run_over(node, run.script);
        bodies.extend(ran);
    }
    for mode in [Mode::Ground, Mode::Vault, Mode::Air] {
        assert!(bodies.iter().any(|body| body.mode == mode), "the runs never put the body in {mode:?}");
    }
    assert_eq!(format!("{:016x}", fingerprint(&bodies)), NODE_RUN_HASH);
}
