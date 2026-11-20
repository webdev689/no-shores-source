//! Every edits file in the repository belongs to a continent of the layout, keeps its rules (its places checked
//! against that continent's coast) and is in its written form, so a file the World Editor saves merges and one
//! hand-edited wrong does not.

use std::path::Path;

#[test]
fn each_continent_of_the_layout_is_one_of_the_nine_biomes() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world");
    let layout = world::layout::parse(&std::fs::read_to_string(root.join("layout.json")).unwrap()).unwrap();
    for continent in &layout.continents {
        let named = continent.climate.as_deref().unwrap_or("none");
        assert!(land::biome::biome_of(named).is_some(), "{} is {named}, not one of the nine biomes", continent.id);
    }
}

#[test]
fn each_land_file_keeps_its_rules() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world");
    let layout = world::layout::parse(&std::fs::read_to_string(root.join("layout.json")).unwrap()).unwrap();
    let Ok(entries) = std::fs::read_dir(root.join("land")) else { return };
    for entry in entries {
        let path = entry.unwrap().path();
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let text = std::fs::read_to_string(&path).unwrap();
        let edits = land::edits::parse(&text).unwrap_or_else(|error| panic!("{name}: {error}"));
        let continent = layout.continents.iter().find(|continent| continent.id == name);
        let continent = continent.unwrap_or_else(|| panic!("{name}: no continent has this id"));
        let problems = land::edits::check_on(&edits, &continent.outline);
        assert!(problems.is_empty(), "{name} breaks its rules: {problems:#?}");
        assert_eq!(land::edits::write(&edits).unwrap(), text, "{name} is in its written form");
    }
}

#[test]
fn the_open_list_names_only_patrol_areas_and_missions_of_the_edits_files_each_once() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world");
    let open: Vec<String> = serde_json::from_str(&std::fs::read_to_string(root.join("open.json")).unwrap()).unwrap();
    let mut nodes = Vec::new();
    for entry in std::fs::read_dir(root.join("land")).unwrap() {
        let text = std::fs::read_to_string(entry.unwrap().path()).unwrap();
        nodes.extend(land::edits::parse(&text).unwrap().nodes);
    }
    for id in &open {
        let kind = nodes.iter().find(|node| &node.id == id).map(|node| node.kind);
        assert!(kind.is_some_and(|kind| land::sites::LOCKABLE.contains(&kind)), "{id} is no patrol area or mission");
    }
    let once: std::collections::BTreeSet<&String> = open.iter().collect();
    assert_eq!(once.len(), open.len(), "each id once");
}
