//! Continent 1's layouts as the bake settles them, checked for what a body meets on their ways: every gate and
//! signpost on open ground at its own floor's level, every set piece at an area's middle standing, no box of any
//! solid, prop or building across a way's walked width under head height, and the rock and walls where they belong.

use city::solids::{Material, Shape};
use land::ground::Ground;
use land::sculpts::Sculpts;
use layout::Layout;
use layout::brief::AreaKind;
use layout::field::distance;
use layout::paths::off_line;
use movement::{Block, Blocks, Controls, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;
use std::sync::OnceLock;

/// How far a body's head stands over its feet, and the tallest box a body steps over, metres.
const HEAD_M: f64 = 1.8;
const STEPPED_OVER_M: f64 = 0.45;

struct Laid {
    layouts: Vec<Layout>,
    ground: Ground,
    book: layout::book::Book,
}

fn laid() -> &'static Laid {
    static LAID: OnceLock<Laid> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = world.continents.into_iter().find(|each| each.id == "continent-1").expect("continent-1");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        Laid { layouts, ground: landmass.surface, book: builders.book }
    })
}

/// How far the other layouts' sculpts raise the land at a point over its own layout's.
fn buried(laid: &Laid, own: &Layout, at: [f64; 2]) -> f64 {
    let coast = laid.ground.coast.at(at[0], at[1]);
    let mine = Sculpts::from(vec![own.sculpt.clone()]).raise(at[0], at[1], coast);
    laid.ground.sculpts.raise(at[0], at[1], coast) - mine
}

#[test]
fn every_gate_and_signpost_stands_on_open_ground_at_its_floors_level() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        let gates = layout.areas.iter().filter(|area| matches!(area.kind, AreaKind::Gate | AreaKind::Entrance));
        for area in gates {
            let over = buried(laid, layout, area.at);
            if over > 0.25 {
                failed.push(format!("{}: {:?} to {:?} under {over:.1} m of rock", layout.id, area.kind, area.leads_to));
            }
        }
        for prop in layout.seating.props.iter().filter(|prop| layout::pieces::model::SIGNPOSTS.contains(&prop.model)) {
            let over = buried(laid, layout, [prop.at[0], prop.at[1]]);
            if over > 0.25 {
                failed.push(format!(
                    "{}: a signpost at {:.0},{:.0} under {over:.1} m",
                    layout.id, prop.at[0], prop.at[1]
                ));
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn a_body_walks_through_the_saltgrass_downs_gate_and_out_along_its_gorge() {
    let laid = laid();
    let layout = laid.layouts.iter().find(|layout| layout.id == "saltgrass-downs").expect("the zone lays out");
    let gate = layout
        .areas
        .iter()
        .find(|area| area.kind == AreaKind::Gate && area.leads_to.as_deref() == Some("broken-causeway"))
        .expect("the gate to the broken causeway");
    // The gorge out of the gate is the floor's capsule that starts at its middle.
    let gorge = layout
        .sculpt
        .floors
        .iter()
        .find(|floor| {
            distance([floor[0], floor[1]], gate.at) < 1e-6 && distance([floor[0], floor[1]], [floor[2], floor[3]]) > 1.0
        })
        .expect("a gorge runs out of the gate");
    let length = distance(gate.at, [gorge[2], gorge[3]]);
    let way = [(gorge[2] - gate.at[0]) / length, (gorge[3] - gate.at[1]) / length];
    let across = [-way[1], way[0]];
    let path = layout
        .paths
        .iter()
        .find(|path| path.points.last().is_some_and(|&end| distance(end, gate.at) < gate.radius))
        .expect("a way reaches the gate");
    // Along the way to the gate, round its palisade's end, and on out along the gorge.
    let mut waypoints: Vec<[f64; 2]> = path.points.clone();
    let beside = [gate.at[0] + across[0] * 16.0, gate.at[1] + across[1] * 16.0];
    waypoints.push(beside);
    waypoints.extend((1..=6).map(|step| {
        let out = (f64::from(step) * 25.0).min(length - 5.0);
        [beside[0] + way[0] * out, beside[1] + way[1] * out]
    }));
    let floor = Floor::Land(Box::new(laid.ground.clone()));
    let blocks = Blocks::new(layout.boxes.iter().map(Block::from_floats).collect());
    let mut body = standing_on(&floor, &blocks, waypoints[0][0], waypoints[0][1]);
    let (mut next, mut highest) = (1, 0.0_f64);
    for _ in 0..(600.0 / TICK_SECONDS) as usize {
        let Some(target) = waypoints.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < 1.5 {
            // Past the gate, on its own floor, not over another layout's rock.
            let own = laid.ground.height_at(body.x, body.y) - buried(laid, layout, [body.x, body.y]);
            highest = highest.max(body.z - own);
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, &blocks, &floor, TICK_SECONDS);
    }
    assert_eq!(next, waypoints.len(), "the body stops at {:.0},{:.0} before {:?}", body.x, body.y, waypoints.get(next));
    assert!(highest < 0.5, "the body walks {highest:.1} m over its own floor");
}

#[test]
fn every_set_piece_at_an_areas_middle_stands() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        let centred = layout.areas.iter().filter(|area| {
            matches!(
                area.kind,
                AreaKind::Gate
                    | AreaKind::Entrance
                    | AreaKind::Wilds
                    | AreaKind::Arena
                    | AreaKind::Wreck
                    | AreaKind::Hulks
                    | AreaKind::Cave
            )
        });
        for area in centred {
            if !layout.seating.props.iter().any(|prop| distance([prop.at[0], prop.at[1]], area.at) < 0.5) {
                let nearest = layout
                    .paths
                    .iter()
                    .flat_map(|path| path.points.windows(2).map(|pair| off_line(area.at, pair[0], pair[1])))
                    .fold(f64::INFINITY, f64::min);
                failed.push(format!(
                    "{}: {:?} {} lost its middle, a way {nearest:.1} m from it",
                    layout.id, area.kind, area.name
                ));
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}

/// Whether a box's footprint comes within `reach` of a segment, measured at points a quarter metre apart along it, and
/// where: the nearest such point.
fn crossing(found: &[f64; 6], from: [f64; 2], to: [f64; 2], reach: f64) -> Option<[f64; 2]> {
    let length = distance(from, to);
    let steps = (length / 0.25).ceil().max(1.0) as usize;
    (0..=steps).map(|step| step as f64 / steps as f64).find_map(|share| {
        let at = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
        let east = (found[0] - at[0]).max(at[0] - found[2]).max(0.0);
        let south = (found[1] - at[1]).max(at[1] - found[3]).max(0.0);
        ((east * east + south * south).sqrt() < reach).then_some(at)
    })
}

#[test]
fn no_box_stands_across_a_ways_walked_width_under_head_height() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for path in layout.paths.iter().filter(|path| !layout.runs.iter().any(|run| run.line == path.points)) {
            // Boxes are written grown out to the centimetre, so a box grazing the edge by that much is not in the way.
            let reach = path.tier.width() / 2.0 - 0.02;
            for pair in path.points.windows(2) {
                for found in &layout.boxes {
                    let near = found[0] - reach <= pair[0][0].max(pair[1][0])
                        && found[2] + reach >= pair[0][0].min(pair[1][0])
                        && found[1] - reach <= pair[0][1].max(pair[1][1])
                        && found[3] + reach >= pair[0][1].min(pair[1][1]);
                    if !near {
                        continue;
                    }
                    let Some(at) = crossing(found, pair[0], pair[1], reach) else { continue };
                    let floor = laid.ground.height_at(at[0], at[1]);
                    if found[5] < floor + HEAD_M && found[4] > floor + STEPPED_OVER_M {
                        failed.push(format!("{}: box {found:?} on the way at {:.1},{:.1}", layout.id, at[0], at[1]));
                    }
                }
            }
        }
    }
    failed.dedup();
    assert!(failed.is_empty(), "{} boxes in the ways: {:#?}", failed.len(), &failed[..failed.len().min(40)]);
}

#[test]
fn no_way_ends_inside_a_solid() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for path in &layout.paths {
            for &point in &path.points {
                let floor = laid.ground.height_at(point[0], point[1]);
                for solid in &layout.seating.solids {
                    let [west, north, east, south, bottom, top] = solid.bounds();
                    let inside = point[0] > west && point[0] < east && point[1] > north && point[1] < south;
                    if inside
                        && bottom < floor + HEAD_M
                        && top > floor + STEPPED_OVER_M
                        && solid.material != Material::Paving
                        && !matches!(solid.shape, Shape::Arch { .. })
                    {
                        failed.push(format!(
                            "{}: a way's point {point:?} inside {:?} {:?}",
                            layout.id, solid.shape, solid.size
                        ));
                    }
                }
            }
        }
    }
    assert!(failed.is_empty(), "{} points: {:#?}", failed.len(), &failed[..failed.len().min(30)]);
}

/// The retaining walls' lengths, as `works::retaining` lays them.
fn is_retaining(solid: &city::solids::Solid) -> bool {
    solid.material == Material::Stone
        && matches!(solid.shape, Shape::Block)
        && (solid.size[0] - 1.4).abs() < 1e-9
        && (solid.size[1] - 7.2).abs() < 1e-9
        && (solid.size[2] - 4.2).abs() < 1e-9
}

#[test]
fn every_retaining_wall_stands_at_its_cliffs_foot() {
    let laid = laid();
    let (mut lengths, mut failed) = (0, Vec::new());
    for layout in &laid.layouts {
        let own = Sculpts::from(vec![layout.sculpt.clone()]);
        for solid in layout.seating.solids.iter().filter(|solid| is_retaining(solid)) {
            lengths += 1;
            let off = own.floor_distance(solid.at[0], solid.at[1]);
            // The face eases up from the floor's edge, so its foot (where it stands a hand high) is a few metres out.
            if !(-3.0..=5.0).contains(&off) {
                failed.push(format!("{}: a length {off:.1} m off its cliff's foot", layout.id));
            }
        }
    }
    assert!(lengths > 50, "the wider basins have retaining walls: {lengths}");
    assert!(failed.is_empty(), "{} of {lengths}: {:#?}", failed.len(), &failed[..failed.len().min(20)]);
}

#[test]
fn every_fallen_stone_rests_on_the_carved_ground() {
    let laid = laid();
    let (mut stones, mut failed) = (0, Vec::new());
    for layout in &laid.layouts {
        let rubble = layout.seating.solids.iter().filter(|solid| {
            solid.material == Material::Rubble && matches!(solid.shape, Shape::Dome { .. } | Shape::Pyramid { .. })
        });
        for solid in rubble {
            stones += 1;
            // A stone is sunk a quarter of its height; one sunk further was heighted on the ground before the carving.
            let sunk = laid.ground.height_at(solid.at[0], solid.at[1]) - (solid.at[2] + solid.size[2] * 0.25);
            if sunk > 0.5 {
                failed.push(format!("{}: a stone {:?} at {:?} sunk {sunk:.1} m", layout.id, solid.size, solid.at));
            }
        }
    }
    assert!(stones > 1000, "{stones}");
    assert!(failed.is_empty(), "{} of {stones}: {:#?}", failed.len(), &failed[..failed.len().min(20)]);
}

#[test]
fn every_plinth_stands_flush_with_its_buildings_floor() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for pad in &layout.seating.pads {
            let centre = [(pad.bounds[0] + pad.bounds[2]) / 2.0, (pad.bounds[1] + pad.bounds[3]) / 2.0];
            let plinths = layout.seating.solids.iter().filter(|solid| {
                solid.material == Material::Stone
                    && distance([solid.at[0], solid.at[1]], centre) < 1e-6
                    && (solid.size[0] - (pad.bounds[2] - pad.bounds[0] + 0.3)).abs() < 1e-6
            });
            for plinth in plinths {
                let gap = plinth.at[2] + plinth.size[2] - pad.level;
                if gap.abs() > 0.005 {
                    failed.push(format!("{}: a plinth's top {gap:+.3} m off its floor", layout.id));
                }
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn no_retaining_wall_or_stone_stands_on_a_way() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for solid in layout.seating.solids.iter().filter(|solid| is_retaining(solid)) {
            let clear = layout.paths.iter().all(|path| {
                path.points
                    .windows(2)
                    .all(|pair| off_line([solid.at[0], solid.at[1]], pair[0], pair[1]) > path.tier.width() / 2.0 + 3.6)
            });
            if !clear {
                failed
                    .push(format!("{}: a retaining wall on a way at {:.0},{:.0}", layout.id, solid.at[0], solid.at[1]));
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
}
