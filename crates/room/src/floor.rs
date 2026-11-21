//! The ground a room's fighters stand on: open ground at 0 m, the open sea, a node's window of the land, a ship's deck,
//! a sea island, or a dungeon's floor.

use crate::dungeon_ground::DungeonGround;
use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Heights, Terrain, standing};

/// The ground a room's fighters stand on: open ground at 0 m, the open sea under a course laid over it, held round the
/// course's edge by its rim (`Heights::rim`: no body leaves the blocks for the sea, and no foe walks it), a node's
/// window of the land, a ship's deck in its own frame (its grid of heights over its waterline, a wall off its planks),
/// a sea island's fine ground in its own, or a dungeon's ground in its own frame, whose rock, jambs and pillars are
/// walls no body passes (`dungeon_ground`).
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Sea(Box<Heights>),
    Land(Box<Ground>),
    Deck(Box<movement::Heights>),
    Island(Box<movement::Heights>),
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
            // The sea is at 0 m off the blocks as under them: its rim walls bodies in, but a drop or a shot over the
            // sea meets the water, not a wall's height.
            Floor::Flat | Floor::Sea(_) => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
            Floor::Deck(heights) | Floor::Island(heights) => heights.height_at(x, y),
            Floor::Dungeon(ground) => ground.height_at(x, y),
        }
    }

    /// Open ground, the land, a deck and an island have no walls of their own; the sea's rim and a dungeon's rock, jambs
    /// and pillars are.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        match self {
            Floor::Flat | Floor::Land(_) | Floor::Deck(_) | Floor::Island(_) => false,
            Floor::Sea(rim) => rim.walled(from, to),
            Floor::Dungeon(ground) => ground.walled(from, to),
        }
    }

    /// Only a dungeon's walls stand across a line: open ground and the sea have none, and a line passes over the land's
    /// rises.
    fn line_walled(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        match self {
            Floor::Flat | Floor::Sea(_) | Floor::Land(_) | Floor::Deck(_) | Floor::Island(_) => false,
            Floor::Dungeon(ground) => ground.line_walled(from, to),
        }
    }

    /// Only a dungeon's walls stand in a shot's way: the land's rises are met by its height.
    fn wall_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        match self {
            Floor::Flat | Floor::Sea(_) | Floor::Land(_) | Floor::Deck(_) | Floor::Island(_) => None,
            Floor::Dungeon(ground) => ground.wall_entry(from, to),
        }
    }

    /// A shot falls onto the land's height, or onto a dungeon's floor under its walls.
    fn floor_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat | Floor::Sea(_) | Floor::Land(_) | Floor::Deck(_) | Floor::Island(_) => self.height_at(x, y),
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
