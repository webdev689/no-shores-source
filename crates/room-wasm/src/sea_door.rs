//! The sea by weather for a browser: the swell under the weather at a point, the swell's height over a grid round
//! the view, and a fingerprint of the deep sea's height at points, all from the world crate's weather and the land
//! crate's swell over the waters `waters_open` opened (the open sea, no coast or port, before they are).

use crate::hand_over;
use crate::waters_door::with_waters;
use land::sea::{FULL_DEPTH_M, GONE_DEPTH_M, SEED, SeaHere, Swell, weather_sea_hash};
use serde_json::json;
use world::geometry::Point;

/// The most cells a shelter grid may hold a side.
pub const MOST_GRID_CELLS: u32 = 64;

/// How the sea stands at world point (x, y) at `time_s`, seconds since the Unix epoch.
fn here_at(x: f64, y: f64, time_s: f64) -> SeaHere {
    with_waters(|waters, traffic| SeaHere::at(waters, &traffic.roadsteads, x, y, time_s))
        .unwrap_or_else(|| SeaHere::open_sea(&world::weather::air_at(x, y, time_s)))
}

/// The swell under the weather at (x, y) at `time_s` as JSON: its waves as the land door gives them, the depths it
/// fades over, its bearing, and how the sea stands there: `{ "waves", "full_depth_m", "gone_depth_m", "bearing",
/// "wind": [east, south], "state", "open", "harbour", "height" }`.
#[must_use]
pub fn swell_json(x: f64, y: f64, time_s: f64) -> String {
    let here = here_at(x, y, time_s);
    let swell = Swell::under(SEED, &here);
    let waves: Vec<_> = swell
        .waves
        .iter()
        .map(|wave| {
            json!({ "direction": wave.direction, "number": wave.number, "frequency": wave.frequency,
                "amplitude": wave.amplitude, "shift": wave.shift, "phase": wave.phase })
        })
        .collect();
    json!({ "waves": waves, "full_depth_m": FULL_DEPTH_M, "gone_depth_m": GONE_DEPTH_M, "bearing": swell.bearing,
        "wind": here.wind, "state": here.state, "open": here.open, "harbour": here.harbour, "height": here.height() })
    .to_string()
}

/// The swell's height as a share of a moderate sea's (`SeaHere::height`) at the middle of each cell of a grid
/// `columns` by `rows` cells `cell_m` metres wide from its north-west corner (x, y), row by row, as little-endian
/// 32-bit floats; empty for a grid that is not a finite corner, a cell of at least a metre, and 1 to
/// `MOST_GRID_CELLS` cells a side.
#[must_use]
pub fn shelter_bytes(x: f64, y: f64, cell_m: f64, columns: u32, rows: u32, time_s: f64) -> Vec<u8> {
    let fits = [x, y, cell_m, time_s].iter().all(|number| number.is_finite())
        && cell_m >= 1.0
        && (1..=MOST_GRID_CELLS).contains(&columns)
        && (1..=MOST_GRID_CELLS).contains(&rows);
    if !fits {
        return Vec::new();
    }
    let mut bytes = Vec::with_capacity((columns * rows * 4) as usize);
    for row in 0..rows {
        for column in 0..columns {
            let (east, south) = (x + (f64::from(column) + 0.5) * cell_m, y + (f64::from(row) + 0.5) * cell_m);
            bytes.extend_from_slice(&(here_at(east, south, time_s).height() as f32).to_le_bytes());
        }
    }
    bytes
}

/// The deep sea's height under the weather at each point (pairs of little-endian 64-bit numbers) at `time_s`,
/// fingerprinted (`land::sea::weather_sea_hash`).
#[must_use]
pub fn sea_hash(points: &[u8], time_s: f64) -> u64 {
    let numbers = crate::floats_of(points);
    let pairs: Vec<(f64, f64)> = numbers.chunks_exact(2).map(|pair| (pair[0], pair[1])).collect();
    with_waters(|waters, traffic| weather_sea_hash(waters, &traffic.roadsteads, &pairs, time_s)).unwrap_or_else(|| {
        let empty = world::waters::Waters::new(&world::layout::Layout::default());
        weather_sea_hash(&empty, &[] as &[Point], &pairs, time_s)
    })
}

/// The swell under the weather at a point, as JSON text (`swell_json`).
#[unsafe(no_mangle)]
pub extern "C" fn sea_swell(x: f64, y: f64, time_s: f64) -> u64 {
    hand_over(swell_json(x, y, time_s).into_bytes())
}

/// The swell's height over a grid round the view (`shelter_bytes`).
#[unsafe(no_mangle)]
pub extern "C" fn sea_shelter(x: f64, y: f64, cell_m: f64, columns: u32, rows: u32, time_s: f64) -> u64 {
    hand_over(shelter_bytes(x, y, cell_m, columns, rows, time_s))
}

/// The fingerprint of the deep sea's height at the points written at `address`, `length` bytes long (`sea_hash`).
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sea_heights_hash(address: *const u8, length: usize, time_s: f64) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    sea_hash(unsafe { std::slice::from_raw_parts(address, length) }, time_s)
}
