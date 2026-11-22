//! The authored layout file in the repository keeps the finished world's rules: the drafting rules and all nine
//! continents.

use std::path::Path;

#[test]
fn the_world_layout_file_keeps_the_finished_worlds_rules() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world/layout.json");
    let text = std::fs::read_to_string(&path).expect("content/world/layout.json exists");
    let layout = world::layout::parse(&text).expect("the layout file reads");
    let problems = world::check::check_finished(&layout);
    assert!(problems.is_empty(), "the layout file breaks its rules: {problems:#?}");
    assert_eq!(world::layout::write(&layout).expect("the layout writes"), text, "the file is in its written form");
}
