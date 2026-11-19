use crate::dungeon::{DOORWAY_HALF_M, JAMB_DEPTH_M, TORCH_M};
use crate::{BLOCK_CELLS, CELL_M, Cell, Dungeon, PER_PATROL, Room, SIDES, STYLES, Shape, Side, WayIn, name, of_patrol};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count).map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]))
}

#[test]
fn every_dungeon_is_three_or_four_blocks_side_by_side_and_one_walk_from_its_way_in() {
    for dungeon in every_dungeon(600) {
        assert!((3..=4).contains(&dungeon.squares.len()));
        for (number, square) in dungeon.squares.iter().enumerate().skip(1) {
            let touches = dungeon.squares[..number]
                .iter()
                .any(|other| square.0.abs_diff(other.0) + square.1.abs_diff(other.1) == 1);
            assert!(touches, "each block beside one laid before it");
        }
        let mut reached = vec![false; dungeon.cells.len()];
        let mut todo = vec![dungeon.way_in.cell];
        reached[dungeon.way_in.cell] = true;
        while let Some(cell) = todo.pop() {
            for side in SIDES {
                if let Some(next) = dungeon.beside(cell, side)
                    && dungeon.cells[next] != Cell::Rock
                    && !reached[next]
                {
                    reached[next] = true;
                    todo.push(next);
                }
            }
        }
        for (cell, kind) in dungeon.cells.iter().enumerate() {
            assert!(*kind == Cell::Rock || reached[cell], "every open cell is walked to from the way in");
        }
        assert!(dungeon.rooms.iter().all(|room| room.walk < u32::MAX));
    }
}

#[test]
fn a_square_no_block_stands_on_is_rock() {
    for dungeon in every_dungeon(200) {
        for cell in 0..dungeon.cells.len() {
            let square = ((cell % dungeon.columns) / BLOCK_CELLS, (cell / dungeon.columns) / BLOCK_CELLS);
            if !dungeon.squares.contains(&square) {
                assert_eq!(dungeon.cells[cell], Cell::Rock);
            }
        }
    }
}

#[test]
fn the_same_seed_lays_the_same_dungeon() {
    for style in STYLES {
        assert_eq!(Dungeon::forge(9, style), Dungeon::forge(9, style));
        assert_ne!(Dungeon::forge(9, style), Dungeon::forge(10, style));
    }
}

#[test]
fn the_way_in_stands_its_door_on_rock_and_a_body_arrives_before_it_facing_in() {
    for dungeon in every_dungeon(300) {
        let way = dungeon.way_in;
        assert_eq!(dungeon.room_at(way.cell), Some(way.room));
        assert_eq!(dungeon.rooms[way.room].walk, 0);
        let behind = dungeon.beside(way.cell, way.side).unwrap();
        assert_eq!(dungeon.cells[behind], Cell::Rock);
        let ([x, y], facing) = dungeon.arrival();
        let [door_x, door_y] = dungeon.exit_door();
        let column = (x / CELL_M) as usize + (y / CELL_M) as usize * dungeon.columns;
        assert_eq!(column, way.cell, "the arrival stands in the door's cell");
        assert!((door_x - x) * facing[0] + (door_y - y) * facing[1] < 0.0, "facing away from the door");
        let [middle_x, middle_y] = dungeon.centre(way.cell);
        let [dx, dy] = way.side.unit();
        let out = (door_x - middle_x) * dx + (door_y - middle_y) * dy;
        let along = (door_x - middle_x) * -dy + (door_y - middle_y) * dx;
        assert!(out > CELL_M / 2.0 - 0.05 && out < CELL_M / 2.0 && along.abs() < 1e-9, "the door on its wall's middle");
    }
}

#[test]
fn torches_stand_on_rock_walls_over_head_height_never_on_the_exit_door() {
    for dungeon in every_dungeon(300) {
        assert!(!dungeon.torches.is_empty());
        for torch in &dungeon.torches {
            let cell = (torch.at[0] / CELL_M) as usize + (torch.at[1] / CELL_M) as usize * dungeon.columns;
            assert_ne!(dungeon.cells[cell], Cell::Rock, "a torch's cell is open");
            assert!(dungeon.beside(cell, torch.wall).is_none_or(|next| dungeon.cells[next] == Cell::Rock));
            assert!((cell, torch.wall) != (dungeon.way_in.cell, dungeon.way_in.side));
            assert!((torch.at[2] - TORCH_M).abs() < 1e-12);
        }
        let lit_rooms = dungeon
            .rooms
            .iter()
            .filter(|room| {
                room.cells.iter().any(|&cell| {
                    dungeon.torches.iter().any(|torch| {
                        (torch.at[0] / CELL_M) as usize + (torch.at[1] / CELL_M) as usize * dungeon.columns == cell
                    })
                })
            })
            .count();
        assert_eq!(lit_rooms, dungeon.rooms.len(), "every room carries a torch");
    }
}

#[test]
fn a_doorway_narrows_to_its_frame_and_its_jambs_stand_in_the_corridor() {
    for dungeon in every_dungeon(100) {
        let boxes = dungeon.boxes();
        assert_eq!(boxes.len(), dungeon.frames.len() * 2 + dungeon.pillars.len());
        for (frame, pair) in dungeon.frames.iter().zip(boxes.chunks(2)) {
            assert!(dungeon.room_at(frame.cell).is_some());
            assert_eq!(dungeon.cells[dungeon.beside(frame.cell, frame.side).unwrap()], Cell::Corridor);
            let [dx, _] = frame.side.unit();
            let across = |jamb: &[f64; 5]| if dx == 0.0 { (jamb[0], jamb[2]) } else { (jamb[1], jamb[3]) };
            let deep = |jamb: &[f64; 5]| if dx == 0.0 { jamb[3] - jamb[1] } else { jamb[2] - jamb[0] };
            let (first, second) = (across(&pair[0]), across(&pair[1]));
            let gap = second.0.max(first.0) - second.1.min(first.1);
            assert!((gap - 2.0 * DOORWAY_HALF_M).abs() < 1e-9, "the way between the jambs is {gap}");
            assert!((deep(&pair[0]) - JAMB_DEPTH_M).abs() < 1e-9 && (deep(&pair[1]) - JAMB_DEPTH_M).abs() < 1e-9);
            assert!(pair.iter().all(|jamb| jamb[4] == frame.height));
            let corridor = dungeon.beside(frame.cell, frame.side).unwrap();
            let [middle_x, middle_y] = dungeon.centre(corridor);
            let half = CELL_M / 2.0;
            let mut spans: Vec<(f64, f64)> = pair
                .iter()
                .map(|jamb| {
                    assert!(
                        jamb[0] >= middle_x - half - 1e-9 && jamb[2] <= middle_x + half + 1e-9,
                        "inside the corridor"
                    );
                    assert!(
                        jamb[1] >= middle_y - half - 1e-9 && jamb[3] <= middle_y + half + 1e-9,
                        "inside the corridor"
                    );
                    let [ex, ey] = frame.side.unit();
                    let near = if ex != 0.0 {
                        if ex > 0.0 { jamb[0] } else { jamb[2] }
                    } else if ey > 0.0 {
                        jamb[1]
                    } else {
                        jamb[3]
                    };
                    let edge = if ex != 0.0 { middle_x - ex * half } else { middle_y - ey * half };
                    assert!((near - edge).abs() < 1e-9, "a jamb stands against the doorway's edge");
                    if ex != 0.0 {
                        (jamb[1] - middle_y, jamb[3] - middle_y)
                    } else {
                        (jamb[0] - middle_x, jamb[2] - middle_x)
                    }
                })
                .collect();
            spans.sort_by(|a, b| a.0.total_cmp(&b.0));
            for ((low, high), (want_low, want_high)) in
                spans.into_iter().zip([(-half, -DOORWAY_HALF_M), (DOORWAY_HALF_M, half)])
            {
                assert!(
                    (low - want_low).abs() < 1e-9 && (high - want_high).abs() < 1e-9,
                    "jambs from 0.9 m to 1.6 m out"
                );
            }
        }
    }
}

#[test]
fn a_rooms_walk_is_the_fewest_cells_crossed_from_the_way_in() {
    // A row: the way in's room, two corridor cells, a room of two, rock; then a corridor turning down to a third room.
    let room = |cells: Vec<usize>| Room {
        x: 0,
        y: 0,
        width: 1,
        depth: 1,
        cells,
        quiet: Vec::new(),
        height: 3.2,
        shape: Shape::Rectangle,
        walk: 0,
    };
    let (rock, corridor) = (Cell::Rock, Cell::Corridor);
    let mut laid = Dungeon {
        style: STYLES[0],
        squares: vec![(0, 0)],
        columns: 6,
        rows: 2,
        cells: vec![
            Cell::Room(0),
            corridor,
            corridor,
            Cell::Room(1),
            Cell::Room(1),
            rock,
            rock,
            rock,
            corridor,
            rock,
            rock,
            Cell::Room(2),
        ],
        ceilings: vec![3.2; 12],
        rooms: vec![room(vec![0]), room(vec![3, 4]), room(vec![11])],
        way_in: WayIn { cell: 0, side: Side::West, room: 0 },
        torches: Vec::new(),
        frames: Vec::new(),
        pillars: Vec::new(),
    };
    laid.walk();
    assert_eq!(laid.rooms.iter().map(|room| room.walk).collect::<Vec<_>>(), [0, 3, u32::MAX]);
    laid.cells[9] = corridor;
    laid.cells[10] = corridor;
    laid.walk();
    assert_eq!(laid.rooms.iter().map(|room| room.walk).collect::<Vec<_>>(), [0, 3, 6]);
    assert_eq!(laid.end(), 2);
}

#[test]
fn a_quiet_cell_is_a_rooms_cell_beside_no_corridor_and_every_other_is_beside_one() {
    for dungeon in every_dungeon(200) {
        for room in &dungeon.rooms {
            for &cell in &room.cells {
                let busy = SIDES
                    .into_iter()
                    .any(|side| dungeon.beside(cell, side).is_some_and(|next| dungeon.cells[next] == Cell::Corridor));
                assert_eq!(room.quiet.contains(&cell), !busy);
            }
        }
    }
}

#[test]
fn pillars_stand_on_every_second_inner_corner_of_a_great_room_four_of_its_own_cells_round_each() {
    let mut stood = 0;
    for dungeon in every_dungeon(300) {
        let own = |x: usize, y: usize| dungeon.room_at(y * dungeon.columns + x);
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let mut want = Vec::new();
            if room.width >= 4 && room.depth >= 4 {
                for y in (room.y + 2..room.y + room.depth - 1).step_by(2) {
                    for x in (room.x + 2..room.x + room.width - 1).step_by(2) {
                        if [own(x, y), own(x - 1, y), own(x, y - 1), own(x - 1, y - 1)]
                            .iter()
                            .all(|&at| at == Some(number))
                        {
                            want.push([x as f64 * CELL_M, y as f64 * CELL_M, room.height]);
                        }
                    }
                }
            }
            let inside = |pillar: &&[f64; 3]| {
                let (x, y) = ((pillar[0] / CELL_M) as usize, (pillar[1] / CELL_M) as usize);
                x > room.x && x < room.x + room.width && y > room.y && y < room.y + room.depth
            };
            let found: Vec<[f64; 3]> = dungeon.pillars.iter().filter(inside).copied().collect();
            assert_eq!(found, want);
            stood += want.len();
        }
    }
    assert!(stood > 0, "some great rooms stand pillars");
}

#[test]
fn the_end_is_the_room_farthest_by_walk() {
    for dungeon in every_dungeon(300) {
        let end = dungeon.end();
        assert!(dungeon.rooms.iter().all(|room| room.walk <= dungeon.rooms[end].walk));
        assert_ne!(end, dungeon.way_in.room, "the end is never the way in's room");
    }
}

#[test]
fn a_patrols_dungeons_take_different_styles_and_are_named_for_their_patrol() {
    for patrol in ["saltgrass-downs", "highwater-glen", "aurora-wastes"] {
        let dungeons: Vec<_> = (0..PER_PATROL).map(|number| of_patrol(patrol, number)).collect();
        for (number, (seed, style)) in dungeons.iter().enumerate() {
            assert_eq!(of_patrol(patrol, number), (*seed, *style));
            assert!(dungeons[number + 1..].iter().all(|other| other.1.noun != style.noun && other.0 != *seed));
        }
    }
    assert_eq!(name(&STYLES[0], "The Saltgrass Downs"), "The Crypt of the Saltgrass Downs");
    assert_eq!(name(&STYLES[3], "The Pale Wastes"), "The Sanctum of the Pale Wastes");
}
