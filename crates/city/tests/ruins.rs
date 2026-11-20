//! The ruined cities on the real world: which cities the planner ruins, a port city's plan as it was before ruins
//! were laid, and a ruin's plan, laid on its city's own site and cells, the same every time.

use city::solids::{Material, Shape};
use city::{Plan, plan_as};
use std::path::Path;

fn read(path: &str) -> String {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world");
    std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository")
}

/// A continent's land as generated, before any city's pads, and its city.
fn land_of(continent_id: &str) -> (land::landmass::Landmass, land::sites::City) {
    let layout = world::layout::parse(&read("layout.json")).expect("the layout parses");
    let continent = layout.continents.iter().find(|continent| continent.id == continent_id).expect("in the layout");
    let edits = land::edits::parse(&read(&format!("land/{continent_id}.json"))).expect("the edits parse");
    let landmass = land::landmass::generate(continent, edits).expect("the continent generates");
    let city = landmass.edits.city.clone().expect("it has a city");
    (landmass, city)
}

/// FNV-1a over the plan as JSON, leaving out what only a ruin has: its last two fields.
fn fingerprint(plan: &Plan) -> String {
    let whole = serde_json::to_string(plan).expect("a plan serialises");
    let text = format!("{}}}", &whole[..whole.rfind(",\"ruined\":").expect("a plan says whether it is ruined")]);
    let hash = text
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x100_0000_01b3));
    format!("{hash:016x}")
}

#[test]
fn of_the_nine_cities_only_the_port_cities_stand() {
    let layout = world::layout::parse(&read("layout.json")).expect("the layout parses");
    let mut ruined = Vec::new();
    for continent in &layout.continents {
        let edits = land::edits::parse(&read(&format!("land/{}.json", continent.id))).expect("the edits parse");
        let city = edits.city.expect("every continent has a city");
        assert_eq!(city::ruins::is_ruined(&city.id), !world::ports::is_main_port(&city.id), "{}", city.id);
        if city::ruins::is_ruined(&city.id) {
            ruined.push(city.id);
        }
    }
    ruined.sort();
    assert_eq!(ruined, ["cairnwatch", "elmhaven", "fenhallow", "goldreach", "mistfall", "windmere"]);
}

#[test]
fn overlook_is_planned_as_it_was() {
    let (mut landmass, _) = land_of("continent-1");
    let plan = city::settle(&mut landmass, &city::rmb::Blocks::default()).expect("plans").expect("a city");
    assert!(!plan.ruined && plan.wrecks.is_empty());
    assert_eq!(plan.name, "Overlook");
    assert!(!plan.social.stations.is_empty(), "a port city keeps its counters");
    // The plan before ruins were laid, pinned: a port city's plan must not change with them.
    assert_eq!(fingerprint(&plan), "6760600ca67abcef");
}

#[test]
fn a_ruin_keeps_its_site_and_breaks_what_stands_on_it() {
    let (landmass, city) = land_of("continent-6");
    let blocks = city::rmb::Blocks::default();
    let ruin = plan_as(&city, &landmass.surface, &blocks, true).expect("the ruin plans");
    let port = plan_as(&city, &landmass.surface, &blocks, false).expect("the port plans");
    // Its site and plan by the same rules: the land, its nodes and the plaza's floor stand where they were.
    assert_eq!(ruin.cells, port.cells);
    assert_eq!(ruin.pads, port.pads);
    assert_eq!((&ruin.gates, ruin.harbour, ruin.centre), (&port.gates, port.harbour, port.centre));
    assert_eq!(
        (ruin.social.bounds, &ruin.social.ring, &ruin.social.spawns),
        (port.social.bounds, &port.social.ring, &port.social.spawns)
    );
    assert_eq!(ruin.name, "Ruins of Mistfall");
    assert!(ruin.ruined && ruin.social.stations.is_empty(), "no one keeps a counter");
    // The landmark broken to what it keeps over the platform, its light out.
    let top = |plan: &Plan| plan.landmark.iter().map(|solid| solid.at[2] + solid.size[2]).fold(f64::MIN, f64::max);
    let level = port.social.level;
    assert!(
        (top(&ruin) - (level + (top(&port) - level) * city::ruins::LANDMARK_KEPT)).abs() < 1e-6,
        "{} of {}",
        top(&ruin),
        top(&port)
    );
    assert!(ruin.landmark.iter().all(|solid| solid.material != Material::Glow));
    // No tower keeps its roof; the breaches and the ways are heaped with rubble.
    assert!(port.works.iter().any(|solid| solid.material == Material::Roof));
    assert!(!ruin.works.iter().any(|solid| solid.material == Material::Roof));
    let heaps = ruin.works.iter().filter(|solid| solid.material == Material::Rubble).count();
    let wall = port.works.iter().filter(|solid| solid.material == Material::Stone && solid.size[2] == 18.0).count();
    assert!(heaps >= wall / 3 + ruin.gates.len(), "{heaps} heaps for {wall} pieces");
    assert!(!port.works.iter().any(|solid| solid.material == Material::Rubble));
    // The piers broken off: each of the ruin's is shorter than the port's.
    let piers = |plan: &Plan| -> Vec<f64> {
        plan.works.iter().filter(|solid| solid.material == Material::Timber).map(|solid| solid.size[1]).collect()
    };
    let (broken, whole) = (piers(&ruin), piers(&port));
    assert_eq!(broken.len(), whole.len());
    assert!(broken.iter().zip(&whole).all(|(broken, whole)| *broken > 0.0 && broken < whole));
    // Two wrecks, a Sloop and a Schooner, heeled, settled in deep water.
    let ships: Vec<_> = ruin.wrecks.iter().map(|wreck| serde_json::to_string(&wreck.ship).expect("names")).collect();
    assert_eq!(ships, ["\"sloop\"", "\"schooner\""]);
    for wreck in &ruin.wrecks {
        assert!((wreck.heel.abs() - city::ruins::WRECK_HEEL).abs() < 1e-12);
        assert!(
            landmass.surface.height_at(wreck.at[0], wreck.at[1]) < -4.0,
            "{:?} lies in the harbour's water",
            wreck.at
        );
    }
    assert!(ruin.works.iter().all(|solid| !matches!(solid.shape, Shape::Arch { .. })), "every gate breached");
    // The same every time, and pinned, so every machine lays the same ruin.
    assert_eq!(ruin, plan_as(&city, &landmass.surface, &blocks, true).expect("the ruin plans again"));
    assert_eq!(fingerprint(&ruin), "922728626a411a2c");
}
