use crate::block::{BLOCK_CELLS, BlockLayout, Opening, opening_cell};
use crate::lane::Lane;
use crate::{Cell, STYLES, Shape, Side};

/// A block's openings as a seed draws them: up to one on each side.
fn openings(seed: u32) -> Vec<Opening> {
    let mut lane = Lane::new(seed);
    let mut gaps = Vec::new();
    for side in [Side::East, Side::South, Side::West, Side::North] {
        if lane.chance(0.6) {
            gaps.push(Opening { side, cell: lane.int(2, 13) });
        }
    }
    gaps
}

fn open_cells(block: &BlockLayout) -> Vec<(usize, usize)> {
    (0..BLOCK_CELLS * BLOCK_CELLS)
        .filter(|&index| block.cells[index] != Cell::Rock)
        .map(|index| (index % BLOCK_CELLS, index / BLOCK_CELLS))
        .collect()
}

#[test]
fn every_block_is_one_walk_its_rim_rock_but_where_its_openings_pass() {
    for seed in 0..2000 {
        let style = STYLES[seed as usize % STYLES.len()];
        let gaps = openings(seed);
        let block = BlockLayout::sound(seed, &gaps, &style, seed % 5 == 0);
        let open = open_cells(&block);
        let mut reached = vec![open[0]];
        let mut todo = vec![open[0]];
        while let Some((x, y)) = todo.pop() {
            for next in [(x + 1, y), (x.wrapping_sub(1), y), (x, y + 1), (x, y.wrapping_sub(1))] {
                if open.contains(&next) && !reached.contains(&next) {
                    reached.push(next);
                    todo.push(next);
                }
            }
        }
        assert_eq!(reached.len(), open.len(), "seed {seed}: every open cell one walk");
        let rim: Vec<(usize, usize)> = gaps.iter().map(|&gap| opening_cell(gap)).collect();
        for &(x, y) in &open {
            let on_rim = x == 0 || y == 0 || x == BLOCK_CELLS - 1 || y == BLOCK_CELLS - 1;
            assert!(!on_rim || rim.contains(&(x, y)), "seed {seed}: ({x}, {y}) opens the rim");
        }
        for &cell in &rim {
            assert_eq!(
                block.cells[cell.1 * BLOCK_CELLS + cell.0],
                Cell::Corridor,
                "seed {seed}: an opening is a corridor"
            );
        }
        for room in &block.rooms {
            assert!(room.x >= 2 && room.y >= 2, "seed {seed}: rock between a room and the rim");
            assert!(room.x + room.width <= BLOCK_CELLS - 2 && room.y + room.depth <= BLOCK_CELLS - 2);
        }
    }
}

#[test]
fn the_same_seed_lays_the_same_block() {
    let gaps = [Opening { side: Side::East, cell: 7 }, Opening { side: Side::North, cell: 3 }];
    for style in STYLES {
        assert_eq!(BlockLayout::sound(77, &gaps, &style, true), BlockLayout::sound(77, &gaps, &style, true));
        assert_ne!(BlockLayout::sound(77, &gaps, &style, true), BlockLayout::sound(78, &gaps, &style, true));
    }
}

#[test]
fn rooms_take_their_styles_sizes_heights_and_shapes() {
    for style in STYLES {
        let (mut ells, mut could) = (0, 0);
        for seed in 0..600 {
            let block = BlockLayout::sound(seed, &[], &style, false);
            assert!(block.rooms.len() <= style.rooms.1, "{}: no more rooms than its most", style.noun);
            for room in &block.rooms {
                assert!(room.width <= style.room_cells.1 && room.depth <= style.room_cells.1);
                assert!(room.height >= style.heights.0 - 0.2 && room.height <= style.heights.1 + 0.2);
                let steps = room.height / 0.4;
                assert!((steps - (steps + 0.5).floor()).abs() < 1e-9, "a ceiling a whole number of 0.4 m");
                if room.width >= 4 && room.depth >= 4 {
                    could += 1;
                }
                if room.shape == Shape::Ell {
                    ells += 1;
                }
            }
        }
        if style.ells {
            let share = f64::from(ells) / f64::from(could);
            assert!((0.33..0.47).contains(&share), "{}: an L two times in five, {share}", style.noun);
        } else {
            assert_eq!(ells, 0, "{}: rectangles only", style.noun);
        }
    }
}

#[test]
fn an_ell_leaves_one_corner_quarter_of_its_rectangle_rock() {
    let style = STYLES[1];
    let (block, number) = (0..)
        .find_map(|seed| {
            let block = BlockLayout::sound(seed, &[], &style, false);
            let number = block.rooms.iter().position(|room| room.shape == Shape::Ell)?;
            Some((block, number))
        })
        .unwrap();
    let room = block.rooms[number];
    let own = block.room_cells(number).len();
    assert_eq!(own, room.width * room.depth - (room.width / 2) * (room.depth / 2));
}

#[test]
fn the_way_ins_block_has_its_exit_door_against_rock_in_a_room() {
    for seed in 0..500 {
        let block = BlockLayout::sound(seed, &openings(seed), &STYLES[seed as usize % 4], true);
        let (x, y, side) = block.exit_spot().unwrap();
        assert!(matches!(block.cells[y * BLOCK_CELLS + x], Cell::Room(_)), "seed {seed}: the door is in a room");
        let (dx, dy) = side.step();
        let behind = (x.wrapping_add_signed(dx), y.wrapping_add_signed(dy));
        assert_eq!(block.cells[behind.1 * BLOCK_CELLS + behind.0], Cell::Rock, "seed {seed}: rock behind the door");
    }
}

#[test]
fn a_quiet_cell_meets_no_corridor() {
    for seed in 0..300 {
        let block = BlockLayout::sound(seed, &openings(seed), &STYLES[0], false);
        for number in 0..block.rooms.len() {
            for (x, y) in block.quiet_cells(number) {
                for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                    assert_ne!(block.cells[ny * BLOCK_CELLS + nx], Cell::Corridor, "seed {seed}");
                }
            }
        }
    }
}
