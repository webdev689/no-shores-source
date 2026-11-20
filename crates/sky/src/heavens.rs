//! The sun, the moon and the stars over a place at a moment of world time. A place's latitude comes from how far
//! south it lies on the map, so the north's sun rides lower and sets later, and the south's climbs high and sets
//! quickly. The year stands in a long summer: there are no seasons yet.

use crate::clock::{DAY_S, day_fraction};
use land::exact::{clamp, lerp, sin_cos};
use std::f64::consts::TAU;
use world::check::FRAME_HEIGHT_M;

/// The latitude, degrees north, of the map's top edge and of its foot.
pub const NORTH_EDGE_DEG: f64 = 62.0;
pub const SOUTH_EDGE_DEG: f64 = 8.0;
/// How far north of the equator the sun stands, degrees: a long summer's, so the north keeps a night of its own.
pub const DECLINATION_DEG: f64 = 15.0;
/// Days from one new moon to the next.
pub const MONTH_DAYS: f64 = 8.0;
/// The sun's height, degrees, below which it is night: the end of twilight.
pub const NIGHT_BELOW_DEG: f64 = -6.0;

/// Where the sun and moon stand and how the stars have turned: directions as unit vectors east, south and up.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Heavens {
    pub latitude_deg: f64,
    pub sun: [f64; 3],
    pub moon: [f64; 3],
    /// How far through its month the moon is: 0 new, a half full.
    pub moon_phase: f64,
    /// The share of the moon's face lit, 0 to 1.
    pub moon_lit: f64,
    /// How far the stars have wheeled about the pole, radians.
    pub star_turn: f64,
}

/// The latitude, degrees north, of a point `y_m` metres down the map.
#[must_use]
pub fn latitude_deg(y_m: f64) -> f64 {
    lerp(NORTH_EDGE_DEG, SOUTH_EDGE_DEG, clamp(y_m / FRAME_HEIGHT_M as f64, 0.0, 1.0))
}

/// The heavens over a point `y_m` metres down the map at `world_s`.
#[must_use]
pub fn heavens_at(y_m: f64, world_s: f64) -> Heavens {
    let latitude_deg = latitude_deg(y_m);
    let latitude = latitude_deg.to_radians();
    let hour_angle = TAU * (day_fraction(world_s) - 0.5);
    let months = world_s / (MONTH_DAYS * DAY_S);
    let moon_phase = months - months.floor();
    let (_, phase_cosine) = sin_cos(TAU * moon_phase);
    let declination = DECLINATION_DEG.to_radians();
    Heavens {
        latitude_deg,
        sun: toward(latitude, declination, hour_angle),
        // The moon trails the sun by its phase, and at full stands as far south of the equator as the sun is north.
        moon: toward(latitude, declination * phase_cosine, hour_angle - TAU * moon_phase),
        moon_phase,
        moon_lit: (1.0 - phase_cosine) / 2.0,
        star_turn: hour_angle,
    }
}

/// The sine of the sun's height at a place on the map at `world_s`: the sun alone, for what follows it through the day.
#[must_use]
pub fn sun_up_at(y_m: f64, world_s: f64) -> f64 {
    let hour_angle = TAU * (day_fraction(world_s) - 0.5);
    toward(latitude_deg(y_m).to_radians(), DECLINATION_DEG.to_radians(), hour_angle)[2]
}

/// The direction of a body at a declination and hour angle seen from a latitude: east, south and up.
fn toward(latitude: f64, declination: f64, hour_angle: f64) -> [f64; 3] {
    let (latitude_sine, latitude_cosine) = sin_cos(latitude);
    let (declination_sine, declination_cosine) = sin_cos(declination);
    let (hour_sine, hour_cosine) = sin_cos(hour_angle);
    let east = -declination_cosine * hour_sine;
    let north = declination_sine * latitude_cosine - declination_cosine * latitude_sine * hour_cosine;
    let up = declination_cosine * latitude_cosine * hour_cosine + declination_sine * latitude_sine;
    [east, -north, up]
}

impl Heavens {
    /// The sine of the sun's height: 1 overhead, 0 on the horizon.
    #[must_use]
    pub fn sun_up(&self) -> f64 {
        self.sun[2]
    }

    /// How much of the day's light is in the sky, 0 in the night to 1 once the sun is 10 degrees up.
    #[must_use]
    pub fn daylight(&self) -> f64 {
        let (night, _) = sin_cos(NIGHT_BELOW_DEG.to_radians());
        let (full, _) = sin_cos(10f64.to_radians());
        land::exact::smooth(night, full, self.sun[2])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::DAY_S;

    fn night_share(y_m: f64) -> f64 {
        let steps = 2400;
        let dark =
            (0..steps).filter(|step| heavens_at(y_m, DAY_S * f64::from(*step) / f64::from(steps)).daylight() <= 0.0);
        dark.count() as f64 / f64::from(steps)
    }

    #[test]
    fn the_sun_rises_in_the_east_stands_south_at_noon_and_sets_in_the_west() {
        let temperate = 1_500_000.0;
        let morning = heavens_at(temperate, DAY_S * 0.3);
        let noon = heavens_at(temperate, DAY_S * 0.5);
        let evening = heavens_at(temperate, DAY_S * 0.7);
        assert!(morning.sun[0] > 0.5 && evening.sun[0] < -0.5, "{morning:?} {evening:?}");
        assert!(noon.sun[0].abs() < 1e-9 && noon.sun[1] > 0.0 && noon.sun_up() > 0.85, "{noon:?}");
        assert!(heavens_at(temperate, 0.0).sun_up() < -0.3, "midnight is dark");
        let length = |sun: [f64; 3]| (sun[0] * sun[0] + sun[1] * sun[1] + sun[2] * sun[2]).sqrt();
        assert!((length(noon.sun) - 1.0).abs() < 1e-12 && (length(morning.moon) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn the_north_has_the_shorter_night_and_the_lower_noon() {
        let (north, south) = (300_000.0, 2_800_000.0);
        assert!(night_share(north) < night_share(south), "{} {}", night_share(north), night_share(south));
        assert!((0.25..0.36).contains(&night_share(north)), "{}", night_share(north));
        assert!((0.36..0.47).contains(&night_share(south)), "{}", night_share(south));
        assert!(heavens_at(north, DAY_S / 2.0).sun_up() < heavens_at(south, DAY_S / 2.0).sun_up());
    }

    #[test]
    fn the_moon_waxes_over_its_month_and_rides_opposite_the_sun_when_full() {
        let full = MONTH_DAYS * DAY_S / 2.0;
        let midnight_full = heavens_at(1_500_000.0, full);
        assert!(midnight_full.moon_lit > 0.999 && midnight_full.moon[2] > 0.5, "{midnight_full:?}");
        assert!(heavens_at(1_500_000.0, 0.0).moon_lit < 1e-9, "the month begins with a new moon");
    }
}
