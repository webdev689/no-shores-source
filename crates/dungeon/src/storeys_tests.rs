use crate::hand_made::{ROOM_HEIGHT_M, VOID_AT, two_storeys};
use crate::{CELL_M, Cell, Dungeon, FLIGHT_CEILING_M, FLOOR_M, STYLES, Span, storey_floor};

#[test]
fn a_forged_dungeon_is_one_storey_with_its_floor_at_nought() {
    for seed in 0..40_u32 {
        let dungeon = Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]);
        assert_eq!(dungeon.storeys, 1);
        assert!(dungeon.stairs.is_empty());
        assert_eq!(dungeon.cells.len(), dungeon.plane());
        assert!(dungeon.rooms.iter().all(|room| room.storey == 0));
        assert!(dungeon.boxes().iter().all(|solid| solid[4] == FLOOR_M && solid[5] > FLOOR_M));
        for cell in 0..dungeon.plane() {
            let spans = dungeon.spans(cell);
            if dungeon.cells[cell] == Cell::Rock {
                assert!(spans.is_empty());
            } else {
                assert_eq!(spans, [Span { storey: 0, floor: 0.0, ceiling: dungeon.ceilings[cell], stair: None }]);
            }
        }
    }
}

#[test]
fn the_hand_made_dungeon_numbers_its_cells_storey_by_storey() {
    let dungeon = two_storeys();
    let plane = dungeon.plane();
    assert_eq!(dungeon.cells.len(), 2 * plane);
    let lower = &dungeon.rooms[2];
    assert_eq!(lower.storey, 1);
    assert!(lower.cells.iter().all(|&cell| dungeon.storey_of(cell) == 1 && dungeon.floor_of(cell) == -8.0));
    let corner = plane + 4 * dungeon.columns + 2;
    assert_eq!(dungeon.centre(corner), dungeon.centre(corner - plane));
    assert_eq!(dungeon.standing_point(corner), [2.5 * CELL_M, 4.5 * CELL_M, -8.0]);
    assert_eq!(dungeon.beside(corner, crate::Side::West), Some(corner - 1));
    assert_eq!(dungeon.beside(corner, crate::Side::North), Some(corner - dungeon.columns));
    assert_eq!(dungeon.look_at(corner), Some(0));
}

#[test]
fn the_walk_crosses_the_flight_to_the_lower_storey() {
    let dungeon = two_storeys();
    let walks: Vec<u32> = dungeon.rooms.iter().map(|room| room.walk).collect();
    assert_eq!(walks[0], 0);
    assert!(walks[1] > walks[0] && walks[2] > walks[1] && walks[2] < u32::MAX, "{walks:?}");
}

#[test]
fn a_flight_falls_a_storey_along_its_length_and_stays_level_past_its_ends() {
    let dungeon = two_storeys();
    let stair = dungeon.stairs[0];
    let x = 9.5 * CELL_M;
    assert_eq!(stair.slope_at(dungeon.columns, x, 6.0 * CELL_M), 0.0);
    assert!((stair.slope_at(dungeon.columns, x, 8.0 * CELL_M) + 4.0).abs() < 1e-12);
    assert_eq!(stair.slope_at(dungeon.columns, x, 10.0 * CELL_M), -8.0);
    assert_eq!(stair.slope_at(dungeon.columns, x, 5.5 * CELL_M), 0.0);
    assert_eq!(stair.slope_at(dungeon.columns, x, 10.5 * CELL_M), -8.0);
    let head = dungeon.spans(stair.cells[0]);
    assert_eq!((head.len(), head[0].storey, head[0].stair, head[0].ceiling), (1, 0, Some(0), FLIGHT_CEILING_M));
    assert!((head[0].floor + 2.0).abs() < 1e-12);
    assert!((dungeon.span_floor(&head[0], x, 6.5 * CELL_M) + 1.0).abs() < 1e-12);
    assert_eq!(dungeon.stair_twin(stair.cells[3]), Some(dungeon.plane() + stair.cells[3]));
    assert_eq!(dungeon.stair_twin(dungeon.plane() + stair.cells[3]), Some(stair.cells[3]));
}

#[test]
fn a_column_holds_a_span_for_each_open_storey_and_a_void_lifts_the_one_under_it() {
    let dungeon = two_storeys();
    let at = |x: usize, y: usize| y * dungeon.columns + x;
    let lower = Span { storey: 1, floor: -8.0, ceiling: -8.0 + ROOM_HEIGHT_M, stair: None };
    let upper = Span { storey: 0, floor: 0.0, ceiling: ROOM_HEIGHT_M, stair: None };
    assert_eq!(dungeon.spans(at(3, 4)), [lower, upper]);
    assert_eq!(dungeon.spans(at(VOID_AT.0, VOID_AT.1)), [Span { ceiling: ROOM_HEIGHT_M, ..lower }]);
    assert_eq!(dungeon.spans(at(3, 6)), [lower]);
    assert_eq!(dungeon.spans(at(1, 1)), [upper]);
    assert!(dungeon.spans(at(0, 0)).is_empty());
}

#[test]
fn a_solid_stands_on_the_floor_of_its_own_storey() {
    let dungeon = two_storeys();
    let boxes = dungeon.boxes();
    let pillar = boxes.iter().find(|solid| solid[5] == storey_floor(1) + ROOM_HEIGHT_M).unwrap();
    assert_eq!(pillar[4], -8.0);
    assert!(boxes.iter().filter(|solid| solid[5] > 0.0).all(|solid| solid[4] == 0.0));
    assert!(boxes.iter().any(|solid| solid[4] == -8.0 && solid[5] == -8.0 + 3.2), "the lower corridor's jambs");
}

#[test]
fn a_height_finds_its_storey() {
    let dungeon = two_storeys();
    assert_eq!(dungeon.storey_at(1.5), 0);
    assert_eq!(dungeon.storey_at(-3.9), 0);
    assert_eq!(dungeon.storey_at(-4.1), 1);
    assert_eq!(dungeon.storey_at(-30.0), 1);
}
