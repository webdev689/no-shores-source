//! The sky and the weather for the browser, as little-endian 64-bit numbers: the heavens and the weather over a place
//! at a moment, and the lightning near it. A climate is its place among `Air::keys()`, the sea last.

use sky::air::Air;
use sky::drift::steering_m_s;
use sky::heavens::heavens_at;
use sky::lightning::strikes_near;
use sky::weather::{ground_at, weather_at};

/// A sky request: x, y, height above the sea, world time, and the climate's number.
pub const SKY_REQUEST_FLOATS: usize = 5;
/// An answer: latitude; the sun; the moon, its phase and lit share; the stars' turn; the daylight; the cloud, the fall
/// and its snow, the storm, the fog and the sand; the wind east and south, its gusts; the temperature; the wetness;
/// the steering flow that carries the weather, m/s east.
pub const SKY_ANSWER_FLOATS: usize = 24;
/// A strikes request: x, y, the reach, from and to (world time) and the climate's number; and each strike's
/// numbers: x, y, its moment, whether it reaches the ground, its power.
pub const STRIKES_REQUEST_FLOATS: usize = 6;
pub const STRIKE_FLOATS: usize = 5;
/// The farthest a browser may ask for lightning, metres, and the longest window, seconds: a storm on the horizon's
/// worth, a few frames' at a time.
const MOST_REACH_M: f64 = 80_000.0;
const MOST_WINDOW_S: f64 = 60.0;

fn air_of(number: f64, y: f64) -> Option<Air> {
    let keys = Air::keys();
    let index = (number >= 0.0 && number == number.trunc()).then_some(number as usize)?;
    keys.get(index).map(|key| Air::of_climate(key, y))
}

/// The sky and weather a request asks of, or nothing for numbers that are not one.
#[must_use]
pub fn sky_numbers(request: &[f64]) -> Vec<f64> {
    let &[x, y, altitude, world, climate] = request else { return Vec::new() };
    let Some(air) = request.iter().all(|number| number.is_finite()).then(|| air_of(climate, y)).flatten() else {
        return Vec::new();
    };
    let heavens = heavens_at(y, world);
    let weather = weather_at(&air, x, y, altitude, world);
    let mut out = Vec::with_capacity(SKY_ANSWER_FLOATS);
    out.push(heavens.latitude_deg);
    out.extend(heavens.sun);
    out.extend(heavens.moon);
    out.extend([heavens.moon_phase, heavens.moon_lit, heavens.star_turn, heavens.daylight()]);
    out.extend([weather.cloud, weather.falling, weather.snow_share, weather.storm, weather.fog, weather.sand]);
    out.extend(weather.wind);
    let ground = ground_at(&air, (x, y, altitude), world);
    out.extend([weather.gust, weather.temperature_c, ground.wet]);
    out.push(steering_m_s(heavens.latitude_deg));
    out.push(ground.snow);
    out
}

/// The wind a ship's sails feel at a point of the sea at a world time (m/s, east and south), the rules' own, or
/// nothing for numbers that are not one.
#[must_use]
pub fn sea_wind_numbers(request: &[f64]) -> Vec<f64> {
    let &[x, y, world] = request else { return Vec::new() };
    if !request.iter().all(|number| number.is_finite()) {
        return Vec::new();
    }
    sailing::waters::sea_wind_at([x, y], world).to_vec()
}

/// The lightning a request asks of, earliest first, or nothing for numbers that are not one.
#[must_use]
pub fn strikes_numbers(request: &[f64]) -> Vec<f64> {
    let &[x, y, reach, from, to, climate] = request else { return Vec::new() };
    let fits = (0.0..=MOST_REACH_M).contains(&reach) && to >= from && to - from <= MOST_WINDOW_S;
    let Some(air) = (request.iter().all(|number| number.is_finite()) && fits).then(|| air_of(climate, y)).flatten()
    else {
        return Vec::new();
    };
    strikes_near(&air, x, y, reach, from, to)
        .into_iter()
        .flat_map(|strike| [strike.x, strike.y, strike.at_s, f64::from(u8::from(strike.to_ground)), strike.power])
        .collect()
}

/// The climates' keys in their numbers' order, as JSON.
#[must_use]
pub fn climates_json() -> String {
    serde_json::json!({ "climates": Air::keys() }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_door_answers_the_sky_and_refuses_numbers_that_are_not_a_request() {
        let sea = (Air::keys().len() - 1) as f64;
        let answer = sky_numbers(&[1_000_000.0, 1_500_000.0, 0.0, 1800.0, sea]);
        assert_eq!(answer.len(), SKY_ANSWER_FLOATS);
        assert!(answer[3] > 0.8, "noon's sun is high: {answer:?}");
        assert!(sky_numbers(&[1.0, 2.0, 3.0, 4.0, 99.0]).is_empty(), "no such climate");
        assert!(sky_numbers(&[f64::NAN, 2.0, 3.0, 4.0, 0.0]).is_empty());
        assert!(strikes_numbers(&[0.0, 0.0, 1e6, 0.0, 1.0, 0.0]).is_empty(), "too far a reach");
        assert!(strikes_numbers(&[0.0, 0.0, 1000.0, 0.0, 600.0, 0.0]).is_empty(), "too long a window");
        assert!(climates_json().contains("\"tundra\"") && climates_json().ends_with("\"sea\"]}"));
    }

    #[test]
    fn the_sails_wind_is_the_rules_own_and_its_way_is_the_weathers() {
        let (x, y, world) = (1_000_000.0, 1_500_000.0, 1830.0);
        let wind = sea_wind_numbers(&[x, y, world]);
        assert_eq!(wind, sailing::waters::sea_wind_at([x, y], world).to_vec());
        let sea = (Air::keys().len() - 1) as f64;
        let weather = sky_numbers(&[x, y, 0.0, 1800.0, sea]);
        let (blows, sails) = ((weather[17], weather[18]), (wind[0], wind[1]));
        assert!((blows.0 * sails.1 - blows.1 * sails.0).abs() < 1e-9 && blows.0 * sails.0 + blows.1 * sails.1 > 0.0);
        assert!(sea_wind_numbers(&[f64::NAN, 0.0, 0.0]).is_empty() && sea_wind_numbers(&[0.0, 0.0]).is_empty());
    }
}
