//! The patrol areas' dungeons, laid as DFO's Forge lays them: blocks of 16 by 16 cells of 3.2 m, each block's rooms
//! carved by a seeded split and joined through the rock by the cheapest ways, the blocks grown from the way in's and
//! joined at their shared edges. One floor: rooms and corridors stand at 0 m, under ceilings of their own heights.
//! The same seed lays the same dungeon on every machine: the maths is + - * / and comparisons, and every draw is made
//! on a lane of its own (`lane`).

mod block;
mod dungeon;
pub mod lane;

pub use block::{BLOCK_CELLS, Ends, Opening};
pub use dungeon::{
    DOORWAY_HALF_M, Dungeon, EXIT_HEIGHT_M, EXIT_WIDTH_M, Frame, JAMB_DEPTH_M, LINTEL_M, PILLAR_HALF_M, Room, TORCH_M,
    TORCH_REACH_M, Torch, WallDoor,
};

/// A cell's side in metres, and a block's.
pub const CELL_M: f64 = 3.2;
pub const BLOCK_M: f64 = CELL_M * BLOCK_CELLS as f64;
/// A corridor's ceiling.
pub const CORRIDOR_HEIGHT_M: f64 = 3.2;
/// How many dungeons a patrol area holds.
pub const PER_PATROL: usize = 3;

/// What a cell is: rock, a room's (by its number in the dungeon), or a corridor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    Rock,
    Room(u16),
    Corridor,
}

/// A cell's four sides, x east and y south.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    East,
    South,
    West,
    North,
}

/// The sides in the order every law walks them.
pub const SIDES: [Side; 4] = [Side::East, Side::South, Side::West, Side::North];

impl Side {
    /// The step to the cell beside, in cells (x east, y south).
    #[must_use]
    pub const fn step(self) -> (isize, isize) {
        match self {
            Side::East => (1, 0),
            Side::South => (0, 1),
            Side::West => (-1, 0),
            Side::North => (0, -1),
        }
    }

    #[must_use]
    pub const fn opposite(self) -> Self {
        match self {
            Side::East => Side::West,
            Side::South => Side::North,
            Side::West => Side::East,
            Side::North => Side::South,
        }
    }

    /// The step as metres of one unit, (x, y).
    #[must_use]
    pub fn unit(self) -> [f64; 2] {
        let (dx, dy) = self.step();
        [dx as f64, dy as f64]
    }

    /// The way the side faces, in radians clockwise from north.
    #[must_use]
    pub const fn bearing(self) -> f64 {
        match self {
            Side::North => 0.0,
            Side::East => core::f64::consts::FRAC_PI_2,
            Side::South => core::f64::consts::PI,
            Side::West => -core::f64::consts::FRAC_PI_2,
        }
    }
}

/// A room's shape inside its rectangle: all of it, or an L with a corner quarter left rock.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Rectangle,
    Ell,
}

/// A dungeon's style: the Forge's rooms for one kind of place (how many a block, their sides in cells, their ceilings'
/// heights, and whether some are Ls), the two dungeon picture sets it is drawn in, and its name's noun.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Style {
    pub rooms: (usize, usize),
    pub room_cells: (usize, usize),
    pub heights: (f64, f64),
    pub ells: bool,
    /// Its main picture set and its second, by Daggerfall's dungeon archives.
    pub pictures: [u16; 2],
    pub noun: &'static str,
}

/// The four styles, as the Forge's crypt, hall, cells and temple.
pub const STYLES: [Style; 4] = [
    Style { rooms: (3, 5), room_cells: (2, 4), heights: (3.2, 4.4), ells: false, pictures: [123, 124], noun: "Crypt" },
    Style { rooms: (2, 4), room_cells: (3, 7), heights: (4.0, 5.6), ells: true, pictures: [122, 124], noun: "Halls" },
    Style { rooms: (4, 6), room_cells: (2, 3), heights: (3.2, 3.6), ells: false, pictures: [122, 123], noun: "Cells" },
    Style { rooms: (2, 4), room_cells: (3, 6), heights: (4.4, 5.6), ells: true, pictures: [124, 122], noun: "Sanctum" },
];

/// A patrol's dungeon by its number: its seed, from the patrol's id, and its style. A patrol's dungeons take different
/// styles, shuffled by the patrol's id.
#[must_use]
pub fn of_patrol(patrol: &str, number: usize) -> (u32, Style) {
    let mut order = [0, 1, 2, 3];
    let mut lane = lane::Lane::named(&format!("styles:{patrol}"));
    for last in (1..order.len()).rev() {
        order.swap(last, lane.below(last + 1));
    }
    (lane::named(&format!("dungeon:{patrol}:{number}")), STYLES[order[number % order.len()]])
}

/// A dungeon's name from its style and its patrol's: "The Crypt of the Saltgrass Downs".
#[must_use]
pub fn name(style: &Style, patrol_name: &str) -> String {
    let place = patrol_name.strip_prefix("The ").map_or_else(|| patrol_name.to_owned(), |rest| format!("the {rest}"));
    format!("The {} of {place}", style.noun)
}

#[cfg(test)]
mod block_tests;
#[cfg(test)]
mod dungeon_tests;
