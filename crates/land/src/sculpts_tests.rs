//! The sculpts' tests: floors, cliffs, climbs, runs, wings, fades and the seams between them.

use super::*;

fn sculpt() -> Sculpts {
    let claim = vec![[-500.0, -500.0], [500.0, -500.0], [500.0, 500.0], [-500.0, 500.0]];
    Sculpts::from(vec![Sculpt {
        claim,
        floors: vec![[0.0, 0.0, 0.0, 0.0, 60.0], [0.0, 0.0, 300.0, 0.0, 12.0]],
        outcrops: vec![[20.0, 20.0, 10.0, 12.0]],
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
