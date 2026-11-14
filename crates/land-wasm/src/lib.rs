//! The land for the browser. JavaScript writes a request into memory this module reserves and reads back a view of a
//! landmass: a JSON header, then its ground and lake surfaces as little-endian 32-bit floats, one a cell. The land
//! stays in the land crate; the open landmass stays here between calls, so the owner's strokes land on it live.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use land::edits::{self, CellRect, Edits, Stroke};
use land::ground::{WaterAt, sample_hash};
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
        "problems": landmass.problems().iter().map(|problem| json!({ "subject": problem.subject, "message": problem.message })).collect::<Vec<_>>(),
        "rivers": rivers,
    })
}

fn read(request: &[u8]) -> Result<Value, String> {
    std::str::from_utf8(request)
        .map_err(|error| error.to_string())
        .and_then(|text| serde_json::from_str::<Value>(text).map_err(|error| error.to_string()))
}

/// Edits from a request's value, refused if any stroke breaks the rules; null is no edits.
fn edits_from(value: &Value) -> Result<Edits, String> {
    if value.is_null() {
        return Ok(Edits::default());
    }
    let edits: Edits = serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    match edits::check(&edits).first() {
        Some(problem) => Err(format!("{}: {}", problem.subject, problem.message)),
        None => Ok(edits),
    }
}

fn error_view(error: &str) -> Vec<u8> {
    view_bytes(&json!({ "error": error }), None)
}

/// Runs `change` on the open landmass and answers its whole view, or the reason it could not.
fn with_open(change: impl FnOnce(&mut Landmass) -> Result<(), String>) -> Vec<u8> {
    OPEN.with(|open| match open.borrow_mut().as_mut() {
        None => error_view("no landmass is open"),
        Some(landmass) => match change(landmass) {
            Ok(()) => view_bytes(&header_of(landmass), Some(landmass)),
            Err(error) => error_view(&error),
        },
    })
}

/// Opens one continent of a layout: `{ "layout": <layout file>, "id": <continent id>, "edits": <edits file or null>,
/// "keep": bool }`. Generates its land with the edits on it and answers its view, or a header holding only `error`.
/// Only a kept landmass stays open for strokes; one not kept is a preview and leaves the open one alone.
#[must_use]
pub fn open_view(request: &[u8]) -> Vec<u8> {
    let opened = read(request).and_then(|request| {
        let layout: world::layout::Layout =
            serde_json::from_value(request["layout"].clone()).map_err(|error| error.to_string())?;
        let id = request["id"].as_str().unwrap_or_default();
        let edits = edits_from(&request["edits"])?;
        let keep = request["keep"].as_bool().unwrap_or(true);
        let continent = layout.continents.iter().find(|continent| continent.id == id);
        let landmass = continent.map(|continent| generate(continent, edits));
        landmass.map(|landmass| (landmass, keep)).ok_or_else(|| format!("the layout has no continent \"{id}\""))
    });
    match opened {
        Ok((landmass, keep)) => {
            let bytes = view_bytes(&header_of(&landmass), Some(&landmass));
            if keep {
                OPEN.with(|open| *open.borrow_mut() = Some(landmass));
            }
            bytes
        }
        Err(error) => error_view(&error),
    }
}

/// One live dab on the open landmass: `{ "brush": <a stroke, its points ignored>, "point": [x, y], "starts": bool }`.
/// Answers the cells it changed: a header with `rect` [left, top, right, bottom], then their heights row by row.
#[must_use]
pub fn dab_patch(request: &[u8]) -> Vec<u8> {
    let patched = read(request).and_then(|request| {
        let point: world::geometry::Point =
            serde_json::from_value(request["point"].clone()).map_err(|error| error.to_string())?;
        let mut brush: Stroke = serde_json::from_value(request["brush"].clone()).map_err(|error| error.to_string())?;
        brush.points = vec![point];
        let checked = edits_from(
            &serde_json::to_value(Edits { strokes: vec![brush.clone()], ..Edits::default() }).unwrap_or_default(),
        )?;
        let brush = checked.strokes.into_iter().next().ok_or("no brush")?;
        let starts = request["starts"].as_bool().unwrap_or(true);
        OPEN.with(|open| {
            let mut open = open.borrow_mut();
            let landmass = open.as_mut().ok_or("no landmass is open")?;
            Ok(landmass.dab(&brush, point, starts).map(|rect| patch_bytes(landmass, rect)))
        })
    });
    match patched {
        Ok(Some(bytes)) => bytes,
        Ok(None) => view_bytes(&json!({ "rect": [0, 0, 0, 0] }), None),
        Err(error) => error_view(&error),
    }
}

fn patch_bytes(landmass: &Landmass, rect: CellRect) -> Vec<u8> {
    let mut bytes = view_bytes(&json!({ "rect": [rect.left, rect.top, rect.right, rect.bottom] }), None);
    let width = landmass.ground.width;
    for j in rect.top..rect.bottom {
        for &value in &landmass.ground.data[j * width + rect.left..j * width + rect.right] {
            bytes.extend_from_slice(&(value as f32).to_le_bytes());
        }
    }
    bytes
}

/// The open landmass with its water run again over the ground as it stands.
#[must_use]
pub fn settle_view() -> Vec<u8> {
    with_open(|landmass| {
        landmass.settle();
        Ok(())
    })
}

/// The open landmass with these edits in place of its own: `{ "edits": <edits file> }`. Undo and redo use it.
#[must_use]
pub fn set_edits_view(request: &[u8]) -> Vec<u8> {
    match read(request).and_then(|request| edits_from(&request["edits"])) {
        Ok(edits) => with_open(|landmass| {
            landmass.set_edits(edits);
            Ok(())
        }),
        Err(error) => error_view(&error),
    }
}

/// The open landmass's edits file in its written form: `{ "id", "text" }`, or `{ "error" }`.
#[must_use]
pub fn write_json() -> String {
    OPEN.with(|open| match open.borrow().as_ref() {
        None => json!({ "error": "no landmass is open" }).to_string(),
        Some(landmass) => match edits::write(&landmass.edits) {
            Ok(text) => json!({ "id": landmass.id, "text": text }).to_string(),
            Err(error) => json!({ "error": error.to_string() }).to_string(),
        },
    })
}

/// The open landmass's ground at each point of `{ "points": [[x, y], ...] }`, as the runtime finds it: each height, the
/// water there (`dry`, `sea`, `lake` or `river`) and its surface, and a fingerprint of the heights' bits.
#[must_use]
pub fn sample_json(request: &[u8]) -> String {
    let sampled = read(request).and_then(|request| {
        let points: Vec<[f64; 2]> =
            serde_json::from_value(request["points"].clone()).map_err(|error| error.to_string())?;
        OPEN.with(|open| {
            let open = open.borrow();
            let landmass = open.as_ref().ok_or("no landmass is open")?;
            let ground = &landmass.surface;
            let pairs: Vec<(f64, f64)> = points.iter().map(|&[x, y]| (x, y)).collect();
            let heights: Vec<f64> = pairs.iter().map(|&(x, y)| ground.height_at(x, y)).collect();
            let water: Vec<Value> = pairs
                .iter()
                .map(|&(x, y)| match ground.water_at(x, y) {
                    WaterAt::Dry => json!({ "kind": "dry" }),
                    WaterAt::Sea => json!({ "kind": "sea", "surface": 0.0 }),
                    WaterAt::Lake { surface } => json!({ "kind": "lake", "surface": surface }),
                    WaterAt::River { surface } => json!({ "kind": "river", "surface": surface }),
                })
                .collect();
            let hash = format!("{:016x}", sample_hash(ground, &pairs));
            Ok(json!({ "heights": heights, "water": water, "sample_hash": hash }).to_string())
        })
    });
    sampled.unwrap_or_else(|error: String| json!({ "error": error }).to_string())
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

/// One dab on the open landmass, from the request at `address`, `length` bytes long.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_dab(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(dab_patch(request))
}

/// The open landmass's water run again.
#[unsafe(no_mangle)]
pub extern "C" fn land_settle() -> u64 {
    hand_over(settle_view())
}

/// The open landmass with the edits the request at `address`, `length` bytes long, holds.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_set_edits(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(set_edits_view(request))
}

/// The open landmass's ground at the points the request at `address`, `length` bytes long, lists.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_sample(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(sample_json(request).into_bytes())
}

/// The open landmass's edits file text.
#[unsafe(no_mangle)]
pub extern "C" fn land_write() -> u64 {
    hand_over(write_json().into_bytes())
}

#[cfg(test)]
#[path = "door_tests.rs"]
mod door_tests;

#[cfg(test)]
mod tests {
    use super::*;

    fn header(bytes: &[u8]) -> Value {
        let length = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
        serde_json::from_slice(&bytes[4..4 + length]).unwrap()
    }

    #[test]
    fn a_continent_opens_as_a_header_and_two_floats_a_cell() {
        let request = br#"{ "id": "small", "edits": null, "layout": { "continents": [{ "id": "small", "outline": [[100000, 100000], [300000, 100000], [300000, 260000], [100000, 260000]] }], "isles": [] } }"#;
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
