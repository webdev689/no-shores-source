//! The deeper dungeons' laws over 2000 dungeons: storeys, flights, doorways between blocks, loops, dead ends, great
//! rooms, galleries, vaults and the main way. Each share's bounds were set from what 2000 dungeons measured.

use crate::dungeon_tests::square_of;
use crate::{BALUSTRADE_M, Cell, Dungeon, FLIGHT_CELLS, Kind, SIDES, STYLES, Side, storey_floor};
use std::sync::LazyLock;

const COUNT: usize = 2000;

static DUNGEONS: LazyLock<Vec<Dungeon>> = LazyLock::new(|| {
    (0..COUNT as u32)
        .map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]))
        .collect()
});

/// A share of the 2000, as a fraction.
fn share(count: usize, of: usize) -> f64 {
    count as f64 / of.max(1) as f64
}

#[test]
fn the_way_ins_block_holds_one_or_two_storeys_and_any_other_one_to_three_each_about_as_often() {
    let (mut first, mut others) = ([0; 4], [0; 4]);
    for dungeon in DUNGEONS.iter() {
        first[dungeon.block_storeys[0]] += 1;
        for &count in &dungeon.block_storeys[1..] {
            others[count] += 1;
        }
        assert_eq!(dungeon.storeys, dungeon.block_storeys.iter().copied().max().unwrap());
        assert_eq!(dungeon.cells.len(), dungeon.storeys * dungeon.plane());
    }
    assert_eq!(first[3], 0, "the way in's block is never three deep");
    assert!((0.45..0.55).contains(&share(first[1], COUNT)), "{first:?}");
    let total: usize = others.iter().sum();
    for count in 1..=3 {
        assert!((0.3..0.37).contains(&share(others[count], total)), "{others:?}");
    }
}

#[test]
fn each_flight_runs_four_cells_in_rock_from_a_landing_above_to_one_below_one_for_each_two_storeys_of_a_block() {
    for dungeon in DUNGEONS.iter() {
        let plane = dungeon.plane();
        let wanted: usize = dungeon.block_storeys.iter().map(|count| count - 1).sum();
        assert_eq!(dungeon.stairs.len(), wanted, "a flight for each two storeys one over the other");
        for (number, stair) in dungeon.stairs.iter().enumerate() {
            let own = Cell::Stair(u16::try_from(number).unwrap());
            let line = [stair.top].into_iter().chain(stair.cells).chain([stair.bottom]).collect::<Vec<_>>();
            let step = line[1] as isize - line[0] as isize;
            assert!([1, -1, dungeon.columns as isize, -(dungeon.columns as isize)].contains(&step));
            assert!(line.windows(2).all(|pair| pair[1] as isize - pair[0] as isize == step), "a straight line");
            let square = square_of(dungeon, stair.top);
            assert!(line.iter().all(|&cell| square_of(dungeon, cell) == square), "inside its block");
            for storey in 0..dungeon.storeys {
                for &cell in &stair.cells {
                    let want = if storey == stair.upper || storey == stair.upper + 1 { own } else { Cell::Rock };
                    assert_eq!(dungeon.cells[storey * plane + cell], want, "rock over and under a flight");
                }
            }
            assert_eq!(dungeon.cells[stair.upper * plane + stair.top], Cell::Corridor, "its top landing a way");
            assert_eq!(dungeon.cells[(stair.upper + 1) * plane + stair.bottom], Cell::Corridor, "its foot's too");
            let across = if step.unsigned_abs() == 1 { [Side::North, Side::South] } else { [Side::East, Side::West] };
            for storey in [stair.upper, stair.upper + 1] {
                for &cell in &stair.cells {
                    for side in across {
                        assert!(dungeon.rock_beside(storey * plane + cell, side), "walled in rock both sides");
                    }
                }
            }
        }
        assert_eq!(dungeon.stairs.iter().map(|stair| stair.cells.len()).sum::<usize>(), wanted * FLIGHT_CELLS);
    }
}

/// The doorways between blocks: each pair of blocks by their numbers, and the storeys their doorways are on.
fn doorways(dungeon: &Dungeon) -> std::collections::BTreeMap<(usize, usize), Vec<usize>> {
    let mut found = std::collections::BTreeMap::new();
    for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != Cell::Rock) {
        for side in [Side::East, Side::South] {
            let Some(next) = dungeon.beside(cell, side) else { continue };
            let (here, there) = (square_of(dungeon, cell), square_of(dungeon, next));
            if here != there && dungeon.cells[next] != Cell::Rock {
                let first = dungeon.squares.iter().position(|&square| square == here).unwrap();
                let second = dungeon.squares.iter().position(|&square| square == there).unwrap();
                found
                    .entry((first.min(second), first.max(second)))
                    .or_insert_with(Vec::new)
                    .push(dungeon.storey_of(cell));
            }
        }
    }
    found
}

#[test]
fn blocks_next_in_the_chain_share_the_way_on_on_their_deepest_storey_and_others_side_by_side_one_time_in_two() {
    let (mut others, mut shared) = (0, 0);
    for dungeon in DUNGEONS.iter() {
        let found = doorways(dungeon);
        let squares = &dungeon.squares;
        for first in 0..squares.len() {
            for second in first + 1..squares.len() {
                let beside =
                    squares[first].0.abs_diff(squares[second].0) + squares[first].1.abs_diff(squares[second].1);
                let storeys = found.get(&(first, second));
                let deepest = dungeon.block_storeys[first].min(dungeon.block_storeys[second]) - 1;
                if second == first + 1 {
                    assert_eq!(storeys, Some(&vec![deepest]), "the way on, one doorway on the deepest both hold");
                } else if beside == 1 {
                    others += 1;
                    if let Some(storeys) = storeys {
                        shared += 1;
                        assert!(storeys.len() == 1 && storeys[0] <= deepest, "one, on a storey both hold");
                    }
                } else {
                    assert!(storeys.is_none(), "only blocks side by side open onto each other");
                }
            }
        }
    }
    assert!(others > 200 && (0.4..0.6).contains(&share(shared, others)), "{shared} of {others}");
}

#[test]
fn every_dead_end_holds_a_chest_a_vault_a_landmark_the_way_in_or_the_end_and_a_storey_has_one_at_most() {
    let (mut dead, mut rooms) = (0, 0);
    for dungeon in DUNGEONS.iter() {
        rooms += dungeon.rooms.len();
        for room in (0..dungeon.rooms.len()).filter(|&room| dungeon.dead_end(room)) {
            dead += 1;
            let holds = room == dungeon.way_in.room
                || room == dungeon.end()
                || dungeon.vaults.contains(&room)
                || dungeon.chest_rooms.contains(&room)
                || dungeon.landmarks.iter().any(|placed| placed.room == room);
            assert!(holds, "{} is a dead end holding nothing", dungeon.rooms[room].name);
        }
        for &room in &dungeon.chest_rooms {
            assert!(dungeon.dead_end(room), "a chest room first is a dead end");
            let mates = dungeon.chest_rooms.iter().filter(|&&other| {
                let (one, two) = (&dungeon.rooms[room], &dungeon.rooms[other]);
                one.storey == two.storey && square_of(dungeon, one.cells[0]) == square_of(dungeon, two.cells[0])
            });
            assert_eq!(mates.count(), 1, "one a block storey");
        }
    }
    assert!((0.2..0.32).contains(&share(dead, rooms)), "{dead} of {rooms} rooms are dead ends");
}

#[test]
fn loops_come_now_and_then_as_the_forge_joins_a_storey() {
    // Loops counted over a graph whose nodes are rooms and open cells but theirs: its edges past a tree's.
    let (mut loops, mut most) = (0, 0);
    for dungeon in DUNGEONS.iter() {
        let node = |cell: usize| match dungeon.cells[cell] {
            Cell::Rock | Cell::Void => None,
            Cell::Room(number) => Some(usize::from(number)),
            Cell::Corridor | Cell::Stair(_) => Some(dungeon.rooms.len() + cell),
        };
        let mut joined = std::collections::BTreeSet::new();
        let mut nodes = std::collections::BTreeSet::new();
        for cell in 0..dungeon.cells.len() {
            let Some(here) = node(cell) else { continue };
            nodes.insert(here);
            for next in dungeon.walk_from(cell).filter_map(node).filter(|&there| there != here) {
                joined.insert((here.min(next), here.max(next)));
            }
        }
        let found = joined.len() + 1 - nodes.len();
        loops += found;
        most = most.max(found);
    }
    let average = share(loops, COUNT);
    assert!((8.0..20.0).contains(&average) && most < 60, "{average} loops a dungeon on average, at most {most}");
}

#[test]
fn now_and_then_a_block_storey_is_one_great_room_and_one_under_a_storey_rises_into_a_gallery_where_it_fits() {
    let (mut great, mut storeys, mut under, mut galleries) = (0, 0, 0, 0);
    for dungeon in DUNGEONS.iter() {
        storeys += dungeon.block_storeys.iter().sum::<usize>();
        let greats: Vec<usize> = (0..dungeon.rooms.len())
            .filter(|&room| dungeon.rooms[room].width.min(dungeon.rooms[room].depth) >= 9)
            .collect();
        great += greats.len();
        if greats.iter().any(|&room| dungeon.rooms[room].storey > 0) {
            under += 1;
        }
        let plane = dungeon.plane();
        let voids: Vec<usize> = (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] == Cell::Void).collect();
        if voids.is_empty() {
            assert!(dungeon.balustrades.is_empty());
            continue;
        }
        galleries += 1;
        for &cell in &voids {
            let room = dungeon.room_at(cell + plane).expect("open air over a room");
            assert!(greats.contains(&room), "over a great room");
            for side in SIDES {
                let next = dungeon.beside(cell, side).unwrap();
                assert!(matches!(dungeon.cells[next], Cell::Void | Cell::Rock | Cell::Corridor), "rock or gallery");
            }
        }
        let edges = voids
            .iter()
            .flat_map(|&cell| SIDES.into_iter().filter_map(move |side| dungeon.beside(cell, side)))
            .filter(|&next| dungeon.cells[next] == Cell::Corridor)
            .count();
        assert_eq!(dungeon.balustrades.len(), edges, "a balustrade along each edge the gallery meets the air");
        let floor = storey_floor(dungeon.storey_of(voids[0]));
        assert!(dungeon.balustrades.iter().all(|rail| rail[4] == floor && rail[5] == floor + BALUSTRADE_M));
    }
    assert!((0.03..0.07).contains(&share(great, storeys)), "{great} great rooms in {storeys} block storeys");
    assert!((0.5..0.75).contains(&share(galleries, under)), "{galleries} galleries of {under}");
}

#[test]
fn a_vault_stands_off_the_main_way_one_in_a_short_dungeon_two_in_a_long_one_on_its_deepest_storey_it_can() {
    for dungeon in DUNGEONS.iter() {
        let want = if dungeon.squares.len() > 3 { 2 } else { 1 };
        let on_way = |room: usize| dungeon.rooms[room].cells.iter().any(|cell| dungeon.main_way.contains(cell));
        let off: Vec<usize> = (0..dungeon.rooms.len())
            .filter(|&room| room != dungeon.way_in.room && room != dungeon.end() && !on_way(room))
            .collect();
        assert_eq!(dungeon.vaults.len(), want.min(off.len()));
        let deepest = off.iter().map(|&room| dungeon.rooms[room].storey).max();
        if let Some(&first) = dungeon.vaults.first() {
            assert_eq!(Some(dungeon.rooms[first].storey), deepest, "the deepest storey it can");
        }
        assert!(dungeon.vaults.iter().all(|vault| off.contains(vault)));
    }
}

#[test]
fn the_main_way_runs_from_the_way_in_to_the_end_and_braziers_flank_the_doorways_it_leaves_rooms_by() {
    let (mut leaving, mut flanked) = (0, 0);
    for dungeon in DUNGEONS.iter() {
        let way = &dungeon.main_way;
        assert_eq!(way.first(), Some(&dungeon.way_in.cell));
        assert_eq!(way.last().and_then(|&cell| dungeon.room_at(cell)), Some(dungeon.end()));
        assert!(way.windows(2).all(|pair| dungeon.walk_from(pair[0]).any(|next| next == pair[1])), "a walk");
        let braziers: Vec<usize> = dungeon
            .fixtures
            .iter()
            .filter(|fixture| fixture.kind == Kind::Brazier)
            .map(|fixture| dungeon.cell_at(fixture.at))
            .collect();
        for room in (0..dungeon.rooms.len()).filter(|&room| room != dungeon.end()) {
            let Some((cell, wall)) = dungeon.way_on(room) else { continue };
            leaving += 1;
            let across = if wall.unit()[0] == 0.0 { [Side::West, Side::East] } else { [Side::North, Side::South] };
            let inside = across
                .map(|side| dungeon.beside(cell, side))
                .iter()
                .all(|at| at.is_some_and(|at| braziers.contains(&at)));
            let outside =
                dungeon.beside(cell, wall).is_some_and(|at| braziers.iter().filter(|&&found| found == at).count() == 2);
            if inside || outside {
                flanked += 1;
            }
        }
    }
    assert!((0.6..1.0).contains(&share(flanked, leaving)), "{flanked} of {leaving} ways on flanked");
}
