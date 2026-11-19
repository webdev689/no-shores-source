//! The sculpts' tests: floors, cliffs, climbs, runs, wings, fades and the seams between them.

use super::*;

fn sculpt() -> Sculpts {
    let claim = vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]];
    Sculpts::from(vec![Sculpt {
        claim,
        floors: vec![[0.0, 0.0, 0.0, 0.0, 60.0], [0.0, 0.0, 300.0, 0.0, 12.0]],
        outcrops: vec![Outcrop { at: [20.0, 20.0], radius: 10.0, tall: 12.0, shape: Shape::Mesa, angle: 0.0 }],
        rise: 30.0,
        seed: 7,
        climbs: vec![[60.0, -40.0, 180.0, -40.0, 4.0, 0.0, 1.0], [180.0, -40.0, 180.0, -40.0, 10.0, 1.0, 1.0]],
        runs: vec![[-200.0, -300.0, 100.0, -300.0, 4.0, 0.0, 0.0], [-200.0, 300.0, 100.0, 300.0, 4.0, 0.0, 1.0]],
        wings: Vec::new(),
    }])
}

#[test]
fn a_run_climbing_round_a_bend_rises_without_a_step() {
    let bent = Sculpts::from(vec![Sculpt {
        claim: vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]],
        floors: Vec::new(),
        outcrops: Vec::new(),
        rise: 30.0,
        seed: 7,
        climbs: Vec::new(),
        runs: vec![[0.0, 0.0, 0.0, 20.0, 2.5, 0.2, 0.4], [0.0, 20.0, 14.0, 34.0, 2.5, 0.4, 0.6]],
        wings: Vec::new(),
    }]);
    // Along each passage 1.5 m either side of its line, where the step was, through the bend.
    for [x1, y1, x2, y2] in [[0.0_f64, 0.0, 0.0, 20.0], [0.0, 20.0, 14.0, 34.0]] {
        let length = ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)).sqrt();
        let (way, across) = ([(x2 - x1) / length, (y2 - y1) / length], [-(y2 - y1) / length, (x2 - x1) / length]);
        for side in [1.5, -1.5] {
            let point = |along: f64| [x1 + way[0] * along + across[0] * side, y1 + way[1] * along + across[1] * side];
            let mut last = bent.raise(point(0.0)[0], point(0.0)[1], 1000.0);
            for step in 1..=(length / 0.25) as i32 {
                let at = point(f64::from(step) * 0.25);
                let now = bent.raise(at[0], at[1], 1000.0);
                assert!((now - last).abs() < 0.2, "a step of {} m at {at:?}", now - last);
                last = now;
            }
        }
    }
}

#[test]
fn a_wing_carries_the_massif_past_the_ring() {
    let sculpts = Sculpts::from(vec![Sculpt {
        claim: vec![[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]],
        floors: vec![[0.0, 0.0, 0.0, 0.0, 20.0]],
        outcrops: Vec::new(),
        rise: 30.0,
        seed: 3,
        climbs: Vec::new(),
        runs: Vec::new(),
        wings: vec![[50.0, 0.0, 350.0, 0.0, 40.0]],
    }]);
    let beyond = sculpts.raise(300.0, 30.0, 1000.0);
    assert!(beyond > 15.0, "the massif stands 250 m past the ring along the wing: {beyond}");
    assert_eq!(sculpts.raise(300.0, 200.0, 1000.0), 0.0, "and the land beside the wing is as it was");
}

#[test]
fn a_run_is_cut_at_its_level() {
    let sculpts = sculpt();
    assert_eq!(sculpts.raise(0.0, -300.0, 1000.0), 0.0, "a run on the floor's level is cut to it");
    assert!(sculpts.floor_distance(0.0, -300.0) < 0.0, "and is floor");
    assert!(sculpts.raise(0.0, -340.0, 1000.0) > 15.0, "the rock stands over it either side");
    let top = sculpts.raise(100.0, 300.0, 1000.0);
    assert!(top > 18.0, "a run rising to the top ends on it: {top}");
}

#[test]
fn a_sculpt_without_runs_or_wings_writes_neither() {
    let text = serde_json::to_string(&Vec::<Sculpt>::from(sculpt())).unwrap_or_default();
    assert!(text.contains("\"runs\""), "the fixture's runs are written");
    let mut bare: Vec<Sculpt> = sculpt().into();
    bare[0].runs.clear();
    let text = serde_json::to_string(&bare).unwrap_or_default();
    assert!(!text.contains("runs") && !text.contains("wings"), "{text}");
}

#[test]
fn the_floor_is_left_and_the_land_round_it_rises_to_cliffs() {
    let sculpts = sculpt();
    assert_eq!(sculpts.raise(-30.0, -30.0, 1000.0), 0.0, "a basin's floor is its own land");
    assert_eq!(sculpts.raise(200.0, 0.0, 1000.0), 0.0, "a canyon's floor too");
    let top = sculpts.raise(200.0, 120.0, 1000.0);
    assert!(top > 15.0, "the massif stands well over the floor: {top}");
    assert!(sculpts.on_floor(200.0, 0.0) && !sculpts.on_floor(200.0, 120.0));
}

#[test]
fn an_outcrop_stands_on_the_floor_and_nothing_rises_on_the_strand() {
    let sculpts = sculpt();
    assert!(sculpts.raise(20.0, 20.0, 1000.0) > 10.0, "a mesa's top");
    assert_eq!(sculpts.raise(200.0, 120.0, -5.0), 0.0, "the sea is never raised");
    assert!(sculpts.raise(200.0, 120.0, 10.0) < sculpts.raise(200.0, 120.0, 1000.0), "the strand eases");
}

#[test]
fn a_climb_rises_along_the_cliff_from_the_floor_to_a_lookout_on_the_top() {
    let sculpts = sculpt();
    let [start, middle, end] = [62.0, 120.0, 180.0].map(|x| sculpts.raise(x, -40.0, 1000.0));
    assert!(start < 3.0 && middle > start + 5.0 && end > middle + 5.0, "it climbs: {start} {middle} {end}");
    assert!(sculpts.raise(120.0, -80.0, 1000.0) > middle + 5.0, "the massif stands over it beyond");
    assert!(sculpts.floor_distance(120.0, -40.0) < 0.0 && sculpts.floor_distance(185.0, -45.0) < 0.0);
    let lookout = [176.0, 184.0].map(|x| sculpts.raise(x, -36.0, 1000.0));
    assert!((lookout[0] - lookout[1]).abs() < 1.0, "the lookout is flat: {lookout:?}");
}

#[test]
fn a_bucket_taken_as_wholly_in_or_past_the_claim_fades_exactly_so_at_every_point() {
    let claim = vec![[-500.0, -500.0], [500.0, -500.0], [620.0, 300.0], [-500.0, 500.0]];
    let fades = Fades::of(&claim, &[], [-700.0, -700.0, 800.0, 700.0]);
    let mut shortcuts = 0;
    for step_x in -140..160 {
        for step_y in -140..140 {
            let (x, y) = (f64::from(step_x) * 5.0 + 0.3, f64::from(step_y) * 5.0 + 0.7);
            let exact = smooth(-FADE_M, 0.0, inside_ring(&claim, x, y));
            match fades.at(x, y) {
                Fade::Whole => assert_eq!(exact, 1.0, "{x},{y}"),
                Fade::None => assert_eq!(exact, 0.0, "{x},{y}"),
                Fade::Measured => continue,
            }
            shortcuts += 1;
        }
    }
    assert!(shortcuts > 40_000, "most points skip the measuring: {shortcuts}");
}

#[test]
fn far_past_the_claim_the_land_is_as_it_was() {
    assert_eq!(sculpt().raise(900.0, 0.0, 1000.0), 0.0);
}

#[test]
fn a_window_keeps_the_sculpts_it_reaches() {
    let sculpts = sculpt();
    assert!(!sculpts.within(0.0, 0.0, 10.0, 10.0).is_empty());
    assert!(sculpts.within(5000.0, 5000.0, 5010.0, 5010.0).is_empty());
}

/// The largest step between points 5 cm apart along rows `rows` (y) from `from` to `to` (x).
fn largest_step(sculpts: &Sculpts, rows: impl Iterator<Item = f64>, from: f64, to: f64) -> (f64, f64, f64) {
    let mut worst = (0.0_f64, 0.0, 0.0);
    for y in rows {
        let mut last = sculpts.raise(from, y, 1000.0);
        for step in 1..=((to - from) / 0.05) as i32 {
            let x = from + f64::from(step) * 0.05;
            let now = sculpts.raise(x, y, 1000.0);
            if (now - last).abs() > worst.0 {
                worst = ((now - last).abs(), x, y);
            }
            last = now;
        }
    }
    worst
}

/// The steepest a strata cliff's riser rises between points 5 cm apart is under this, metres.
const STRATA_STEP_M: f64 = 1.0;

#[test]
fn a_neighbours_massif_never_buries_a_floor_and_meets_it_without_a_step() {
    let square = |west: f64, east: f64| vec![[west, -500.0], [east, -500.0], [east, 500.0], [west, 500.0]];
    let sculpts = Sculpts::from(vec![
        Sculpt {
            claim: square(-1000.0, 1000.0),
            // A basin and the gorge out of its gate, through the neighbour's fade and into its claim.
            floors: vec![[900.0, 0.0, 900.0, 0.0, 60.0], [900.0, 0.0, 1300.0, 0.0, 15.0]],
            outcrops: Vec::new(),
            rise: 30.0,
            seed: 7,
            climbs: Vec::new(),
            runs: Vec::new(),
            wings: Vec::new(),
        },
        Sculpt {
            claim: square(1100.0, 2000.0),
            floors: vec![[1500.0, 0.0, 1500.0, 0.0, 60.0]],
            outcrops: Vec::new(),
            rise: 38.0,
            seed: 9,
            climbs: Vec::new(),
            runs: Vec::new(),
            wings: Vec::new(),
        },
    ]);
    for x in [1000.0, 1050.0, 1150.0, 1250.0] {
        assert_eq!(sculpts.raise(x, 0.0, 1000.0), 0.0, "the gorge is open at {x}");
    }
    assert!(sculpts.raise(1250.0, 80.0, 1000.0) > 20.0, "the neighbour's massif stands either side");
    let worst = largest_step(&sculpts, (-12..=12).map(|row| f64::from(row) * 8.0), 950.0, 1450.0);
    assert!(worst.0 < STRATA_STEP_M, "a step of {:.2} m at {:.2},{:.2}", worst.0, worst.1, worst.2);
}

#[test]
fn the_massif_has_no_step_at_a_bucket_edge_or_beside_a_climbs_top() {
    let sculpts = Sculpts::from(vec![Sculpt {
        claim: vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]],
        floors: vec![[0.0, 0.0, 0.0, 0.0, 60.0]],
        outcrops: Vec::new(),
        rise: 30.0,
        seed: 7,
        climbs: vec![[60.0, -40.0, 180.0, -40.0, 3.5, 0.0, 1.0], [180.0, -40.0, 180.0, -40.0, 11.0, 1.0, 1.0]],
        runs: Vec::new(),
        wings: Vec::new(),
    }]);
    let worst = largest_step(&sculpts, (0..100).map(|row| -200.0 + f64::from(row) * 4.0), -200.0, 220.0);
    assert!(worst.0 < STRATA_STEP_M, "a step of {:.2} m at {:.2},{:.2}", worst.0, worst.1, worst.2);
    // Across the climb's top, from its lookout's side down past its end.
    let mut worst = (0.0_f64, 0.0, 0.0);
    for column in 0..400 {
        let x = 70.0 + f64::from(column) * 0.2;
        let mut last = sculpts.raise(x, -55.0, 1000.0);
        for step in 1..800 {
            let y = -55.0 - f64::from(step) * 0.05;
            let now = sculpts.raise(x, y, 1000.0);
            if (now - last).abs() > worst.0 {
                worst = ((now - last).abs(), x, y);
            }
            last = now;
        }
    }
    assert!(worst.0 < STRATA_STEP_M, "a step of {:.2} m at {:.2},{:.2}", worst.0, worst.1, worst.2);
}

const SHAPES: [Shape; 6] = [Shape::Mesa, Shape::Tor, Shape::Whaleback, Shape::Crag, Shape::Knoll, Shape::Hummock];

/// One outcrop standing alone in a basin wide enough that the land round it is floor.
fn standing(outcrop: Outcrop) -> Sculpts {
    Sculpts::from(vec![Sculpt {
        claim: vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]],
        floors: vec![[0.0, 0.0, 0.0, 0.0, 320.0]],
        outcrops: vec![outcrop],
        rise: 30.0,
        seed: 7,
        climbs: Vec::new(),
        runs: Vec::new(),
        wings: Vec::new(),
    }])
}

/// The land along a line through an outcrop's middle, `way` (along its angle, or across it with `across`), every
/// 0.25 m out to its reach either side: how long a stretch of it stands, stands within a tenth of the tall of the
/// line's highest point, and stands at its full tall, metres.
fn line_through(sculpts: &Sculpts, outcrop: &Outcrop, across: bool) -> (f64, f64, f64) {
    let (sine, cosine) = crate::exact::sin_cos(outcrop.angle);
    let way = if across { [cosine, sine] } else { [sine, -cosine] };
    let [west, north, east, south] = outcrop.reach();
    let out = 0.5 * (east - west).max(south - north) + 4.0;
    let heights: Vec<f64> = (-(out * 4.0) as i32..=(out * 4.0) as i32)
        .map(|step| {
            let along = f64::from(step) * 0.25;
            sculpts.raise(outcrop.at[0] + way[0] * along, outcrop.at[1] + way[1] * along, 1000.0)
        })
        .collect();
    let highest = heights.iter().copied().fold(0.0, f64::max);
    let length = |test: &dyn Fn(f64) -> bool| heights.iter().filter(|&&height| test(height)).count() as f64 * 0.25;
    (
        length(&|height| height > 0.0),
        length(&|height| height >= highest - outcrop.tall * 0.1),
        length(&|height| height >= outcrop.tall - 1e-9),
    )
}

#[test]
fn every_shape_holds_its_bands_on_the_close_up_grid() {
    for shape in SHAPES {
        for radius in [12.0, 30.0, 40.0, 64.0] {
            let outcrop = Outcrop { at: [3.3, -2.1], radius, tall: 10.0, shape, angle: 0.7 };
            let sculpts = standing(outcrop);
            let band = outcrop.tall / f64::from(outcrop.bands());
            let broad = match shape {
                Shape::Tor | Shape::Knoll => radius > 20.0,
                Shape::Crag => radius > 35.0,
                Shape::Mesa => radius > 50.0,
                Shape::Whaleback | Shape::Hummock => false,
            };
            assert!(!broad || outcrop.bands() >= 2, "a broad {shape:?} stands in bands");
            // Every shape's faces are `BAND_M` across, two samples, so no step between neighbours climbs near a whole
            // band.
            let [west, north, east, south] = outcrop.reach();
            let height = |column: i32, row: i32| {
                sculpts.raise(west + 1.3 + f64::from(column) * 4.0, north + 0.7 + f64::from(row) * 4.0, 1000.0)
            };
            let (columns, rows) = (((east - west) / 4.0) as i32 + 1, ((south - north) / 4.0) as i32 + 1);
            for column in 0..columns {
                for row in 0..rows {
                    let here = height(column, row);
                    for there in [height(column + 1, row), height(column, row + 1)] {
                        let step = (there - here).abs();
                        assert!(step < band * 0.8, "{shape:?} {radius}: {step:.2} m over 4 m, its band {band:.2}");
                    }
                }
            }
            let (along, along_top, _) = line_through(&sculpts, &outcrop, false);
            let (wide, across_top, flat) = line_through(&sculpts, &outcrop, true);
            match shape {
                // Once it has room for its face beside such a top.
                Shape::Mesa if radius > 20.0 => {
                    assert!(flat >= wide * 0.5, "a mesa's top is flat over half its width: {flat} of {wide}")
                }
                Shape::Tor | Shape::Knoll => {
                    assert!(along_top >= 4.0 && across_top >= 4.0, "{shape:?}: rounded {along_top} {across_top}");
                    assert!(flat < 1.0, "{shape:?}: a dome, not a flat top: {flat}");
                }
                Shape::Whaleback => {
                    assert!(along_top >= 2.5 * 2.0 * radius, "a whaleback's top runs long: {along_top} by {wide}");
                    assert!(along > 2.5 * wide, "and it is long along its angle: {along} by {wide}");
                }
                Shape::Mesa | Shape::Crag | Shape::Hummock => {
                    assert!(flat >= 4.0, "{shape:?}: its top flat over a sample: {flat}")
                }
            }
        }
    }
}

#[test]
fn a_stepped_shape_shows_a_ledge_between_its_faces_on_the_close_up_grid() {
    for (shape, radius) in [(Shape::Mesa, 64.0), (Shape::Crag, 40.0), (Shape::Crag, 64.0)] {
        let outcrop = Outcrop { at: [3.3, -2.1], radius, tall: 10.0, shape, angle: 0.7 };
        let sculpts = standing(outcrop);
        let bands = outcrop.bands();
        assert!(bands >= 2, "{shape:?} {radius} stands in bands");
        let band = outcrop.tall / f64::from(bands);
        for turn in 0..8 {
            let (sine, cosine) = crate::exact::sin_cos(f64::from(turn) * 0.79 + 0.2);
            for offset in [0.0, 1.0, 2.0, 3.0] {
                // The close-up's samples out along a line from the middle.
                let heights: Vec<f64> = (0..)
                    .map(|sample| offset + 4.0 * f64::from(sample))
                    .take_while(|&out| out < radius * 1.4)
                    .map(|out| sculpts.raise(outcrop.at[0] + sine * out, outcrop.at[1] - cosine * out, 1000.0))
                    .collect();
                // The faces it falls in, each parted from the next by a step that is nearly flat: a ramp is one face.
                let (mut faces, mut fallen) = (0, 0.0);
                for pair in heights.windows(2) {
                    let fall = (pair[0] - pair[1]).abs();
                    if fall < band * 0.15 {
                        faces += u32::from(fallen >= band * 0.5);
                        fallen = 0.0;
                    } else {
                        fallen += fall;
                    }
                }
                faces += u32::from(fallen >= band * 0.5);
                assert!(faces >= bands, "{shape:?} {radius}, turn {turn}, offset {offset}: {faces} faces of {bands}");
            }
        }
    }
}

#[test]
fn a_shape_never_rises_past_its_tall_or_off_its_reach() {
    for shape in SHAPES {
        for (radius, angle) in [(12.0, 0.0), (30.0, 2.2), (7.0, 4.1)] {
            let outcrop = Outcrop { at: [-14.6, 9.2], radius, tall: 10.0, shape, angle };
            let sculpts = standing(outcrop);
            let [west, north, east, south] = outcrop.reach();
            let mut highest = 0.0_f64;
            for column in 0..=((east - west + 40.0) as i32) {
                for row in 0..=((south - north + 40.0) as i32) {
                    let (x, y) = (west - 20.0 + f64::from(column), north - 20.0 + f64::from(row));
                    let height = sculpts.raise(x, y, 1000.0);
                    assert!((0.0..=outcrop.tall).contains(&height), "{shape:?}: {height} m at {x},{y}");
                    let off = x < west || x > east || y < north || y > south;
                    assert!(!off || height == 0.0, "{shape:?} rises {height} m off its reach at {x},{y}");
                    highest = highest.max(height);
                }
            }
            assert!(highest > outcrop.tall * 0.98, "{shape:?} stands its tall: {highest}");
        }
    }
}

#[test]
fn an_outcrop_is_written_with_its_shape_and_read_from_four_numbers_as_a_mesa() {
    let old: Outcrop = serde_json::from_str("[1.0, 2.0, 3.0, 4.0]").unwrap();
    assert_eq!(old, Outcrop { at: [1.0, 2.0], radius: 3.0, tall: 4.0, shape: Shape::Mesa, angle: 0.0 });
    let tor = Outcrop { at: [1.0, 2.0], radius: 3.0, tall: 4.0, shape: Shape::Tor, angle: 0.5 };
    let text = serde_json::to_string(&tor).unwrap();
    assert_eq!(text, r#"[1.0,2.0,3.0,4.0,"tor",0.5]"#);
    assert_eq!(serde_json::from_str::<Outcrop>(&text).unwrap(), tor);
    for wrong in ["[1.0, 2.0, 3.0]", "[1.0, 2.0, 3.0, 4.0, 0.5]", r#"[1.0, 2.0, 3.0, 4.0, "spire", 0.5]"#] {
        assert!(serde_json::from_str::<Outcrop>(wrong).is_err(), "{wrong} is refused");
    }
}
