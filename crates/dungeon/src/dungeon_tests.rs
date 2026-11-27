use crate::dungeon::{DOORWAY_HALF_M, JAMB_DEPTH_M};
use crate::shapes::Ceiling;
use crate::torches::TORCH_M;
use crate::{
    BLOCK_CELLS, BLOCKS, CELL_M, Cell, Dungeon, ELITE_BLOCKS, EVERY_STYLE, PER_PATROL, Room, SIDES, STYLES, Shape,
    Side, WallDoor, named, of_patrol,
};

#[test]
fn every_style_is_found_by_its_key_and_no_other_key_names_one() {
    for style in EVERY_STYLE {
        assert_eq!(crate::style_of(style.key).map(|found| found.key), Some(style.key));
    }
    assert!(crate::style_of("grotto").is_none());
    assert!(crate::style_of("").is_none());
}

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count)
        .map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), EVERY_STYLE[seed as usize % EVERY_STYLE.len()]))
}

#[test]
fn every_dungeon_is_two_to_five_blocks_side_by_side_and_one_walk_from_its_way_in() {
    for dungeon in every_dungeon(600) {
        assert!((2..=5).contains(&dungeon.squares.len()));
        for (number, square) in dungeon.squares.iter().enumerate().skip(1) {
            let touches = dungeon.squares[..number]
                .iter()
                .any(|other| square.0.abs_diff(other.0) + square.1.abs_diff(other.1) == 1);
            assert!(touches, "each block beside one laid before it");
        }
        // Down the flights too; open air is no floor, a way down alone.
        let mut reached = vec![false; dungeon.cells.len()];
        let mut todo = vec![dungeon.way_in.cell];
        reached[dungeon.way_in.cell] = true;
        while let Some(cell) = todo.pop() {
            for next in dungeon.walk_from(cell) {
                if !reached[next] {
                    reached[next] = true;
                    todo.push(next);
                }
            }
        }
        for (cell, kind) in dungeon.cells.iter().enumerate() {
            let floored = !matches!(kind, Cell::Rock | Cell::Void);
            assert!(!floored || reached[cell], "every open cell is walked to from the way in");
        }
        assert!(dungeon.rooms.iter().all(|room| room.walk < u32::MAX));
    }
}

#[test]
fn a_square_no_block_stands_on_is_rock() {
    for dungeon in every_dungeon(200) {
        for cell in 0..dungeon.cells.len() {
            if !dungeon.squares.contains(&square_of(&dungeon, cell)) {
                assert_eq!(dungeon.cells[cell], Cell::Rock);
            }
        }
    }
}

#[test]
fn the_same_seed_lays_the_same_dungeon() {
    for style in EVERY_STYLE {
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
            let cell = dungeon.cell_at(torch.at);
            assert_ne!(dungeon.cells[cell], Cell::Rock, "a torch's cell is open");
            assert!(dungeon.beside(cell, torch.wall).is_none_or(|next| dungeon.cells[next] == Cell::Rock));
            assert!((cell, torch.wall) != (dungeon.way_in.cell, dungeon.way_in.side));
            assert!((torch.at[2] - dungeon.floor_of(cell) - TORCH_M).abs() < 1e-12, "over its own floor");
        }
        let lit_rooms = dungeon
            .rooms
            .iter()
            .filter(|room| {
                room.cells.iter().any(|&cell| dungeon.torches.iter().any(|torch| dungeon.cell_at(torch.at) == cell))
            })
            .count();
        assert_eq!(lit_rooms, dungeon.rooms.len(), "every room carries a torch");
    }
}

#[test]
fn a_doorway_narrows_to_its_frame_and_its_jambs_stand_in_the_corridor() {
    for dungeon in every_dungeon(100) {
        let boxes = dungeon.boxes();
        let props = dungeon.props.iter().filter(|prop| prop.solid.is_some()).count();
        let fixtures = dungeon.fixtures.iter().filter(|fixture| fixture.solid.is_some()).count();
        let landmarks: usize = dungeon.landmarks.iter().map(|placed| placed.solids.len()).sum();
        assert_eq!(boxes.len(), dungeon.frames.len() * 2 + dungeon.pillars.len() + props + fixtures + landmarks);
        for (frame, pair) in dungeon.frames.iter().zip(boxes.chunks(2)) {
            assert!(dungeon.room_at(frame.cell).is_some());
            assert_eq!(dungeon.cells[dungeon.beside(frame.cell, frame.side).unwrap()], Cell::Corridor);
            let [dx, _] = frame.side.unit();
            let across = |jamb: &[f64; 6]| if dx == 0.0 { (jamb[0], jamb[2]) } else { (jamb[1], jamb[3]) };
            let deep = |jamb: &[f64; 6]| if dx == 0.0 { jamb[3] - jamb[1] } else { jamb[2] - jamb[0] };
            let (first, second) = (across(&pair[0]), across(&pair[1]));
            let gap = second.0.max(first.0) - second.1.min(first.1);
            assert!((gap - 2.0 * DOORWAY_HALF_M).abs() < 1e-9, "the way between the jambs is {gap}");
            assert!((deep(&pair[0]) - JAMB_DEPTH_M).abs() < 1e-9 && (deep(&pair[1]) - JAMB_DEPTH_M).abs() < 1e-9);
            let floor = dungeon.floor_of(frame.cell);
            assert!(pair.iter().all(|jamb| jamb[4] == floor && jamb[5] == floor + frame.height));
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
        stones: Vec::new(),
        height: 3.2,
        ceiling: Ceiling::Flat,
        shape: Shape::Rectangle,
        walk: 0,
        look: 0,
        storey: 0,
        purpose: &STYLES[0].purposes.way_in,
        role: STYLES[0].purposes.way_in.role,
        name: String::new(),
    };
    let (rock, corridor) = (Cell::Rock, Cell::Corridor);
    let mut laid = Dungeon {
        style: STYLES[0],
        looks: vec![STYLES[0]],
        squares: vec![(0, 0)],
        block_looks: vec![0],
        block_storeys: vec![1],
        columns: 6,
        rows: 2,
        storeys: 1,
        stairs: Vec::new(),
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
        main_way: Vec::new(),
        vaults: Vec::new(),
        chest_rooms: Vec::new(),
        torches: Vec::new(),
        frames: Vec::new(),
        pillars: Vec::new(),
        balustrades: Vec::new(),
        props: Vec::new(),
        fixtures: Vec::new(),
        landmarks: Vec::new(),
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
fn pillars_stand_on_every_second_inner_corner_of_a_great_hewn_room_four_of_its_own_cells_round_each() {
    let mut stood = 0;
    for dungeon in every_dungeon(300) {
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let first = room.storey * dungeon.plane();
            // Under a gallery's open air the hall rises a storey, and no pillar stands.
            let open_over = |cell: usize| room.storey > 0 && dungeon.cells[cell - dungeon.plane()] == Cell::Void;
            let own = |x: usize, y: usize| {
                let cell = first + y * dungeon.columns + x;
                dungeon.room_at(cell).filter(|_| !open_over(cell))
            };
            // A landmark stands in place of the pillars whose boxes would meet it: those at its footprint's corners.
            let under = |x: usize, y: usize| {
                [(x, y), (x - 1, y), (x, y - 1), (x - 1, y - 1)]
                    .iter()
                    .any(|&(column, row)| dungeon.under_landmark(first + row * dungeon.columns + column))
            };
            let mut want = Vec::new();
            if room.width >= 4 && room.depth >= 4 && room.shape != Shape::Cave {
                for y in (room.y + 2..room.y + room.depth - 1).step_by(2) {
                    for x in (room.x + 2..room.x + room.width - 1).step_by(2) {
                        if [own(x, y), own(x - 1, y), own(x, y - 1), own(x - 1, y - 1)]
                            .iter()
                            .all(|&at| at == Some(number))
                            && !under(x, y)
                        {
                            let top = crate::storey_floor(room.storey) + room.height;
                            want.push([x as f64 * CELL_M, y as f64 * CELL_M, top]);
                        }
                    }
                }
            }
            let inside = |pillar: &&[f64; 3]| {
                let (x, y) = ((pillar[0] / CELL_M) as usize, (pillar[1] / CELL_M) as usize);
                let level = dungeon.storey_under(pillar[2]) == room.storey;
                level && x > room.x && x < room.x + room.width && y > room.y && y < room.y + room.depth
            };
            let found: Vec<[f64; 3]> = dungeon.pillars.iter().filter(inside).copied().collect();
            assert_eq!(found, want);
            stood += want.len();
        }
    }
    assert!(stood > 0, "some great rooms stand pillars");
}

#[test]
fn the_end_is_the_farthest_room_of_the_last_blocks_deepest_storey_and_never_the_way_ins() {
    for dungeon in every_dungeon(600) {
        let end = dungeon.end();
        assert_ne!(end, dungeon.way_in.room, "the end is never the way in's room");
        let last = dungeon.squares.len() - 1;
        let deepest = dungeon.block_storeys[last] - 1;
        let found = &dungeon.rooms[end];
        assert_eq!((square_of(&dungeon, found.cells[0]), found.storey), (dungeon.squares[last], deepest));
        let there = dungeon
            .rooms
            .iter()
            .filter(|room| room.storey == deepest && square_of(&dungeon, room.cells[0]) == dungeon.squares[last]);
        assert!(there.clone().all(|room| room.walk <= found.walk), "the farthest by walk there");
        let first_storey = dungeon
            .rooms
            .iter()
            .filter(|room| room.storey == 0 && square_of(&dungeon, room.cells[0]) == dungeon.squares[0] && last > 0);
        assert!(first_storey.clone().all(|room| room.walk < found.walk), "past the way in's storey");
    }
}

#[test]
fn a_patrols_dungeons_take_three_different_styles_of_the_six() {
    let mut taken = Vec::new();
    for patrol in (0..200).map(|nth| format!("patrol-{nth}")) {
        let dungeons: Vec<_> = (0..PER_PATROL).map(|number| of_patrol(&patrol, number)).collect();
        for (number, (seed, style)) in dungeons.iter().enumerate() {
            assert_eq!(of_patrol(&patrol, number), (*seed, *style));
            assert!(dungeons[number + 1..].iter().all(|other| other.1.key != style.key && other.0 != *seed));
            if !taken.contains(&style.key) {
                taken.push(style.key);
            }
        }
    }
    assert_eq!(taken.len(), STYLES.len(), "every style is some patrol's: {taken:?}");
}

#[test]
fn a_dungeon_is_named_by_its_seed_and_style_alike_every_time_and_seldom_twice() {
    let mut names = Vec::new();
    for seed in 0..600_u32 {
        let style = &STYLES[seed as usize % STYLES.len()];
        let name = named(seed, style);
        assert_eq!(name, named(seed, style));
        assert!(name.starts_with(|first: char| first.is_ascii_uppercase()) && !name.contains("  "), "{name}");
        assert!(name.split(' ').count() >= 2, "{name}");
        names.push(name);
    }
    names.sort();
    names.dedup();
    assert!(names.len() > 500, "{} names of 600", names.len());
    assert_ne!(named(7, &STYLES[0]), named(7, &STYLES[1]), "the style changes the name");
}

#[test]
fn the_six_styles_keys_breaks_pictures_and_entrances() {
    let keys = STYLES.map(|style| style.key);
    assert_eq!(keys, ["crypt", "halls", "cells", "sanctum", "caverns", "mines"]);
    let below = STYLES.map(|style| style.style_below().key);
    assert_eq!(below, ["caverns", "crypt", "mines", "crypt", "crypt", "caverns"]);
    assert_eq!(STYLES[4].pictures, [120, 119]);
    assert_eq!(STYLES[5].pictures, [119, 120]);
    for style in STYLES {
        let caves = ["caverns", "mines"].contains(&style.key);
        let entrances: &[u16] = if caves { &[43603, 43604] } else { &[43601, 43602] };
        assert_eq!(style.entrances, entrances, "{}", style.key);
    }
}

#[test]
fn the_passages_two_styles_are_found_by_key_and_never_drawn_for_a_patrol() {
    use crate::PASSAGE_STYLES;
    assert_eq!(PASSAGE_STYLES.map(|style| style.key), ["chalk", "barrow"]);
    assert_eq!(PASSAGE_STYLES.map(|style| style.style_below().key), ["barrow", "caverns"]);
    assert_eq!(PASSAGE_STYLES.map(|style| style.pictures), [[123, 120], [124, 122]]);
    assert_eq!(PASSAGE_STYLES[0].entrances, &[43603, 43604]);
    assert_eq!(PASSAGE_STYLES[1].entrances, &[43601, 43602]);
    for patrol in (0..300).map(|nth| format!("patrol-{nth}")) {
        for number in 0..PER_PATROL {
            let (_, style) = of_patrol(&patrol, number);
            assert!(STYLES.iter().any(|kept| kept.key == style.key), "{} is drawn for {patrol}", style.key);
        }
    }
    for style in PASSAGE_STYLES {
        let dungeon = Dungeon::forge(7, style);
        assert_eq!(dungeon.style.key, style.key);
        assert!(dungeon.rooms.iter().all(|room| !room.name.is_empty()));
    }
}

#[test]
fn sizes_span_two_to_five_blocks_each_about_as_often() {
    let mut counts = [0; 6];
    for dungeon in every_dungeon(2000) {
        counts[dungeon.squares.len()] += 1;
    }
    for (blocks, &count) in counts.iter().enumerate() {
        let drawn = (BLOCKS.0..=BLOCKS.1).contains(&blocks);
        assert!(if drawn { (400..600).contains(&count) } else { count == 0 }, "{blocks} blocks in {count} of 2000");
    }
}

#[test]
fn about_half_break_into_the_style_below_in_their_last_block_alone() {
    let mut deeper = 0;
    for dungeon in every_dungeon(2000) {
        assert_eq!(dungeon.looks[0], dungeon.style, "the first look is the dungeon's own style");
        let last = dungeon.squares.len() - 1;
        for (block, &look) in dungeon.block_looks.iter().enumerate() {
            assert_eq!(look, usize::from(block == last && dungeon.looks.len() == 2), "only the last block breaks");
        }
        if dungeon.looks.len() == 2 {
            deeper += 1;
            assert_eq!(dungeon.looks[1], dungeon.style.style_below(), "the style below");
        }
        for (cell, &kind) in dungeon.cells.iter().enumerate() {
            let square = square_of(&dungeon, cell);
            let block = dungeon.squares.iter().position(|&found| found == square);
            let want = (kind != Cell::Rock).then(|| block.map(|block| dungeon.block_looks[block])).flatten();
            assert_eq!(dungeon.look_at(cell), want, "a cell wears its block's look");
        }
        for room in &dungeon.rooms {
            assert_eq!(dungeon.look_at(room.cells[0]), Some(room.look), "a room wears its block's look");
            let style = dungeon.looks[room.look];
            let bank = style.purposes;
            let own = bank.rooms.contains(room.purpose) || *room.purpose == bank.end || *room.purpose == bank.way_in;
            assert!(own, "{}'s purpose is its own style's", room.name);
        }
    }
    assert!((900..1100).contains(&deeper), "{deeper} of 2000 break into the style below");
}

/// The square of blocks a cell lies in, whatever its storey.
pub(crate) fn square_of(dungeon: &Dungeon, cell: usize) -> (usize, usize) {
    let at = cell % dungeon.plane();
    ((at % dungeon.columns) / BLOCK_CELLS, (at / dungeon.columns) / BLOCK_CELLS)
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
fn the_return_portal_stands_on_a_rock_wall_of_the_end_room() {
    for dungeon in every_dungeon(600) {
        let portal = dungeon.portal;
        assert_eq!(portal.room, dungeon.end());
        assert_eq!(dungeon.room_at(portal.cell), Some(portal.room));
        assert!(dungeon.beside(portal.cell, portal.side).is_none_or(|next| dungeon.cells[next] == Cell::Rock));
        assert_ne!((portal.cell, portal.side), (dungeon.way_in.cell, dungeon.way_in.side));
        let [x, y] = dungeon.portal_door();
        let [middle_x, middle_y] = dungeon.centre(portal.cell);
        let [dx, dy] = portal.side.unit();
        assert!(((x - middle_x) * dx + (y - middle_y) * dy - CELL_M / 2.0).abs() < 0.05, "on its wall");
    }
}

#[test]
fn a_dungeon_forged_within_four_and_five_blocks_takes_one_of_them_and_the_forges_own_count_is_unchanged() {
    let counts: std::collections::BTreeSet<usize> = (0..200_u32)
        .map(|seed| {
            Dungeon::forge_within(seed, EVERY_STYLE[seed as usize % EVERY_STYLE.len()], ELITE_BLOCKS).squares.len()
        })
        .collect();
    assert_eq!(counts, std::collections::BTreeSet::from([4, 5]));
    for seed in [0, 7, 4242] {
        assert_eq!(Dungeon::forge(seed, STYLES[0]), Dungeon::forge_within(seed, STYLES[0], BLOCKS));
    }
}
