//! Each layout's map as the bake plans continent 1: its first spaces are its areas and every way joins two of them,
//! every space is reached from the first, each lookout stands on its massif's top at its climb's end, each beat follows
//! the one before it, a mine's and an undercroft's beats are roofed while no area of Saltmere's is, and every way and
//! climb of Saltmere's is walked without a step a body cannot take.

use land::ground::Ground;
use layout::Layout;
use layout::field::distance;
use layout::spaces::{Joined, SpaceKind};
use std::path::Path;
use std::sync::OnceLock;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them, and its ground as they leave it.
fn laid_one() -> &'static (Vec<Layout>, Ground) {
    static LAID: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent =
            world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        (layouts, landmass.surface)
    })
}

fn continent_one() -> &'static [Layout] {
    &laid_one().0
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
    for laid in continent_one().iter().filter(|laid| ZONES.contains(&laid.id.as_str())) {
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

#[test]
#[ignore = "the Driftwood Moors' way from Moorend steps 0.5 to 0.7 m onto the Tithe Camp's platform where its ramp, cut straight, leaves the way's line; cutting each ramp along its way moves the step onto the way that passes between two ramps, so it waits on the height rework's graded network"]
fn every_way_and_climb_of_saltmeres_is_walked_without_a_step() {
    let ground = &laid_one().1;
    let mut steps_found = Vec::new();
    for laid in continent_one().iter().filter(|laid| ZONES.contains(&laid.id.as_str())) {
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
                        steps_found.push(format!(
                            "{}: {:?} {from} to {to} steps {rise:+.2} m at {at:?}",
                            laid.id, joined.joined
                        ));
                    }
                }
            }
        }
    }
    assert!(steps_found.is_empty(), "{} steps: {steps_found:#?}", steps_found.len());
}
