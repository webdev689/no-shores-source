use super::*;
use crate::layout::parse;

/// A spread of world points over the frame and times from 2024 on.
fn samples() -> impl Iterator<Item = (f64, f64, f64)> {
    (0..3000).flat_map(|point| {
        let x = 12_345.0 * f64::from(point) * 97.0 % 4_900_000.0;
        let y = 7_919.0 * f64::from(point) * 31.0 % 3_000_000.0;
        let day = 1.7e9 + f64::from(point) * 86_400.0 * 7.3;
        (0..24).map(move |hour| (x, y, day + f64::from(hour) * 3_600.0))
    })
}

#[test]
fn over_days_at_many_points_the_sea_is_calm_moderate_rough_and_storm_in_the_set_shares() {
    let mut counts = [0_u32; 4];
    for (x, y, time) in samples() {
        counts[air_at(x, y, time).band() as usize] += 1;
    }
    let total = f64::from(counts.iter().sum::<u32>());
    let shares = counts.map(|count| f64::from(count) / total);
    for (share, wanted) in shares.iter().zip([0.15, 0.50, 0.25, 0.10]) {
        assert!((share - wanted).abs() < 0.03, "{shares:?}");
    }
}

#[test]
fn the_weather_changes_over_hours_and_never_steps() {
    let (x, y, start) = (1_234_567.0, 987_654.0, 1.75e9);
    let mut most_step = 0.0_f64;
    let mut low_high = (1.0_f64, 0.0_f64);
    for minute in 0..(3 * 24 * 60) {
        let (now, next) =
            (air_at(x, y, start + f64::from(minute) * 60.0), air_at(x, y, start + f64::from(minute + 1) * 60.0));
        most_step = most_step.max((now.state - next.state).abs());
        low_high = (low_high.0.min(now.state), low_high.1.max(now.state));
    }
    assert!(most_step < 0.01, "a minute never moves the sea state far: {most_step}");
    assert!(low_high.1 - low_high.0 > 0.2, "over three days it does change: {low_high:?}");
}

#[test]
fn the_systems_drift_eastward_at_their_speed() {
    // An hour on, the weather 36 km east is nearer what it was here than the weather here is: it has drifted there,
    // changing as it went.
    let (mut carried, mut stayed) = (0.0, 0.0);
    for (x, y, time) in samples().step_by(7) {
        let before = air_at(x, y, time).state;
        carried += (air_at(x + DRIFT_M_S * 3_600.0, y, time + 3_600.0).state - before).abs();
        stayed += (air_at(x, y, time + 3_600.0).state - before).abs();
    }
    assert!(carried < 0.97 * stayed, "{carried} {stayed}");
}

#[test]
fn the_wind_veers_smoothly_across_a_system_and_blows_harder_the_rougher_the_sea() {
    let time = 1.76e9;
    let mut most_turn = 0.0_f64;
    let mut ways = Vec::new();
    for step in 0..600 {
        let (here, there) =
            (air_at(f64::from(step) * 5_000.0, 1.5e6, time), air_at(f64::from(step + 1) * 5_000.0, 1.5e6, time));
        let dot = (here.wind[0] * there.wind[0] + here.wind[1] * there.wind[1]) / (here.strength() * there.strength());
        most_turn = most_turn.max(1.0 - dot);
        ways.push(here.wind[1] / here.strength());
    }
    assert!(most_turn < 0.01, "5 km never turns the wind far: {most_turn}");
    let (low, high) = ways.iter().fold((1.0_f64, -1.0_f64), |(low, high), &way| (low.min(way), high.max(way)));
    assert!(high - low > 0.5, "across 3,000 km it veers: {low} {high}");
    for (x, y, time) in samples().step_by(11) {
        let air = air_at(x, y, time);
        let strength = air.strength();
        let wanted = match air.band() {
            Band::Calm => WIND_M_S[0]..=WIND_M_S[1],
            Band::Moderate => WIND_M_S[1]..=WIND_M_S[2],
            Band::Rough => WIND_M_S[2]..=WIND_M_S[3],
            Band::Storm => WIND_M_S[3]..=WIND_M_S[4],
        };
        assert!(wanted.contains(&(strength + 1e-9)) || wanted.contains(&(strength - 1e-9)), "{air:?}");
        assert!((0.0..=1.0).contains(&air.state));
    }
}

#[test]
fn the_bands_meet_at_their_set_states() {
    assert_eq!(
        [0.0, 0.19, 0.2, 0.49, 0.5, 0.79, 0.8, 1.0].map(band_of),
        [Band::Calm, Band::Calm, Band::Moderate, Band::Moderate, Band::Rough, Band::Rough, Band::Storm, Band::Storm]
    );
    assert_eq!(through(&[(0.0, 1.0), (2.0, 3.0)], 1.0), 2.0);
    assert_eq!(through(&[(0.0, 1.0), (2.0, 3.0)], -5.0), 1.0);
    assert_eq!(through(&[(0.0, 1.0), (2.0, 3.0)], 9.0), 3.0);
}

#[test]
fn the_weather_holds_to_its_fingerprint() {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for (x, y, time) in samples().step_by(97) {
        let air = air_at(x, y, time);
        for number in [air.wind[0], air.wind[1], air.state] {
            for byte in number.to_bits().to_le_bytes() {
                hash = (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3);
            }
        }
    }
    assert_eq!(format!("{hash:016x}"), WEATHER_HASH);
}

/// The weather's fingerprint over the samples: any change to its numbers shows here.
const WEATHER_HASH: &str = "ffc809e61b97d35b";

/// An island 100 km square with the sea round it.
fn island() -> Waters {
    let text = r#"{ "continents": [{ "id": "square", "outline": [[1000000, 1000000], [1100000, 1000000], [1100000, 1100000], [1000000, 1100000]] }], "isles": [] }"#;
    Waters::new(&parse(text).unwrap())
}

#[test]
fn the_lee_of_land_is_sheltered_by_its_fetch_and_the_open_sea_is_not() {
    let waters = island();
    let east_wind = [10.0, 0.0];
    // Just east of the island, downwind: the wind has crossed only a kilometre of sea.
    assert!((fetch_m(&waters, [1_101_000.0, 1_050_000.0], east_wind) - 1_000.0).abs() < 60.0);
    assert_eq!(shelter(&waters, &[], [1_101_000.0, 1_050_000.0], east_wind), (FETCH_SHARE[0], 0.0));
    // 31 km east, half the shares' way along.
    let (half, _) = shelter(&waters, &[], [1_131_000.0, 1_050_000.0], east_wind);
    assert!((half - (0.25 + 0.75 * 29.0 / 58.0)).abs() < 0.03, "about half its fan's way along: {half}");
    // West of it, upwind, the open sea.
    assert_eq!(fetch_m(&waters, [990_000.0, 1_050_000.0], east_wind), FETCH_M[1]);
    assert_eq!(shelter(&waters, &[], [990_000.0, 1_050_000.0], east_wind).0, 1.0);
}

#[test]
fn a_roadstead_is_calm_whatever_the_weather_and_eases_to_the_open_sea() {
    let waters = island();
    let roadstead = [Point { x: 900_000, y: 1_050_000 }];
    let at = |east: f64| shelter(&waters, &roadstead, [900_000.0 + east, 1_050_000.0], [0.0, 10.0]).1;
    assert_eq!([at(0.0), at(2_999.0), at(3_250.0), at(3_500.0), at(9_000.0)], [1.0, 1.0, 0.5, 0.0, 0.0]);
}
