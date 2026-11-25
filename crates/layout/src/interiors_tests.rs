//! A building's interior: its storeys, its lining, its doors' gaps and its stair.

use super::*;

fn room(top: f64) -> Room {
    Room { cells: [0, 0, 10, 10], xs: [0.0, 8.0], zs: [0.0, 6.0], base: 0.0, top }
}

#[test]
fn a_room_stands_a_storey_for_every_three_metres_it_leaves_room_for() {
    assert_eq!(floors_of(&room(3.5)), [0.0]);
    assert_eq!(floors_of(&room(6.65)), [0.0, STOREY_M]);
}

#[test]
fn a_span_cut_by_a_door_leaves_the_wall_either_side() {
    assert_eq!(cut([0.0, 10.0], [4.0, 5.5]), [[0.0, 4.0], [5.5, 10.0]]);
    assert_eq!(cut([0.0, 3.0], [4.0, 5.0]), [[0.0, 3.0]]);
    assert_eq!(cut([4.2, 5.0], [4.0, 5.5]), Vec::<[f64; 2]>::new());
}

#[test]
fn a_stair_stands_clear_of_the_doors_in_its_wall() {
    // A long room with a door near the middle of each long wall, as a curved hall's (model 703).
    let room = Room { cells: [0; 4], xs: [9.6, 19.2], zs: [-12.8, 6.4], base: 0.0, top: 6.45 };
    let door = |x: f64, z: [f64; 2], out: f64| Door {
        top: [x, 2.3, z[0]],
        sill: [x, 0.05, z[0]],
        sill_end: [x, 0.05, z[1]],
        out: [out, 0.0, 0.0],
    };
    let doors = [door(9.6, [-6.75, -8.0], -1.0), door(19.2, [-9.25, -8.0], 1.0)];
    let stair = stair_of(&room, &doors);
    let [low, high] = stair.run();
    let wall = if stair.side[0] < 14.4 { 9.6 } else { 19.2 };
    for (span, _, _) in doors_in(&doors, false, wall, if wall < 14.4 { -1.0 } else { 1.0 }) {
        assert!(span[1] < low - 1.0 || span[0] > high + 1.0, "{span:?} by the run {low}..{high}");
    }
    assert!(low >= room.zs[0] && high <= room.zs[1], "within the room");
}

#[test]
fn a_tall_room_is_lined_over_a_lower_room_beside_it_and_open_into_it_below() {
    // Two wings 4 m square on one floor, side by side along x: one to 9.68 m, one to 6.65 m.
    let wing = |eaves: f64, rect: Vec<f64>| Wing {
        eaves,
        ridge: eaves + 3.0,
        low: None,
        steps: false,
        platform: false,
        rects: vec![rect],
    };
    let measure = Measure {
        min: [0.0, 0.0, 0.0],
        max: [8.0, 12.0, 4.0],
        grid: Some([20, 10]),
        plan: vec![wing(9.68, vec![0.0, 0.0, 10.0, 10.0]), wing(6.65, vec![10.0, 0.0, 20.0, 10.0])],
        doors: Vec::new(),
    };
    let plan = rooms_of(&measure).expect("a plan");
    let mut built = Built::default();
    line(&Frame { origin: [0.0; 3], cosine: 1.0, sine: 0.0 }, &plan, &[], &mut built);
    // The tall room's lining on the shared side, x 4 m, inside it.
    let shared: Vec<[f64; 6]> = built
        .solids
        .iter()
        .map(Solid::bounds)
        .filter(|[west, _, east, ..]| *west > 3.5 && *east < 4.0 + 1e-6)
        .collect();
    assert!(shared.iter().all(|bounds| bounds[4] >= 6.65 - 1e-6), "open into the lower room below its top: {shared:?}");
    let covered = shared.iter().any(|bounds| bounds[4] <= 6.65 + 1e-6 && bounds[5] >= 9.68 - CEILING_M - 1e-6);
    assert!(covered, "lined from the lower room's top to the ceiling: {shared:?}");
}

#[test]
fn a_quarter_turned_frame_takes_the_plan_s_forward_to_the_east() {
    let frame = Frame { origin: [100.0, 200.0, 0.0], cosine: 0.0, sine: 1.0 };
    assert_eq!(frame.world(0.0, 1.0), [101.0, 200.0]);
}
