//! The patrol areas' dungeons, laid as DFO's Forge lays them: blocks of 16 by 16 cells of 3.2 m, each block's rooms
//! carved by a seeded split and joined through the rock by the cheapest ways, the blocks grown from the way in's and
//! joined at their shared edges, in six styles. Each room has a purpose that furnishes and lights it, and one or two
//! rooms a landmark. One floor:
//! rooms and corridors stand at 0 m, under ceilings of their own heights. The same seed lays the same dungeon on
//! every machine: the maths is + - * / and comparisons, and every draw is made on a lane of its own (`lane`).

mod banks;
mod block;
mod dungeon;
mod fixtures;
mod furnish;
mod landmarks;
pub mod lane;
pub mod models;
mod props;
mod purposes;
mod shapes;
mod styles;
mod torches;

pub use block::{BLOCK_CELLS, Ends, Opening};
pub use dungeon::{
    BLOCKS, DOORWAY_HALF_M, Dungeon, EXIT_HEIGHT_M, EXIT_WIDTH_M, FLOOR_M, Frame, JAMB_DEPTH_M, LINTEL_M,
    PILLAR_HALF_M, Room, WallDoor,
};
pub use fixtures::{
    BRAZIER_HALF_M, BRAZIER_TOP_M, CANDLES_OVER_M, CRYSTALS_TOP_M, FUNGUS_TOP_M, Fixture, Kind, LANTERN_M,
};
pub use landmarks::{LANDMARKS, Landmark, Placed, turned, turned_box};
pub use models::{Piece, PropModel, prop_model};
pub use props::{HUNG_M, POSTS_A_ROOM, Prop, posts_for};
pub use purposes::{Bank, Facing, Lay, Light, Lit, Pattern, Purpose};
pub use shapes::{Ceiling, Roof, Shape};
pub use styles::{Form, STYLES, Style};
pub use torches::{TORCH_M, TORCH_REACH_M, Torch};

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

    /// The side a quarter turn clockwise seen from above: north's is east.
    #[must_use]
    pub const fn clockwise(self) -> Self {
        match self {
            Side::North => Side::East,
            Side::East => Side::South,
            Side::South => Side::West,
            Side::West => Side::North,
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

/// The style a key names (crypt, halls, cells, sanctum, caverns or mines), for a dungeon laid by a seed where there is
/// no patrol, as on a sea island.
#[must_use]
pub fn style_of(key: &str) -> Option<Style> {
    STYLES.into_iter().find(|style| style.key == key)
}

/// A patrol's dungeon by its number: its seed, from the patrol's id, and its style. A patrol's dungeons take three
/// different styles of the six, shuffled by the patrol's id.
#[must_use]
pub fn of_patrol(patrol: &str, number: usize) -> (u32, Style) {
    let mut order: [usize; STYLES.len()] = core::array::from_fn(|index| index);
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
#[cfg(test)]
mod fixtures_tests;
#[cfg(test)]
mod landmarks_tests;
#[cfg(test)]
mod props_tests;
#[cfg(test)]
mod purposes_tests;
#[cfg(test)]
mod shapes_tests;
#[cfg(test)]
mod torches_tests;
