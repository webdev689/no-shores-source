//! Saltmere's runs as the bake lays them, walked by the movement rules: a body walks each run from its mouth along its
//! line to its door, and pressing on past the door gets it nowhere.

use layout::runs::Run;
use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];
/// How near a waypoint a body counts as there, and the door as reached, metres.
const THERE_M: f64 = 1.5;
const AT_DOOR_M: f64 = 3.0;

struct Zone {
    id: String,
    floor: Floor,
    blocks: Blocks,
    runs: Vec<Run>,
}

fn zones() -> Vec<Zone> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = layout.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("continent-1 bakes");
    ZONES
        .iter()
        .map(|id| {
            let laid = layouts.iter().find(|layout| layout.id == *id).expect("the zone lays out");
            let node = nodes.iter().find(|node| node.id == *id).expect("the zone bakes");
            Zone {
                id: (*id).to_owned(),
                floor: Floor::Land(Box::new(node.ground.clone())),
                blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
                runs: laid.runs.clone(),
            }
        })
        .collect()
}

/// A body walked from `from` through each waypoint in turn, steering at each tick toward the next; where it ends, and
/// how many waypoints it passed.
fn walked(zone: &Zone, from: [f64; 2], waypoints: &[[f64; 2]], ticks: usize) -> (movement::Body, usize) {
    let mut body = standing_on(&zone.floor, &zone.blocks, from[0], from[1]);
    let mut next = 0;
    for _ in 0..ticks {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < THERE_M {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &zone.blocks, &zone.floor, TICK_SECONDS);
    }
    (body, next)
}

#[test]
fn every_run_is_walked_to_its_door_and_no_further() {
    let zones = zones();
    let mut failed = Vec::new();
    for zone in &zones {
        for run in &zone.runs {
            let waypoints: Vec<[f64; 2]> = run.line.iter().skip(1).copied().chain(std::iter::once(run.door)).collect();
            let ticks = (600.0 / TICK_SECONDS) as usize;
            let (body, passed) = walked(zone, run.mouth, &waypoints, ticks);
            let to_door = layout::field::distance([body.x, body.y], run.door);
            if to_door > AT_DOOR_M {
                let stuck = run.line.get(passed + 1).copied().unwrap_or(run.door);
                failed.push(format!("{}: {} stops at {:.0},{:.0} before {stuck:?}", zone.id, run.name, body.x, body.y));
                continue;
            }
            let beyond = [run.door[0] + run.facing[0] * 10.0, run.door[1] + run.facing[1] * 10.0];
            let (pressed, _) = walked(zone, [body.x, body.y], &[beyond], (20.0 / TICK_SECONDS) as usize);
            let past = (pressed.x - run.door[0]) * run.facing[0] + (pressed.y - run.door[1]) * run.facing[1];
            if past > 1.0 {
                failed.push(format!("{}: {} lets a body {past:.1} m past its door", zone.id, run.name));
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}
