use crate::dungeon::{DOORWAY_HALF_M, EXIT_WIDTH_M, JAMB_DEPTH_M, TORCH_M};
use crate::{
    BLOCK_CELLS, CELL_M, Cell, Dungeon, PER_PATROL, Room, SIDES, STYLES, Shape, Side, WallDoor, name, of_patrol,
};

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
        let (past, aside) = ((x - middle_x) * -dx + (y - middle_y) * -dy, (x - middle_x) * -dy + (y - middle_y) * dx);
        assert!((past - 0.4).abs() < 1e-9 && aside.abs() < 1e-9, "the arrival 0.4 m past its cell's middle");
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
        assert_eq!(boxes.len(), dungeon.frames.len() * 2 + dungeon.pillars.len() + dungeon.props.len());
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
        way_in: WallDoor { cell: 0, side: Side::West, room: 0 },
        end: 2,
        portal: WallDoor { cell: 11, side: Side::East, room: 2 },
        torches: Vec::new(),
        frames: Vec::new(),
        pillars: Vec::new(),
        props: Vec::new(),
    };
    let _ = laid.walk();
    assert_eq!(laid.rooms.iter().map(|room| room.walk).collect::<Vec<_>>(), [0, 3, u32::MAX]);
    laid.cells[9] = corridor;
    laid.cells[10] = corridor;
    let steps = laid.walk();
    assert_eq!(laid.rooms.iter().map(|room| room.walk).collect::<Vec<_>>(), [0, 3, 6]);
    assert_eq!(steps[10], 5, "each cell's walk too");
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
fn the_end_lies_past_every_room_of_the_first_block_and_is_never_the_way_ins() {
    for dungeon in every_dungeon(600) {
        let end = dungeon.end();
        assert_ne!(end, dungeon.way_in.room, "the end is never the way in's room");
        let first_block = dungeon.rooms.iter().filter(|room| square_of(&dungeon, room.cells[0]) == dungeon.squares[0]);
        assert!(first_block.clone().all(|room| room.walk < dungeon.rooms[end].walk), "the end lies past the beginning");
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

/// The square of blocks a cell lies in.
fn square_of(dungeon: &Dungeon, cell: usize) -> (usize, usize) {
    ((cell % dungeon.columns) / BLOCK_CELLS, (cell / dungeon.columns) / BLOCK_CELLS)
}

#[test]
fn the_blocks_run_in_a_chain_each_opening_only_onto_the_one_before_and_the_one_after() {
    for dungeon in every_dungeon(600) {
        for pair in dungeon.squares.windows(2) {
            assert_eq!(
                pair[0].0.abs_diff(pair[1].0) + pair[0].1.abs_diff(pair[1].1),
                1,
                "each block beside the one before"
            );
        }
        let mut doorways = std::collections::BTreeMap::new();
        for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != Cell::Rock) {
            for side in [Side::East, Side::South] {
                let Some(next) = dungeon.beside(cell, side) else { continue };
                let (here, there) = (square_of(&dungeon, cell), square_of(&dungeon, next));
                if here != there && dungeon.cells[next] != Cell::Rock {
                    let first = dungeon.squares.iter().position(|&square| square == here).unwrap();
                    let second = dungeon.squares.iter().position(|&square| square == there).unwrap();
                    *doorways.entry((first.min(second), first.max(second))).or_insert(0) += 1;
                }
            }
        }
        let next_in_chain: Vec<(usize, usize)> =
            (1..dungeon.squares.len()).map(|number| (number - 1, number)).collect();
        assert_eq!(doorways.keys().copied().collect::<Vec<_>>(), next_in_chain, "only blocks next in the chain open");
        assert!(doorways.values().all(|&count| count == 1), "one doorway between them");
    }
}

#[test]
fn a_dungeon_begins_in_its_first_block_and_ends_in_its_last() {
    for dungeon in every_dungeon(600) {
        assert_eq!(square_of(&dungeon, dungeon.way_in.cell), dungeon.squares[0]);
        let end = &dungeon.rooms[dungeon.end()];
        assert_eq!(square_of(&dungeon, end.cells[0]), dungeon.squares[dungeon.squares.len() - 1]);
    }
}

#[test]
fn a_dungeon_is_a_run_with_few_loops_not_a_maze() {
    // Loops counted over a graph whose nodes are rooms and corridor cells: its edges past a tree's.
    let (count, mut loops, mut most) = (2000, 0, 0);
    for dungeon in every_dungeon(count) {
        let node = |cell: usize| match dungeon.cells[cell] {
            Cell::Rock => None,
            Cell::Room(number) => Some(usize::from(number)),
            Cell::Corridor => Some(dungeon.rooms.len() + cell),
        };
        let mut joined = std::collections::BTreeSet::new();
        for cell in 0..dungeon.cells.len() {
            for side in [Side::East, Side::South] {
                if let (Some(here), Some(there)) = (node(cell), dungeon.beside(cell, side).and_then(node))
                    && here != there
                {
                    joined.insert((here.min(there), here.max(there)));
                }
            }
        }
        let corridors = dungeon.cells.iter().filter(|&&cell| cell == Cell::Corridor).count();
        let found = joined.len() + 1 - (dungeon.rooms.len() + corridors);
        loops += found;
        most = most.max(found);
    }
    // DFO's maze law, with its loops, made 5.3 on average over these dungeons and up to 28.
    assert!(loops * 10 < count as usize * 12, "{} loops a dungeon on average", loops as f64 / f64::from(count));
    assert!(most <= 10, "at most {most}");
}

#[test]
fn the_return_portal_stands_on_a_rock_wall_of_the_end_room_between_two_torches() {
    for dungeon in every_dungeon(600) {
        let portal = dungeon.portal;
        assert_eq!(portal.room, dungeon.end());
        assert_eq!(dungeon.room_at(portal.cell), Some(portal.room));
        assert!(dungeon.beside(portal.cell, portal.side).is_none_or(|next| dungeon.cells[next] == Cell::Rock));
        assert_ne!((portal.cell, portal.side), (dungeon.way_in.cell, dungeon.way_in.side));
        let [door_x, door_y] = dungeon.portal_door();
        let flanking: Vec<f64> = dungeon
            .torches
            .iter()
            .filter(|torch| {
                let cell = (torch.at[0] / CELL_M) as usize + (torch.at[1] / CELL_M) as usize * dungeon.columns;
                (cell, torch.wall) == (portal.cell, portal.side)
            })
            .map(|torch| {
                (torch.at[0] - door_x) * -portal.side.unit()[1] + (torch.at[1] - door_y) * portal.side.unit()[0]
            })
            .collect();
        assert_eq!(flanking.len(), 2, "two torches on the portal's wall");
        assert!(flanking.iter().all(|along| along.abs() > EXIT_WIDTH_M / 2.0), "beside the portal, not over it");
        assert!(flanking[0] * flanking[1] < 0.0, "one either side");
        let [x, y] = dungeon.portal_door();
        let [middle_x, middle_y] = dungeon.centre(portal.cell);
        let [dx, dy] = portal.side.unit();
        assert!(((x - middle_x) * dx + (y - middle_y) * dy - CELL_M / 2.0).abs() < 0.05, "on its wall");
    }
}
