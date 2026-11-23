//! The editor's live dabs keep an edits file within its dabs, so what it saves is a file it opens again.

use land::edits::{Edits, Falloff, MAX_DABS, Stroke, Tool, check};
use land::landmass::generate;
use std::path::Path;

#[test]
fn a_live_dab_past_the_most_dabs_a_file_may_hold_is_refused() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world/layout.json");
    let layout = world::layout::parse(&std::fs::read_to_string(path).expect("the layout")).expect("it parses");
    let continent = layout.continents.into_iter().next().expect("a continent");
    let mut landmass = generate(&continent, Edits::default()).expect("a landmass");
    let at = continent.outline.first().copied().expect("a coast");
    let brush = Stroke {
        tool: Tool::Raise,
        radius_m: 8_000,
        strength: 1,
        falloff: Falloff::Smooth,
        level_m: None,
        points: vec![],
    };
    landmass.edits.strokes = vec![Stroke { points: vec![at; MAX_DABS], ..brush.clone() }];
    let before = landmass.ground.clone();
    assert_eq!(landmass.dab(&brush, at, false), None, "joining the last stroke");
    assert_eq!(landmass.dab(&brush, at, true), None, "starting a new one");
    assert_eq!(landmass.edits.strokes.iter().map(|stroke| stroke.points.len()).sum::<usize>(), MAX_DABS);
    assert_eq!(landmass.ground, before, "the ground untouched");
    assert!(check(&landmass.edits).is_empty(), "what it saves holds no more than a file may");
}
