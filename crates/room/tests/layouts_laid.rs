//! Continent 1's layouts as the bake settles them, checked for what a body meets on their ways: every gate and
//! signpost on open ground at its own floor's level, every set piece at an area's middle standing, no box of any
//! solid, prop or building across a way's walked width under head height, every spawn inside its section and clear
//! of the boxes, and the rock and walls where they belong.

use city::solids::{Material, Shape};
use land::ground::Ground;
use land::sculpts::Sculpts;
use layout::Layout;
use layout::brief::AreaKind;
use layout::field::distance;
use layout::paths::off_line;
use movement::{Block, Blocks, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;
use std::sync::OnceLock;

/// How far a body's head stands over its feet, and the tallest box a body steps over, metres.
const HEAD_M: f64 = 1.8;
const STEPPED_OVER_M: f64 = 0.45;

struct Laid {
    layouts: Vec<Layout>,
    ground: Ground,
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
        Laid { layouts, ground: landmass.surface }
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
    let path = layout
        .paths
        .iter()
        .find(|path| path.points.last().is_some_and(|&end| distance(end, gate.at) < gate.radius))
        .expect("a way reaches the gate");
    // The gate's arch and its palisade close the cleft, so the body walks the way up to the gate, then from past the
    // arch on out along the gorge, over nothing it would have to climb.
    let past = [gate.at[0] + way[0] * PAST_ARCH_M, gate.at[1] + way[1] * PAST_ARCH_M];
    let gorge_out = std::iter::once(past).chain((1..=6).map(|step| {
        let out = (f64::from(step) * 25.0).min(length - 5.0);
        [gate.at[0] + way[0] * out, gate.at[1] + way[1] * out]
    }));
    let floor = Floor::Land(Box::new(laid.ground.clone()));
    let blocks = Blocks::new(layout.boxes.iter().map(Block::from_floats).collect());
    for leg in [path.points.clone(), gorge_out.collect()] {
        let mut body = standing_on(&floor, &blocks, leg[0][0], leg[0][1]);
        let (mut next, mut highest) = (1, 0.0_f64);
        for _ in 0..(600.0 / TICK_SECONDS) as usize {
            let Some(target) = leg.get(next) else { break };
            let (east, south) = (target[0] - body.x, target[1] - body.y);
            if (east * east + south * south).sqrt() < 1.5 {
                // On its own floor, not over another layout's rock.
                let own = laid.ground.height_at(body.x, body.y) - buried(laid, layout, [body.x, body.y]);
                highest = highest.max(body.z - own);
                next += 1;
                continue;
            }
            let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
            body = step_body(&body, &controls, &blocks, &floor, TICK_SECONDS);
            let on_a_wall = matches!(body.mode, Mode::Hang | Mode::Climb | Mode::Mantle);
            assert!(!on_a_wall, "the body takes hold of a wall at {:.0},{:.0}", body.x, body.y);
        }
        assert_eq!(next, leg.len(), "the body stops at {:.0},{:.0} before {:?}", body.x, body.y, leg.get(next));
        assert!(highest < 0.5, "the body walks {highest:.1} m over its own floor");
    }
}

/// How far out along the gorge from the gate's middle a body starts clear of its arch, metres.
const PAST_ARCH_M: f64 = 6.0;

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
        // A crossing gate on the landing toward another patrol zone stands no set piece (layout's crossings.rs).
        for area in centred.filter(|area| !layout::crossings::is_crossing(area)) {
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

/// What a box was made from, as far as its footprint tells: a solid, a prop, a building, or a room's lining.
fn source(layout: &Layout, found: &[f64; 6]) -> String {
    let same = |print: [f64; 4]| (0..4).all(|side| (print[side] - found[side]).abs() < 0.02);
    if let Some(solid) = layout.seating.solids.iter().find(|solid| {
        let [west, north, east, south, ..] = solid.bounds();
        same([west, north, east, south])
    }) {
        return format!(
            "{:?} {:?} {:?} lean {:.2} roll {:.2}",
            solid.material, solid.shape, solid.size, solid.lean, solid.roll
        );
    }
    if let Some(prop) = layout.seating.props.iter().find(|prop| same(prop.footprint)) {
        return format!("prop {}", prop.model);
    }
    if let Some(building) = layout.seating.buildings.iter().find(|building| same(building.footprint)) {
        return format!("building {} open {}", building.model, building.open);
    }
    "a room's lining".to_owned()
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
                        failed.push(format!(
                            "{}: {} {found:?} on a {:?} at {:.1},{:.1}",
                            layout.id,
                            source(layout, found),
                            path.tier,
                            at[0],
                            at[1]
                        ));
                    }
                }
            }
        }
    }
    failed.dedup();
    assert!(failed.is_empty(), "{} boxes in the ways: {:#?}", failed.len(), &failed[..failed.len().min(4000)]);
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
                    // A body meets an arch by its jambs and head, and rock by its parts.
                    let boxes: Vec<[f64; 6]> = if city::rock::is_rock(solid.shape) {
                        city::rock::boxes(solid)
                            .iter()
                            .map(|&[west, north, east, south, top, bottom]| [west, north, east, south, bottom, top])
                            .collect()
                    } else {
                        vec![solid.bounds()]
                    };
                    let met = boxes.iter().any(|&[west, north, east, south, bottom, top]| {
                        point[0] > west
                            && point[0] < east
                            && point[1] > north
                            && point[1] < south
                            && bottom < floor + HEAD_M
                            && top > floor + STEPPED_OVER_M
                    });
                    if met && solid.material != Material::Paving && !matches!(solid.shape, Shape::Arch { .. }) {
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

#[test]
fn every_spawn_stands_inside_its_section_and_clear_of_every_box() {
    let laid = laid();
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for &[x, y] in &layout.spawns {
            let floor = laid.ground.height_at(x, y);
            let boxed = layout.boxes.iter().any(|&[west, north, east, south, top, underside]| {
                x > west
                    && x < east
                    && y > north
                    && y < south
                    && underside < floor + HEAD_M
                    && top > floor + STEPPED_OVER_M
            });
            if !reach::inside(&layout.ring, x, y) || boxed {
                failed.push(format!("{}: a spawn at {x:.1}, {y:.1}, boxed in: {boxed}", layout.id));
            }
        }
    }
    assert!(failed.is_empty(), "{failed:#?}");
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
            // A stone is sunk a quarter of its height; one sunk further was heighted on the ground before the carving, or
            // on a ground another layout's sculpt has since raised; one whose foot shows floats.
            let ground = laid.ground.height_at(solid.at[0], solid.at[1]);
            let sunk = ground - (solid.at[2] + solid.size[2] * 0.25);
            if sunk > 0.5 || solid.at[2] > ground + 0.05 {
                failed.push(format!("{}: a stone {:?} at {:?} sunk {sunk:.1} m", layout.id, solid.size, solid.at));
            }
        }
    }
    assert!(stones > 1000, "{stones}");
    assert!(failed.is_empty(), "{} of {stones}: {:#?}", failed.len(), &failed[..failed.len().min(20)]);
}

#[test]
fn every_ruin_stands_on_the_ground_as_settled() {
    let laid = laid();
    let (mut ruins, mut failed) = (0, Vec::new());
    for layout in &laid.layouts {
        for solid in &layout.seating.solids {
            // How deep each was sunk where it was laid: a broken tower's stump 1.5 m, a length of the rim's curtain
            // wall (outside the section, on the cliff tops) 1.2 m.
            let rim_wall = solid.shape == Shape::Block
                && solid.material == Material::Stone
                && (solid.size[0] - 1.6).abs() < 1e-9
                && (6.2..=9.2).contains(&solid.size[1])
                && !layout::field::ring_holds(&layout.ring, solid.at[0], solid.at[1]);
            let sunk = match solid.shape {
                Shape::Column { sides: 12, top } if (top - 0.92).abs() < 1e-9 => 1.5,
                _ if rim_wall => 1.2,
                _ => continue,
            };
            ruins += 1;
            let off = solid.at[2] + sunk - laid.ground.height_at(solid.at[0], solid.at[1]);
            if off.abs() > 0.15 {
                failed.push(format!(
                    "{}: a ruin {:?} at {:?} stands {off:+.2} m off the ground",
                    layout.id, solid.size, solid.at
                ));
            }
        }
    }
    assert!(ruins > 100, "{ruins}");
    assert!(failed.is_empty(), "{} of {ruins}: {:#?}", failed.len(), &failed[..failed.len().min(20)]);
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

#[test]
fn no_city_walls_underside_stands_off_the_ground_on_a_slope() {
    // Every continent's city as it settles: a body walks under nothing standing more than a head off the ground, so no
    // length of its wall stands with its underside over the ground at its ends.
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut checked = 0;
    for continent in world.continents {
        let edits = land::edits::parse(&read(&format!("content/world/land/{}.json", continent.id))).expect("edits");
        let id = continent.id.clone();
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        let bare = landmass.surface.clone();
        let Some(plan) = city::settle(&mut landmass, &city).expect("its city settles") else { continue };
        // A ramp's walls stand on its pad, never on the bare ground: they are not the city's wall.
        let on_ramp = |solid: &&city::solids::Solid| {
            plan.ramps.iter().any(|ramp| {
                let [west, north, east, south] = ramp.pad.bounds;
                (west..=east).contains(&solid.at[0]) && (north..=south).contains(&solid.at[1])
            })
        };
        let lengths = plan.works.iter().filter(|solid| {
            solid.material == Material::Stone
                && solid.shape == Shape::Block
                && (solid.size[0] - city::walls::WALL_THICK_M).abs() < 1e-9
                && !on_ramp(solid)
        });
        for length in lengths {
            checked += 1;
            for along in [-0.5, 0.0, 0.5] {
                let [x, y, _] = length.place([0.0, along * length.size[1], 0.0]);
                let off = length.bounds()[4] - bare.height_at(x, y);
                assert!(off <= 0.0, "{id}: a length of wall at {:?} stands {off:.2} m off the ground", length.at);
            }
        }
    }
    assert!(checked > 10, "the cities have their walls: {checked}");
}

/// How far a point of a solid's own frame lies outside its own box, metres.
fn off_box([width, depth, height]: [f64; 3], [x, y, z]: [f64; 3]) -> f64 {
    let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
    let (across, along, rise) =
        (gap(x, -width / 2.0, width / 2.0), gap(y, -depth / 2.0, depth / 2.0), gap(z, 0.0, height));
    (across * across + along * along + rise * rise).sqrt()
}

fn corners([west, north, east, south, top, bottom]: [f64; 6]) -> impl Iterator<Item = [f64; 3]> {
    (0..8).map(move |corner| {
        let x = if corner & 1 == 0 { west } else { east };
        let y = if corner & 2 == 0 { north } else { south };
        [x, y, if corner & 4 == 0 { bottom } else { top }]
    })
}

#[test]
fn no_box_of_a_laid_prop_or_solid_stands_further_off_its_parts_or_its_own_box_than_a_box_may() {
    let laid = laid();
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let book = bake::builders(&root).expect("the builders read").book;
    // Boxes are grown out to the centimetre.
    let keep = city::hug::KEEP_M + 0.015;
    let mut failed = Vec::new();
    for layout in &laid.layouts {
        for prop in &layout.seating.props {
            let Some(parts) = book.parts.get(&prop.model) else { continue };
            let Some(measure) = book.measure(prop.model, false) else { continue };
            // A turned prop's strips keep within their own keep of its parts, loosened as its cost asks.
            let loosened = layout::collide::prop_kept(prop, measure, Some(parts)).1;
            let strips = layout::collide::STRIPS_KEEP_M * loosened + 0.015;
            let alone = layout::seat::Seating { props: vec![prop.clone()], ..layout::seat::Seating::default() };
            let (sine, cosine) = land::exact::sin_cos(prop.yaw.to_radians());
            for found in layout::collide::seated_boxes(&alone, &layout.ring, &book) {
                let shut = layout::pieces::model::GATE_ARCHES.contains(&prop.model);
                for [east, south, up] in corners(found) {
                    let (east_of, south_of) = (east - prop.at[0], south - prop.at[1]);
                    let (x, z, y) =
                        (east_of * cosine + south_of * sine, east_of * sine - south_of * cosine, up - prop.at[2]);
                    let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
                    let off = parts
                        .iter()
                        .map(|&[x0, y0, z0, x1, y1, z1]| {
                            let low = if shut { f64::NEG_INFINITY } else { y0 };
                            let (across, rise, along) = (gap(x, x0, x1), gap(y, low, y1), gap(z, z0, z1));
                            (across * across + rise * rise + along * along).sqrt()
                        })
                        .fold(f64::INFINITY, f64::min);
                    if off > strips {
                        failed.push(format!("{}: prop {} {off:.2} m off", layout.id, prop.model));
                    }
                }
            }
        }
        for solid in &layout.seating.solids {
            let ground = matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth);
            if ground || solid.size[2] < STEPPED_OVER_M || city::rock::is_rock(solid.shape) {
                continue;
            }
            // A solid hardly tilted is boxed as if upright, as far off as its tilt moves it; one too costly to box
            // so closely keeps as far as its budget loosens it.
            let (boxes, loosened) = city::collision::kept(solid);
            let tilted = city::hug::tilt_move(solid);
            let tilt = if tilted <= city::hug::STILL_M { tilted } else { 2.0 * city::hug::tilt_reach(solid) };
            let allowed = keep * loosened + tilt;
            for found in boxes {
                let off = corners(found).map(|corner| off_box(solid.size, solid.own(corner))).fold(0.0, f64::max);
                if off > allowed {
                    failed.push(format!("{}: {:?} {off:.2} m off", layout.id, solid.shape));
                }
            }
        }
    }
    failed.dedup();
    assert!(failed.is_empty(), "{} boxes, the first {:#?}", failed.len(), &failed[..failed.len().min(12)]);
}
