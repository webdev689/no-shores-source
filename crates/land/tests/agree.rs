//! The land agrees to the bit wherever it runs: these fingerprints of a generated landmass's ground, and of the
//! ground sampled with places on it, are checked here, natively, and by the client's test of the same landmass
//! through WebAssembly (landRules.test.ts).

use land::landmass::{generate, ground_hash};

/// Both tests hold this value; a change to the generator changes it in both, on purpose.
pub const SQUARE_GROUND_HASH: &str = "2723ccc818961ecb";

#[test]
fn the_square_generates_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = generate(&layout.continents[0], land::edits::Edits::default()).unwrap();
    assert_eq!(format!("{:016x}", ground_hash(&landmass.ground)), SQUARE_GROUND_HASH);
}

/// The same square with a road, a carved river and a town, sampled on the road, along the river, inside the town and
/// across the land (`sample_points`; landRules.test.ts lists the same points).
pub const SQUARE_SAMPLE_HASH: &str = "1316e7b1b67f5f55";

#[test]
fn the_square_with_places_samples_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let edits = r#"{ "strokes": [],
        "rivers": [{ "id": "river-1", "width_m": 40, "depth_m": 4, "points": [[260000, 330000], [260000, 400000]] }],
        "roads": [{ "id": "road-1", "width_m": 8, "points": [[220000, 360000], [300000, 360000]] }],
        "towns": [{ "id": "town-1", "outline": [[230000, 370000], [240000, 370000], [240000, 380000], [230000, 380000]] }] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = generate(&layout.continents[0], land::edits::parse(edits).unwrap()).unwrap();
    assert!(landmass.problems().is_empty(), "{:?}", landmass.problems());
    let points = sample_points();
    assert_eq!(format!("{:016x}", land::ground::sample_hash(&landmass.surface, &points)), SQUARE_SAMPLE_HASH);
}

/// Ten points along the road, ten along the river, sixteen in the town, a hundred across the square and fifty more
/// at fractions of a metre.
fn sample_points() -> Vec<(f64, f64)> {
    let road = (0..10).map(|step| (225_000.0 + 7_000.0 * f64::from(step), 360_000.0));
    let river = (0..10).map(|step| (260_000.0, 335_000.0 + 6_000.0 * f64::from(step)));
    let town =
        (0..16).map(|step| (232_000.0 + 2_000.0 * f64::from(step % 4), 372_000.0 + 2_000.0 * f64::from(step / 4)));
    let across = (0..100).map(|step| (205_000.0 + 1_100.0 * f64::from(step), 305_000.0 + 1_100.0 * f64::from(step)));
    // Fractions of a metre, so the door's reading of a browser's numbers is held to the bit as well.
    let fractions = (0..50).map(|step| {
        (205_000.123_456_789 + 2_201.987_654_321 * f64::from(step), 305_000.75 + 2_199.062_5 * f64::from(step))
    });
    road.chain(river).chain(town).chain(across).chain(fractions).collect()
}

/// The sea's swell over the square's margin at a moment of world time, at points a fraction of a metre off the grid
/// (landRules.test.ts samples the same).
pub const SQUARE_SEA_HASH: &str = "b6ceaaa9dd1a37f4";

#[test]
fn the_sea_over_the_square_swells_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = generate(&layout.continents[0], land::edits::Edits::default()).unwrap();
    let swell = land::sea::Swell::default();
    let points: Vec<(f64, f64)> =
        (0..60).map(|step| (162_000.5 + 550.25 * f64::from(step), 262_000.75 + 3_300.5 * f64::from(step))).collect();
    assert!(points.iter().all(|&(x, y)| land::sea::sea_surface(&landmass.surface, &swell, x, y, 1234.567).is_some()));
    assert_eq!(format!("{:016x}", land::sea::sea_hash(&landmass.surface, &swell, &points, 1234.567)), SQUARE_SEA_HASH);
}

/// The deep sea under the weather round an island, at points from its lee to the open sea and a roadstead, at a moment
/// of 2026 (watersRules.test.ts asks the room's door for the same).
pub const WEATHER_SEA_HASH: &str = "33a897e65c0a9658";

#[test]
fn the_sea_under_the_weather_swells_to_its_fingerprint() {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[1000000, 1000000], [1100000, 1000000], [1100000, 1100000], [1000000, 1100000]] }], "isles": [] }"#;
    let waters = world::waters::Waters::new(&world::layout::parse(text).unwrap());
    let roadsteads = [world::geometry::Point { x: 1_103_000, y: 1_050_000 }];
    let points: Vec<(f64, f64)> = (0..40)
        .map(|step| (1_100_500.25 + 1_700.5 * f64::from(step), 1_000_000.75 + 2_600.125 * f64::from(step)))
        .collect();
    let hash = land::sea::weather_sea_hash(&waters, &roadsteads, &points, 1_790_000_123.25);
    assert_eq!(format!("{hash:016x}"), WEATHER_SEA_HASH);
}
