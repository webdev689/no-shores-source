//! The weather a fight at sea is fought in: the swell and the wind where it began, at the world time it began, kept
//! while it lasts. A room counts its own ticks; the world time it opened at, handed in by its host, sets them in the
//! world's weather (`world::weather`).

use crate::sea::{Coast, on_land};
use land::sea::{FULL_DEPTH_M, SEED, SeaHere, Swell};
use sailing::waters::{Spot, Waters, weather_wind};
use world::geometry::Point;
use world::layout::Layout;

/// A room's place in the weather: the world's waters, for the shelter of its coasts, and the world time its clock
/// started at, seconds since the Unix epoch (0 until its host says).
#[derive(Debug)]
pub struct SeaWeather {
    waters: world::waters::Waters,
    pub world_start_s: f64,
}

impl SeaWeather {
    #[must_use]
    pub fn new(layout: &Layout) -> Self {
        Self { waters: world::waters::Waters::new(layout), world_start_s: 0.0 }
    }

    /// The swell and the sailing wind at world point `at` at `time`, the room's seconds: the weather there then, the
    /// swell sheltered by the coasts upwind.
    #[must_use]
    pub fn at(&self, at: [f64; 2], time: f64) -> (Swell, [f64; 2]) {
        let here = SeaHere::at(&self.waters, &[], at[0], at[1], self.world_start_s + time);
        (Swell::under(SEED, &here), weather_wind(here.wind))
    }
}

/// The swell and the sailing wind of the open sea under the weather at world point `at`, at `world_time_s`: a fleet
/// room's, which has no coast.
#[must_use]
pub fn open_sea_at(at: [f64; 2], world_time_s: f64) -> (Swell, [f64; 2]) {
    let air = world::weather::air_at(at[0], at[1], world_time_s);
    (Swell::under(SEED, &SeaHere::open_sea(&air)), weather_wind(air.wind))
}

/// The bed under the open sea in a fight, metres below its level: the swell's full depth, and more.
const SEA_BED_M: f64 = FULL_DEPTH_M * 2.0;
/// The ground over the sea on a continent, metres: dry.
const DRY_M: f64 = 5.0;

/// The waters a fight is fought on, made from the continents' coasts alone: open sea off them with the swell on it,
/// dry ground on them.
pub(crate) struct CoastWaters<'sea> {
    pub coasts: &'sea [Coast],
    pub swell: &'sea Swell,
}

impl Waters for CoastWaters<'_> {
    fn at(&self, x: f64, y: f64, time: f64) -> Spot {
        let point = Point::new(x.round() as i64, y.round() as i64);
        if on_land(self.coasts, point) {
            Spot { bed: DRY_M, surface: None }
        } else {
            Spot { bed: -SEA_BED_M, surface: Some(self.swell.height_at(x, y, time, SEA_BED_M)) }
        }
    }

    fn lagged(&self, x: f64, y: f64, time: f64, lag: f64) -> Spot {
        let spot = self.at(x, y, time);
        let surface = spot.surface.map(|_| self.swell.lagged_height_at(x, y, time, SEA_BED_M, lag));
        Spot { surface, ..spot }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fleet::{FLEET_AT, Fleet};

    #[test]
    fn a_fleet_room_takes_the_weather_where_it_lies_when_it_opened_and_keeps_it() {
        let mut fleet = Fleet::new();
        assert_eq!(fleet.weather().1, open_sea_at(FLEET_AT, 0.0).1);
        fleet.set_world_start(1_790_000_000.0);
        let (swell, wind) = open_sea_at(FLEET_AT, 1_790_000_000.0);
        assert_eq!(fleet.weather(), (&swell, wind));
        for _ in 0..600 {
            fleet.tick();
        }
        assert_eq!(fleet.weather().1, wind, "the wind it began in holds while it lasts");
    }

    #[test]
    fn a_fight_in_the_lee_of_a_coast_rolls_lower_than_one_out_on_the_open_sea() {
        let text = r#"{ "continents": [{ "id": "square", "outline": [[1000000, 1000000], [1100000, 1000000], [1100000, 1100000], [1000000, 1100000]] }], "isles": [] }"#;
        let weather =
            SeaWeather { world_start_s: 1_790_000_000.0, ..SeaWeather::new(&world::layout::parse(text).unwrap()) };
        let wind = world::weather::air_at(1_050_000.0, 1_050_000.0, 1_790_000_000.0).wind;
        let strength = (wind[0] * wind[0] + wind[1] * wind[1]).sqrt();
        let lee = [1_050_000.0 + wind[0] / strength * 51_000.0, 1_050_000.0 + wind[1] / strength * 51_000.0];
        let open = [lee[0] + wind[0] / strength * 200_000.0, lee[1] + wind[1] / strength * 200_000.0];
        let tallest = |at: [f64; 2]| weather.at(at, 0.0).0.waves.iter().map(|wave| wave.amplitude).fold(0.0, f64::max);
        assert!(tallest(lee) < 0.5 * tallest(open), "{} {}", tallest(lee), tallest(open));
    }
}
