//! The land for the browser. JavaScript writes a request into memory this module reserves and reads back a view of a
//! landmass: a JSON header, then its ground and lake surfaces as little-endian 32-bit floats, one a cell. The land
//! stays in the land crate; the open landmass stays here between calls, so edits can follow.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use land::landmass::{Landmass, generate, ground_hash};
use serde_json::{Value, json};
use std::cell::RefCell;

thread_local! {
    static OPEN: RefCell<Option<Landmass>> = const { RefCell::new(None) };
}

/// A view as bytes: the header's length (u32), the header, spaces to a 4-byte boundary, then the floats.
#[must_use]
pub fn view_bytes(header: &Value, landmass: Option<&Landmass>) -> Vec<u8> {
    let mut text = header.to_string().into_bytes();
    while !(4 + text.len()).is_multiple_of(4) {
        text.push(b' ');
    }
    let cells = landmass.map_or(0, |landmass| landmass.ground.data.len());
    let mut out = Vec::with_capacity(4 + text.len() + 8 * cells);
    out.extend_from_slice(&u32::try_from(text.len()).unwrap_or(u32::MAX).to_le_bytes());
    out.extend_from_slice(&text);
    if let Some(landmass) = landmass {
        for &value in &landmass.ground.data {
            out.extend_from_slice(&(value as f32).to_le_bytes());
        }
        for &value in &landmass.water.lake_level {
            out.extend_from_slice(&(value as f32).to_le_bytes());
        }
    }
    out
}

/// The header of a landmass's view: its window and its rivers.
#[must_use]
pub fn header_of(landmass: &Landmass) -> Value {
    let ground = &landmass.ground;
    let rivers: Vec<Value> = landmass
        .water
        .rivers
        .iter()
        .map(|river| {
            let points: Vec<[f64; 2]> = river.points.iter().map(|&(x, y)| [x.round(), y.round()]).collect();
            let flow: Vec<f64> = river.flow.iter().map(|flow| (flow * 100.0).round() / 100.0).collect();
            json!({ "points": points, "flow": flow })
        })
        .collect();
    json!({
        "id": landmass.id,
        "width": ground.width,
        "height": ground.height,
        "left_m": ground.left_m,
        "top_m": ground.top_m,
        "cell_m": ground.cell_m,
        "ground_hash": format!("{:016x}", ground_hash(ground)),
        "rivers": rivers,
    })
}

/// Opens one continent of a layout: `{ "layout": <layout file>, "id": <continent id> }`. Generates its land, keeps it
/// open, and answers its view, or a header holding only `error`.
#[must_use]
pub fn open_view(request: &[u8]) -> Vec<u8> {
    let opened = std::str::from_utf8(request)
        .map_err(|error| error.to_string())
        .and_then(|text| serde_json::from_str::<Value>(text).map_err(|error| error.to_string()))
        .and_then(|request| {
            let layout: world::layout::Layout =
                serde_json::from_value(request["layout"].clone()).map_err(|error| error.to_string())?;
            let id = request["id"].as_str().unwrap_or_default();
            layout
                .continents
                .iter()
                .find(|continent| continent.id == id)
                .map(generate)
                .ok_or_else(|| format!("the layout has no continent \"{id}\""))
        });
    match opened {
        Ok(landmass) => {
            let bytes = view_bytes(&header_of(&landmass), Some(&landmass));
            OPEN.with(|open| *open.borrow_mut() = Some(landmass));
            bytes
        }
        Err(error) => view_bytes(&json!({ "error": error }), None),
    }
}

/// Hands bytes to JavaScript as one number: the address in the high 32 bits, the length in the low 32. WebAssembly's
/// addresses are 32 bits; anywhere else the packing would lose them, so it refuses.
fn hand_over(bytes: Vec<u8>) -> u64 {
    let bytes = bytes.into_boxed_slice();
    let length = u32::try_from(bytes.len()).expect("an answer fits in 4 GB");
    let address = u32::try_from(Box::into_raw(bytes).cast::<u8>() as usize).expect("WebAssembly addresses are 32 bits");
    (u64::from(address) << 32) | u64::from(length)
}

/// Reserves `length` bytes for JavaScript to write a request into.
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

/// Opens the continent the request at `address`, `length` bytes long, names.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_open(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(open_view(request))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(bytes: &[u8]) -> Value {
        let length = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        serde_json::from_slice(&bytes[4..4 + length]).unwrap()
    }

    #[test]
    fn a_continent_opens_as_a_header_and_two_floats_a_cell() {
        let request = br#"{ "id": "small", "layout": { "continents": [{ "id": "small", "outline": [[100000, 100000], [300000, 100000], [300000, 260000], [100000, 260000]] }], "isles": [] } }"#;
        let bytes = open_view(request);
        let found = header(&bytes);
        assert_eq!(found["id"], "small");
        let cells = found["width"].as_u64().unwrap() * found["height"].as_u64().unwrap();
        let header_length = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        assert_eq!(header_length % 4, 0);
        assert_eq!(bytes.len(), 4 + header_length + 8 * cells as usize);
    }

    #[test]
    fn an_unknown_continent_answers_an_error() {
        let found = header(&open_view(br#"{ "id": "none", "layout": { "continents": [], "isles": [] } }"#));
        assert_eq!(found["error"], "the layout has no continent \"none\"");
    }
}
