use super::*;

fn header(bytes: &[u8]) -> Value {
    let length = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    serde_json::from_slice(&bytes[4..4 + length]).unwrap()
}

const SQUARE: &str = r#""layout": { "continents": [{ "id": "small", "outline": [[100000, 100000], [300000, 100000], [300000, 260000], [100000, 260000]] }], "isles": [] }"#;

#[test]
fn a_dab_lifts_the_open_land_and_the_edits_write_back() {
    let opened = open_view(format!(r#"{{ "id": "small", "edits": null, {SQUARE} }}"#).as_bytes());
    assert!(header(&opened).get("error").is_none());
    let brush = r#"{ "tool": "raise", "radius_m": 5000, "strength": 100, "points": [] }"#;
    let patch = dab_patch(format!(r#"{{ "brush": {brush}, "point": [200000, 180000], "starts": true }}"#).as_bytes());
    let rect = header(&patch)["rect"].clone();
    assert_eq!(rect, json!([135, 115, 145, 125]), "the window starts 40 km west and north of the coast");
    let again = dab_patch(format!(r#"{{ "brush": {brush}, "point": [201000, 180000], "starts": false }}"#).as_bytes());
    assert!(header(&again).get("error").is_none());
    let written: Value = serde_json::from_str(&write_json()).unwrap();
    let edits = edits::parse(written["text"].as_str().unwrap()).unwrap();
    assert_eq!(edits.strokes.len(), 1, "two dabs of one stroke");
    assert_eq!(edits.strokes[0].points.len(), 2);
}

#[test]
fn edits_that_break_the_rules_are_refused() {
    let _ = open_view(format!(r#"{{ "id": "small", "edits": null, {SQUARE} }}"#).as_bytes());
    let bad = r#"{ "edits": { "strokes": [{ "tool": "raise", "radius_m": 5, "strength": 10, "points": [[0, 0]] }] } }"#;
    let found = header(&set_edits_view(bad.as_bytes()));
    assert_eq!(found["error"], "stroke 1: its radius must be 1000 to 200000 m");
}

#[test]
fn a_patch_samples_the_ground_with_its_water_and_marks() {
    let edits = r#"{ "strokes": [], "roads": [{ "id": "road-1", "width_m": 10, "points": [[150000, 180000], [250000, 180000]] }] }"#;
    let _ = open_view(format!(r#"{{ "id": "small", "edits": {edits}, {SQUARE} }}"#).as_bytes());
    let bytes = patch_view(br#"{ "left": 199000, "top": 179980, "step": 4, "width": 10, "height": 10 }"#);
    let found = header(&bytes);
    assert_eq!((found["width"].as_u64(), found["height"].as_u64()), (Some(10), Some(10)));
    let start = 4 + u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    assert_eq!(bytes.len(), start + 100 * 4 * 3 + 100, "height, water and fresh water's edge, then the mark");
    let float = |at: usize| f32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    for sample in 0..100 {
        let (water, edge) = (float(start + 400 + sample * 4), float(start + 800 + sample * 4));
        assert_eq!(water > 0.0, edge < 0.0, "sample {sample}: under fresh water exactly where inside its edge");
    }
    let marks = &bytes[start + 1200..];
    assert_eq!(marks[5 * 10], 3, "the sample on the road's line is on its bed");
    assert_eq!(marks[0], 0, "20 m off it is not");
    let refused = header(&patch_view(br#"{ "left": 0, "top": 0, "step": 4, "width": 5000, "height": 10 }"#));
    assert!(refused["error"].as_str().unwrap().starts_with("a patch is"));
}

/// The square continent the land's own agreement test opens, as the browser's test writes it.
const SAIL_SQUARE: &str = r#"{ "id": "square", "keep": true, "edits": null, "layout": { "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] } }"#;

/// A voyage the browser's test sails too (client/src/rules/sailRules.test.ts): each leg's steer, crab, climb and
/// ticks, from 20 km off the square's west coast at rest.
const VOYAGE: [[f64; 4]; 9] = [
    [0.0, 0.0, 1.0, 30.0],
    [0.0, 0.0, 1.0, 30.0],
    [1.0, 0.0, 0.0, 60.0],
    [1.0, 0.0, 0.0, 60.0],
    [1.0, 0.0, 0.0, 60.0],
    [0.0, 0.0, 0.0, 60.0],
    [-1.0, 0.0, 0.0, 60.0],
    [0.0, 0.0, -1.0, 60.0],
    [1.0, 1.0, 0.0, 60.0],
];

fn sail_request(ship: &[f64], helm: &[f64], time: f64, ticks: f64) -> Vec<u8> {
    ship.iter().chain(helm).chain(&[time, ticks]).flat_map(|number| number.to_le_bytes()).collect()
}

fn sail_answer(bytes: &[u8]) -> Vec<f64> {
    let start = 4 + u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    bytes[start..].chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap())).collect()
}

#[test]
fn a_voyage_steps_to_its_pinned_fingerprint() {
    assert!(header(&open_view(SAIL_SQUARE.as_bytes())).get("error").is_none());
    let mut ship = vec![180_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let (mut time, mut sailed) = (1000.0, Vec::new());
    for [steer, crab, climb, ticks] in VOYAGE {
        let answer = sail_answer(&sail_bytes(&sail_request(&ship, &[steer, crab, climb], time, ticks)));
        assert_eq!(answer.len(), 12, "a ship and her pose");
        ship = answer[..8].to_vec();
        sailed.extend(answer);
        time += ticks / 60.0;
    }
    assert_eq!(ship[7], 1.0, "she ends on her oars");
    assert!(ship[1] < 360_000.0 - 10.0, "she sailed north: {ship:?}");
    assert_eq!(format!("{:016x}", sailing::floats::fingerprint(&sailed)), "d37511220c2dc5b3");
}

#[test]
fn a_ship_at_sea_is_afloat_and_one_on_land_aground() {
    assert!(header(&open_view(SAIL_SQUARE.as_bytes())).get("error").is_none());
    let afloat = sail_answer(&sail_bytes(&sail_request(
        &[180_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        &[0.0; 3],
        0.0,
        0.0,
    )));
    assert_eq!(afloat[11], 0.0);
    let beached = sail_answer(&sail_bytes(&sail_request(
        &[260_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        &[0.0; 3],
        0.0,
        0.0,
    )));
    assert_eq!(beached[11], 1.0);
}

#[test]
fn bad_numbers_through_the_sail_door_are_refused() {
    assert!(header(&open_view(SAIL_SQUARE.as_bytes())).get("error").is_none());
    let ship = [180_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    let refused = |ship: &[f64], helm: &[f64], ticks: f64| {
        header(&sail_bytes(&sail_request(ship, helm, 0.0, ticks))).get("error").is_some()
    };
    assert!(refused(&[f64::NAN, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], &[0.0; 3], 1.0), "NaN");
    assert!(refused(&[180_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 7.0], &[0.0; 3], 1.0), "rung 7");
    assert!(refused(&[180_000.0, 360_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5], &[0.0; 3], 1.0), "half a rung");
    assert!(refused(&ship, &[0.0; 3], 1e6), "a million ticks");
    assert!(refused(&ship, &[0.0; 3], 1.5), "half a tick");
    assert!(refused(&ship, &[2.0, 0.0, 0.0], 1.0), "steer 2");
    assert!(refused(&ship, &[0.0, 0.0, 2.0], 1.0), "climb 2");
    assert!(refused(&ship, &[0.0, f64::INFINITY, 0.0], 1.0), "infinite crab");
    assert!(header(&sail_bytes(&[0; 16])).get("error").is_some(), "too few numbers");
    assert!(!refused(&ship, &[0.0; 3], 60.0), "a second's ticks are fine");
}
