//! Each layout's map as the bake plans continent 1: its first spaces are its areas and every way joins two of them,
//! every space is reached from the first, each lookout stands on its massif's top at its climb's end, each beat follows
//! the one before it, a mine's and an undercroft's beats are roofed while no area of Saltmere's is, and every way and
//! climb of Saltmere's is walked without a step a body cannot take. The two zones cut from Saltmere are laid back by
//! the tests alone (`support/cut_zones.rs`) for what only they hold.

use land::ground::Ground;
use layout::Layout;
use layout::field::distance;
use layout::spaces::{Joined, SpaceKind};
use std::path::Path;
use std::sync::OnceLock;

#[path = "support/cut_zones.rs"]
mod cut_zones;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them, and its ground as they leave it.
fn laid_one() -> &'static (Vec<Layout>, Ground) {
    static LAID: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    LAID.get_or_init(|| laid(false))
}

/// Continent 1 with the cut zones laid back, as they stood.
fn laid_cut() -> &'static (Vec<Layout>, Ground) {
    static LAID: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    LAID.get_or_init(|| laid(true))
}

/// Continent 1 settled, the cut zones laid back or not.
fn laid(cut: bool) -> (Vec<Layout>, Ground) {
    {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent =
            world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
        let text = read("content/world/land/continent-1.json");
        let edits = land::edits::parse(&if cut { cut_zones::edits(&text) } else { text }).expect("the edits parse");
        let mut builders = bake::builders(&root).expect("the builders read");
        if cut {
            cut_zones::briefs(&mut builders.briefs);
        }
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        (layouts, landmass.surface)
    }
}

fn continent_one() -> &'static [Layout] {
    &laid_one().0
}

/// Saltmere's zone as it is and the cut zones as the tests lay them back, each with its ground.
fn saltmere() -> impl Iterator<Item = (&'static Layout, &'static Ground)> {
    ZONES.into_iter().map(|id| {
        let (layouts, ground) = if cut_zones::CUT.contains(&id) { laid_cut() } else { laid_one() };
        (layouts.iter().find(|laid| laid.id == id).expect("the zone lays out"), ground)
    })
}

/// A cut zone as the tests lay it back.
fn cut(id: &str) -> &'static Layout {
    laid_cut().0.iter().find(|laid| laid.id == id).expect("the cut zone lays out")
}

#[test]
fn every_area_is_a_space_and_every_way_joins_two() {
    for laid in continent_one() {
        for (number, area) in laid.areas.iter().enumerate() {
            let space = &laid.map.spaces[number];
            assert_eq!(space.kind, SpaceKind::Area(area.kind), "{}: space {number} is its area", laid.id);
            assert_eq!(space.at, area.at, "{}: space {number} stands at its area", laid.id);
        }
        let ways: Vec<_> = laid.map.connections.iter().filter(|joined| joined.joined == Joined::Way).collect();
        assert!(!ways.is_empty() || laid.areas.len() < 2, "{} has ways", laid.id);
        for way in ways {
            let (from, to) = (&laid.areas[way.from], &laid.areas[way.to]);
            let (first, last) = (way.points[0], way.points[way.points.len() - 1]);
            assert!(way.from != way.to, "{}: a way joins two areas", laid.id);
            // A way starts and ends at its areas' hubs, which stand inside their reach.
            assert!(distance(first, from.at) <= from.radius, "{}: a way starts in {}", laid.id, from.name);
            assert!(distance(last, to.at) <= to.radius, "{}: a way ends in {}", laid.id, to.name);
        }
    }
}

#[test]
fn every_space_is_reached_from_the_first() {
    for laid in continent_one() {
        let count = laid.map.spaces.len();
        let mut reached = vec![false; count];
        let mut waiting = vec![0];
        while let Some(space) = waiting.pop() {
            if count == 0 || std::mem::replace(&mut reached[space], true) {
                continue;
            }
            for joined in &laid.map.connections {
                if joined.from == space {
                    waiting.push(joined.to);
                } else if joined.to == space {
                    waiting.push(joined.from);
                }
            }
        }
        let missed: Vec<_> = (0..count).filter(|&space| !reached[space]).collect();
        assert!(missed.is_empty(), "{}: spaces {missed:?} are reached by no connection", laid.id);
    }
}

#[test]
fn each_lookout_stands_on_its_massifs_top_at_its_climbs_end() {
    let mut seen = 0;
    for laid in continent_one() {
        for (number, space) in laid.map.spaces.iter().enumerate().filter(|(_, space)| space.kind == SpaceKind::Lookout)
        {
            seen += 1;
            assert!(space.level >= 0.8, "{}: a lookout stands at {:.2} of its massif", laid.id, space.level);
            let climbed =
                laid.map.connections.iter().any(|joined| joined.joined == Joined::Climb && joined.to == number);
            assert!(climbed, "{}: a climb ends at lookout {number}", laid.id);
        }
    }
    assert!(seen > 0, "continent 1 has lookouts");
}

#[test]
fn each_beat_follows_the_one_before_it() {
    for laid in continent_one() {
        for run in &laid.runs {
            let beats: Vec<usize> = (0..laid.map.spaces.len())
                .filter(|&space| {
                    laid.map.spaces[space].kind == SpaceKind::Beat && laid.map.spaces[space].name == run.name
                })
                .collect();
            assert_eq!(beats.len(), run.beats.len(), "{}: {} has its beats", laid.id, run.name);
            for pair in beats.windows(2) {
                let follows = laid
                    .map
                    .connections
                    .iter()
                    .any(|joined| joined.joined == Joined::Run && joined.from == pair[0] && joined.to == pair[1]);
                assert!(follows, "{}: {}'s beats follow one another", laid.id, run.name);
            }
            let into =
                laid.map.connections.iter().any(|joined| {
                    joined.joined == Joined::Run && joined.to == beats[0] && joined.from < laid.areas.len()
                });
            assert!(into, "{}: {} is entered from an area", laid.id, run.name);
        }
    }
}

#[test]
fn a_mines_and_an_undercrofts_beats_are_roofed_and_no_area_of_saltmeres_is() {
    use layout::brief::RunKind;
    let mut roofed_runs = 0;
    for laid in saltmere().map(|(laid, _)| laid) {
        for space in &laid.map.spaces[..laid.areas.len()] {
            assert!(!space.roofed, "{}: {} lies open to the sky", laid.id, space.name);
        }
        for run in laid.runs.iter().filter(|run| matches!(run.kind, RunKind::Mine | RunKind::Undercroft)) {
            roofed_runs += 1;
            let beats = laid.map.spaces.iter().filter(|space| space.kind == SpaceKind::Beat && space.name == run.name);
            for beat in beats {
                assert!(beat.roofed, "{}: {}'s beat at {:?} is roofed", laid.id, run.name, beat.at);
            }
        }
    }
    assert!(roofed_runs >= 2, "Saltmere has a mine and an undercroft");
}

/// A body's step: the most the land may rise within half a metre along a way, metres.
const STEP_M: f64 = 0.5;

/// Each place along a zone's ways and climbs where the carved land rises more than a body's step within half a metre,
/// but where a bridge carries the way.
fn steps_on(zones: &[&str]) -> Vec<String> {
    let mut steps_found = Vec::new();
    for (laid, ground) in saltmere().filter(|(laid, _)| zones.contains(&laid.id.as_str())) {
        // A river crossing's bridge carries the way over the water and its banks.
        let bridged = |at: [f64; 2]| {
            laid.paths
                .iter()
                .flat_map(|path| &path.crossings)
                .any(|[first, second]| layout::paths::off_line(at, *first, *second) < 6.0)
        };
        let walked = laid.map.connections.iter().filter(|joined| matches!(joined.joined, Joined::Way | Joined::Climb));
        for joined in walked {
            for pair in joined.points.windows(2) {
                let count = (distance(pair[0], pair[1]) / 0.5).ceil().max(1.0) as i32;
                let point = |step: i32| {
                    let share = f64::from(step) / f64::from(count);
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]
                };
                for step in 1..=count {
                    let (before, at) = (point(step - 1), point(step));
                    let rise = ground.height_at(at[0], at[1]) - ground.height_at(before[0], before[1]);
                    if rise.abs() > STEP_M && !bridged(at) && !bridged(before) {
                        let (from, to) = (joined.from, joined.to);
                        let joined = joined.joined;
                        steps_found
                            .push(format!("{}: {joined:?} {from} to {to} steps {rise:+.2} m at {at:?}", laid.id));
                    }
                }
            }
        }
    }
    steps_found
}

#[test]
fn every_way_and_climb_of_the_vales_is_walked_without_a_step() {
    let steps = steps_on(&["gullwing-vale"]);
    assert!(steps.is_empty(), "{} steps: {steps:#?}", steps.len());
}

#[test]
fn every_way_and_climb_of_saltmeres_is_walked_without_a_step() {
    let steps = steps_on(&ZONES);
    assert!(steps.is_empty(), "{} steps: {steps:#?}", steps.len());
}

#[test]
fn the_vales_places_stand_at_their_heights() {
    let laid = cut("gullwing-vale");
    let level = |name: &str| {
        let number = laid.areas.iter().position(|area| area.name == name).expect("the area is laid out");
        laid.map.spaces[number].level
    };
    let (keep, shrine, hamlet, farm) =
        (level("Valeguard"), level("The Old Stones"), level("Gullwing"), level("Orchard Farm"));
    assert!(keep > shrine && shrine > hamlet && hamlet > farm && farm > 0.1, "{keep} {shrine} {hamlet} {farm}");
    for low in ["Weir Mill", "The Water Meadows", "Hollow Coven"] {
        assert!(level(low) < 0.05, "{low} lies by the river: {}", level(low));
    }
    let mut heights: Vec<i64> =
        laid.map.spaces[..laid.areas.len()].iter().map(|space| (space.level * 10.0).round() as i64).collect();
    heights.sort_unstable();
    heights.dedup();
    assert!(heights.len() >= 4, "the Vale's places stand at {heights:?} tenths of its massif");
}

#[test]
fn no_way_of_saltmeres_is_carved_steeper_than_a_track_climbs() {
    // A raised floor's level is a share of the massif's local height, its rise varied up to 1.15 times by a slow noise.
    let most = layout::heights::STEEPEST * 1.15 + 0.02;
    let ramp = layout::basins::RAMP_STEEPEST * 1.15 + 0.02;
    let mut steep = Vec::new();
    for laid in saltmere().map(|(laid, _)| laid) {
        let carved = land::sculpts::Sculpts::from(vec![laid.sculpt.clone()]);
        let bridged = |at: [f64; 2]| {
            laid.paths
                .iter()
                .flat_map(|path| &path.crossings)
                .any(|[first, second]| layout::paths::off_line(at, *first, *second) < 12.0)
        };
        for joined in laid.map.connections.iter().filter(|joined| joined.joined == Joined::Way) {
            // The way's line every metre, and how far the carving raises the land there.
            let mut line: Vec<[f64; 2]> = Vec::new();
            for pair in joined.points.windows(2) {
                let count = distance(pair[0], pair[1]).ceil().max(1.0) as i32;
                line.extend((0..count).map(|step| {
                    let share = f64::from(step) / f64::from(count);
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]
                }));
            }
            let raised: Vec<f64> = line.iter().map(|at| carved.raise(at[0], at[1], 1000.0)).collect();
            // Over every 8 m of it; where it runs up a basin's ramp (a platform's, a shelf's, a terrace's), at the
            // ramp's own steepest.
            let on_ramp = |at: [f64; 2]| {
                laid.sculpt.climbs.iter().any(|climb| {
                    climb[5] != climb[6]
                        && layout::paths::off_line(at, [climb[0], climb[1]], [climb[2], climb[3]]) <= climb[4]
                })
            };
            for (from, to) in (0..line.len()).zip(8..line.len()) {
                let grade = (raised[to] - raised[from]).abs() / distance(line[from], line[to]).max(1e-9);
                let most = if on_ramp(line[from]) || on_ramp(line[to]) { ramp } else { most };
                if grade > most && !bridged(line[from]) && !bridged(line[to]) {
                    steep.push(format!(
                        "{}: {} to {} climbs {grade:.2} at {:?}",
                        laid.id, joined.from, joined.to, line[from]
                    ));
                    break;
                }
            }
        }
    }
    assert!(steep.is_empty(), "{} ways: {steep:#?}", steep.len());
}

#[test]
fn every_place_of_saltmeres_stands_at_its_briefs_height() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut briefs = bake::builders(&root).expect("the builders read").briefs;
    cut_zones::briefs(&mut briefs);
    for laid in saltmere().map(|(laid, _)| laid) {
        let brief = &briefs.0[&laid.id];
        let wanted = layout::heights::levels(&laid.areas, brief);
        let mut heights: Vec<i64> = wanted.iter().map(|level| (level * 10.0).round() as i64).collect();
        heights.sort_unstable();
        heights.dedup();
        assert!(heights.len() >= 3, "{}'s places stand at {heights:?} tenths of its massif", laid.id);
        for (((area, space), level), basin) in laid.areas.iter().zip(&laid.map.spaces).zip(wanted).zip(&laid.basins) {
            // A place whose basin raises a terrace at its middle (a camp's mound) stands on it.
            let mound = basin
                .terraces
                .iter()
                .filter(|t| t[5] == t[6] && layout::paths::off_line(area.at, [t[0], t[1]], [t[2], t[3]]) <= t[4])
                .fold(0.0, |high: f64, t| high.max(t[5]));
            let level = level + mound;
            assert!(
                (space.level - level).abs() < 0.05,
                "{}: {} stands at {:.2} of its massif, not {level:.2}",
                laid.id,
                area.name,
                space.level
            );
        }
    }
}

#[test]
fn the_vales_coven_opens_into_a_roofed_cavern_by_a_tunnel() {
    let (layouts, ground) = laid_cut();
    let laid = layouts.iter().find(|laid| laid.id == "gullwing-vale").expect("the Vale lays out");
    let coven = laid.areas.iter().position(|area| area.name == "Hollow Coven").expect("the coven is laid out");
    let cavern =
        laid.map.spaces.iter().position(|space| space.kind == SpaceKind::Cavern).expect("the coven has a cavern");
    let space = &laid.map.spaces[cavern];
    assert!(space.roofed, "the cavern is roofed");
    assert!(space.level < 0.05, "the cavern lies at the coven's level: {}", space.level);
    let tunnel = laid
        .map
        .connections
        .iter()
        .any(|joined| joined.joined == Joined::Tunnel && joined.from == coven && joined.to == cavern);
    assert!(tunnel, "a tunnel joins the coven to its cavern");
    // Under the roof at its middle, room to stand and fight.
    let floor = ground.height_at(space.at[0], space.at[1]);
    let over: Vec<f64> = laid
        .seating
        .solids
        .iter()
        .filter(|solid| city::rock::is_rock(solid.shape))
        .flat_map(city::rock::boxes)
        .filter(|&[west, north, east, south, ..]| {
            space.at[0] >= west && space.at[0] <= east && space.at[1] >= north && space.at[1] <= south
        })
        .map(|rock| rock[5] - floor)
        .collect();
    assert!(!over.is_empty(), "rock roofs the cavern's middle");
    assert!(over.iter().all(|&headroom| headroom >= 5.0), "the cavern's headroom: {over:?}");
}

#[test]
fn each_of_saltmeres_gates_closes_its_cleft_from_rock_to_rock() {
    for laid in saltmere().map(|(laid, _)| laid) {
        gates_close(laid);
    }
}

fn gates_close(laid: &Layout) {
    let carved = land::sculpts::Sculpts::from(vec![laid.sculpt.clone()]);
    let gates = laid.areas.iter().filter(|area| area.kind == layout::brief::AreaKind::Gate);
    let mut seen = 0;
    for gate in gates {
        seen += 1;
        // Its palisade's stakes: timber posts of a stake's girth within 45 m of its middle.
        let stakes: Vec<[f64; 2]> = laid
            .seating
            .solids
            .iter()
            .filter(|solid| solid.material == city::solids::Material::Timber && (solid.size[0] - 0.55).abs() < 1e-9)
            .map(|solid| [solid.at[0], solid.at[1]])
            .filter(|&at| distance(at, gate.at) < 45.0)
            .collect();
        // The line they stand along, from the farthest of them to the farthest from that.
        let far =
            |from: [f64; 2]| stakes.iter().copied().max_by(|a, b| distance(*a, from).total_cmp(&distance(*b, from)));
        let (Some(first), Some(second)) = (far(gate.at), far(far(gate.at).unwrap_or(gate.at))) else {
            panic!("{}'s gate at {:?} has a palisade", laid.id, gate.at)
        };
        for end in [first, second] {
            let off = carved.floor_distance(end[0], end[1]);
            assert!(
                off > -2.5,
                "the gate at {:?}: its palisade ends {:.1} m short of the rock at {end:?}",
                gate.at,
                -off
            );
        }
    }
    assert!(seen >= 1, "{} has its gates", laid.id);
}

#[test]
#[ignore = "writes target/shots/vale-fly.json"]
fn fly_list() {
    let laid = cut("gullwing-vale");
    let named = |name: &str| laid.areas.iter().position(|area| area.name == name).expect("the area is laid out");
    // A tour along the Vale's own ways: the landing, the meadows, the keep, the farm, the coven and into its cavern.
    let stops = ["Vale Mouth", "The Water Meadows", "Valeguard", "Orchard Farm", "Hollow Coven"].map(named);
    let mut line: Vec<[f64; 2]> = Vec::new();
    for pair in stops.windows(2) {
        let way = laid.map.connections.iter().find(|joined| {
            joined.joined == Joined::Way
                && ((joined.from, joined.to) == (pair[0], pair[1]) || (joined.from, joined.to) == (pair[1], pair[0]))
        });
        let Some(way) = way else {
            panic!("a way joins {} and {}", laid.areas[pair[0]].name, laid.areas[pair[1]].name)
        };
        let mut points = way.points.clone();
        if way.from != pair[0] {
            points.reverse();
        }
        line.extend(points);
    }
    if let Some(tunnel) = laid.map.connections.iter().find(|joined| joined.joined == Joined::Tunnel) {
        line.extend(tunnel.points.iter().copied());
    }
    let mut views = Vec::new();
    let mut walked = 0.0;
    let mut next = 0.0;
    for (index, pair) in line.windows(2).enumerate() {
        let length = distance(pair[0], pair[1]);
        while next <= walked + length {
            let share = (next - walked) / length.max(1e-9);
            let at = [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
            let ahead = line[(index + 3).min(line.len() - 1)];
            let bearing = libm::atan2(ahead[0] - at[0], at[1] - ahead[1]).to_degrees().rem_euclid(360.0);
            let name = format!("fly{:03}", views.len());
            views.push(serde_json::json!([at[0], at[1], bearing.round(), "third,45,22", name]));
            next += 40.0;
        }
        walked += length;
    }
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/shots/vale-fly.json");
    std::fs::create_dir_all(path.parent().expect("a folder")).expect("the folder is made");
    std::fs::write(&path, serde_json::to_string(&views).expect("the views write")).expect("the list is written");
}

#[test]
fn the_vales_hamlet_steps_up_its_hillside_block_by_block() {
    let laid = cut("gullwing-vale");
    let hamlet = laid.areas.iter().find(|area| area.name == "Gullwing").expect("the hamlet is laid out");
    let carved = land::sculpts::Sculpts::from(vec![laid.sculpt.clone()]);
    // How far the carving raises the land under each of its buildings.
    let raised: Vec<f64> = laid
        .seating
        .buildings
        .iter()
        .map(|building| {
            let [west, north, east, south] = building.footprint;
            [(west + east) / 2.0, (north + south) / 2.0]
        })
        .filter(|&at| distance(at, hamlet.at) < hamlet.radius + 60.0)
        .map(|at| carved.raise(at[0], at[1], 1000.0))
        .collect();
    let (low, high) =
        raised.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), &each| (low.min(each), high.max(each)));
    assert!(raised.len() >= 4, "the hamlet has its buildings: {}", raised.len());
    assert!(low >= 4.0, "every building stands up on the hamlet's terrace: {raised:?}");
    // A block up its hillside stands a step over the plaza's, on a terrace of its own.
    assert!(high - low >= 1.5, "its buildings stand {:.1} m apart in height: {raised:?}", high - low);
}

#[test]
fn no_hamlet_or_ruin_building_of_saltmeres_stands_across_a_step_or_a_slope() {
    let mut across = Vec::new();
    for laid in saltmere().map(|(laid, _)| laid) {
        let carved = land::sculpts::Sculpts::from(vec![laid.sculpt.clone()]);
        let stepped = |area: &&layout::areas::Area| {
            matches!(area.kind, layout::brief::AreaKind::Hamlet | layout::brief::AreaKind::Ruin)
        };
        for hamlet in laid.areas.iter().filter(stepped) {
            for building in &laid.seating.buildings {
                let [west, north, east, south] = building.footprint;
                if distance([(west + east) / 2.0, (north + south) / 2.0], hamlet.at) > hamlet.radius {
                    continue;
                }
                // The land under it and 4 m round it, where its doors open.
                let (west, north, wide, deep) = (west - 4.0, north - 4.0, east - west + 8.0, south - north + 8.0);
                let raised: Vec<f64> = (0..9)
                    .map(|at| {
                        let [x, y] = [west + wide * f64::from(at % 3) / 2.0, north + deep * f64::from(at / 3) / 2.0];
                        carved.raise(x, y, 1000.0)
                    })
                    .collect();
                let spread = raised.iter().fold(f64::NEG_INFINITY, |high, &each| high.max(each))
                    - raised.iter().fold(f64::INFINITY, |low, &each| low.min(each));
                // The massif's own roll lifts a large building's far side by under a metre; a tier's step, by metres.
                if spread > 1.0 {
                    across.push(format!("{}: {} at {west:.0},{north:.0} on {spread:.2} m", laid.id, hamlet.name));
                }
            }
        }
    }
    assert!(across.is_empty(), "{across:#?}");
}

#[test]
fn saltmeres_near_places_open_into_one_floor() {
    let opened: usize = saltmere().map(|(laid, _)| laid).map(near_places_open).sum();
    assert!(opened > 0, "Saltmere has places near enough to open into one floor");
}

fn near_places_open(laid: &Layout) -> usize {
    let carved = land::sculpts::Sculpts::from(vec![laid.sculpt.clone()]);
    let mut opened = 0;
    for way in laid.map.connections.iter().filter(|joined| joined.joined == Joined::Way) {
        let (first, second) = (&laid.areas[way.from], &laid.areas[way.to]);
        if distance(first.at, second.at) >= first.radius + second.radius + 120.0 {
            continue;
        }
        opened += 1;
        // Halfway along the way, its floor reaches half the smaller area's reach to either side.
        let middle = way.points[way.points.len() / 2];
        let next = way.points[(way.points.len() / 2 + 1).min(way.points.len() - 1)];
        let length = distance(middle, next).max(1e-9);
        let across = [-(next[1] - middle[1]) / length, (next[0] - middle[0]) / length];
        let out = first.radius.min(second.radius) * 0.5;
        for side in [-1.0, 1.0] {
            let at = [middle[0] + across[0] * out * side, middle[1] + across[1] * out * side];
            let between = format!("{} and {}", first.name, second.name);
            assert!(
                carved.floor_distance(at[0], at[1]) <= 0.0,
                "{between}: the floor reaches {out:.0} m aside at {at:?}"
            );
        }
    }
    opened
}
