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
            let (east, south) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
            let across = (east * east + south * south).sqrt();
            let fall = (pair[1][2] - pair[0][2]).abs();
            assert!(fall <= 0.7 * across + 0.3, "no drop through the Void, only the slope: {pair:?}");
        }
        let [flight_x, _] = middle(9, 7);
        assert!(path.iter().any(|point| (point[0] - flight_x).abs() < CELL_M / 2.0 && point[1] > 6.0 * CELL_M));
    }
}

#[test]
fn a_body_leaping_high_in_a_tall_lower_room_keeps_to_its_storey() {
    let mut laid = two_storeys();
    let lower: Vec<usize> = laid.rooms[2].cells.clone();
    lower.iter().for_each(|&cell| laid.ceilings[cell] = 5.6);
    let ground = DungeonGround::of(&laid).unwrap();
    // Over half way up to the floor over it, the feet are still the lower room's.
    let [x, y] = middle(3, 6);
    assert_eq!(ground.storey_of_feet(x, y, -3.6), 1);
    assert!(!ground.walled_at((x, y), (x, y + 0.1), -3.6), "the top storey's rock is not its wall");
}

#[test]
fn a_flight_walls_a_body_beside_it_or_past_its_ends_its_half_width_off_as_the_page_draws_it() {
    let mut laid = two_storeys();
    let (plane, columns) = (laid.plane(), laid.columns);
    let at = |storey: usize, x: usize, y: usize| storey * plane + y * columns + x;
    // Corridors beside the flight on the top storey, past its foot on the top storey and before its head on the lower.
    for cell in [at(0, 10, 6), at(0, 9, 10), at(1, 9, 5)] {
        laid.cells[cell] = dungeon::Cell::Corridor;
        laid.ceilings[cell] = dungeon::CORRIDOR_HEIGHT_M;
    }
    let ground = DungeonGround::of(&laid).unwrap();
    let (beside, _) = run(&ground, middle(10, 6), 0.0, Side::West, 120);
    assert!((beside.x - (10.0 * CELL_M + TUNING.radius)).abs() < TICK_RUN, "beside it: {}", beside.x);
    assert_eq!(beside.z, 0.0);
    let (past_foot, _) = run(&ground, middle(9, 10), 0.0, Side::North, 120);
    assert!((past_foot.y - (10.0 * CELL_M + TUNING.radius)).abs() < TICK_RUN, "past its foot: {}", past_foot.y);
    let (before_head, _) = run(&ground, middle(9, 5), -8.0, Side::South, 120);
    assert!((before_head.y - (6.0 * CELL_M - TUNING.radius)).abs() < TICK_RUN, "before its head: {}", before_head.y);
    // And from the flight, its side is rock to a body on it.
    let (on_flight, _) = run(&ground, middle(9, 6), -1.0, Side::East, 120);
    assert!((on_flight.x - (10.0 * CELL_M - TUNING.radius)).abs() < TICK_RUN, "on it: {}", on_flight.x);
    let [x, y] = middle(10, 6);
    assert!(!ground.clear_between(middle(10, 6), middle(9, 6), 0.0, 0), "a line from beside it onto it");
    assert!(!ground.clear_between([x, y], [10.0 * CELL_M + 0.1, y], TUNING.radius, 0), "a line beside its side");
    // From its own landings a flight is open still.
    assert!(ground.clear_between(middle(9, 5), middle(9, 6), TUNING.radius, 0));
    assert!(ground.clear_between(middle(9, 10), middle(9, 9), TUNING.radius, 1));
}

#[test]
fn a_column_open_only_on_a_lower_storey_is_capped_from_its_ceiling_to_a_walls_height_over_the_top_storey() {
    let ground = ground();
    let slabs = ground.slabs();
    let over = |column: usize, row: usize| {
        let [x, y] = middle(column, row);
        let holds = |slab: &&movement::Block| slab.min_x < x && x < slab.max_x && slab.min_y < y && y < slab.max_y;
        slabs.iter().filter(holds).map(|slab| (slab.bottom, slab.top)).collect::<Vec<_>>()
    };
    let wall_top = dungeon::storey_floor(0) + WALL_RISE_M;
    assert_eq!(over(3, 6), vec![(-4.0, wall_top)], "rock over room 2 alone");
    assert_eq!(over(3, 4), vec![(-4.0, 0.0)], "the slab under room 0 and nothing over it");
    assert_eq!(over(3, 2), Vec::<(f64, f64)>::new(), "room 0 alone, open over it as a line is");
    let flight = over(9, 7);
    assert_eq!(flight.len(), 1);
    assert_eq!(flight[0].1, wall_top, "over the flight's ceiling");
}

#[test]
fn a_line_high_in_a_tall_lower_room_is_walled_by_its_own_storeys_rock_alone() {
    let mut laid = two_storeys();
    let lower: Vec<usize> = laid.rooms[2].cells.clone();
    lower.iter().for_each(|&cell| laid.ceilings[cell] = 5.6);
    let ground = DungeonGround::of(&laid).unwrap();
    // 4.4 m over the lower floor, nearer the top storey's floor, under the top storey's rock.
    let ([x, from_y], [_, to_y]) = (middle(3, 5), middle(3, 7));
    assert!(!ground.line_walled([x, from_y, -3.6], [x, to_y, -3.6]), "open across the lower room");
}
