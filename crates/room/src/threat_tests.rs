use super::*;

const NORTH: Option<[f64; 2]> = Some([0.0, -1.0]);

#[test]
fn a_reach_is_met_along_the_way_and_never_behind_or_beside_it() {
    assert!((metres_to_reach(0.0, -1_000.0, 750.0, NORTH) - 250.0).abs() < 1e-9, "dead ahead");
    assert_eq!(metres_to_reach(800.0, 0.0, 750.0, NORTH), f64::INFINITY, "abeam, the way passes it by");
    assert_eq!(metres_to_reach(0.0, 1_000.0, 750.0, NORTH), f64::INFINITY, "astern");
    assert_eq!(metres_to_reach(0.0, -500.0, 750.0, NORTH), 0.0, "inside, the way leading deeper");
    assert_eq!(metres_to_reach(0.0, 500.0, 750.0, NORTH), f64::INFINITY, "inside, the way leading out");
    assert!((metres_to_reach(0.0, -1_000.0, 750.0, None) - 250.0).abs() < 1e-9, "at rest: the straight distance");
}

#[test]
fn the_ladder_steps_down_by_fives_then_ones() {
    assert_eq!(
        [step_down(144.7), step_down(28.9), step_down(5.8), step_down(4.2), step_down(0.3)],
        [140.0, 25.0, 5.0, 4.0, 1.0]
    );
}

#[test]
fn a_voyage_eases_down_as_a_pirate_comes_near_along_her_way_and_is_held_inside_her_ring() {
    let ahead = |metres: f64| held_pace(60, [0.0, 0.0], 0.0, [[0.0, -metres]]);
    // Closing at 12 + 2.4 m/s with 0.6 s of warning: 8.64 m of her way to the pirate's 750 m sight for each step.
    assert_eq!(ahead(2_000.0), 60, "1250 m short of her sight asks no less than the pace");
    assert_eq!(ahead(1_000.0), 25, "250 m short: 28.9, down the ladder");
    assert_eq!(ahead(800.0), 5, "50 m short: 5.8");
    assert_eq!(ahead(760.0), 5, "10 m short: never under the near-enemy pace");
    assert_eq!(ahead(740.0), 5, "inside her sight, short of her hold");
    assert_eq!(ahead(690.0), 1, "inside her hold: the world's own time");
}

#[test]
fn a_pirate_off_the_way_or_astern_leaves_the_pace_alone_but_her_hold_holds_whatever_the_way() {
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [[900.0, 0.0]]), 60, "abeam, the way passes her by");
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [[0.0, 1_000.0]]), 60, "astern");
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [[0.0, 650.0]]), 1, "astern but within her hold");
    assert_eq!(held_pace(100, [0.0, 0.0], 0.0, []), 100, "an empty sea");
    assert_eq!(held_pace(0, [0.0, 0.0], 0.0, [[0.0, -100.0]]), 0, "at rest she stays at rest");
}

#[test]
fn the_nearest_ask_holds_among_several_pirates() {
    let pirates = [[0.0, -2_000.0], [0.0, -1_000.0], [3_000.0, 0.0]];
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, pirates), 25);
    let east = std::f64::consts::FRAC_PI_2;
    assert_eq!(held_pace(60, [0.0, 0.0], east, pirates), 60, "heading east, the two to the north are passed by");
}
