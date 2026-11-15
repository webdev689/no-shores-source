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
