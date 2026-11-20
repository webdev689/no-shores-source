//! The weather: one field over the whole world, from world time (seconds since the Unix epoch) and position, made
//! from + - * / and square root alone so every machine agrees to the bit. Weather systems about 600 km across drift
//! eastward at 10 m/s and change over hours; across a system the wind veers smoothly and the sea state rises and falls
//! from calm to storm, never stepping. The open water a point lies in shelters it too: the lee of land and a port's
//! roadstead lie calmer than the open sea (`shelter`).

use crate::geometry::Point;
use crate::waters::Waters;

/// Weather systems are about this wide, metres, and drift eastward at this speed, metres a second.
pub const SYSTEM_M: f64 = 600_000.0;
pub const DRIFT_M_S: f64 = 10.0;
/// A system's weather changes over about this long, seconds, as well as drifting.
pub const CHANGE_S: f64 = 6.0 * 3_600.0;
/// Where the sea state's bands meet: calm below the first, moderate to the second, rough to the third, storm above.
pub const BANDS: [f64; 3] = [0.2, 0.5, 0.8];
/// The wind's strength at sea states 0, 0.2, 0.5, 0.8 and 1, metres a second: a light air in a calm, a gale in a
/// storm.
pub const WIND_M_S: [f64; 5] = [2.0, 4.0, 9.0, 15.0, 25.0];
/// The prevailing wind's share eastward, under the systems' own swirl: the systems ride westerlies.
const PREVAILING: f64 = 0.6;
/// The raw field's measured quantiles at 15%, 65% and 90%, so the sea is calm, moderate, rough and storm 15%, 50%,
/// 25% and 10% of the time (held by the shares test).
const QUANTILES: [f64; 3] = [0.340, 0.561, 0.693];

/// How the sea stands, by sea state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Band {
    Calm,
    Moderate,
    Rough,
    Storm,
}

/// The weather at a point and time: the wind (metres a second, east and south) and the sea state, 0 calm to 1 storm.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Air {
    pub wind: [f64; 2],
    pub state: f64,
}

impl Air {
    /// The wind's strength, metres a second.
    #[must_use]
    pub fn strength(&self) -> f64 {
        (self.wind[0] * self.wind[0] + self.wind[1] * self.wind[1]).sqrt()
    }

    #[must_use]
    pub fn band(&self) -> Band {
        band_of(self.state)
    }
}

#[must_use]
pub fn band_of(state: f64) -> Band {
    match state {
        state if state < BANDS[0] => Band::Calm,
        state if state < BANDS[1] => Band::Moderate,
        state if state < BANDS[2] => Band::Rough,
        _ => Band::Storm,
    }
}

/// The weather at world point (x, y), metres east and south, at `time_s` seconds since the Unix epoch.
#[must_use]
pub fn air_at(x: f64, y: f64, time_s: f64) -> Air {
    let (east, south, change) = ((x - DRIFT_M_S * time_s) / SYSTEM_M, y / SYSTEM_M, time_s / CHANGE_S);
    let raw = 0.65 * noise(east, south, change, 1) + 0.35 * noise(2.0 * east, 2.0 * south, 2.0 * change, 2);
    let state = through(
        &[(0.0, 0.0), (QUANTILES[0], BANDS[0]), (QUANTILES[1], BANDS[1]), (QUANTILES[2], BANDS[2]), (1.0, 1.0)],
        raw,
    );
    let swirl = [2.0 * noise(east, south, change, 3) - 1.0, 2.0 * noise(east, south, change, 4) - 1.0];
    let way = [PREVAILING + swirl[0], swirl[1]];
    let length = (way[0] * way[0] + way[1] * way[1]).sqrt();
    let strength = through(
        &[
            (0.0, WIND_M_S[0]),
            (BANDS[0], WIND_M_S[1]),
            (BANDS[1], WIND_M_S[2]),
            (BANDS[2], WIND_M_S[3]),
            (1.0, WIND_M_S[4]),
        ],
        state,
    );
    let unit = if length > 1e-9 { [way[0] / length, way[1] / length] } else { [1.0, 0.0] };
    Air { wind: [unit[0] * strength, unit[1] * strength], state }
}

/// How far the fetch is judged upwind, metres, and the swell's share at under the shortest fetch and at the longest.
pub const FETCH_M: [f64; 2] = [2_000.0, 60_000.0];
pub const FETCH_SHARE: [f64; 2] = [0.25, 1.0];
/// Within this far of a port's roadstead the sea is calm whatever the weather, the swell this share of a moderate
/// sea's; it eases back to the open sea's over the next `HARBOUR_EASE_M`, so no seam shows.
pub const HARBOUR_M: f64 = 3_000.0;
pub const HARBOUR_EASE_M: f64 = 500.0;
pub const HARBOUR_SHARE: f64 = 0.3;
/// The march upwind never steps less than this, metres, so a march along a coast lying with the wind takes 120 steps
/// at most: the fetch's shares change over kilometres.
const LEAST_STEP_M: f64 = 500.0;

/// The open water upwind of a point, metres, out to the longest fetch: the distance along the wind's way back to the
/// first land. Marched by the clearance to the nearest coast, which no step can overshoot.
#[must_use]
pub fn fetch_m(waters: &Waters, point: [f64; 2], wind: [f64; 2]) -> f64 {
    let strength = (wind[0] * wind[0] + wind[1] * wind[1]).sqrt();
    if strength <= 0.0 {
        return FETCH_M[1];
    }
    let upwind = [-wind[0] / strength, -wind[1] / strength];
    let mut out = 0.0;
    while out < FETCH_M[1] {
        let at = [point[0] + upwind[0] * out, point[1] + upwind[1] * out];
        let clear = waters.clearance(at);
        if clear <= 0.0 {
            return out;
        }
        out += clear.max(LEAST_STEP_M);
    }
    FETCH_M[1]
}

/// The share of the open sea's swell a point of sea is left by the land round it: by its fetch upwind (`fetch_m`),
/// and calm within `HARBOUR_M` of a roadstead. The second number says how much of the harbour's calm holds, 0 to 1.
#[must_use]
pub fn shelter(waters: &Waters, roadsteads: &[Point], point: [f64; 2], wind: [f64; 2]) -> (f64, f64) {
    let fetch = fetch_m(waters, point, wind);
    let open = through(&[(FETCH_M[0], FETCH_SHARE[0]), (FETCH_M[1], FETCH_SHARE[1])], fetch);
    let nearest = roadsteads.iter().fold(f64::INFINITY, |least, roadstead| {
        let (east, south) = (point[0] - roadstead.x as f64, point[1] - roadstead.y as f64);
        least.min((east * east + south * south).sqrt())
    });
    let harbour = 1.0 - ((nearest - HARBOUR_M) / HARBOUR_EASE_M).clamp(0.0, 1.0);
    (open, harbour)
}

/// The value at `at` along a line through `points` (their first numbers rising), held at its ends.
#[must_use]
pub fn through(points: &[(f64, f64)], at: f64) -> f64 {
    let (first, last) = (points[0], points[points.len() - 1]);
    if at <= first.0 {
        return first.1;
    }
    for pair in points.windows(2) {
        let ((low, from), (high, to)) = (pair[0], pair[1]);
        if at <= high {
            return from + (to - from) * (at - low) / (high - low);
        }
    }
    last.1
}

/// Smooth value noise in [0, 1] over space and time: the lattice's corners hashed, eased by the quintic step so the
/// field and its slope never jump.
fn noise(x: f64, y: f64, z: f64, salt: u64) -> f64 {
    let (cell_x, cell_y, cell_z) = (x.floor(), y.floor(), z.floor());
    let (ease_x, ease_y, ease_z) = (ease(x - cell_x), ease(y - cell_y), ease(z - cell_z));
    let corner = |dx: i64, dy: i64, dz: i64| lattice(cell_x as i64 + dx, cell_y as i64 + dy, cell_z as i64 + dz, salt);
    let mix = |from: f64, to: f64, share: f64| from + (to - from) * share;
    let face = |dz: i64| {
        let near = mix(corner(0, 0, dz), corner(1, 0, dz), ease_x);
        let far = mix(corner(0, 1, dz), corner(1, 1, dz), ease_x);
        mix(near, far, ease_y)
    };
    mix(face(0), face(1), ease_z)
}

fn ease(fraction: f64) -> f64 {
    fraction * fraction * fraction * (fraction * (fraction * 6.0 - 15.0) + 10.0)
}

/// A lattice corner's value in [0, 1): SplitMix64 over its whole coordinates and the field's salt.
fn lattice(x: i64, y: i64, z: i64, salt: u64) -> f64 {
    let mut hash = salt.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    for part in [x, y, z] {
        hash = (hash ^ part as u64).wrapping_add(0x9E37_79B9_7F4A_7C15);
        hash = (hash ^ (hash >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        hash = (hash ^ (hash >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        hash ^= hash >> 31;
    }
    (hash >> 11) as f64 / (1_u64 << 53) as f64
}

#[cfg(test)]
#[path = "weather_tests.rs"]
mod tests;
