//! The ground a room's fighters stand on: open ground at 0 m, a node's window of the land, or a dungeon's floor.

use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Heights, Terrain, standing};

/// The ground a room's fighters stand on: open ground at 0 m, a node's window of the land, or a dungeon's floor, a
/// grid of heights in the dungeon's own frame whose rock is a wall no body passes.
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Land(Box<Ground>),
    Dungeon(Box<Heights>),
}

impl Floor {
    /// A dungeon's floor: its cells' heights from its north-west corner, rock holding none.
    #[must_use]
    pub fn of_dungeon(dungeon: &dungeon::Dungeon) -> Option<Self> {
        let heights = dungeon.heights();
        let grid = Heights::new(0.0, 0.0, dungeon::CELL_M, dungeon.columns, dungeon.rows, heights)?;
        Some(Floor::Dungeon(Box::new(grid)))
    }
}

impl Terrain for Floor {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
            Floor::Dungeon(heights) => heights.height_at(x, y),
        }
    }

    /// Open ground and the land have no walls of their own; a dungeon's rock is one.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        match self {
            Floor::Flat | Floor::Land(_) => false,
            Floor::Dungeon(heights) => heights.walled(from, to),
        }
    }
}

/// A body standing at (x, y) on the floor and the blocks: its feet on the ground there, or on a block's top within
/// a step of it.
#[must_use]
pub fn standing_on(floor: &Floor, blocks: &[Block], x: f64, y: f64) -> Body {
    Body { z: ground_at(blocks, floor, x, y, floor.height_at(x, y)), ..standing(x, y) }
}
