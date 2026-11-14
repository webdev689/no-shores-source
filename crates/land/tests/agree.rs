//! The land agrees to the bit wherever it runs: this fingerprint of a generated landmass's ground is checked here,
//! natively, and by the client's test of the same landmass through WebAssembly (landRules.test.ts).

use land::landmass::{generate, ground_hash};

/// Both tests hold this value; a change to the generator changes it in both, on purpose.
pub const SQUARE_GROUND_HASH: &str = "c3f0ce8d08683ead";

#[test]
fn the_square_generates_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = generate(&layout.continents[0], land::edits::Edits::default());
    assert_eq!(format!("{:016x}", ground_hash(&landmass.ground)), SQUARE_GROUND_HASH);
}
