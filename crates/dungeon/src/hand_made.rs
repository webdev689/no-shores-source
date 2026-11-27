//! A dungeon of two storeys laid by hand, for the tests of every crate that stands bodies, bakes paths or draws in a
//! storeyed dungeon. One block of 16 by 16 cells:
//!
//! - storey 0 (floor 0 m): room 0 (x 1-4, y 1-4, the way in's, a Void at its cell (2, 4)), a corridor (x 5-6, y 2) to
//!   room 1 (x 7-10, y 1-4), and the top landing (9, 5) under room 1;
//! - the flight, (9, 6) to (9, 9) going south on both storeys, from the landing (9, 5) down to the landing (9, 10);
//! - storey 1 (floor -8 m): room 2 (x 2-7, y 4-10, partly under rooms 0 and 1, the end), joined to the landing by a
//!   corridor at (8, 10), with a pillar at its corner (4, 7).

use crate::shapes::{Ceiling, Shape};
use crate::{BLOCK_CELLS, CORRIDOR_HEIGHT_M, Cell, Dungeon, FLIGHT_CEILING_M, Room, STYLES, Side, Stair, WallDoor};

/// The hand-made dungeon's rooms' ceilings (m over their floors).
pub const ROOM_HEIGHT_M: f64 = 4.0;
/// The Void's plane cell (2, 4), over room 2's north-west corner.
pub const VOID_AT: (usize, usize) = (2, 4);

/// Two storeys, two rooms over one, a flight between them and a Void over the lower room's corner.
#[must_use]
pub fn two_storeys() -> Dungeon {
    let style = STYLES[1];
    let (columns, rows) = (BLOCK_CELLS, BLOCK_CELLS);
    let plane = columns * rows;
    let index = |storey: usize, x: usize, y: usize| storey * plane + y * columns + x;
    let mut dungeon = Dungeon {
        style,
        looks: vec![style],
        squares: vec![(0, 0)],
        block_looks: vec![0],
        block_storeys: vec![2],
        columns,
        rows,
        storeys: 2,
        cells: vec![Cell::Rock; 2 * plane],
        ceilings: vec![0.0; 2 * plane],
        stairs: vec![Stair {
            upper: 0,
            cells: [6, 7, 8, 9].map(|y| y * columns + 9),
            top: 5 * columns + 9,
            bottom: 10 * columns + 9,
        }],
        rooms: Vec::new(),
        way_in: WallDoor { cell: index(0, 1, 1), side: Side::North, room: 0 },
        end: 2,
        portal: WallDoor { cell: index(1, 2, 10), side: Side::South, room: 2 },
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
    let mut set = |cell: usize, kind: Cell, ceiling: f64| {
        dungeon.cells[cell] = kind;
        dungeon.ceilings[cell] = ceiling;
    };
    for (number, storey, (west, east), (north, south)) in
        [(0_u16, 0, (1, 4), (1, 4)), (1, 0, (7, 10), (1, 4)), (2, 1, (2, 7), (4, 10))]
    {
        for y in north..=south {
            for x in west..=east {
                set(index(storey, x, y), Cell::Room(number), ROOM_HEIGHT_M);
            }
        }
    }
    set(index(0, VOID_AT.0, VOID_AT.1), Cell::Void, ROOM_HEIGHT_M);
    for (storey, x, y) in [(0, 5, 2), (0, 6, 2), (0, 9, 5), (1, 9, 10), (1, 8, 10)] {
        set(index(storey, x, y), Cell::Corridor, CORRIDOR_HEIGHT_M);
    }
    for storey in 0..2 {
        for y in 6..=9 {
            set(index(storey, 9, y), Cell::Stair(0), FLIGHT_CEILING_M);
        }
    }
    for (number, storey, (x, y), (width, depth)) in
        [(0, 0, (1, 1), (4, 4)), (1, 0, (7, 1), (4, 4)), (2, 1, (2, 4), (6, 7))]
    {
        let cells: Vec<usize> =
            (0..dungeon.cells.len()).filter(|&cell| dungeon.room_at(cell) == Some(number)).collect();
        dungeon.rooms.push(Room {
            x,
            y,
            width,
            depth,
            quiet: cells.clone(),
            cells,
            stones: Vec::new(),
            height: ROOM_HEIGHT_M,
            ceiling: Ceiling::Flat,
            shape: Shape::Rectangle,
            walk: 0,
            look: 0,
            storey,
            purpose: &style.purposes.way_in,
            role: style.purposes.way_in.role,
            name: format!("room {number}"),
        });
    }
    dungeon.pillars.push([4.0 * crate::CELL_M, 7.0 * crate::CELL_M, crate::storey_floor(1) + ROOM_HEIGHT_M]);
    dungeon.walk();
    dungeon.frame();
    dungeon
}
