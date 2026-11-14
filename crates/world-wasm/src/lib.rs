//! The world rules for the browser. JavaScript writes a layout file's text into memory this module reserves, calls
//! `check_layout`, and reads back JSON: the problems, and each continent's area. The rules stay in the world crate.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use serde_json::{Value, json};
use world::check::{CONTINENT_COUNT, FRAME_HEIGHT_M, FRAME_WIDTH_M, MAX_CONTINENT_M2, MIN_CONTINENT_M2, check};
use world::geometry::{doubled_area, ring_is_simple};

/// The constants the editor measures against, as JSON.
pub fn rules_json() -> String {
    json!({
        "frame_width_m": FRAME_WIDTH_M,
        "frame_height_m": FRAME_HEIGHT_M,
        "continent_count": CONTINENT_COUNT,
        "min_continent_km2": MIN_CONTINENT_M2 / 1_000_000,
        "max_continent_km2": MAX_CONTINENT_M2 / 1_000_000,
    })
    .to_string()
}

/// A layout file's text checked: whether it reads, its problems, and each continent's area in square kilometres.
pub fn check_json(text: &[u8]) -> String {
    let layout = match std::str::from_utf8(text)
        .map_err(|error| error.to_string())
        .and_then(|text| world::layout::parse(text).map_err(|error| error.to_string()))
    {
        Ok(layout) => layout,
        Err(error) => return json!({ "reads": false, "error": error }).to_string(),
    };
    let problems: Vec<Value> = check(&layout)
        .iter()
        .map(|problem| json!({ "subject": problem.subject, "message": problem.message }))
        .collect();
    let areas: Vec<Value> = layout
        .continents
        .iter()
        .map(|continent| {
            let outline = &continent.outline;
            json!({
                "id": continent.id,
                "area_km2": doubled_area(outline) / 2 / 1_000_000,
                "simple": outline.len() >= 3 && ring_is_simple(outline),
            })
        })
        .collect();
    json!({ "reads": true, "problems": problems, "continents": areas }).to_string()
}

/// A layout file's text rewritten in its one written form, or the reason it does not read.
pub fn write_json(text: &[u8]) -> String {
    let written = std::str::from_utf8(text)
        .map_err(|error| error.to_string())
        .and_then(|text| world::layout::parse(text).map_err(|error| error.to_string()))
        .and_then(|layout| world::layout::write(&layout).map_err(|error| error.to_string()));
    match written {
        Ok(text) => json!({ "reads": true, "text": text }).to_string(),
        Err(error) => json!({ "reads": false, "error": error }).to_string(),
    }
}

/// Hands text to JavaScript as one number: the address in the high 32 bits, the length in the low 32. WebAssembly's
/// addresses are 32 bits; anywhere else the packing would lose them, so it refuses.
fn hand_over(text: String) -> u64 {
    let bytes = text.into_bytes().into_boxed_slice();
    let length = u32::try_from(bytes.len()).expect("an answer fits in 4 GB");
    let address = u32::try_from(Box::into_raw(bytes).cast::<u8>() as usize).expect("WebAssembly addresses are 32 bits");
    (u64::from(address) << 32) | u64::from(length)
}

/// Reserves `length` bytes for JavaScript to write text into.
#[unsafe(no_mangle)]
pub extern "C" fn reserve(length: usize) -> *mut u8 {
    Box::into_raw(vec![0_u8; length].into_boxed_slice()).cast::<u8>()
}

/// Gives back memory from `reserve`, or from an answer.
///
/// # Safety
/// `address` and `length` must be exactly what `reserve` returned, or what an answer's number held, and used once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn release(address: *mut u8, length: usize) {
    // SAFETY: the caller hands back a boxed slice this module made, with its own length, once.
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(address, length)) });
}

/// The rules the editor measures against.
#[unsafe(no_mangle)]
pub extern "C" fn world_rules() -> u64 {
    hand_over(rules_json())
}

/// Checks the layout text at `address`, `length` bytes long.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn check_layout(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let text = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(check_json(text))
}

/// Rewrites the layout text at `address`, `length` bytes long, in its written form.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn write_layout(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let text = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(write_json(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rules_name_the_frame_and_the_continent_range() {
        let rules: Value = serde_json::from_str(&rules_json()).unwrap();
        assert_eq!(rules["frame_width_m"], 4_915_200);
        assert_eq!(rules["continent_count"], 9);
        assert_eq!(rules["min_continent_km2"], 161_600);
        assert_eq!(rules["max_continent_km2"], 940_000);
    }

    #[test]
    fn a_layout_is_checked_with_its_areas() {
        let text = br#"{ "continents": [{ "id": "small", "outline": [[0, 0], [400000, 0], [400000, 400000], [0, 400000]] }], "isles": [] }"#;
        let answer: Value = serde_json::from_str(&check_json(text)).unwrap();
        assert_eq!(answer["reads"], true);
        assert_eq!(answer["continents"][0]["area_km2"], 160_000);
        assert_eq!(answer["continents"][0]["simple"], true);
        assert_eq!(answer["problems"][0]["subject"], "small");
    }

    #[test]
    fn a_layout_is_written_in_its_one_form() {
        let answer: Value = serde_json::from_str(&write_json(br#"{"isles":[],"continents":[]}"#)).unwrap();
        assert_eq!(answer["text"], "{\n  \"continents\": [],\n  \"isles\": []\n}\n");
    }

    #[test]
    fn text_that_does_not_read_says_why() {
        let answer: Value = serde_json::from_str(&check_json(b"{ not json")).unwrap();
        assert_eq!(answer["reads"], false);
        assert!(answer["error"].as_str().is_some_and(|error| !error.is_empty()));
    }
}
