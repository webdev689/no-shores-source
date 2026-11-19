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
    let lone = Swell { waves: vec![Wave { amplitude: 0.0, shift: 0.0, ..wave }; WAVES], ..swell };
    let mut alone = lone.clone();
    alone.waves[0] = wave;
    let [x, y] = [100.0, 200.0];
    let later = alone.height_at(x + wave.direction[0] * speed * 3.0, y + wave.direction[1] * speed * 3.0, 3.0, 99.0);
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

/// The open sea at a sea state, the wind blowing east-north-east.
fn open_at(state: f64) -> SeaHere {
    SeaHere { wind: [9.0, -3.0], state, open: 1.0, harbour: 0.0 }
}

/// The swell's height's root mean square along a line of deep water at a moment.
fn spread(swell: &Swell, lag: f64) -> f64 {
    let heights =
        (0..3000).map(|step| swell.lagged_height_at(1_000.0 + 4.1 * f64::from(step), 2_000.0, 7.0, 500.0, lag));
    (heights.map(|height| height * height).sum::<f64>() / 3000.0).sqrt()
}

#[test]
fn the_weather_raises_the_swell_from_a_calm_to_a_storm_blended_never_stepped() {
    let moderate = spread(&Swell::under(SEED, &open_at(0.35)), 0.0);
    for (state, share) in [(0.1, 0.35), (0.65, 1.8), (0.9, 3.0)] {
        let ratio = spread(&Swell::under(SEED, &open_at(state)), 0.0) / moderate;
        assert!((ratio - share).abs() < 0.15 * share, "state {state}: {ratio}");
    }
    assert_eq!(
        [0.0, 0.1, 0.225, 0.35, 0.65, 0.9, 1.0].map(|state| open_at(state).height()),
        [0.35, 0.35, 0.675, 1.0, 1.8, 3.0, 3.0]
    );
    let mut last = Swell::under(SEED, &open_at(0.0)).height_at(500.0, 300.0, 3.0, 500.0);
    for step in 1..=1000 {
        let now = Swell::under(SEED, &open_at(f64::from(step) / 1000.0)).height_at(500.0, 300.0, 3.0, 500.0);
        assert!((now - last).abs() < 0.03, "a thousandth of a sea state moves the sea a little: {last} {now}");
        last = now;
    }
}

#[test]
fn the_swell_grows_longer_as_it_grows_higher_and_runs_with_the_wind() {
    assert!(
        (open_at(0.0).length() - LENGTH_SHARE[0]).abs() < 1e-12
            && (open_at(1.0).length() - LENGTH_SHARE[1]).abs() < 1e-12
    );
    let longest = |state: f64| {
        let swell = Swell::under(SEED, &open_at(state));
        swell.waves.iter().map(|wave| TAU / wave.number).fold(0.0, f64::max)
    };
    assert!(
        longest(0.0) < 0.85 * LONGEST_M * 1.1 && longest(1.0) > 1.3 * LONGEST_M * 0.9,
        "{} {}",
        longest(0.0),
        longest(1.0)
    );
    for wind in [[9.0, -3.0], [-2.0, 7.0], [0.0, -5.0], [-4.0, -4.0]] {
        let swell = Swell::under(SEED, &SeaHere { wind, ..open_at(0.5) });
        let strength = (wind[0] * wind[0] + wind[1] * wind[1]).sqrt();
        let (mut along, mut total) = (0.0, 0.0);
        for wave in &swell.waves {
            along += wave.amplitude * (wave.direction[0] * wind[0] + wave.direction[1] * wind[1]) / strength;
            total += wave.amplitude;
        }
        assert!(along / total > 0.7, "{wind:?}: {}", along / total);
        assert!(swell.waves.len() <= MOST_WAVES);
        let sharpness: f64 = swell.waves.iter().map(|wave| wave.number * wave.shift).sum();
        assert!(sharpness <= SHARPNESS + 1e-9, "no crest folds: {sharpness}");
    }
    let storm = Swell::under(SEED, &open_at(1.0));
    assert!(storm.waves.iter().map(|wave| wave.number * wave.shift).sum::<f64>() <= SHARPNESS + 1e-9);
}

#[test]
fn the_lee_of_land_and_a_roadstead_lie_calmer() {
    let open = open_at(0.9);
    assert!((SeaHere { open: 0.25, ..open }.height() - 0.75).abs() < 1e-12);
    assert!((SeaHere { harbour: 1.0, ..open }.height() - HARBOUR_SHARE).abs() < 1e-12, "a storm stays outside");
    assert!((SeaHere { harbour: 1.0, ..open_at(0.0) }.height() - HARBOUR_SHARE).abs() < 1e-12);
    let lee = spread(&Swell::under(SEED, &SeaHere { open: 0.25, ..open }), 0.0);
    let whole = spread(&Swell::under(SEED, &open), 0.0);
    assert!((lee / whole - 0.25).abs() < 0.05, "{}", lee / whole);
}

#[test]
fn a_hull_slow_to_answer_rides_the_short_waves_least() {
    let swell = Swell::under(SEED, &open_at(0.5));
    for step in 0..50 {
        let x = 17.3 * f64::from(step);
        assert_eq!(
            swell.lagged_height_at(x, 9.0, 4.0, 300.0, 0.0).to_bits(),
            swell.height_at(x, 9.0, 4.0, 300.0).to_bits()
        );
    }
    let (still, small, large) = (spread(&swell, 0.0), spread(&swell, 0.4), spread(&swell, 1.0));
    assert!(still > small && small > large && large > 0.3 * still, "{still} {small} {large}");
    // One wave alone: a first order lag of time constant 1 / frequency answers half as high, an eighth of a period late.
    let wave = Wave { direction: [1.0, 0.0], number: 0.1, frequency: 1.0, amplitude: 1.0, shift: 0.0, phase: 0.0 };
    let lone = Swell { bearing: 0.0, wind: [0.0; 2], waves: vec![wave] };
    let peak =
        (0..2000).map(|step| lone.lagged_height_at(0.0, 0.0, f64::from(step) * 0.01, 300.0, 1.0)).fold(0.0, f64::max);
    assert!((peak - 0.5_f64.sqrt()).abs() < 1e-3, "{peak}");
}
