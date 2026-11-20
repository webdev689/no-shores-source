//! Where a ship meets the water: the bed under a point and the water's surface over it at a moment.

use crate::helm::WIND_RATED;
use land::ground::{Ground, WaterAt};
use land::sea::Swell;
use sky::air::Air;
use sky::weather::weather_at;

/// The bed's height at a point and the water's surface over it, metres; no surface where the point is dry.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Spot {
    pub bed: f64,
    pub surface: Option<f64>,
}

/// Water a ship can sail on: the land's, or a test's.
pub trait Waters {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot;
}

/// A landmass's waters: the sea with the swell on it, and its lakes and rivers at their levels.
#[derive(Debug, Clone, Copy)]
pub struct LandWaters<'land> {
    pub ground: &'land Ground,
    pub swell: &'land Swell,
}

impl Waters for LandWaters<'_> {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot {
        let bed = self.ground.height_at(x, y);
        let surface = match self.ground.water_at(x, y) {
            WaterAt::Sea => Some(self.swell.height_at(x, y, time, -bed)),
            WaterAt::Lake { surface } | WaterAt::River { surface } => Some(surface),
            WaterAt::Dry => None,
        };
        Spot { bed, surface }
    }
}

/// How deep the open sea is, metres: well past where the swell feels the bottom, so it rolls whole everywhere.
pub const OPEN_SEA_DEPTH_M: f64 = 1000.0;

/// The open sea: deep water everywhere under the swell, and no land. Wherever a landmass's sea is deeper than the
/// swell feels, its water is this water to the bit.
#[derive(Debug, Clone, Copy)]
pub struct OpenSea<'sea> {
    pub swell: &'sea Swell,
}

impl Waters for OpenSea<'_> {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot {
        Spot { bed: -OPEN_SEA_DEPTH_M, surface: Some(self.swell.height_at(x, y, time, OPEN_SEA_DEPTH_M)) }
    }
}

/// The wind along the swell at a ship's rated strength (m/s, east and south): a still world's, which the rules' tests
/// sail in where no weather is asked.
#[must_use]
pub fn steady_wind(swell: &Swell) -> [f64; 2] {
    [WIND_RATED * libm::sin(swell.bearing), -WIND_RATED * libm::cos(swell.bearing)]
}

/// The weather's usual wind, m/s: the breeze a ship is rated for.
pub const USUAL_WIND_M_S: f64 = 6.5;

/// The weather's wind (m/s, east and south) as a ship's sails feel it: scaled so its usual breeze is her rated wind.
/// The helm holds it within her shares, so a gale drives her at most twice as hard and a near calm still gives way.
#[must_use]
pub fn sail_wind(weather_wind: [f64; 2]) -> [f64; 2] {
    weather_wind.map(|part| part * WIND_RATED / USUAL_WIND_M_S)
}

/// The sails' wind at a point of the map at `world_s`, in the open sea's air. It holds for a minute of world time,
/// read at the minute's start, so a browser predicting a ship anywhere in the minute reads the room's wind exactly.
#[must_use]
pub fn sea_wind_at(at: [f64; 2], world_s: f64) -> [f64; 2] {
    let minute = (world_s / 60.0).floor() * 60.0;
    sail_wind(weather_at(&Air::of_sea(at[1]), at[0], at[1], 0.0, minute).wind)
}
