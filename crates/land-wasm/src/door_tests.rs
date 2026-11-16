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
