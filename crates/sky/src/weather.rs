//! The weather at a place and moment. A few drifting fields make it: the cloud deck, the damp that turns cloud into
//! rain, the cells that grow into thunderstorms, the mist, and long spells of warm and cold. The place's air shifts
//! each threshold: a desert's cloud seldom rains, a swamp's often does, and only warm air grows storms. The wind
//! blows round the cloudy lows over the steering flow and rises in a storm.

use crate::air::Air;
use crate::drift::{Drift, steering_m_s};
use crate::clock::DAY_S;
use crate::heavens::{heavens_at, latitude_deg, sun_up_at};
use land::biome::LAPSE_C_PER_M;
use land::exact::{clamp, smooth};

/// Each field's own stream: the deck, the damp, the storm cells, the mist and the warm and cold spells.
pub const COVER: Drift = Drift { seed: 0x5C1E_0001, scale_m: 160_000.0, spell_s: 1500.0, octaves: 4, carried: 1.0 };
pub const DAMP: Drift = Drift { seed: 0x5C1E_0002, scale_m: 90_000.0, spell_s: 1200.0, octaves: 3, carried: 1.0 };
pub const CELLS: Drift = Drift { seed: 0x5C1E_0003, scale_m: 28_000.0, spell_s: 540.0, octaves: 3, carried: 0.8 };
pub const MIST: Drift = Drift { seed: 0x5C1E_0004, scale_m: 45_000.0, spell_s: 1800.0, octaves: 3, carried: 0.3 };
pub const SPELLS: Drift = Drift { seed: 0x5C1E_0005, scale_m: 400_000.0, spell_s: 3600.0, octaves: 2, carried: 1.0 };
/// The broad lie of the deck alone, whose slope the wind follows.
pub const PRESSURE: Drift = Drift { octaves: 2, ..COVER };
/// The spread of a field of two to four octaves, measured, so each reads as a standard score.
pub const SPREAD: f64 = 0.195;

/// How far apart, metres, the deck is read to find the lie of its lows, and the wind a whole spread of slope
/// across one of its features makes, m/s.
const SLOPE_STEP_M: f64 = 12_000.0;
const SLOPE_WIND_M_S: f64 = 0.9;
/// The share of the steering flow felt at the ground, and the stillest and wildest wind, m/s.
const GROUND_STEERING: f64 = 0.2;
const LEAST_WIND_M_S: f64 = 0.8;
const MOST_WIND_M_S: f64 = 26.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Weather {
    /// The share of the sky under cloud.
    pub cloud: f64,
    /// How hard rain or snow falls, 0 to 1, and the share of it that is snow.
    pub falling: f64,
    pub snow_share: f64,
    /// How much of it is a thunderstorm, 0 to 1.
    pub storm: f64,
    pub fog: f64,
    /// Sand lifted into the air, 0 to 1.
    pub sand: f64,
    /// The wind, m/s east and south, and how gusty it is, 0 to 1.
    pub wind: [f64; 2],
    pub gust: f64,
    pub temperature_c: f64,
}

/// What every reading of a place's weather shares: its steering flow, how high the sun stands, how high it stood as
/// long ago as the land takes to warm, and how damp its air is.
#[derive(Debug, Clone, Copy)]
struct Setting {
    steering: f64,
    sun_up: f64,
    warming: f64,
    damp: f64,
}

/// The air warms behind the sun: the day's heat, and the storms the land grows from it, peak this long after noon,
/// world seconds (two hours of the day).
const WARMING_LAG_S: f64 = DAY_S / 12.0;

fn setting(air: &Air, y: f64, world_s: f64) -> Setting {
    Setting {
        steering: steering_m_s(latitude_deg(y)),
        sun_up: heavens_at(y, world_s).sun_up(),
        warming: sun_up_at(y, world_s - WARMING_LAG_S),
        damp: clamp((air.rain_mm - 900.0) / 1200.0, -0.55, 0.75),
    }
}

/// A field as a standard score.
fn score(drift: &Drift, x: f64, y: f64, world_s: f64, steering: f64) -> f64 {
    drift.at(x, y, world_s, steering) / SPREAD
}

/// The cloud over a place, from the deck's score.
fn cloud_of(deck: f64, place: Setting) -> f64 {
    smooth(-1.3 - 1.6 * place.damp, 1.0 - 1.6 * place.damp, deck)
}

/// How hard it falls and how much of it is a storm.
fn fall_and_storm(air: &Air, x: f64, y: f64, world_s: f64, deck: f64, place: Setting) -> (f64, f64) {
    let damp = score(&DAMP, x, y, world_s, place.steering);
    // Dry air dries twice over: what little cloud a desert has seldom rains.
    let falling = smooth(0.85, 2.3, deck + 0.6 * damp + 1.4 * place.damp + 0.8 * place.damp.min(0.0));
    let warm = smooth(8.0, 20.0, air.warmth_c);
    // Land heats behind the sun and grows its storms in the afternoon; the sea's are as likely by night.
    let heating = if air.at_sea { 0.5 } else { smooth(0.2, 0.75, place.warming) };
    let cells = score(&CELLS, x, y, world_s, place.steering);
    let storm = smooth(0.9, 2.0, cells + 0.9 * heating * warm + 0.4 * place.damp) * smooth(0.15, 0.5, falling) * warm;
    (falling.max(0.85 * storm), storm)
}

/// The air's temperature, Celsius, at a point (x, y, altitude above the sea) at `world_s`: its place's warmth, cooler
/// with height, swinging through the day behind the sun, in warm and cold spells, and cooled by what falls.
fn temperature_of(air: &Air, place: Setting, (x, y, altitude_m): (f64, f64, f64), world_s: f64, falling: f64) -> f64 {
    let swing = if air.at_sea {
        1.5
    } else if air.sand > 0.5 {
        7.0
    } else {
        4.5
    };
    let spell = 2.5 * score(&SPELLS, x, y, world_s, place.steering);
    air.warmth_c - LAPSE_C_PER_M * altitude_m.max(0.0) + swing * (2.0 * smooth(-0.3, 0.8, place.warming) - 1.0) + spell
        - 1.5 * falling
}

/// The share of what falls that is snow, by the air's temperature.
fn snow_share_of(temperature_c: f64) -> f64 {
    smooth(3.0, 0.5, temperature_c)
}

/// The weather over a point (x, y) of the map at `altitude_m` above the sea, at `world_s`, in its place's air.
#[must_use]
pub fn weather_at(air: &Air, x: f64, y: f64, altitude_m: f64, world_s: f64) -> Weather {
    let place = setting(air, y, world_s);
    let deck = score(&COVER, x, y, world_s, place.steering);
    let cloud = cloud_of(deck, place);
    let (falling, storm) = fall_and_storm(air, x, y, world_s, deck, place);
    let wind = wind_of(x, y, world_s, place.steering, storm);
    let speed = (wind[0] * wind[0] + wind[1] * wind[1]).sqrt();
    let temperature_c = temperature_of(air, place, (x, y, altitude_m), world_s, falling);
    let mist = score(&MIST, x, y, world_s, place.steering);
    let humid = smooth(400.0, 1400.0, air.rain_mm);
    let low_sun = 1.0 - smooth(0.0, 0.4, place.sun_up);
    let fog = smooth(1.9, 3.0, mist + 1.2 * humid + 0.8 * low_sun + 0.3 * cloud - 1.2 * air.sand)
        * (1.0 - smooth(4.0, 9.0, speed))
        * (1.0 - 0.5 * falling);
    let sand = air.sand * smooth(7.0, 13.0, speed) * (1.0 - smooth(0.0, 0.3, falling));
    Weather {
        cloud: cloud.max(storm),
        falling,
        snow_share: snow_share_of(temperature_c),
        storm,
        fog,
        sand,
        wind,
        gust: clamp(0.15 + 0.6 * storm + 0.25 * smooth(6.0, 14.0, speed) + 0.3 * sand, 0.0, 1.0),
        temperature_c,
    }
}

/// How hard a thunderstorm is over a point, alone: what lightning asks of the weather, at less cost.
#[must_use]
pub fn storm_at(air: &Air, x: f64, y: f64, world_s: f64) -> f64 {
    let place = setting(air, y, world_s);
    let deck = score(&COVER, x, y, world_s, place.steering);
    fall_and_storm(air, x, y, world_s, deck, place).1
}

/// The wind: round the deck's lows, which turn the way the north's do, over the share of the steering flow felt at
/// the ground, rising in a storm.
fn wind_of(x: f64, y: f64, world_s: f64, steering: f64, storm: f64) -> [f64; 2] {
    let slope = |dx: f64, dy: f64| score(&PRESSURE, x + dx, y + dy, world_s, steering);
    let per = PRESSURE.scale_m / (2.0 * SLOPE_STEP_M);
    let east_slope = (slope(SLOPE_STEP_M, 0.0) - slope(-SLOPE_STEP_M, 0.0)) * per;
    let south_slope = (slope(0.0, SLOPE_STEP_M) - slope(0.0, -SLOPE_STEP_M)) * per;
    // Cloud stands for low pressure: the wind keeps the low on its left in the north, across the slope.
    let rise = 1.0 + 0.9 * storm;
    let east = (GROUND_STEERING * steering - SLOPE_WIND_M_S * south_slope) * rise;
    let south = SLOPE_WIND_M_S * east_slope * rise;
    let speed = (east * east + south * south).sqrt();
    if speed < LEAST_WIND_M_S {
        return if speed > 0.0 {
            [east * LEAST_WIND_M_S / speed, south * LEAST_WIND_M_S / speed]
        } else {
            [LEAST_WIND_M_S, 0.0]
        };
    }
    let held = speed.min(MOST_WIND_M_S) / speed;
    [east * held, south * held]
}

/// What lies on the ground at a point: how wet it is and how much fresh snow, each 0 to 1.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ground {
    pub wet: f64,
    pub snow: f64,
}

/// What lies on the ground at a point (x, y, altitude above the sea): the rain and the snow of the last twenty
/// minutes, the latest counting most, so a shower leaves the ground dark, and a fall of snow leaves it white, a while
/// after it passes, the same for everyone.
#[must_use]
pub fn ground_at(air: &Air, (x, y, altitude_m): (f64, f64, f64), world_s: f64) -> Ground {
    let steps = 10;
    let mut ground = Ground { wet: 0.0, snow: 0.0 };
    for step in 0..=steps {
        let then = world_s - f64::from(step) * 120.0;
        let kept = 1.0 - f64::from(step) / f64::from(steps + 1);
        let place = setting(air, y, then);
        let deck = score(&COVER, x, y, then, place.steering);
        let (falling, _) = fall_and_storm(air, x, y, then, deck, place);
        let snow = falling * snow_share_of(temperature_of(air, place, (x, y, altitude_m), then, falling));
        ground.wet = ground.wet.max(smooth(0.0, 0.4, falling - snow) * kept);
        ground.snow = ground.snow.max(smooth(0.0, 0.4, snow) * kept);
    }
    ground
}
