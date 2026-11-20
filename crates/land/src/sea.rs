//! The sea's swell: the long waves rolling over the open sea, the same on the server and in a browser, so a ship or a
//! swimmer rides the same wave everywhere. A sum of Gerstner waves about the weather's wind, from a fixed seed and
//! world time, as high and as long as the weather and the open water make it (`world::weather`). The swell feels the
//! bottom and fades as the sea shallows toward a coast, where the browser draws the breakers.

use crate::exact::{fingerprint, rand01, seed_of, sin_cos, smooth};
use crate::ground::{Ground, WaterAt};
use std::f64::consts::TAU;
use world::geometry::Point;
use world::waters::Waters;
use world::weather::{Air, HARBOUR_SHARE, air_at, shelter, through};

/// Metres a second squared.
pub const GRAVITY: f64 = 9.81;
/// How many waves the swell sums, and the longest and shortest of them, metres.
pub const WAVES: usize = 10;
pub const LONGEST_M: f64 = 140.0;
pub const SHORTEST_M: f64 = 5.0;
/// Each wave's steepness, its wavenumber times its height: a moderate sea, two to three metres from trough to crest.
pub const STEEPNESS: f64 = 0.03;
/// How sharp the crests are, over the whole sum: under 1, so no crest folds over itself.
pub const SHARPNESS: f64 = 0.8;
/// The swell is whole where the sea is FULL_DEPTH_M deep and gone where it is GONE_DEPTH_M.
pub const FULL_DEPTH_M: f64 = 15.0;
pub const GONE_DEPTH_M: f64 = 1.0;
/// The swell's seed: one sea for the whole world, its height and length the weather's.
pub const SEED: u32 = 0x5EA5_EA5E;
/// The swell's height as a share of a moderate sea's at the middle of each band of sea state: calm, moderate, rough
/// and storm; between them it is blended, never stepped.
pub const HEIGHT_BY_STATE: [(f64, f64); 4] = [(0.1, 0.35), (0.35, 1.0), (0.65, 1.8), (0.9, 3.0)];
/// The swell's lengths as a share of a moderate sea's, from the lowest sea to the highest.
pub const LENGTH_SHARE: [f64; 2] = [0.8, 1.4];
/// The bearings the sets of waves run toward, evenly round the compass: the wind between two blends their sets.
pub const BEARINGS: usize = 8;
/// The most waves a swell under the weather sums: two bearings' sets at two lengths.
pub const MOST_WAVES: usize = 4 * WAVES;

/// One wave: the way it travels (a unit vector east and south), its wavenumber (radians a metre), its frequency
/// (radians a second), its height and how far it carries water sideways (metres), and its phase.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Wave {
    pub direction: [f64; 2],
    pub number: f64,
    pub frequency: f64,
    pub amplitude: f64,
    pub shift: f64,
    pub phase: f64,
}

/// The swell: its waves, longest first in each set, the bearing they run toward (radians clockwise from north: a
/// seed's own, or the nearest set's to the weather's wind), and the wind it runs with, metres a second east and south
/// (none for a seed's own swell).
#[derive(Debug, Clone, PartialEq)]
pub struct Swell {
    pub bearing: f64,
    pub wind: [f64; 2],
    pub waves: Vec<Wave>,
}

/// The share of the swell left in water `depth` metres deep.
#[must_use]
pub fn reach(depth: f64) -> f64 {
    smooth(GONE_DEPTH_M, FULL_DEPTH_M, depth)
}

impl Default for Swell {
    fn default() -> Self {
        Self::new(SEED)
    }
}

impl Swell {
    /// The swell a seed makes: one set of waves about a bearing drawn from the seed, a moderate sea's.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let seed = seed_of(seed, "swell");
        let bearing = TAU * rand01(seed, &[0]);
        Self { bearing, wind: [0.0; 2], waves: set(seed, 0, bearing, 1.0).to_vec() }
    }

    /// The swell where the sea stands as `here` says: the sets about the two bearings nearest the wind's and the two
    /// lengths round its own, each weighted by how near, the whole as high as `here` makes it. A set's waves keep their
    /// phases wherever and whenever they are summed, so the sea never jumps as the weather moves; only their weights do,
    /// and those change over kilometres and hours. The weights' squares sum to 1, so a blend of two sets is as high as
    /// one; the sideways carry takes the squares, so the crests never fold.
    #[must_use]
    pub fn under(seed: u32, here: &SeaHere) -> Self {
        let seed = seed_of(seed, "swell");
        let strength = (here.wind[0] * here.wind[0] + here.wind[1] * here.wind[1]).sqrt();
        let toward = if strength > 0.0 { [here.wind[0] / strength, here.wind[1] / strength] } else { [1.0, 0.0] };
        let spacing_cosine = sin_cos(TAU / BEARINGS as f64).1;
        // A bearing a hair's weight from none is none: the wind on a set's bearing blends that set alone.
        let mut bearings: Vec<(usize, f64)> = (0..BEARINGS)
            .map(|index| {
                let (east, north) = sin_cos(TAU * index as f64 / BEARINGS as f64);
                (index, ((toward[0] * east - toward[1] * north - spacing_cosine) / (1.0 - spacing_cosine)).max(0.0))
            })
            .filter(|&(_, weight)| weight > 1e-9)
            .collect();
        let total: f64 = bearings.iter().map(|&(_, weight)| weight * weight).sum::<f64>().sqrt();
        bearings.iter_mut().for_each(|(_, weight)| *weight /= total);
        let long = (here.length() - LENGTH_SHARE[0]) / (LENGTH_SHARE[1] - LENGTH_SHARE[0]);
        let lengths_total = ((1.0 - long) * (1.0 - long) + long * long).sqrt();
        let (height, carry) = (here.height(), here.height().min(1.0));
        let mut waves = Vec::with_capacity(MOST_WAVES);
        let mut strongest = (0.0, 0.0);
        for &(index, bearing_weight) in &bearings {
            for (length_index, length_weight) in [(0_usize, 1.0 - long), (1, long)] {
                let weight = bearing_weight * length_weight / lengths_total;
                if weight <= 0.0 {
                    continue;
                }
                let bearing = TAU * index as f64 / BEARINGS as f64;
                if weight > strongest.0 {
                    strongest = (weight, bearing);
                }
                let salt = (index * 2 + length_index + 1) as i64;
                waves.extend(set(seed, salt, bearing, LENGTH_SHARE[length_index]).map(|wave| Wave {
                    amplitude: wave.amplitude * weight * height,
                    shift: wave.shift * weight * weight * carry,
                    ..wave
                }));
            }
        }
        Self { bearing: strongest.1, wind: here.wind, waves }
    }

    /// Where the water at rest at (x, y) is carried at `time`, seconds of world time, in the sea `depth` metres deep:
    /// its shift east and south and its height, metres.
    #[must_use]
    pub fn displacement(&self, x: f64, y: f64, time: f64, depth: f64) -> [f64; 3] {
        self.lagged_displacement(x, y, time, depth, 0.0)
    }

    /// As `displacement`, the height as a hull of time constant `lag` seconds feels it: each wave answered as a first
    /// order lag answers a sine, its height shrunk by 1 / √(1 + (frequency x lag)^2) and its crest come late, from
    /// + - * / alone. A lag of 0 is the water itself, to the bit.
    fn lagged_displacement(&self, x: f64, y: f64, time: f64, depth: f64, lag: f64) -> [f64; 3] {
        let share = reach(depth);
        let mut out = [0.0; 3];
        if share <= 0.0 {
            return out;
        }
        for wave in &self.waves {
            let along = wave.direction[0] * x + wave.direction[1] * y;
            let (sine, cosine) = sin_cos(wave.number * along - wave.frequency * time + wave.phase);
            out[0] += wave.shift * wave.direction[0] * cosine;
            out[1] += wave.shift * wave.direction[1] * cosine;
            if lag > 0.0 {
                let slowness = wave.frequency * lag;
                out[2] += wave.amplitude * (sine + slowness * cosine) / (1.0 + slowness * slowness);
            } else {
                out[2] += wave.amplitude * sine;
            }
        }
        out.map(|value| value * share)
    }

    /// The sea's surface above the point (x, y), metres from still water. A wave carries water sideways, so this
    /// finds the water at rest whose carried place is (x, y): four steps converge, the waves never folding.
    #[must_use]
    pub fn height_at(&self, x: f64, y: f64, time: f64, depth: f64) -> f64 {
        self.lagged_height_at(x, y, time, depth, 0.0)
    }

    /// The sea's surface above (x, y) as a hull of time constant `lag` seconds rides it (`lagged_displacement`).
    #[must_use]
    pub fn lagged_height_at(&self, x: f64, y: f64, time: f64, depth: f64, lag: f64) -> f64 {
        let (mut rest_x, mut rest_y) = (x, y);
        for _ in 0..4 {
            let [east, south, _] = self.displacement(rest_x, rest_y, time, depth);
            (rest_x, rest_y) = (x - east, y - south);
        }
        self.lagged_displacement(rest_x, rest_y, time, depth, lag)[2]
    }
}

/// One set of waves about `bearing`, `length_share` times the swell's lengths, its draws salted by `salt` (0 the
/// seed's own swell). Lengths step down evenly in ratio, each nudged; the shorter a wave, the further its course strays
/// from the wind's.
fn set(seed: u32, salt: i64, bearing: f64, length_share: f64) -> [Wave; WAVES] {
    std::array::from_fn(|index| {
        let draw = |part: i64| rand01(seed, &[salt * 16 + index as i64 + 1, part]);
        let place = index as f64 / (WAVES - 1) as f64;
        let ratio = SHORTEST_M / LONGEST_M;
        // LONGEST * ratio^place, from + - * / alone: the ratio's square roots, halving the step each time.
        let length = LONGEST_M * power(ratio, place) * (0.9 + 0.2 * draw(1)) * length_share;
        let number = TAU / length;
        let stray = (0.35 + 0.85 * place) * (draw(2) - 0.5) * 2.0;
        let (east, north) = sin_cos(bearing + stray);
        let amplitude = STEEPNESS * (0.8 + 0.4 * draw(3)) / number / length_share;
        Wave {
            direction: [east, -north],
            number,
            frequency: (GRAVITY * number).sqrt(),
            amplitude,
            shift: (SHARPNESS / (number * WAVES as f64)).min(2.0 * amplitude),
            phase: TAU * draw(4),
        }
    })
}

/// How the sea stands at a point: the weather's wind there (metres a second, east and south) and its sea state (0
/// calm to 1 storm), the share of the open sea's swell its fetch leaves (`world::weather::shelter`), and how much of a
/// roadstead's calm holds there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SeaHere {
    pub wind: [f64; 2],
    pub state: f64,
    pub open: f64,
    pub harbour: f64,
}

impl SeaHere {
    /// The open sea under the weather `air`: no land near, no port.
    #[must_use]
    pub fn open_sea(air: &Air) -> Self {
        Self { wind: air.wind, state: air.state, open: 1.0, harbour: 0.0 }
    }

    /// The weather and the shelter at world point (x, y) at `time_s` seconds since the Unix epoch, amid `waters` and
    /// `roadsteads`.
    #[must_use]
    pub fn at(waters: &Waters, roadsteads: &[Point], x: f64, y: f64, time_s: f64) -> Self {
        let air = air_at(x, y, time_s);
        let (open, harbour) = shelter(waters, roadsteads, [x, y], air.wind);
        Self { open, harbour, ..Self::open_sea(&air) }
    }

    /// The swell's height here as a share of a moderate sea's: by its sea state (`HEIGHT_BY_STATE`), times the share
    /// its fetch leaves, eased to a roadstead's calm.
    #[must_use]
    pub fn height(&self) -> f64 {
        let open = through(&HEIGHT_BY_STATE, self.state) * self.open;
        open + (HARBOUR_SHARE - open) * self.harbour
    }

    /// The swell's lengths here as a share of a moderate sea's: longer the higher its sea state raises it.
    #[must_use]
    pub fn length(&self) -> f64 {
        let (lowest, highest) = (HEIGHT_BY_STATE[0].1, HEIGHT_BY_STATE[HEIGHT_BY_STATE.len() - 1].1);
        let rise = (through(&HEIGHT_BY_STATE, self.state) - lowest) / (highest - lowest);
        LENGTH_SHARE[0] + (LENGTH_SHARE[1] - LENGTH_SHARE[0]) * rise
    }
}

/// The sea's surface over a landmass's ground at (x, y), metres from still water, at `time`: the swell over the
/// seabed there. None where the point is not sea.
#[must_use]
pub fn sea_surface(ground: &Ground, swell: &Swell, x: f64, y: f64, time: f64) -> Option<f64> {
    matches!(ground.water_at(x, y), WaterAt::Sea).then(|| swell.height_at(x, y, time, -ground.height_at(x, y)))
}

/// A fingerprint of the sea's surface at some points at `time` (a point not at sea counts as still water), so the
/// server and a browser can be held to the same bits.
#[must_use]
pub fn sea_hash(ground: &Ground, swell: &Swell, points: &[(f64, f64)], time: f64) -> u64 {
    fingerprint(points.iter().map(|&(x, y)| sea_surface(ground, swell, x, y, time).unwrap_or(0.0)))
}

/// How deep the open sea is under the weather's fingerprint, metres: past where the swell feels the bottom.
pub const DEEP_M: f64 = 1_000.0;

/// A fingerprint of the deep sea's surface under the weather at world points at `time_s` seconds since the Unix
/// epoch, amid `waters` and `roadsteads`: each point's own weather and shelter, its own swell, its height. The server
/// and a browser are held to the same bits.
#[must_use]
pub fn weather_sea_hash(waters: &Waters, roadsteads: &[Point], points: &[(f64, f64)], time_s: f64) -> u64 {
    fingerprint(points.iter().map(|&(x, y)| {
        Swell::under(SEED, &SeaHere::at(waters, roadsteads, x, y, time_s)).height_at(x, y, time_s, DEEP_M)
    }))
}

/// `base` to the power `exponent` for an exponent in [0, 1], from square roots: each binary digit of the exponent
/// takes the next square root.
fn power(base: f64, exponent: f64) -> f64 {
    let (mut out, mut root, mut rest) = (1.0, base, exponent);
    for _ in 0..40 {
        root = root.sqrt();
        rest *= 2.0;
        if rest >= 1.0 {
            out *= root;
            rest -= 1.0;
        }
    }
    out
}

#[cfg(test)]
#[path = "sea_tests.rs"]
mod tests;
