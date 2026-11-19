use crate::dungeon::{DOORWAY_HALF_M, JAMB_DEPTH_M, TORCH_M};
use crate::{BLOCK_CELLS, CELL_M, Cell, Dungeon, PER_PATROL, SIDES, STYLES, name, of_patrol};

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
        assert!(lit_rooms * 10 >= dungeon.rooms.len() * 9, "nearly every room carries a torch");
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
        }
    }
}

#[test]
fn the_floor_is_open_cells_at_0_m_and_rock_none() {
    for dungeon in every_dungeon(50) {
        let heights = dungeon.heights();
        assert_eq!(heights.len(), dungeon.columns * dungeon.rows);
        for (height, cell) in heights.iter().zip(&dungeon.cells) {
            assert_eq!(*height, (*cell != Cell::Rock).then_some(0.0));
        }
    }
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
