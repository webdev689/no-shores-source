//! The sea's swell: the long waves rolling over the open sea, the same on the server and in a browser, so a ship or a
//! swimmer rides the same wave everywhere. A sum of Gerstner waves about the prevailing wind, from a fixed seed and
//! world time. The swell feels the bottom and fades as the sea shallows toward a coast, where the browser draws the
//! breakers.

use crate::exact::{rand01, seed_of, sin_cos, smooth};
use crate::ground::{Ground, WaterAt};
use std::f64::consts::TAU;

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
/// The swell's seed: one sea for the whole world, until the weather drives it.
pub const SEED: u32 = 0x5EA5_EA5E;

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

/// The swell: its waves, longest first, and the bearing they come from.
#[derive(Debug, Clone, PartialEq)]
pub struct Swell {
    pub bearing: f64,
    pub waves: [Wave; WAVES],
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
    /// The swell a seed makes. Lengths step down evenly in ratio, each nudged; the shorter a wave, the further its
    /// course strays from the wind's.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        let seed = seed_of(seed, "swell");
        let bearing = TAU * rand01(seed, &[0]);
        let waves = std::array::from_fn(|index| {
            let draw = |salt: i64| rand01(seed, &[index as i64 + 1, salt]);
            let place = index as f64 / (WAVES - 1) as f64;
            let ratio = SHORTEST_M / LONGEST_M;
            // LONGEST * ratio^place, from + - * / alone: the ratio's square roots, halving the step each time.
            let length = LONGEST_M * power(ratio, place) * (0.9 + 0.2 * draw(1));
            let number = TAU / length;
            let stray = (0.35 + 0.85 * place) * (draw(2) - 0.5) * 2.0;
            let (east, north) = sin_cos(bearing + stray);
            let amplitude = STEEPNESS * (0.8 + 0.4 * draw(3)) / number;
            Wave {
                direction: [east, -north],
                number,
                frequency: (GRAVITY * number).sqrt(),
                amplitude,
                shift: (SHARPNESS / (number * WAVES as f64)).min(2.0 * amplitude),
                phase: TAU * draw(4),
            }
        });
        Self { bearing, waves }
    }

    /// Where the water at rest at (x, y) is carried at `time`, seconds of world time, in the sea `depth` metres deep:
    /// its shift east and south and its height, metres.
    #[must_use]
    pub fn displacement(&self, x: f64, y: f64, time: f64, depth: f64) -> [f64; 3] {
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
            out[2] += wave.amplitude * sine;
        }
        out.map(|value| value * share)
    }

    /// The sea's surface above the point (x, y), metres from still water. A wave carries water sideways, so this
    /// finds the water at rest whose carried place is (x, y): four steps converge, the waves never folding.
    #[must_use]
    pub fn height_at(&self, x: f64, y: f64, time: f64, depth: f64) -> f64 {
        let (mut rest_x, mut rest_y) = (x, y);
        for _ in 0..4 {
            let [east, south, _] = self.displacement(rest_x, rest_y, time, depth);
            (rest_x, rest_y) = (x - east, y - south);
        }
        self.displacement(rest_x, rest_y, time, depth)[2]
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
    points.iter().fold(0xcbf2_9ce4_8422_2325, |hash: u64, &(x, y)| {
        let bits = sea_surface(ground, swell, x, y, time).unwrap_or(0.0).to_bits().to_le_bytes();
        bits.iter().fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
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
mod tests {
    use super::*;

    #[test]
    fn the_swell_runs_from_the_longest_wave_to_the_shortest_about_one_wind() {
        let swell = Swell::default();
        assert_eq!(swell, Swell::new(SEED));
        let lengths: Vec<f64> = swell.waves.iter().map(|wave| TAU / wave.number).collect();
        assert!(lengths[0] > 120.0 && lengths[WAVES - 1] < 6.0, "{lengths:?}");
        assert!(lengths.windows(2).all(|pair| pair[0] > pair[1]), "{lengths:?}");
        let sharpness: f64 = swell.waves.iter().map(|wave| wave.number * wave.shift).sum();
        assert!(sharpness <= SHARPNESS + 1e-12, "{sharpness}");
        let (east, north) = sin_cos(swell.bearing);
        let along = swell.waves[0].direction[0] * east - swell.waves[0].direction[1] * north;
        assert!(along > 0.9, "the longest wave runs nearly with the wind: {along}");
        assert_ne!(Swell::new(1), Swell::new(2));
    }

    #[test]
    fn deep_water_rolls_about_still_water_two_metres_or_so_from_trough_to_crest() {
        let swell = Swell::default();
        let heights: Vec<f64> =
            (0..4000).map(|step| swell.height_at(1_000.0 + 3.7 * f64::from(step), 2_000.0, 0.0, 200.0)).collect();
        let mean = heights.iter().sum::<f64>() / heights.len() as f64;
        let (low, high) = heights.iter().fold((f64::MAX, f64::MIN), |(low, high), &h| (low.min(h), high.max(h)));
        assert!(mean.abs() < 0.15, "{mean}");
        assert!(high - low > 1.5 && high - low < 5.0, "{low} {high}");
    }

    #[test]
    fn the_swell_fades_as_the_sea_shallows_and_is_gone_at_the_shore() {
        let swell = Swell::default();
        let spread = |depth: f64| {
            (0..400).map(|step| swell.height_at(37.0 * f64::from(step), 11.0, 5.0, depth).abs()).fold(0.0, f64::max)
        };
        assert!(spread(0.5).abs() < f64::EPSILON);
        assert!(spread(5.0) < spread(10.0) && spread(10.0) < spread(40.0));
        assert!((spread(40.0) - spread(400.0)).abs() < 1e-12, "deep water is all one");
    }

    #[test]
    fn a_crest_travels_with_its_wave_at_its_speed() {
        let swell = Swell::default();
        let wave = swell.waves[0];
        let speed = wave.frequency / wave.number;
        assert!((speed - (GRAVITY / wave.number).sqrt()).abs() < 1e-9);
        let lone = Swell { waves: [Wave { amplitude: 0.0, shift: 0.0, ..wave }; WAVES], ..swell };
        let mut alone = lone.clone();
        alone.waves[0] = wave;
        let [x, y] = [100.0, 200.0];
        let later =
            alone.height_at(x + wave.direction[0] * speed * 3.0, y + wave.direction[1] * speed * 3.0, 3.0, 99.0);
        assert!((later - alone.height_at(x, y, 0.0, 99.0)).abs() < 1e-9);
    }

    #[test]
    fn the_height_at_a_point_is_where_the_carried_water_stands() {
        let swell = Swell::default();
        let [east, south, height] = swell.displacement(500.0, 700.0, 12.0, 80.0);
        let found = swell.height_at(500.0 + east, 700.0 + south, 12.0, 80.0);
        assert!((found - height).abs() < 1e-3, "{found} {height}");
    }

    #[test]
    fn power_from_square_roots_matches_the_ratio_steps() {
        assert!((power(0.25, 0.5) - 0.5).abs() < 1e-12);
        assert!((power(2.0, 0.0) - 1.0).abs() < 1e-12 && (power(9.0, 1.0) - 9.0).abs() < 1e-9);
    }
}
