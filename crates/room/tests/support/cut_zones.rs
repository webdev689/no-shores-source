//! The two patrol zones cut from Saltmere (the Gullwing Vale and the Driftwood Moors), laid back into continent 1 by
//! the tests alone: what only they hold (a river, knolls and tors, a keep's citadel, the Old Stones, a coven's cavern,
//! ledges, and runs of a rampart, a gorge and an undercroft) stays walked, while the game lays the island as it is.

use std::path::Path;

/// The cut zones' ids.
pub const CUT: [&str; 2] = ["gullwing-vale", "driftwood-moors"];

fn fixture() -> serde_json::Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/support/cut_zones.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("the cut zones' file")).expect("it parses")
}

/// Continent 1's edits with the cut zones' nodes back where they stood among its nodes: the Vale's after the Broken
/// Causeway, the Moors' after the Maw of the Shallows.
#[must_use]
pub fn edits(text: &str) -> String {
    let mut edits: serde_json::Value = serde_json::from_str(text).expect("the edits parse");
    let nodes = edits["nodes"].as_array_mut().expect("its nodes");
    let cut = fixture()["nodes"].as_array().expect("the cut nodes").clone();
    for (node, after) in cut.into_iter().zip(["broken-causeway", "maw-shallows"]) {
        let at = nodes.iter().position(|each| each["id"] == after).expect("the node it stood after") + 1;
        nodes.insert(at, node);
    }
    edits.to_string()
}

/// The briefs with the cut zones' own beside them.
pub fn briefs(briefs: &mut layout::brief::Briefs) {
    let cut = fixture()["briefs"].to_string();
    briefs.0.extend(layout::brief::Briefs::parse(&cut).expect("the cut zones' briefs").0);
}
