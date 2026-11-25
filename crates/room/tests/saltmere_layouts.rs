//! Saltmere's built patrol zone (saltgrass-downs) and the two cut from it (gullwing-vale and driftwood-moors, laid back
//! by the tests alone, `support/cut_zones.rs`) as the bake lays them,
//! measured where a body walks and fights: every walked line inside its section and the rock beside a run on the
//! rock's top outside it, a building run walked into and back out of the place it breaks off, the map's passages along
//! each run's line, and each cavern's chamber facing its tunnel under a roof no higher than the rock round it.

use city::solids::Shape;
use land::ground::Ground;
use land::sculpts::Sculpts;
use layout::Layout;
use layout::field::{distance, ring_holds};
use layout::paths::off_line;
use layout::pieces::ahead;
use layout::spaces::{Joined, SpaceKind};
use movement::{Block, Blocks, Controls, Mode, TICK_SECONDS, step_body};
use room::{Floor, standing_on};
use std::path::Path;
use std::sync::OnceLock;

#[path = "support/cut_zones.rs"]
mod cut_zones;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).expect("the world's files are in the repository")
}

/// Continent 1's layouts as the bake settles them, the cut zones laid back or not, and its ground as carved.
fn settled(cut: bool) -> &'static (Vec<Layout>, Ground) {
    static SETTLED: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    static CUT: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    (if cut { &CUT } else { &SETTLED }).get_or_init(|| {
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = world.continents.into_iter().find(|each| each.id == "continent-1").expect("continent 1");
        let text = read("content/world/land/continent-1.json");
        let edits = land::edits::parse(&if cut { cut_zones::edits(&text) } else { text }).expect("its edits parse");
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut builders = bake::builders(&root()).expect("the builders read");
        if cut {
            cut_zones::briefs(&mut builders.briefs);
        }
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        city::settle(&mut landmass, &blocks).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        (layouts, landmass.surface)
    })
}

fn zones() -> Vec<&'static Layout> {
    let found: Vec<&Layout> = ZONES
        .iter()
        .filter_map(|id| settled(cut_zones::CUT.contains(id)).0.iter().find(|layout| layout.id == *id))
        .collect();
    assert_eq!(found.len(), ZONES.len(), "Saltmere's zone and the cut zones are laid");
    found
}

/// The ground a zone of `zones` is carved on.
fn ground_of(layout: &Layout) -> &'static Ground {
    &settled(cut_zones::CUT.contains(&layout.id.as_str())).1
}

/// How far a point lies outside a ring, metres (negative inside).
fn off_ring(ring: &[[f64; 2]], at: [f64; 2]) -> f64 {
    let edge = (0..ring.len())
        .map(|edge| off_line(at, ring[edge], ring[(edge + 1) % ring.len()]))
        .fold(f64::INFINITY, f64::min);
    if ring_holds(ring, at[0], at[1]) { -edge } else { edge }
}

fn unit(from: [f64; 2], to: [f64; 2]) -> [f64; 2] {
    let length = distance(from, to).max(1e-9);
    [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

/// What a body walks and fights in, by what it is: each run's line to 3 m short of its door and its beats a metre in
/// from their rims, each climb, lookout, stair and tunnel, each cavern's hollow, and every way.
fn walked_lines(layout: &Layout) -> Vec<(String, Vec<[f64; 2]>)> {
    let mut lines = Vec::new();
    for run in &layout.runs {
        let mut way = run.way();
        let last = way.len() - 1;
        way[last] = ahead(run.door, unit(run.door, way[last - 1]), 3.0, 0.0);
        lines.push((format!("{}'s line", run.name), way));
        for beat in &run.beats {
            lines.push((format!("{}'s beat", run.name), layout::ring::round(beat.at, beat.radius - 1.0)));
        }
    }
    for connection in &layout.map.connections {
        let what = match connection.joined {
            Joined::Climb => "a climb",
            Joined::Stair => "a stair",
            Joined::Tunnel => "a tunnel",
            Joined::Way | Joined::Run => continue,
        };
        lines.push((what.to_owned(), connection.points.clone()));
    }
    let rounds = layout.map.spaces.iter().filter(|space| matches!(space.kind, SpaceKind::Lookout | SpaceKind::Cavern));
    lines.extend(rounds.map(|space| (format!("{:?}", space.kind), layout::ring::round(space.at, space.reach - 1.0))));
    lines.extend(layout.paths.iter().map(|path| ("a way".to_owned(), path.points.clone())));
    lines
}

#[test]
fn every_line_walked_and_every_beat_lies_inside_its_section_a_metre_either_side() {
    for layout in zones() {
        for (what, line) in walked_lines(layout) {
            let points = layout::ring::walked(&[line]);
            let worst = points.iter().map(|&at| off_ring(&layout.ring, at)).fold(f64::NEG_INFINITY, f64::max);
            assert!(worst <= 0.0, "{}: {what} lies {worst:.2} m outside its section", layout.id);
        }
    }
}

#[test]
fn no_rock_beside_a_run_on_the_rocks_top_lies_inside_its_section() {
    // Past a floor's edge the section's cells reach 4 m onto the rock to their middles and 5.7 m more to their
    // corners, and its simplified ring 12.8 m past those at the most: past 23 m no rock is in it.
    const SLACK_M: f64 = 23.0;
    let mut seen = 0;
    for layout in zones() {
        let carved = Sculpts::from(vec![layout.sculpt.clone()]);
        for run in layout.runs.iter().filter(|run| layout::runs::on_top(run.kind)) {
            for pair in run.line.windows(2) {
                let along = unit(pair[0], pair[1]);
                let across = [-along[1], along[0]];
                let steps = (distance(pair[0], pair[1]) / 4.0).ceil() as usize;
                for step in 0..=steps {
                    let at = ahead(pair[0], along, distance(pair[0], pair[1]) * step as f64 / steps as f64, 0.0);
                    for out in (6..=60).step_by(2).flat_map(|out| [f64::from(out), -f64::from(out)]) {
                        let point = ahead(at, across, out, 0.0);
                        let off = carved.floor_distance(point[0], point[1]);
                        if off > SLACK_M {
                            seen += 1;
                            assert!(
                                !ring_holds(&layout.ring, point[0], point[1]),
                                "{}: rock {off:.1} m off every floor beside {} at {point:?} is in the section",
                                layout.id,
                                run.name
                            );
                        }
                    }
                }
            }
        }
    }
    assert!(seen > 1000, "rock stands beside Saltmere's ramparts and ledges: {seen}");
}

/// Where a body walking from `from` through `points` (each reached within 1.5 m) stands after at most `seconds`, and
/// whether it climbed: a body that climbs, hangs or mantles has not walked there and stops.
fn walked_to(floor: &Floor, blocks: &Blocks, from: [f64; 2], points: &[[f64; 2]], seconds: f64) -> ([f64; 2], bool) {
    let mut body = standing_on(floor, blocks, from[0], from[1]);
    let mut next = 0;
    for _ in 0..(seconds / TICK_SECONDS) as usize {
        let Some(target) = points.get(next) else { break };
        let (east, south) = (target[0] - body.x, target[1] - body.y);
        if (east * east + south * south).sqrt() < 1.5 {
            next += 1;
            continue;
        }
        let controls = Controls { forward: 1.0, yaw: libm::atan2(east, -south), ..Controls::default() };
        body = step_body(&body, &controls, blocks, floor, TICK_SECONDS);
        if matches!(body.mode, Mode::Climb | Mode::Hang | Mode::Mantle) {
            return ([body.x, body.y], true);
        }
    }
    ([body.x, body.y], false)
}

#[test]
fn a_building_run_is_walked_into_from_its_place_and_back_out_to_it() {
    let mut walked = 0;
    for layout in zones() {
        let floor = Floor::Land(Box::new(ground_of(layout).clone()));
        let blocks = Blocks::new(layout.boxes.iter().map(Block::from_floats).collect());
        for run in layout.runs.iter().filter(|run| run.kind.building()) {
            // A point on the place's floor 12 m back from the mouth.
            let inside = ahead(run.mouth, unit(run.line[1], run.mouth), 12.0, 0.0);
            let (end, climbed) = walked_to(&floor, &blocks, inside, &run.way(), 600.0);
            let name = format!("{}: {}", layout.id, run.name);
            assert!(!climbed && distance(end, run.door) < 3.0, "{name} is not walked in: {end:?}");
            let (end, climbed) = walked_to(&floor, &blocks, run.line[1], &[run.mouth, inside], 120.0);
            assert!(!climbed && distance(end, inside) < 1.5, "{name} is not walked out of: {end:?}");
            walked += 1;
        }
    }
    assert!(walked >= 4, "Saltmere has its keeps, its mine and its undercroft: {walked}");
}

#[test]
fn a_runs_passages_on_the_map_follow_its_line_from_the_place_it_breaks_off() {
    for layout in zones() {
        for run in &layout.runs {
            let name = format!("{}: {}", layout.id, run.name);
            let passages: Vec<_> = layout
                .map
                .connections
                .iter()
                .filter(|each| each.joined == Joined::Run && layout.map.spaces[each.to].name == run.name)
                .collect();
            assert_eq!(passages.len(), run.beats.len(), "{name} has a passage to each beat");
            assert!(run.area < layout.areas.len(), "{name} breaks off one of its places");
            assert_eq!(passages[0].from, run.area, "{name} is entered from the place it breaks off");
            assert_eq!(passages[0].points[0], run.mouth, "{name} starts at its mouth");
            let walked: Vec<[f64; 2]> = passages.iter().flat_map(|each| each.points.iter().skip(1).copied()).collect();
            assert_eq!(walked, run.line[1..], "{name}'s passages are its line");
        }
    }
}

#[test]
fn a_caverns_chamber_faces_its_tunnel_under_a_roof_no_higher_than_the_rock_round_it() {
    let mut caverns = 0;
    for layout in zones() {
        let ground = ground_of(layout);
        for tunnel in layout.map.connections.iter().filter(|each| each.joined == Joined::Tunnel) {
            caverns += 1;
            let [mouth, middle] = [tunnel.points[0], tunnel.points[1]];
            let way = unit(mouth, middle);
            let chamber = layout
                .seating
                .solids
                .iter()
                .find(|solid| {
                    matches!(solid.shape, Shape::Module { group: 0, .. })
                        && distance([solid.at[0], solid.at[1]], middle) < 1.0
                })
                .expect("a chamber stands in the hollow");
            let Shape::Module { module, .. } = chamber.shape else { unreachable!() };
            let socket = city::modules::all()[module as usize].sockets.iter().find(|each| each.name == "entry");
            let facing = socket.expect("the chamber has its entry").facing;
            let (sine, cosine) = land::exact::sin_cos(chamber.turn);
            let turned = [facing[0] * cosine - facing[1] * sine, facing[0] * sine + facing[1] * cosine];
            let toward = -(turned[0] * way[0] + turned[1] * way[1]);
            assert!(toward > 0.9999, "{}: the chamber's entry is turned off its tunnel ({toward})", layout.id);
        }
        // Each roof's top against the rock round its edges where that stands whole, its box square to the world.
        for roof in layout.seating.solids.iter().filter(|solid| matches!(solid.shape, Shape::CaveRoof { .. })) {
            let [west, north, east, south, _, top] = roof.bounds();
            let edges = (0..=8).flat_map(|step| {
                let share = f64::from(step) / 8.0;
                let (x, y) = (west + (east - west) * share, north + (south - north) * share);
                [[x, north], [x, south], [west, y], [east, y]]
            });
            let lowest = edges
                .filter(|at| ground.sculpts.floor_distance(at[0], at[1]) > land::sculpts::ROOFED_WALL_M + 1.0)
                .map(|at| ground.height_at(at[0], at[1]))
                .fold(f64::INFINITY, f64::min);
            assert!(top <= lowest + 0.5, "{}: a cave roof's top {top:.1} stands over its rock {lowest:.1}", layout.id);
        }
    }
    assert!(caverns >= 1, "the Hollow Coven opens into a cavern");
}

/// Not a check: whether any two node sections overlap on any continent, and how far each Saltmere zone's landing site
/// (its boardwalk, lanterns, stores and signpost) reaches from its spawns, against the 15 m round each spawn in which
/// no foe starts a fight. `cargo test --release -p room --test saltmere_layouts -- --ignored --nocapture`.
#[test]
#[ignore = "a measure, printed"]
fn measure_overlaps_and_landings() {
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let builders = bake::builders(&root()).expect("the builders read");
    for continent in &world.continents {
        let Ok(text) = std::fs::read_to_string(root().join(format!("content/world/land/{}.json", continent.id))) else {
            continue;
        };
        let edits = land::edits::parse(&text).expect("the edits parse");
        let nodes = match bake::nodes_of(continent, edits, &blocks, &builders) {
            Ok(nodes) => nodes,
            Err(problem) => {
                eprintln!("{}: not baked: {problem}", continent.id);
                continue;
            }
        };
        let mut overlaps = 0;
        for (number, first) in nodes.iter().enumerate() {
            for second in &nodes[number + 1..] {
                let ([w1, n1, e1, s1], [w2, n2, e2, s2]) = (first.bounds, second.bounds);
                if w1 > e2 || w2 > e1 || n1 > s2 || n2 > s1 {
                    continue;
                }
                let deepest = |one: &[[f64; 2]], other: &[[f64; 2]]| {
                    one.iter().map(|&at| -off_ring(other, at)).fold(f64::NEG_INFINITY, f64::max)
                };
                let deep = deepest(&first.ring, &second.ring).max(deepest(&second.ring, &first.ring));
                if deep > 0.0 {
                    overlaps += 1;
                    eprintln!("{}: {} and {} overlap, {deep:.1} m deep", continent.id, first.id, second.id);
                }
            }
        }
        eprintln!("{}: {} nodes, {overlaps} overlapping pairs", continent.id, nodes.len());
    }
    for layout in zones() {
        let Some(landing) = layout.areas.iter().find(|area| area.kind == layout::brief::AreaKind::Landing) else {
            continue;
        };
        let nearest =
            |at: [f64; 2]| layout.spawns.iter().map(|&spawn| distance(spawn, at)).fold(f64::INFINITY, f64::min);
        let planks = layout.seating.solids.iter().filter(|solid| {
            solid.material == city::solids::Material::Timber
                && (solid.size[1] - 2.05).abs() < 1e-9
                && distance([solid.at[0], solid.at[1]], landing.at) < 80.0
        });
        let boardwalk = planks.map(|solid| nearest([solid.at[0], solid.at[1]])).fold(0.0, f64::max);
        let props = layout.seating.props.iter().filter(|prop| distance([prop.at[0], prop.at[1]], landing.at) <= 16.0);
        let stores = props.map(|prop| nearest([prop.at[0], prop.at[1]])).fold(0.0, f64::max);
        let spread = layout.spawns.iter().map(|&spawn| distance(spawn, landing.at)).fold(0.0, f64::max);
        eprintln!(
            "{}: {} spawns within {spread:.1} m of the landing's middle; its boardwalk reaches {boardwalk:.1} m and its \
             lanterns, stores and signpost {stores:.1} m from the nearest spawn",
            layout.id,
            layout.spawns.len()
        );
    }
}
