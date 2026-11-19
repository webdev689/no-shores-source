//! Continent 1's nodes as the bake lays them, walked by the movement rules: a body walks each of Saltmere's runs from
//! its mouth along its line to its door, and pressing on past the door gets it nowhere; up every ramp, the instances'
//! too, onto the terrace it serves; up every climb to its lookout on the massif's top; and over every footbridge
//! where a gorge out of a zone meets a river.

use layout::field::distance;
use layout::paths::off_line;
use layout::runs::Run;
use movement::terrain::Terrain;
use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;

/// How near a waypoint a body counts as there, and the door as reached, metres.
const THERE_M: f64 = 1.5;
const AT_DOOR_M: f64 = 3.0;

struct Zone {
    id: String,
    floor: Floor,
    blocks: Blocks,
    runs: Vec<Run>,
    ring: Vec<[f64; 2]>,
    terraces: Vec<[f64; 7]>,
    climbs: Vec<[f64; 7]>,
    /// Each footbridge over a gorge's river: its deck's top and its two ends, a few metres onto the banks.
    bridges: Vec<(f64, [[f64; 2]; 2])>,
}

/// The footbridges over a layout's gorges (a capsule of its floor out of an area's middle): the top of the deck laid in
/// lengths along each, and its ends a few metres out past its first and last lengths.
fn bridges_of(laid: &layout::Layout) -> Vec<(f64, [[f64; 2]; 2])> {
    let gorges = laid.sculpt.floors.iter().filter(|floor| {
        let from = [floor[0], floor[1]];
        distance(from, [floor[2], floor[3]]) > 1.0 && laid.areas.iter().any(|area| distance(area.at, from) < 1e-6)
    });
    let decks: Vec<&city::solids::Solid> = laid
        .seating
        .solids
        .iter()
        .filter(|solid| solid.material == city::solids::Material::Timber && (solid.size[2] - 0.5).abs() < 1e-9)
        .collect();
    gorges
        .filter_map(|&[x1, y1, x2, y2, half]| {
            let length = distance([x1, y1], [x2, y2]);
            let way = [(x2 - x1) / length, (y2 - y1) / length];
            let on: Vec<&&city::solids::Solid> =
                decks.iter().filter(|deck| off_line([deck.at[0], deck.at[1]], [x1, y1], [x2, y2]) < half).collect();
            let along = |deck: &&&city::solids::Solid| (deck.at[0] - x1) * way[0] + (deck.at[1] - y1) * way[1];
            let first = on.iter().min_by(|one, other| along(one).total_cmp(&along(other)))?;
            let last = on.iter().max_by(|one, other| along(one).total_cmp(&along(other)))?;
            let out = |deck: &&&city::solids::Solid, side: f64| {
                let reach = (deck.size[1] / 2.0 + 3.0) * side;
                [deck.at[0] + way[0] * reach, deck.at[1] + way[1] * reach]
            };
            Some((first.at[2] + first.size[2], [out(first, -1.0), out(last, 1.0)]))
        })
        .collect()
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
    layouts
        .iter()
        .map(|laid| {
            let node = nodes.iter().find(|node| node.id == laid.id).expect("the node bakes");
            Zone {
                id: laid.id.clone(),
                floor: Floor::Land(Box::new(node.ground.clone())),
                blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
                runs: laid.runs.clone(),
                ring: laid.ring.clone(),
                terraces: laid.basins.iter().flat_map(|basin| basin.terraces.iter().copied()).collect(),
                climbs: laid.sculpt.climbs.clone(),
                bridges: bridges_of(laid),
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

#[test]
fn every_terrace_is_walked_up_its_ramps() {
    let zones = zones();
    let (mut ramps, mut failed) = (0, Vec::new());
    for zone in &zones {
        for &[x1, y1, x2, y2, half, level, _] in zone.terraces.iter().filter(|terrace| terrace[5] == terrace[6]) {
            let serving = zone.terraces.iter().filter(|ramp| {
                ramp[5] == 0.0 && ramp[6] == level && off_line([ramp[2], ramp[3]], [x1, y1], [x2, y2]) < half
            });
            let mut served = false;
            for &[foot_x, foot_y, top_x, top_y, ..] in serving {
                ramps += 1;
                served = true;
                // From the ramp's foot up it, and on 3 m onto the terrace.
                let length = distance([foot_x, foot_y], [top_x, top_y]);
                let on = [top_x + (top_x - foot_x) / length * 3.0, top_y + (top_y - foot_y) / length * 3.0];
                let raised = zone.floor.height_at(on[0], on[1]) - zone.floor.height_at(foot_x, foot_y);
                let (body, _) = walked(zone, [foot_x, foot_y], &[[top_x, top_y], on], (60.0 / TICK_SECONDS) as usize);
                if distance([body.x, body.y], on) > THERE_M || raised < 1.0 {
                    failed.push(format!(
                        "{}: up the ramp from {foot_x:.0},{foot_y:.0} the body stops at {:.0},{:.0}, {raised:.1} m up",
                        zone.id, body.x, body.y
                    ));
                }
            }
            if !served {
                failed.push(format!("{}: no ramp up to the terrace at {x1:.0},{y1:.0}", zone.id));
            }
        }
    }
    assert!(ramps > 0, "continent 1 has terraces");
    assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn every_climb_is_walked_to_its_lookout() {
    let zones = zones();
    let (mut climbs, mut failed) = (0, Vec::new());
    for zone in &zones {
        for pair in layout::carve::lookouts(&zone.climbs) {
            climbs += 1;
            let ([foot_x, foot_y, top_x, top_y, ..], lookout) = (pair[0], [pair[1][0], pair[1][1]]);
            let raised = zone.floor.height_at(top_x, top_y) - zone.floor.height_at(foot_x, foot_y);
            let (body, _) = walked(zone, [foot_x, foot_y], &[lookout], (60.0 / TICK_SECONDS) as usize);
            if distance([body.x, body.y], lookout) > THERE_M || raised < 10.0 {
                failed.push(format!(
                    "{}: up the climb from {foot_x:.0},{foot_y:.0} the body stops at {:.0},{:.0}, the top {raised:.1} m up",
                    zone.id, body.x, body.y
                ));
            }
        }
    }
    assert!(climbs > 0, "continent 1 has climbs");
    assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn every_footbridge_over_a_gorges_river_is_walked_over() {
    let zones = zones();
    let (mut bridges, mut failed) = (0, Vec::new());
    for zone in &zones {
        for &(deck, [from, to]) in &zone.bridges {
            bridges += 1;
            // Across it from bank to bank, noting how high the body stands as it passes the deck's middle.
            let middle = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
            let mut body = standing_on(&zone.floor, &zone.blocks, from[0], from[1]);
            let mut over = f64::NEG_INFINITY;
            for _ in 0..(30.0 / TICK_SECONDS) as usize {
                let (east, south) = (to[0] - body.x, to[1] - body.y);
                if (east * east + south * south).sqrt() < THERE_M {
                    break;
                }
                let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
                body = step_body(&body, &controls, &zone.blocks, &zone.floor, TICK_SECONDS);
                if distance([body.x, body.y], middle) < 1.5 {
                    over = over.max(body.z);
                }
            }
            if distance([body.x, body.y], to) > THERE_M || over < deck - 0.1 {
                failed.push(format!(
                    "{}: over the bridge at {:.0},{:.0} the body stops at {:.0},{:.0}, {:.1} m at its middle on a {deck:.1} m deck",
                    zone.id, middle[0], middle[1], body.x, body.y, over
                ));
            }
        }
    }
    assert!(bridges > 0, "a gorge on continent 1 crosses a river");
    assert!(failed.is_empty(), "{failed:#?}");
}

/// How far a point lies outside a ring, metres (negative inside).
fn outside(ring: &[[f64; 2]], at: [f64; 2]) -> f64 {
    let edge = (0..ring.len())
        .map(|side| layout::paths::off_line(at, ring[side], ring[(side + 1) % ring.len()]))
        .fold(f64::INFINITY, f64::min);
    if layout::field::ring_holds(ring, at[0], at[1]) { -edge } else { edge }
}

#[test]
#[ignore = "the movement rules let a body climb any block, so no wall holds it on the massif's top: what bounds a rampart is the owner's call"]
fn a_ramparts_top_holds_a_body_in_its_section() {
    let zones = zones();
    let mut failed = Vec::new();
    for zone in &zones {
        for run in zone.runs.iter().filter(|run| run.kind == layout::brief::RunKind::Rampart) {
            // From each beat, and the middle of each passage between, out in sixteen headings across the top.
            let middles =
                run.line.windows(2).map(|pair| [(pair[0][0] + pair[1][0]) / 2.0, (pair[0][1] + pair[1][1]) / 2.0]);
            let starts: Vec<[f64; 2]> = run.beats.iter().map(|beat| beat.at).chain(middles).collect();
            for from in starts {
                for heading in 0..16 {
                    let (sine, cosine) = land::exact::sin_cos(f64::from(heading) * std::f64::consts::TAU / 16.0);
                    let target = [from[0] + sine * 400.0, from[1] - cosine * 400.0];
                    let (body, _) = walked(zone, from, &[target], (40.0 / TICK_SECONDS) as usize);
                    let out = outside(&zone.ring, [body.x, body.y]);
                    if out > 5.0 {
                        failed.push(format!(
                            "{}: {} lets a body {out:.0} m out of the section from {from:?}",
                            zone.id, run.name
                        ));
                    }
                }
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}
