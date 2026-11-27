use crate::block::{BLOCK_CELLS, BlockLayout, Opening, opening_cell};
use crate::descent::StoreyPlan;
use crate::lane::Lane;
use crate::{Cell, EVERY_STYLE, STYLES, Shape, Side, Style};

/// A block storey's plan as a seed draws it: up to two doorways, each on a side of its own, and no flight.
fn ends(seed: u32) -> StoreyPlan {
    let mut lane = Lane::new(seed);
    let sides = [Side::East, Side::South, Side::West, Side::North];
    let entry = sides[lane.below(4)];
    let exit = sides.into_iter().filter(|&side| side != entry).nth(lane.below(3)).unwrap_or(Side::East);
    let mut opening = |side| lane.chance(0.8).then(|| Opening { side, cell: lane.int(2, 13) });
    let openings = [opening(entry), opening(exit)].into_iter().flatten().collect();
    StoreyPlan { openings, ..StoreyPlan::default() }
}

/// The rim cells a plan's doorways pass through.
fn rim(plan: &StoreyPlan) -> Vec<(usize, usize)> {
    plan.openings.iter().map(|&opening| opening_cell(opening)).collect()
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
        let style = EVERY_STYLE[seed as usize % EVERY_STYLE.len()];
        let gaps = ends(seed);
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
        let rim = rim(&gaps);
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
    let openings = vec![Opening { side: Side::North, cell: 3 }, Opening { side: Side::East, cell: 7 }];
    let gaps = StoreyPlan { openings, ..StoreyPlan::default() };
    for style in EVERY_STYLE {
        assert_eq!(BlockLayout::sound(77, &gaps, &style, true), BlockLayout::sound(77, &gaps, &style, true));
        assert_ne!(BlockLayout::sound(77, &gaps, &style, true), BlockLayout::sound(78, &gaps, &style, true));
    }
}

/// Whether a room's rectangle is one of its style's forms: its shape, and its sides within the form's one way or the
/// other.
fn of_a_form(style: &Style, shape: Shape, width: usize, depth: usize) -> bool {
    let within = |side: usize, (least, most): (usize, usize)| (least..=most).contains(&side);
    style.forms.iter().any(|form| {
        form.shape == shape
            && ((within(width, form.along) && within(depth, form.across))
                || (within(depth, form.along) && within(width, form.across)))
    })
}

#[test]
fn rooms_take_their_styles_forms_and_heights_and_every_form_is_drawn() {
    for style in EVERY_STYLE {
        let (mut shapes, mut simplest) = (Vec::new(), 0);
        for seed in 0..600 {
            let block = BlockLayout::sound(seed, &ends(seed), &style, false);
            // Past its tries a storey takes its simplest form, one room of 3 by 3.
            if let [only] = &block.rooms[..]
                && (only.width, only.depth) == (3, 3)
            {
                simplest += 1;
                continue;
            }
            // No part is cut below five cells, so the square is cut at most once each way: four rooms at most.
            let (fewest, most) = (style.rooms.0.min(3), style.rooms.1.min(4));
            let rooms = block.rooms.len();
            assert!((fewest..=most).contains(&rooms), "{}: {rooms} rooms, not {fewest} to {most}", style.noun);
            for room in &block.rooms {
                assert!(of_a_form(&style, room.shape, room.width, room.depth), "{}: {room:?}", style.noun);
                assert!(room.height >= style.heights.0 - 0.2 && room.height <= style.heights.1 + 0.2);
                let steps = room.height / 0.4;
                assert!((steps - (steps + 0.5).floor()).abs() < 1e-9, "a ceiling a whole number of 0.4 m");
                if !shapes.contains(&room.shape) {
                    shapes.push(room.shape);
                }
            }
        }
        for form in style.forms {
            assert!(shapes.contains(&form.shape), "{}: no {:?} in 600 blocks", style.noun, form.shape);
        }
        assert!(simplest < 30, "{}: {simplest} of 600 storeys took their simplest form", style.noun);
    }
}

#[test]
fn the_mines_lay_long_galleries_two_cells_wide() {
    let mines = STYLES.into_iter().find(|style| style.key == "mines").unwrap();
    let galleries = (0..300)
        .flat_map(|seed| BlockLayout::sound(seed, &StoreyPlan::default(), &mines, false).rooms)
        .filter(|room| room.width.min(room.depth) == 2 && room.width.max(room.depth) >= 5)
        .count();
    assert!(galleries > 100, "{galleries} galleries in 300 blocks");
}

#[test]
fn an_ell_leaves_one_corner_quarter_of_its_rectangle_rock() {
    let style = STYLES[1];
    let (block, number) = (0..)
        .find_map(|seed| {
            let block = BlockLayout::sound(seed, &StoreyPlan::default(), &style, false);
            let number = block.rooms.iter().position(|room| room.shape == Shape::Ell)?;
            Some((block, number))
        })
        .unwrap();
    let room = &block.rooms[number];
    let own = block.room_cells(number).len();
    assert_eq!(own, room.width * room.depth - (room.width / 2) * (room.depth / 2));
}

#[test]
fn the_way_ins_block_has_its_exit_door_against_rock_in_a_room_never_on_a_stone() {
    for seed in 0..500 {
        let block = BlockLayout::sound(seed, &ends(seed), &EVERY_STYLE[seed as usize % EVERY_STYLE.len()], true);
        let (x, y, side) = block.exit_spot().unwrap();
        assert!(matches!(block.cells[y * BLOCK_CELLS + x], Cell::Room(_)), "seed {seed}: the door is in a room");
        let (dx, dy) = side.step();
        let behind = (x.wrapping_add_signed(dx), y.wrapping_add_signed(dy));
        assert_eq!(block.cells[behind.1 * BLOCK_CELLS + behind.0], Cell::Rock, "seed {seed}: rock behind the door");
        assert!(!block.stone(behind), "seed {seed}: the door is on a wall, not a stone");
    }
}

#[test]
fn a_quiet_cell_meets_no_corridor() {
    for seed in 0..300 {
        let block = BlockLayout::sound(seed, &ends(seed), &STYLES[0], false);
        for number in 0..block.rooms.len() {
            for (x, y) in block.quiet_cells(number) {
                for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                    assert_ne!(block.cells[ny * BLOCK_CELLS + nx], Cell::Corridor, "seed {seed}");
                }
            }
        }
    }
}

#[test]
fn no_way_cuts_a_caves_stones_which_stand_inside_its_room() {
    let caverns = STYLES.into_iter().find(|style| style.key == "caverns").unwrap();
    let mut stones = 0;
    for seed in 0..600 {
        let block = BlockLayout::sound(seed, &ends(seed), &caverns, seed % 3 == 0);
        for (number, room) in block.rooms.iter().enumerate() {
            for &(x, y) in &room.stones {
                stones += 1;
                assert_eq!(block.cells[y * BLOCK_CELLS + x], Cell::Rock, "seed {seed}: a stone is rock");
                let own = Cell::Room(u16::try_from(number).unwrap());
                for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                    assert_eq!(block.cells[ny * BLOCK_CELLS + nx], own, "seed {seed}: its room all round it");
                }
            }
        }
    }
    assert!(stones > 100, "{stones} stones in 600 blocks of caverns");
}
