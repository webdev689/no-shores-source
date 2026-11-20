//! Continent 1's nodes as the bake lays them, walked by the movement rules: a body walks each of Saltmere's runs from
//! its mouth along its line to its door, and pressing on past the door gets it nowhere; up every ramp, the instances'
//! too, onto the terrace it serves; along every ruin's spoke from its plaza onto its tier; up every climb to its lookout on the massif's top; and over every bridge, a
//! path's or a gorge's, both ways.

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
    terraces: Vec<[f64; 7]>,
    /// The ramps up each tiered ruin's spokes from its plaza to a tier (`[x1, y1, x2, y2, half, from, to]`).
    spokes: Vec<[f64; 7]>,
    climbs: Vec<[f64; 7]>,
    bridges: Vec<Bridge>,
}

/// A bridge over a path's or a gorge's river: its deck's top at its middle, its two ends a few metres onto the banks,
/// the walked width of the way over it, and its rails' lengths (each a solid's bounds).
struct Bridge {
    deck: f64,
    ends: [[f64; 2]; 2],
    width: f64,
    rails: Vec<[f64; 6]>,
}

/// A layout's bridges: over each path's crossing and over each gorge (a capsule of its floor out of an area's middle)
/// where a deck is laid in lengths along it.
fn bridges_of(laid: &layout::Layout) -> Vec<Bridge> {
    let footpath = layout::paths::Tier::Footpath.width();
    let gorges = laid.sculpt.floors.iter().filter(|floor| {
        let from = [floor[0], floor[1]];
        distance(from, [floor[2], floor[3]]) > 1.0 && laid.areas.iter().any(|area| distance(area.at, from) < 1e-6)
    });
    let gorges = gorges.map(|&[x1, y1, x2, y2, half]| ([[x1, y1], [x2, y2]], half, footpath));
    // A path's crossing, its line drawn on well past its banks, for a deck reaching out along a lower bank.
    let crossings = laid.paths.iter().flat_map(|path| path.crossings.iter().map(|banks| (*banks, path.tier.width())));
    let crossings = crossings.map(|([from, to], width)| {
        let length = distance(from, to).max(1e-9);
        let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let out = |at: [f64; 2], side: f64| [at[0] + way[0] * 30.0 * side, at[1] + way[1] * 30.0 * side];
        ([out(from, -1.0), out(to, 1.0)], 3.0, width)
    });
    let timber = |solid: &&city::solids::Solid| solid.material == city::solids::Material::Timber;
    let decks: Vec<&city::solids::Solid> =
        laid.seating.solids.iter().filter(timber).filter(|solid| (solid.size[2] - 0.5).abs() < 1e-9).collect();
    let rails: Vec<&city::solids::Solid> = laid
        .seating
        .solids
        .iter()
        .filter(timber)
        .filter(|solid| solid.size[0] == 0.2 && solid.size[2] == 1.0)
        .collect();
    crossings
        .chain(gorges)
        .filter_map(|([from, to], half, width)| {
            let length = distance(from, to);
            let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
            let mut on: Vec<&&city::solids::Solid> =
                decks.iter().filter(|deck| off_line([deck.at[0], deck.at[1]], from, to) < half).collect();
            let along =
                |deck: &&&city::solids::Solid| (deck.at[0] - from[0]) * way[0] + (deck.at[1] - from[1]) * way[1];
            on.sort_by(|one, other| along(one).total_cmp(&along(other)));
            let (first, last, middle) = (on.first()?, on.last()?, on[on.len() / 2]);
            let out = |deck: &&&city::solids::Solid, side: f64| {
                let reach = (deck.size[1] / 2.0 + 3.0) * side;
                [deck.at[0] + way[0] * reach, deck.at[1] + way[1] * reach]
            };
            let ends = [out(first, -1.0), out(last, 1.0)];
            let rails = rails
                .iter()
                .filter(|rail| off_line([rail.at[0], rail.at[1]], ends[0], ends[1]) < first.size[0] / 2.0 + 1.0)
                .map(|rail| rail.bounds())
                .collect();
            Some(Bridge { deck: middle.at[2] + middle.size[2], ends, width, rails })
        })
        .collect()
}

/// The raised floors that ramp along a ruin's spokes (each of its basin's floors but its plaza), from its plaza's
/// level to a tier's.
fn spokes_of(laid: &layout::Layout) -> Vec<[f64; 7]> {
    let ruins = laid.areas.iter().zip(&laid.basins).filter(|(area, _)| area.kind == layout::brief::AreaKind::Ruin);
    let lines: Vec<[[f64; 2]; 2]> =
        ruins.flat_map(|(_, basin)| basin.floors.iter().skip(1).map(|f| [[f[0], f[1]], [f[2], f[3]]])).collect();
    let on_line = |[x, y]: [f64; 2]| lines.iter().any(|&[from, to]| off_line([x, y], from, to) < 0.01);
    let ramps = laid.sculpt.levels.iter().filter(|level| level[5] != level[6]);
    ramps.filter(|level| on_line([level[0], level[1]]) && on_line([level[2], level[3]])).copied().collect()
}

fn zones() -> Vec<Zone> {
    zones_of("continent-1")
}

fn zones_of(id: &str) -> Vec<Zone> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = layout.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
    let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits.clone()).expect("the continent generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    let nodes = bake::nodes_of(&continent, edits, &city, &builders).expect("the continent bakes");
    layouts
        .iter()
        .map(|laid| {
            let node = nodes.iter().find(|node| node.id == laid.id).expect("the node bakes");
            Zone {
                id: laid.id.clone(),
                floor: Floor::Land(Box::new(node.ground.clone())),
                blocks: Blocks::new(node.boxes.iter().map(Block::from_floats).collect()),
                runs: laid.runs.clone(),
                terraces: laid.basins.iter().flat_map(|basin| basin.terraces.iter().copied()).collect(),
                spokes: spokes_of(laid),
                climbs: laid.sculpt.climbs.clone(),
                bridges: bridges_of(laid),
            }
        })
        .collect()
}

/// A body walked from `from` through each waypoint in turn, steering at each tick toward the next; where it ends, and
/// how many waypoints it passed.
fn walked(zone: &Zone, from: [f64; 2], waypoints: &[[f64; 2]], ticks: usize) -> (movement::Body, usize) {
    walked_on(zone, standing_on(&zone.floor, &zone.blocks, from[0], from[1]), waypoints, ticks)
}

/// A body walked on from where it stands through each waypoint in turn, as `walked`.
fn walked_on(zone: &Zone, body: movement::Body, waypoints: &[[f64; 2]], ticks: usize) -> (movement::Body, usize) {
    let mut body = body;
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
        // A body that climbs a face, or hangs or mantles, has not walked there: it stops short.
        if matches!(body.mode, movement::Mode::Climb | movement::Mode::Hang | movement::Mode::Mantle) {
            break;
        }
    }
    (body, next)
}

/// Whether a body walked as `walked` climbed, hung or mantled on the way: walking, it never should.
fn walked_climbing(zone: &Zone, from: [f64; 2], waypoints: &[[f64; 2]], ticks: usize) -> (movement::Body, usize, bool) {
    let mut body = standing_on(&zone.floor, &zone.blocks, from[0], from[1]);
    let (mut next, mut climbed) = (0, false);
    for _ in 0..ticks {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < THERE_M {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &zone.blocks, &zone.floor, TICK_SECONDS);
        climbed |= matches!(body.mode, movement::Mode::Climb | movement::Mode::Hang | movement::Mode::Mantle);
    }
    (body, next, climbed)
}

#[test]
fn every_run_is_walked_into_from_its_area_and_back_out() {
    let zones = zones();
    let (mut runs, mut failed) = (0, Vec::new());
    for zone in &zones {
        for run in &zone.runs {
            runs += 1;
            // From 8 m inside its area's floor, out through its mouth into its first beat, and back.
            let length = distance(run.line[0], run.line[1]).max(1e-9);
            let way = [(run.line[1][0] - run.line[0][0]) / length, (run.line[1][1] - run.line[0][1]) / length];
            let inside = [run.mouth[0] - way[0] * 8.0, run.mouth[1] - way[1] * 8.0];
            let there_and_back = [run.mouth, run.line[1], run.line[2], run.line[1], run.mouth, inside];
            let (body, passed, climbed) =
                walked_climbing(zone, inside, &there_and_back, (120.0 / TICK_SECONDS) as usize);
            if passed < there_and_back.len() || climbed {
                failed.push(format!(
                    "{}: {} stops at {:.0},{:.0} past {passed} of its waypoints{}",
                    zone.id,
                    run.name,
                    body.x,
                    body.y,
                    if climbed { ", climbing" } else { "" }
                ));
            }
        }
    }
    assert!(runs > 0, "continent 1 has runs");
    assert!(failed.is_empty(), "{failed:#?}");
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
fn every_keep_is_climbed_to_its_turret_top_and_every_undercroft_walked_down_from_its_chapel_floor() {
    let zones = zones();
    let (mut keeps, mut undercrofts, mut failed) = (0, 0, Vec::new());
    for zone in &zones {
        for run in zone.runs.iter().filter(|run| run.kind.building()) {
            let Some(climb) = layout::run_climbs::climb(run) else {
                if run.kind != layout::brief::RunKind::Mine {
                    failed.push(format!("{}: {} has nothing to climb", zone.id, run.name));
                }
                continue;
            };
            let up = |body: &movement::Body| body.z - zone.floor.height_at(body.x, body.y);
            let ticks = (60.0 / TICK_SECONDS) as usize;
            let (end, last) = (climb.walk.len() - 1, climb.walk[climb.walk.len() - 1]);
            if run.kind == layout::brief::RunKind::Keep {
                keeps += 1;
                // Up the stair, along the wall-walk and up onto the turret, 11 m over the ward's floor.
                let (body, _) = walked(zone, climb.walk[0], &climb.walk[1..], ticks);
                if distance([body.x, body.y], last) > THERE_M || up(&body) < 10.5 {
                    failed.push(format!(
                        "{}: up {}'s stair the body stops at {:.1},{:.1}, {:.1} m up",
                        zone.id,
                        run.name,
                        body.x,
                        body.y,
                        up(&body)
                    ));
                }
            } else {
                undercrofts += 1;
                // Up onto the chapel's floor from the zone, then down its stair into the undercroft.
                let (top, _) = walked(zone, climb.walk[0], &climb.walk[1..end], ticks);
                let (body, _) = walked_on(zone, top, &[last], ticks);
                if up(&top) < 2.2 || distance([body.x, body.y], last) > THERE_M || up(&body).abs() > 0.1 {
                    failed.push(format!(
                        "{}: {}'s chapel floor is {:.1} m up, and down its stair the body stops at {:.1},{:.1}, {:.1} m up",
                        zone.id,
                        run.name,
                        up(&top),
                        body.x,
                        body.y,
                        up(&body)
                    ));
                }
            }
        }
    }
    assert!(keeps >= 2 && undercrofts >= 1, "Saltmere's keeps and undercroft: {keeps}, {undercrofts}");
    assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn every_terrace_is_walked_up_its_ramps() {
    let zones = zones();
    let (mut ramps, mut failed) = (0, Vec::new());
    for zone in &zones {
        // A terrace laid in strips (a hamlet block's) is one terrace: each strip with the strips touching it at its
        // level, any of them the one a ramp tops onto.
        let level_ones: Vec<[f64; 7]> =
            zone.terraces.iter().copied().filter(|terrace| terrace[5] == terrace[6]).collect();
        let touching = |first: &[f64; 7], second: &[f64; 7]| {
            first[5] == second[5]
                && layout::paths::segments_apart(
                    [[first[0], first[1]], [first[2], first[3]]],
                    [[second[0], second[1]], [second[2], second[3]]],
                ) <= first[4] + second[4] + 0.01
        };
        let joined = |start: usize| {
            let mut group = vec![start];
            let mut at = 0;
            while at < group.len() {
                let next: Vec<usize> = (0..level_ones.len())
                    .filter(|&other| !group.contains(&other) && touching(&level_ones[group[at]], &level_ones[other]))
                    .collect();
                group.extend(next);
                at += 1;
            }
            group
        };
        let mut seen: Vec<usize> = Vec::new();
        for (number, &[x1, y1, ..]) in level_ones.iter().enumerate() {
            if seen.contains(&number) {
                continue;
            }
            let group = joined(number);
            seen.extend(&group);
            let level = level_ones[number][5];
            let serving = zone.terraces.iter().filter(|ramp| {
                ramp[5] == 0.0
                    && ramp[6] == level
                    && group.iter().any(|&each| {
                        let [x1, y1, x2, y2, half, ..] = level_ones[each];
                        off_line([ramp[2], ramp[3]], [x1, y1], [x2, y2]) < half
                    })
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
fn every_ruins_spoke_is_walked_from_its_plaza_up_or_down_onto_its_tier() {
    let zones = zones();
    let (mut walked_up, mut failed) = (0, Vec::new());
    for zone in &zones {
        for &[foot_x, foot_y, top_x, top_y, ..] in &zone.spokes {
            walked_up += 1;
            // From the plaza's edge along the ramp and on 3 m onto the tier.
            let length = distance([foot_x, foot_y], [top_x, top_y]);
            let on = [top_x + (top_x - foot_x) / length * 3.0, top_y + (top_y - foot_y) / length * 3.0];
            let moved = zone.floor.height_at(on[0], on[1]) - zone.floor.height_at(foot_x, foot_y);
            let (body, _) = walked(zone, [foot_x, foot_y], &[[top_x, top_y], on], (60.0 / TICK_SECONDS) as usize);
            if distance([body.x, body.y], on) > THERE_M || moved.abs() < 1.0 {
                failed.push(format!(
                    "{}: along the spoke from {foot_x:.0},{foot_y:.0} the body stops at {:.0},{:.0}, {moved:+.1} m",
                    zone.id, body.x, body.y
                ));
            }
        }
    }
    assert!(walked_up >= 3, "Saltmere's ruins stand on tiers: {walked_up} spokes");
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
            // A climb from a raised floor rises less than one from the land's own level; that its lookout stands on
            // the massif's top, map_planned.rs checks.
            if distance([body.x, body.y], lookout) > THERE_M || raised < 3.0 {
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
fn every_bridge_is_walked_over_both_ways() {
    // Continent 3 holds the world's one path crossing a river, by the ironclad wreck.
    let zones: Vec<Zone> = ["continent-1", "continent-3"].into_iter().flat_map(zones_of).collect();
    let (mut bridges, mut failed) = (0, Vec::new());
    for zone in &zones {
        for &Bridge { deck, ends, .. } in &zone.bridges {
            bridges += 1;
            // Across it from bank to bank and back, noting how high the body stands as it passes the deck's middle.
            let middle = [(ends[0][0] + ends[1][0]) / 2.0, (ends[0][1] + ends[1][1]) / 2.0];
            for [from, to] in [ends, [ends[1], ends[0]]] {
                let mut body = standing_on(&zone.floor, &zone.blocks, from[0], from[1]);
                let mut over = f64::NEG_INFINITY;
                for _ in 0..(40.0 / TICK_SECONDS) as usize {
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
                        "{}: over the bridge at {:.0},{:.0} from {:.0},{:.0} the body stops at {:.0},{:.0}, {:.1} m at its \
                         middle on a {deck:.1} m deck",
                        zone.id, middle[0], middle[1], from[0], from[1], body.x, body.y, over
                    ));
                }
            }
        }
    }
    // A crossing where the brief asks for heights is of stone, walked in modules_walked.rs; the rest are of timber.
    assert!(bridges >= 1, "a timber bridge crosses a river: {bridges} bridges");
    assert!(failed.is_empty(), "{} of {bridges} bridges: {failed:#?}", failed.len());
}

#[test]
fn no_bridge_rail_stands_on_its_walked_width_or_leaves_a_gap() {
    let zones: Vec<Zone> = ["continent-1", "continent-3"].into_iter().flat_map(zones_of).collect();
    let (mut rails, mut failed) = (0, Vec::new());
    for zone in &zones {
        for bridge in &zone.bridges {
            let [from, to] = bridge.ends;
            let length = distance(from, to);
            let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
            let mut sides: [Vec<f64>; 2] = [Vec::new(), Vec::new()];
            for &[west, north, east, south, ..] in &bridge.rails {
                rails += 1;
                // How near the way's middle line the rail's box comes: it may not reach onto the walked width.
                let corners = [[west, north], [east, north], [east, south], [west, south]];
                let crossed = (0..4).any(|edge| {
                    layout::paths::segments_apart([from, to], [corners[edge], corners[(edge + 1) % 4]]) == 0.0
                });
                let near = (0..4)
                    .map(|edge| layout::paths::segments_apart([from, to], [corners[edge], corners[(edge + 1) % 4]]))
                    .fold(f64::INFINITY, f64::min);
                if crossed || near < bridge.width / 2.0 {
                    failed.push(format!(
                        "{}: a rail's box {:?} comes {near:.2} m from the way's middle",
                        zone.id,
                        [west, north, east, south]
                    ));
                }
                let middle = [(west + east) / 2.0, (north + south) / 2.0];
                let across = (middle[0] - from[0]) * -way[1] + (middle[1] - from[1]) * way[0];
                sides[usize::from(across > 0.0)].push((middle[0] - from[0]) * way[0] + (middle[1] - from[1]) * way[1]);
            }
            // Each side's lengths run on with no length missing.
            for side in &mut sides {
                side.sort_by(f64::total_cmp);
                let steps: Vec<f64> = side.windows(2).map(|pair| pair[1] - pair[0]).collect();
                let usual = steps.iter().copied().fold(f64::INFINITY, f64::min);
                if steps.iter().any(|&step| step > usual * 1.5) {
                    failed.push(format!("{}: a rail of the bridge at {from:?} has a gap", zone.id));
                }
            }
        }
    }
    assert!(rails > 0, "the bridges have rails");
    assert!(failed.is_empty(), "{} of {rails} rail lengths: {failed:#?}", failed.len());
}
