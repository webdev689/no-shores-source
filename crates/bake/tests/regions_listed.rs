//! The islands' regions as `content/world/regions.json` lists them, against the land files and the outlines: every
//! node listed once, on its own island, in the region whose centre is nearest it, and each region's anchorage where
//! the regions' rule puts it. The passages' mouths, against the briefs: each island's passages open at its patrol
//! zone's runs.

use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;
use world::geometry::{Point, ring_contains};

/// How far past the first point off the coast a region's anchorage lies on its bearing, metres.
const ANCHORAGE_PAST_COAST_M: f64 = 3000.0;
/// The bearings the anchorage is sought on, degrees apart, and the steps walked out along each, metres.
const BEARING_STEP_DEGREES: u32 = 5;
const WALK_STEP_M: f64 = 1000.0;
/// How far a listed anchorage may stand off the rule's point: the table holds whole metres.
const ANCHORAGE_WITHIN_M: f64 = 1.5;

fn read(path: &str) -> Value {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let text = std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    serde_json::from_str(&text).expect("the file parses")
}

fn point(value: &Value) -> [f64; 2] {
    [value[0].as_f64().expect("a number"), value[1].as_f64().expect("a number")]
}

fn apart(first: [f64; 2], second: [f64; 2]) -> f64 {
    libm::hypot(first[0] - second[0], first[1] - second[1])
}

/// A node's middle: the mean of its ring's points.
fn middle(ring: &[Value]) -> [f64; 2] {
    let count = ring.len() as f64;
    let sum = ring.iter().map(point).fold([0.0, 0.0], |sum, at| [sum[0] + at[0], sum[1] + at[1]]);
    [sum[0] / count, sum[1] / count]
}

#[test]
fn every_node_is_listed_once_on_its_own_island_in_the_region_nearest_it() {
    let islands = read("content/world/regions.json");
    let mut listed: BTreeMap<String, (String, String)> = BTreeMap::new();
    for island in islands.as_array().expect("a list of islands") {
        let id = island["island"].as_str().expect("an island id");
        for region in island["regions"].as_array().expect("its regions") {
            let name = region["name"].as_str().expect("a region's name");
            for node in region["nodes"].as_array().expect("its nodes") {
                let node = node.as_str().expect("a node id").to_owned();
                let again = listed.insert(node.clone(), (id.to_owned(), name.to_owned()));
                assert!(again.is_none(), "{node} is listed twice");
            }
        }
    }
    let mut found = 0;
    for island in islands.as_array().expect("a list of islands") {
        let id = island["island"].as_str().expect("an island id");
        let regions = island["regions"].as_array().expect("its regions");
        let land = read(&format!("content/world/land/{id}.json"));
        for node in land["nodes"].as_array().expect("the land file's nodes") {
            let node_id = node["id"].as_str().expect("a node id");
            let at = middle(node["ring"].as_array().expect("a node's ring"));
            let nearest = regions
                .iter()
                .min_by(|first, second| {
                    apart(point(&first["centre"]), at).total_cmp(&apart(point(&second["centre"]), at))
                })
                .expect("an island has regions");
            let wanted = (id.to_owned(), nearest["name"].as_str().expect("a name").to_owned());
            assert_eq!(listed.get(node_id), Some(&wanted), "{node_id}");
            found += 1;
        }
    }
    assert_eq!(found, listed.len(), "every listed id names a node of its island's land file");
}

#[test]
fn every_region_holds_three_outpost_slots_each_named_once_in_the_world() {
    let mut names: BTreeMap<String, String> = BTreeMap::new();
    for island in read("content/world/regions.json").as_array().expect("a list of islands") {
        let id = island["island"].as_str().expect("an island id");
        let land = read(&format!("content/world/land/{id}.json"));
        let nodes = land["nodes"].as_array().expect("the land file's nodes");
        for node in nodes {
            let name = node["name"].as_str().expect("a node's name").to_owned();
            let again = names.insert(name.clone(), node["id"].as_str().expect("a node id").to_owned());
            assert!(again.is_none(), "{name} names two nodes");
        }
        for region in island["regions"].as_array().expect("its regions") {
            let slots = region["nodes"]
                .as_array()
                .expect("its nodes")
                .iter()
                .filter(|listed| nodes.iter().any(|node| node["id"] == **listed && node["kind"] == "outpost"));
            assert_eq!(slots.count(), 3, "{id} {}", region["name"]);
        }
    }
}

/// The rule: from a region's centre, walk out in whole kilometres on each bearing 5 degrees apart (from east,
/// turning south) to the first point off its island's outline; the anchorage is 3 km past that point, on the bearing
/// where it comes soonest (the first such bearing on a tie).
#[test]
fn each_anchorage_is_3_km_past_the_coast_on_the_bearing_that_leaves_land_soonest() {
    let layout = read("content/world/layout.json");
    let mut checked = 0;
    for island in read("content/world/regions.json").as_array().expect("a list of islands") {
        let id = island["island"].as_str().expect("an island id");
        let continent = layout["continents"]
            .as_array()
            .expect("the continents")
            .iter()
            .find(|continent| continent["id"] == id)
            .expect("each island is a continent of the layout");
        let outline: Vec<Point> = continent["outline"]
            .as_array()
            .expect("an outline")
            .iter()
            .map(|at| Point::new(at[0].as_i64().expect("whole metres"), at[1].as_i64().expect("whole metres")))
            .collect();
        for region in island["regions"].as_array().expect("its regions") {
            let centre = point(&region["centre"]);
            let along = |degrees: u32, metres: f64| {
                let bearing = f64::from(degrees).to_radians();
                [centre[0] + metres * libm::cos(bearing), centre[1] + metres * libm::sin(bearing)]
            };
            let off_land =
                |at: [f64; 2]| !ring_contains(&outline, Point::new(at[0].round() as i64, at[1].round() as i64));
            let (_, degrees, coast) = (0..360 / BEARING_STEP_DEGREES)
                .map(|nth| nth * BEARING_STEP_DEGREES)
                .filter_map(|degrees| {
                    let steps = (1..100).find(|&step| off_land(along(degrees, f64::from(step) * WALK_STEP_M)))?;
                    Some((steps, degrees, f64::from(steps) * WALK_STEP_M))
                })
                .min_by_key(|&(steps, degrees, _)| (steps, degrees))
                .expect("some bearing reaches the sea");
            let wanted = along(degrees, coast + ANCHORAGE_PAST_COAST_M);
            let listed = point(&region["anchorage"]);
            assert!(apart(listed, wanted) <= ANCHORAGE_WITHIN_M, "{}: {listed:?} against {wanted:?}", region["name"]);
            checked += 1;
        }
    }
    assert_eq!(checked, 27, "nine islands of three regions");
}

#[test]
fn each_island_s_passages_open_at_its_patrol_zone_s_runs() {
    let briefs = read("content/world/briefs.json");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/passages");
    let mut files: Vec<_> = std::fs::read_dir(&root)
        .expect("the passages' folder")
        .map(|entry| entry.expect("an entry").path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "the passages' files");
    for file in files {
        let passages: Value =
            serde_json::from_str(&std::fs::read_to_string(&file).expect("a passages file")).expect("it parses");
        let patrol = passages["patrol"].as_str().expect("its patrol zone");
        let runs: Vec<&Value> =
            briefs[patrol]["runs"].as_array().expect("the patrol zone's runs").iter().map(|run| &run["name"]).collect();
        let mouths: Vec<&Value> = passages["mouths"].as_array().expect("its mouths").iter().collect();
        assert_eq!(mouths, runs, "{}: a mouth the room finds no door for opens none", file.display());
    }
}
