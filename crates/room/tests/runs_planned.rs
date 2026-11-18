//! Saltmere's runs as the bake plans them: each zone's three runs are carved into its land, held in its section and
//! walked as its ways, and no other node's layout or land changes for them.

use land::sculpts::Sculpts;
use layout::brief::Briefs;
use layout::field::ring_holds;
use layout::paths::Tier;
use layout::sites::SiteKind;
use std::path::Path;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them with these briefs, its nodes' claims and its ground as laid.
fn continent_one(briefs: &Briefs) -> (Vec<layout::Layout>, Vec<Vec<[f64; 2]>>, land::ground::Ground) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let claims =
        edits.nodes.iter().map(|node| node.ring.iter().map(|point| [point.x as f64, point.y as f64]).collect());
    let claims = claims.collect();
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, briefs);
    (layouts, claims, landmass.surface)
}

fn briefs() -> Briefs {
    bake::builders(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("the builders read").briefs
}

#[test]
fn saltmeres_runs_are_planned_and_open() {
    let (layouts, _, _) = continent_one(&briefs());
    for id in ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        assert_eq!(laid.runs.len(), 3, "{id} has its three runs");
        for run in &laid.runs {
            let held = |at: [f64; 2]| ring_holds(&laid.ring, at[0], at[1]);
            for beat in &run.beats {
                assert!(held(beat.at), "{id}: {}'s beat at {:?} is in the section", run.name, beat.at);
            }
            // The section is traced on 8 m cells, so its edge lies within a cell of the floor's.
            let before = [run.door[0] - run.facing[0] * 8.0, run.door[1] - run.facing[1] * 8.0];
            let past = [run.door[0] + run.facing[0] * 25.0, run.door[1] + run.facing[1] * 25.0];
            assert!(held(before), "{id}: {}'s door stands at the section's edge", run.name);
            assert!(!held(past), "{id}: {}'s section ends at its door", run.name);
            let walked = laid.paths.iter().any(|path| path.tier == Tier::Footpath && path.points == run.line);
            assert!(walked, "{id}: {} is walked as a footpath", run.name);
            let marked = |kind: SiteKind| {
                laid.sites.iter().any(|site| site.kind == kind && site.holds.as_deref() == Some(run.name.as_str()))
            };
            assert!(marked(SiteKind::Objective) && marked(SiteKind::Door), "{id}: {}'s end and door", run.name);
        }
    }
}

#[test]
fn the_other_nodes_are_planned_as_before_and_no_run_raises_their_land() {
    let briefs = briefs();
    let mut bare = briefs.clone();
    for id in ZONES {
        if let Some(brief) = bare.0.get_mut(id) {
            brief.runs.clear();
        }
    }
    let (with, claims, _) = continent_one(&briefs);
    let (without, _, _) = continent_one(&bare);
    for (now, was) in with.iter().zip(&without) {
        if !ZONES.contains(&now.id.as_str()) {
            let [now_text, was_text] = [now, was].map(|laid| serde_json::to_string(laid).unwrap_or_default());
            assert!(now_text == was_text, "{} is planned as before", now.id);
        }
    }
    let carved = |layouts: &[layout::Layout]| {
        let ours = layouts.iter().filter(|laid| ZONES.contains(&laid.id.as_str()));
        Sculpts::from(ours.map(|laid| laid.sculpt.clone()).collect::<Vec<_>>())
    };
    let (raised, plain) = (carved(&with), carved(&without));
    for (claim, laid) in claims.iter().zip(&with) {
        if ZONES.contains(&laid.id.as_str()) {
            continue;
        }
        for &[x, y] in claim {
            let (now, was) = (raised.raise(x, y, 1000.0), plain.raise(x, y, 1000.0));
            assert!(now <= was + 1e-9, "{}'s claim at {x},{y} is raised {now} by a run (was {was})", laid.id);
        }
    }
}

/// A check of one run: its layout, the run, and the ground's height under a point.
type RunCheck<'a> = &'a dyn Fn(&layout::Layout, &layout::runs::Run, &dyn Fn([f64; 2]) -> f64);

/// Each run of Saltmere's zones with its layout, its boxes and the ground's height under a point.
fn each_run(check: RunCheck) {
    let (layouts, _, ground) = continent_one(&briefs());
    let floor = |at: [f64; 2]| ground.height_at(at[0], at[1]);
    for laid in layouts.iter().filter(|laid| ZONES.contains(&laid.id.as_str())) {
        for run in &laid.runs {
            check(laid, run, &floor);
        }
    }
}

/// How far a point lies from a box's footprint, metres (0 inside it).
fn off_box(at: [f64; 2], b: &[f64; 6]) -> f64 {
    let across = (b[0] - at[0]).max(0.0).max(at[0] - b[2]);
    let down = (b[1] - at[1]).max(0.0).max(at[1] - b[3]);
    (across * across + down * down).sqrt()
}

/// Points of a beat's floor every 3 m, kept 2 m inside its edge.
fn floor_of(beat: &layout::runs::Beat) -> Vec<[f64; 2]> {
    let reach = (beat.radius - 2.0).max(0.0);
    let steps = (reach / 3.0).floor() as i32;
    let mut points = Vec::new();
    for column in -steps..=steps {
        for row in -steps..=steps {
            let (x, y) = (f64::from(column) * 3.0, f64::from(row) * 3.0);
            if (x * x + y * y).sqrt() <= reach {
                points.push([beat.at[0] + x, beat.at[1] + y]);
            }
        }
    }
    points
}

#[test]
fn cover_stands_within_ten_metres_on_every_beat() {
    each_run(&|laid, run, floor| {
        for beat in &run.beats {
            // Cover is a box standing on its own ground and at least 0.9 m over it, near enough the beat to count.
            let cover: Vec<&[f64; 6]> = laid
                .boxes
                .iter()
                .filter(|b| off_box(beat.at, b) <= beat.radius + 10.0)
                .filter(|b| {
                    let under = floor([(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0]);
                    b[5] <= under + 0.6 && b[4] >= under + 0.9
                })
                .collect();
            for at in floor_of(beat) {
                let nearest = cover.iter().map(|b| off_box(at, b)).fold(f64::INFINITY, f64::min);
                assert!(nearest <= 10.0, "{}: {} has no cover within 10 m of {at:?} ({nearest})", laid.id, run.name);
            }
        }
    });
}

#[test]
fn every_beat_has_a_raised_place() {
    each_run(&|laid, run, floor| {
        for beat in &run.beats {
            let ground = floor(beat.at);
            let within = |b: &&[f64; 6]| off_box(beat.at, b) <= beat.radius;
            let platforms: Vec<&[f64; 6]> = laid
                .boxes
                .iter()
                .filter(within)
                .filter(|b| (ground + 1.2..=ground + 4.0).contains(&b[4]) && b[2] - b[0] >= 2.0 && b[3] - b[1] >= 2.0)
                .collect();
            let stepped = platforms.iter().any(|platform| {
                let steps = laid.boxes.iter().filter(|b| {
                    let middle = [(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0];
                    off_box(middle, platform) <= 4.0 && b[4] > ground + 0.2 && b[4] < platform[4] - 0.2
                });
                steps.count() >= 2
            });
            assert!(stepped, "{}: {}'s beat at {:?} has a raised place with steps up", laid.id, run.name, beat.at);
        }
    });
}

#[test]
fn nothing_stands_on_a_runs_line() {
    each_run(&|laid, run, floor| {
        for pair in run.line.windows(2) {
            let length = layout::field::distance(pair[0], pair[1]);
            let steps = (length / 2.0).ceil().max(1.0) as usize;
            for step in 0..=steps {
                let share = step as f64 / steps as f64;
                let at =
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
                let ground = floor(at);
                let blocking =
                    laid.boxes.iter().find(|b| b[5] < ground + 2.0 && b[4] > ground + 0.4 && off_box(at, b) < 1.2);
                assert!(blocking.is_none(), "{}: {} is blocked at {at:?} by {blocking:?}", laid.id, run.name);
            }
        }
    });
}

#[test]
fn a_ledge_climbs_to_the_top() {
    each_run(&|laid, run, floor| {
        if run.kind == layout::brief::RunKind::Ledge {
            let (mouth, end) = (floor(run.mouth), run.beats.last().map_or(0.0, |beat| floor(beat.at)));
            assert!(end - mouth >= 0.6 * laid.sculpt.rise, "{}: {} climbs {} m", laid.id, run.name, end - mouth);
        }
    });
}

/// Points every 2 m along a run's line.
fn along(run: &layout::runs::Run) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    for pair in run.line.windows(2) {
        let steps = (layout::field::distance(pair[0], pair[1]) / 2.0).ceil().max(1.0) as usize;
        for step in 0..steps {
            let share = step as f64 / steps as f64;
            points.push([pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]);
        }
    }
    points
}

#[test]
fn a_building_runs_ceilings_stand_clear_and_its_passages_are_roofed() {
    each_run(&|laid, run, floor| {
        if !run.kind.building() {
            return;
        }
        let mut roofed = 0;
        let points = along(run);
        for &at in &points {
            let ground = floor(at);
            let over: Vec<&[f64; 6]> =
                laid.boxes.iter().filter(|b| off_box(at, b) < 0.4 && b[5] > ground + 0.4 && b[5] < ground + 12.0).collect();
            for b in &over {
                assert!(b[5] >= ground + 2.6, "{}: {}'s ceiling at {at:?} is {} m up", laid.id, run.name, b[5] - ground);
            }
            roofed += usize::from(!over.is_empty());
        }
        assert!(roofed * 2 >= points.len(), "{}: {} is roofed over {roofed} of {} points", laid.id, run.name, points.len());
    });
}
