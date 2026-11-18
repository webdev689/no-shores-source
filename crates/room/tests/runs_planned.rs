//! Saltmere's runs as the bake plans them: each zone's three runs are carved into its land, held in its section and
//! walked as its ways, and no other node's layout or land changes for them.

use land::sculpts::Sculpts;
use layout::brief::Briefs;
use layout::field::ring_holds;
use layout::paths::Tier;
use layout::sites::SiteKind;
use std::path::Path;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them with these briefs, and its nodes' claims.
fn continent_one(briefs: &Briefs) -> (Vec<layout::Layout>, Vec<Vec<[f64; 2]>>) {
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
    (layout::settle::settle(&mut landmass, &builders.book, briefs), claims)
}

fn briefs() -> Briefs {
    bake::builders(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("the builders read").briefs
}

#[test]
fn saltmeres_runs_are_planned_and_open() {
    let (layouts, _) = continent_one(&briefs());
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
    let (with, claims) = continent_one(&briefs);
    let (without, _) = continent_one(&bare);
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
