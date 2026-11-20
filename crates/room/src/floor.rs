//! The ground a room's fighters stand on: open ground at 0 m, the open sea, a node's window of the land, or a dungeon's
//! floor.

use crate::dungeon_ground::DungeonGround;
use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Terrain, standing};

/// The ground a room's fighters stand on: open ground at 0 m, the open sea at 0 m under a course laid over it (a body
/// stands there, but no foe walks it), a node's window of the land, or a dungeon's ground in its own frame, whose rock,
/// jambs and pillars are walls no body passes (`dungeon_ground`).
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Sea,
    Land(Box<Ground>),
    Dungeon(Box<DungeonGround>),
}

impl Floor {
    /// A dungeon's ground, as the Forge lays it.
    #[must_use]
    pub fn of_dungeon(dungeon: &dungeon::Dungeon) -> Option<Self> {
        DungeonGround::of(dungeon).map(|ground| Floor::Dungeon(Box::new(ground)))
    }

    /// How deep a point lies inside a solid nobody may stand on, metres: a dungeon's, since its ground walls every
    /// solid however low; 0 elsewhere, where a body climbs a low block.
    pub(crate) fn depth_in_solid(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Dungeon(ground) => ground.depth_in_solid(x, y),
            _ => 0.0,
        }
    }
}

impl Terrain for Floor {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat | Floor::Sea => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
            Floor::Dungeon(ground) => ground.height_at(x, y),
        }
    }

    /// Open ground, the sea and the land have no walls of their own; a dungeon's rock, jambs and pillars are.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        match self {
            Floor::Flat | Floor::Sea | Floor::Land(_) => false,
            Floor::Dungeon(ground) => ground.walled(from, to),
        }
    }

    /// Only a dungeon's walls stand across a line: open ground and the sea have none, and a line passes over the land's
    /// rises.
    fn line_walled(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        match self {
            Floor::Flat | Floor::Sea | Floor::Land(_) => false,
            Floor::Dungeon(ground) => ground.line_walled(from, to),
        }
    }

    /// Only a dungeon's walls stand in a shot's way: the land's rises are met by its height.
    fn wall_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        match self {
            Floor::Flat | Floor::Sea | Floor::Land(_) => None,
            Floor::Dungeon(ground) => ground.wall_entry(from, to),
        }
    }

    /// A shot falls onto the land's height, or onto a dungeon's floor under its walls.
    fn floor_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat | Floor::Sea | Floor::Land(_) => self.height_at(x, y),
            Floor::Dungeon(ground) => ground.floor_at(x, y),
        }
    }
}

/// A body standing at (x, y) on the floor and the blocks: its feet on the ground there, or on a block's top within
/// a step of it.
#[must_use]
pub fn standing_on(floor: &Floor, blocks: &[Block], x: f64, y: f64) -> Body {
    Body { z: ground_at(blocks, floor, x, y, floor.height_at(x, y)), ..standing(x, y) }
}
