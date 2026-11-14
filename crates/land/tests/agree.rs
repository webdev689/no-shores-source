//! The land agrees to the bit wherever it runs: these fingerprints of a generated landmass's ground, and of the
//! ground sampled with places on it, are checked here, natively, and by the client's test of the same landmass
//! through WebAssembly (landRules.test.ts).

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

/// The same square with a road, a carved river and a town, sampled on the road, along the river, inside the town and
/// across the land (`sample_points`; landRules.test.ts lists the same points).
pub const SQUARE_SAMPLE_HASH: &str = "ee55746a7aba0eae";

#[test]
fn the_square_with_places_samples_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let edits = r#"{ "strokes": [],
        "rivers": [{ "id": "river-1", "width_m": 40, "depth_m": 4, "points": [[260000, 330000], [260000, 400000]] }],
        "roads": [{ "id": "road-1", "width_m": 8, "points": [[220000, 360000], [300000, 360000]] }],
        "towns": [{ "id": "town-1", "outline": [[230000, 370000], [240000, 370000], [240000, 380000], [230000, 380000]] }] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = generate(&layout.continents[0], land::edits::parse(edits).unwrap());
    assert!(landmass.problems().is_empty(), "{:?}", landmass.problems());
    let points = sample_points();
    assert_eq!(format!("{:016x}", land::ground::sample_hash(&landmass.surface, &points)), SQUARE_SAMPLE_HASH);
}

/// Ten points along the road, ten along the river, sixteen in the town and a hundred across the square.
fn sample_points() -> Vec<(f64, f64)> {
    let road = (0..10).map(|step| (225_000.0 + 7_000.0 * f64::from(step), 360_000.0));
    let river = (0..10).map(|step| (260_000.0, 335_000.0 + 6_000.0 * f64::from(step)));
    let town =
        (0..16).map(|step| (232_000.0 + 2_000.0 * f64::from(step % 4), 372_000.0 + 2_000.0 * f64::from(step / 4)));
    let across = (0..100).map(|step| (205_000.0 + 1_100.0 * f64::from(step), 305_000.0 + 1_100.0 * f64::from(step)));
    road.chain(river).chain(town).chain(across).collect()
}
