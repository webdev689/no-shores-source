use super::*;

const NORTH: [f64; 2] = [0.0, -1.0];

#[test]
fn a_reach_is_met_along_the_way_and_never_behind_or_beside_it() {
    assert!((metres_to_reach(0.0, -1_000.0, 750.0, NORTH) - 250.0).abs() < 1e-9, "dead ahead");
    assert_eq!(metres_to_reach(800.0, 0.0, 750.0, NORTH), f64::INFINITY, "abeam, the way passes it by");
    assert_eq!(metres_to_reach(0.0, 1_000.0, 750.0, NORTH), f64::INFINITY, "astern");
    assert_eq!(metres_to_reach(0.0, -500.0, 750.0, NORTH), 0.0, "inside, the way leading deeper");
    assert_eq!(metres_to_reach(0.0, 500.0, 750.0, NORTH), f64::INFINITY, "inside, the way leading out");
}

#[test]
fn the_ladder_steps_down_by_fives() {
    assert_eq!([step_down(144.7), step_down(28.9), step_down(5.8), step_down(4.2)], [140.0, 25.0, 5.0, 0.0]);
}

#[test]
fn a_voyage_eases_down_as_a_hostile_comes_near_along_its_way_and_is_held_inside_its_ring() {
    let ahead = |metres: f64| held_pace(60, [0.0, 0.0], 0.0, [([0.0, -metres], true)]);
    // Closing at 12 + 2.4 m/s with 0.6 s of warning: 8.64 m of its way to the hostile's 750 m sight for each step.
    assert_eq!(ahead(2_000.0), 60, "1250 m short of its sight asks no less than the pace");
    assert_eq!(ahead(1_000.0), 25, "250 m short: 28.9, down the ladder");
    assert_eq!(ahead(800.0), 5, "50 m short: 5.8");
    assert_eq!(ahead(760.0), 5, "10 m short: never under the near-enemy pace");
    assert_eq!(ahead(740.0), 5, "inside its sight, short of its hold");
    assert_eq!(ahead(690.0), 1, "inside its hold: the world's own time");
}

#[test]
fn a_hostile_off_the_way_or_astern_leaves_the_pace_alone_but_its_hold_holds_whatever_the_way() {
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [([900.0, 0.0], true)]), 60, "abeam, the way passes it by");
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [([0.0, 1_000.0], true)]), 60, "astern");
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, [([0.0, 650.0], true)]), 1, "astern but within its hold");
    assert_eq!(held_pace(100, [0.0, 0.0], 0.0, [] as [([f64; 2], bool); 0]), 100, "an empty sea");
    assert_eq!(held_pace(0, [0.0, 0.0], 0.0, [([0.0, -100.0], true)]), 0, "at rest it stays at rest");
}

#[test]
fn the_nearest_ask_holds_among_several_hostiles() {
    let hostiles = [([0.0, -2_000.0], true), ([0.0, -1_000.0], true), ([3_000.0, 0.0], true)];
    assert_eq!(held_pace(60, [0.0, 0.0], 0.0, hostiles), 25);
    let east = std::f64::consts::FRAC_PI_2;
    assert_eq!(held_pace(60, [0.0, 0.0], east, hostiles), 60, "heading east, the two to the north are passed by");
}

#[test]
fn a_ship_that_will_not_engage_caps_the_pace_by_the_ladder_but_never_holds_it() {
    let wary = |east: f64, south: f64, heading: f64| held_pace(60, [0.0, 0.0], heading, [([east, south], false)]);
    assert_eq!(wary(0.0, -650.0, 0.0), FOE_PACE as u16, "inside its ring, the way leading deeper: the ladder's floor");
    assert_eq!(wary(553.0, 0.0, 0.0), FOE_PACE as u16, "passing 553 m abeam, still closing its sight");
    assert_eq!(wary(0.0, 650.0, 0.0), 60, "inside its ring, the way leading out of its sight");
    assert_eq!(
        held_pace(60, [0.0, 0.0], 0.0, [([0.0, 650.0], false), ([0.0, 690.0], true)]),
        1,
        "one that engages holds"
    );
}

#[test]
fn past_the_hold_reach_no_hostile_ahead_slows_the_fastest_pace_and_within_it_one_does() {
    let reach = hold_reach_m();
    let most = *crate::sea::PACES.iter().max().unwrap();
    let ahead = |metres: f64| held_pace(most, [0.0, 0.0], 0.0, [([0.0, -metres], false)]);
    assert_eq!(ahead(reach + 1.0), most, "past it, it sails at its pace");
    assert!(ahead(reach - 10.0) < most, "within it, the ladder holds it");
}
