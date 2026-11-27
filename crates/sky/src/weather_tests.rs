use crate::air::Air;
use crate::lightning::strikes_near;
use crate::weather::{Ground, Weather, ground_at, weather_at};
use land::exact::fingerprint;

/// Each climate's island at the latitude its continent lies at on the world map, metres down it.
const PLACES: [(&str, f64); 10] = [
    ("temperate-coast", 1_520_000.0),
    ("highland", 640_000.0),
    ("woodland", 860_000.0),
    ("desert", 2_750_000.0),
    ("savanna", 2_685_000.0),
    ("rainforest", 2_526_000.0),
    ("steppe", 535_000.0),
    ("swamp", 1_945_000.0),
    ("tundra", 373_000.0),
    ("sea", 1_500_000.0),
];

#[derive(Debug, Default)]
struct Shares {
    cloud: f64,
    falling: f64,
    storm: f64,
    fog: f64,
    sand: f64,
    snow: f64,
    wind: f64,
    least_wind: f64,
    most_wind: f64,
}

/// A climate's weather read across 400 km of its island over three days.
fn shares(key: &str, y: f64) -> Shares {
    let air = Air::of_climate(key, y);
    let mut out = Shares { least_wind: f64::MAX, ..Shares::default() };
    let mut count = 0.0;
    for step in 0..3000 {
        let step = f64::from(step);
        let x = 1_000_000.0 + (step * 7919.0) % 400_000.0;
        let weather: Weather = weather_at(&air, x, y + (step * 104_729.0) % 200_000.0, 50.0, step * 87.0);
        let speed = (weather.wind[0] * weather.wind[0] + weather.wind[1] * weather.wind[1]).sqrt();
        out.cloud += weather.cloud;
        out.falling += f64::from(u8::from(weather.falling > 0.05));
        out.storm += f64::from(u8::from(weather.storm > 0.3));
        out.fog += f64::from(u8::from(weather.fog > 0.3));
        out.sand += f64::from(u8::from(weather.sand > 0.3));
        out.snow += f64::from(u8::from(weather.falling > 0.05 && weather.snow_share > 0.5));
        out.wind += speed;
        out.least_wind = out.least_wind.min(speed);
        out.most_wind = out.most_wind.max(speed);
        count += 1.0;
    }
    for share in
        [&mut out.cloud, &mut out.falling, &mut out.storm, &mut out.fog, &mut out.sand, &mut out.snow, &mut out.wind]
    {
        *share /= count;
    }
    out
}

#[test]
#[ignore = "prints each climate's weather, for tuning: cargo test -p sky -- --ignored --nocapture"]
fn print_each_climates_weather() {
    for (key, y) in PLACES {
        let read = shares(key, y);
        let line = format!(
            "{key:16} cloud {:.2} falling {:.2} storm {:.2} fog {:.2} sand {:.2} snow {:.2} wind {:.1} ({:.1}-{:.1})",
            read.cloud,
            read.falling,
            read.storm,
            read.fog,
            read.sand,
            read.snow,
            read.wind,
            read.least_wind,
            read.most_wind
        );
        std::io::Write::write_all(&mut std::io::stderr(), format!("{line}\n").as_bytes()).unwrap();
    }
}

#[test]
fn each_climate_has_the_weather_its_air_makes() {
    let read = |key: &str| shares(key, PLACES.iter().find(|place| place.0 == key).unwrap().1);
    let (desert, swamp, rainforest, tundra, temperate, sea) =
        (read("desert"), read("swamp"), read("rainforest"), read("tundra"), read("temperate-coast"), read("sea"));
    assert!(desert.falling < 0.05 && desert.cloud < temperate.cloud, "{desert:?}");
    assert!(desert.sand > 0.05 && temperate.sand == 0.0, "{desert:?}");
    assert!((0.25..0.55).contains(&swamp.falling) && (0.25..0.55).contains(&rainforest.falling), "{swamp:?}");
    assert!((0.1..0.3).contains(&temperate.falling) && (0.1..0.3).contains(&sea.falling), "{temperate:?} {sea:?}");
    assert!(rainforest.storm > temperate.storm && tundra.storm < 0.01, "{rainforest:?} {tundra:?}");
    // A summer tundra's days thaw: its fall is snow by night and sleet or rain by day.
    assert!(tundra.snow > 0.35 * tundra.falling && temperate.snow < 0.02, "{tundra:?}");
    let high = weather_at(&Air::of_climate("highland", 640_000.0), 900_000.0, 640_000.0, 2200.0, 0.0);
    assert!(
        high.temperature_c
            < weather_at(&Air::of_climate("highland", 640_000.0), 900_000.0, 640_000.0, 0.0, 0.0).temperature_c - 10.0
    );
    assert!(swamp.fog > desert.fog && desert.fog < 0.01, "{swamp:?}");
    for climate in [desert, swamp, rainforest, tundra, temperate, sea] {
        assert!(climate.least_wind >= 0.8 - 1e-9 && climate.most_wind <= 26.0 + 1e-9, "{climate:?}");
        assert!((3.0..12.0).contains(&climate.wind), "{climate:?}");
    }
}

#[test]
fn weather_changes_smoothly_from_second_to_second_and_place_to_place() {
    let air = Air::of_climate("temperate-coast", 1_520_000.0);
    for step in 0..400 {
        let (x, t) = (2_400_000.0 + f64::from(step) * 1300.0, f64::from(step) * 61.0);
        let now = weather_at(&air, x, 1_520_000.0, 0.0, t);
        let later = weather_at(&air, x, 1_520_000.0, 0.0, t + 1.0);
        let beside = weather_at(&air, x + 50.0, 1_520_000.0, 0.0, t);
        for (first, second) in [(now, later), (now, beside)] {
            assert!((first.cloud - second.cloud).abs() < 0.02 && (first.falling - second.falling).abs() < 0.03);
            assert!((first.wind[0] - second.wind[0]).abs() < 0.2 && (first.wind[1] - second.wind[1]).abs() < 0.2);
        }
    }
}

#[test]
fn lightning_strikes_alike_however_its_window_is_cut_and_only_in_storms() {
    let air = Air::of_climate("rainforest", 2_526_000.0);
    let (x, y) = (450_000.0, 2_526_000.0);
    let whole = strikes_near(&air, x, y, 30_000.0, 0.0, 3600.0);
    let halves: Vec<_> = strikes_near(&air, x, y, 30_000.0, 0.0, 1800.0)
        .into_iter()
        .chain(strikes_near(&air, x, y, 30_000.0, 1800.0, 3600.0))
        .collect();
    assert_eq!(whole, halves);
    assert!(!whole.is_empty(), "a rainforest's hour has storms");
    assert!(strikes_near(&Air::of_climate("tundra", 373_000.0), x, 373_000.0, 30_000.0, 0.0, 3600.0).is_empty());
}

#[test]
fn the_ground_stays_wet_a_while_after_the_rain() {
    let air = Air::of_climate("swamp", 1_945_000.0);
    let wet_after_dry: Vec<f64> =
        (0..2000).map(|step| ground_at(&air, (4_000_000.0, 1_945_000.0, 0.0), f64::from(step) * 30.0).wet).collect();
    assert!(wet_after_dry.iter().any(|wet| *wet > 0.8) && wet_after_dry.iter().any(|wet| *wet < 0.05));
}

#[test]
fn snow_whitens_the_ground_and_never_wets_it_and_rain_the_other_way() {
    let (tundra, swamp) = (Air::of_climate("tundra", 373_000.0), Air::of_climate("swamp", 1_945_000.0));
    let grounds = |air: &Air, x: f64, y: f64, altitude: f64| -> Vec<(Ground, f64)> {
        (0..3000)
            .map(|step| {
                let world_s = f64::from(step) * 40.0;
                (ground_at(air, (x, y, altitude), world_s), weather_at(air, x, y, altitude, world_s).temperature_c)
            })
            .collect()
    };
    let cold = grounds(&tundra, 1_200_000.0, 373_000.0, 900.0);
    assert!(cold.iter().any(|(ground, _)| ground.snow > 0.5), "the tundra's high ground whitens");
    assert!(cold.iter().all(|(ground, celsius)| *celsius > 2.5 || ground.wet < 0.5), "frozen ground is not soaked");
    let warm = grounds(&swamp, 4_000_000.0, 1_945_000.0, 0.0);
    assert!(warm.iter().any(|(ground, _)| ground.wet > 0.8), "a swamp's rain soaks it");
    assert!(warm.iter().all(|(ground, _)| ground.snow == 0.0), "and never whitens it");
}

#[test]
fn the_weather_samples_to_its_fingerprint() {
    let numbers = PLACES.iter().flat_map(|&(key, y)| {
        let air = Air::of_climate(key, y);
        (0..24).flat_map(move |step| {
            let step = f64::from(step);
            let weather = weather_at(&air, 300_123.25 + step * 170_017.5, y, 120.5, 1_000_000.75 + step * 151.0);
            [weather.cloud, weather.falling, weather.snow_share, weather.storm, weather.fog, weather.sand]
                .into_iter()
                .chain(weather.wind)
                .chain([weather.gust, weather.temperature_c])
        })
    });
    // The weather sampled across the map and through a day; the client's test of land.wasm holds the same
    // fingerprint.
    assert_eq!(format!("{:016x}", fingerprint(numbers)), pinned("sky.weather"));
}

#[test]
#[ignore = "prints each field's spread, for tuning"]
fn print_each_fields_spread() {
    use crate::weather::{CELLS, COVER, DAMP, MIST, SPELLS};
    for (name, drift) in [("cover", COVER), ("damp", DAMP), ("cells", CELLS), ("mist", MIST), ("spells", SPELLS)] {
        let values: Vec<f64> = (0..20_000)
            .map(|step| drift.at(f64::from(step) * 7919.0, f64::from(step) * 3571.0, f64::from(step) * 97.0, 10.0))
            .collect();
        let mean = values.iter().sum::<f64>() / values.len() as f64;
        let spread =
            (values.iter().map(|value| (value - mean) * (value - mean)).sum::<f64>() / values.len() as f64).sqrt();
        std::io::Write::write_all(
            &mut std::io::stderr(),
            format!("{name} mean {mean:.3} spread {spread:.3}\n").as_bytes(),
        )
        .unwrap();
    }
}

#[path = "../../land/tests/support/pinned.rs"]
mod pinned;
use pinned::pinned;
