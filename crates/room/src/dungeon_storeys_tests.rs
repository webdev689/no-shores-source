use super::*;
use crate::Floor;
use dungeon::hand_made::{VOID_AT, two_storeys};
use dungeon::{CELL_M, Side};
use movement::{Body, Controls, Mode, TICK_SECONDS, standing, step_body};

/// How far a running body moves in a tick: it stops within one of a wall's half-width line.
const TICK_RUN: f64 = TUNING.run * TICK_SECONDS;

fn ground() -> DungeonGround {
    DungeonGround::of(&two_storeys()).unwrap()
}

/// A cell's middle in metres, by its column and row.
fn middle(column: usize, row: usize) -> [f64; 2] {
    [(column as f64 + 0.5) * CELL_M, (row as f64 + 0.5) * CELL_M]
}

/// A body stepped `ticks` ticks running the way `side` faces from `from` with its feet at `z`, never jumping; and the
/// highest its feet rose over where they were the tick before.
fn run(ground: &DungeonGround, from: [f64; 2], z: f64, side: Side, ticks: u32) -> (Body, f64) {
    let controls = Controls { forward: 1.0, yaw: side.bearing(), run: true, ..Controls::default() };
    let start = Body { z, ..standing(from[0], from[1]) };
    (0..ticks).fold((start, f64::NEG_INFINITY), |(body, rise), _| {
        let next = step_body(&body, &controls, &[], ground, TICK_SECONDS);
        (next, rise.max(next.z - body.z))
    })
}

#[test]
fn a_body_walks_down_the_flight_to_the_lower_storey_and_back_up_without_a_jump() {
    let ground = ground();
    let (down, _) = run(&ground, middle(9, 3), 0.0, Side::South, 300);
    // Down the flight and on across the lower landing to its rock.
    assert_eq!(down.z, -8.0, "on the lower storey's floor");
    assert!((down.y - (11.0 * CELL_M - TUNING.radius)).abs() < TICK_RUN, "at the rock past the landing: {}", down.y);
    assert_eq!(down.mode, Mode::Ground);
    let (up, rise) = run(&ground, [down.x, down.y], down.z, Side::North, 300);
    assert_eq!(up.z, 0.0, "back on the top storey");
    assert!((up.y - (CELL_M + TUNING.radius)).abs() < TICK_RUN, "across room 1 to its north wall: {}", up.y);
    assert!(rise < TUNING.step, "walked up, never jumped: {rise}");
}

#[test]
fn a_body_walks_off_a_voids_edge_and_falls_to_the_floor_under_it() {
    let ground = ground();
    let (fallen, _) = run(&ground, middle(VOID_AT.0, 2), 0.0, Side::South, 240);
    assert_eq!(fallen.z, -8.0);
    assert!(fallen.y > 4.0 * CELL_M, "on into room 2: {}", fallen.y);
    assert_eq!(ground.height_under(middle(VOID_AT.0, VOID_AT.1)[0], middle(VOID_AT.0, VOID_AT.1)[1], 0.0), -8.0);
}

#[test]
fn a_body_on_the_lower_storey_is_walled_by_its_rock_under_the_open_floor_over_it() {
    let ground = ground();
    // Room 2's north wall at row 4, under room 0's open floor at row 3.
    let (walled, _) = run(&ground, middle(3, 5), -8.0, Side::North, 120);
    assert!((walled.y - (4.0 * CELL_M + TUNING.radius)).abs() < TICK_RUN, "{}", walled.y);
    assert_eq!(walled.z, -8.0);
    // And room 0's floor over it is no ceiling the body stands on.
    assert_eq!(ground.height_under(middle(3, 4)[0], middle(3, 4)[1], -8.0), -8.0);
    assert_eq!(ground.height_under(middle(3, 4)[0], middle(3, 4)[1], 0.0), 0.0);
}

#[test]
fn a_line_and_a_shot_from_one_storey_to_the_other_are_stopped_by_the_slab() {
    let ground = ground();
    let ([x, from_y], [_, to_y]) = (middle(3, 2), middle(3, 6));
    let (from, to) = ([x, from_y, 1.5], [x, to_y, -6.5]);
    assert!(ground.line_walled(from, to), "sight through the slab");
    let share = ground.wall_entry(from, to).expect("the shot meets the slab");
    let at_z = from[2] + (to[2] - from[2]) * share;
    assert!(at_z.abs() < 1e-9, "at room 0's floor: {at_z}");
    // Within a storey, and down through the Void, a line is clear.
    let ([low_x, low_y], [far_x, far_y]) = (middle(3, 5), middle(5, 8));
    assert!(!ground.line_walled([low_x, low_y, -6.5], [far_x, far_y, -6.5]));
    let [void_x, void_y] = middle(VOID_AT.0, VOID_AT.1);
    assert!(!ground.line_walled([void_x, void_y, 1.5], [void_x, void_y, -7.0]));
    assert!(ground.wall_entry([void_x, void_y, 1.5], [void_x, void_y, -7.0]).is_none());
}

#[test]
fn a_drop_or_a_shot_on_the_lower_storey_rests_on_its_floor_and_its_solids_stand_there() {
    let ground = ground();
    let floor = Floor::Dungeon(Box::new(ground.clone()));
    let [x, y] = middle(3, 4);
    assert_eq!(movement::blocks::ground_at(&[] as &[movement::Block], &floor, x, y, -7.0), -8.0);
    assert_eq!(floor.floor_under(x, y, -7.0), -8.0);
    assert_eq!(floor.height_at(x, y), 0.0, "the top storey's floor over it");
    // The pillar at (4, 7) stands on the lower storey alone.
    let (pillar_x, pillar_y) = (4.0 * CELL_M, 7.0 * CELL_M);
    assert!(floor.depth_in_solid(pillar_x, pillar_y, -8.0) > 0.0);
    assert_eq!(ground.depth_in_solid(pillar_x, pillar_y, 0.0), 0.0);
    assert!(ground.clear_between(middle(3, 6), middle(3, 8), 0.0, 1), "open on the lower storey");
    assert!(!ground.clear_between(middle(3, 6), middle(3, 8), 0.0, 0), "rock on the top one");
    assert!(!ground.clear_between([pillar_x - 2.0, pillar_y], [pillar_x + 2.0, pillar_y], 0.0, 1));
}

#[test]
fn a_foes_path_from_the_top_storey_to_the_lower_goes_by_the_flight() {
    let laid = two_storeys();
    let floor = Floor::of_dungeon(&laid).unwrap();
    let (width, depth) = (laid.columns as f64 * CELL_M, laid.rows as f64 * CELL_M);
    let ([x, y], _) = laid.arrival();
    let ring = vec![[0.0, 0.0], [width, 0.0], [width, depth], [0.0, depth]];
    let section = reach::Section { ring, spawns: vec![[x, y]], falls_kill: false };
    let nav = crate::dungeon_room::baked(&floor, &[], (x, y), &section);
    for from in [middle(9, 3), middle(3, 2)] {
        let to = middle(5, 8);
        let path = nav.find_path([from[0], from[1], 0.0], [to[0], to[1], -8.0]).expect("a way down");
        let (first, last) = (path[0], path[path.len() - 1]);
        assert!(first[2].abs() < 0.3 && (last[2] + 8.0).abs() < 0.3, "{path:?}");
        for pair in path.windows(2) {
            let across = ((pair[1][0] - pair[0][0]).powi(2) + (pair[1][1] - pair[0][1]).powi(2)).sqrt();
            let fall = (pair[1][2] - pair[0][2]).abs();
            assert!(fall <= 0.7 * across + 0.3, "no drop through the Void, only the slope: {pair:?}");
        }
        let [flight_x, _] = middle(9, 7);
        assert!(path.iter().any(|point| (point[0] - flight_x).abs() < CELL_M / 2.0 && point[1] > 6.0 * CELL_M));
    }
}
