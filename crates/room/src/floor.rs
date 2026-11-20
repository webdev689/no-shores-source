//! The ground a room's fighters stand on.

use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Heights, Terrain, standing};

/// The ground a room's fighters stand on: open ground at 0 m, the open sea under a course laid over it, held round the
/// course's edge by its rim (`Heights::rim`: no body leaves the blocks for the sea, and no foe walks it), a node's
/// window of the land, a ship's deck in its own frame (its grid of heights over its waterline, a wall off its planks),
/// or a sea island's fine ground in its own.
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Sea(Box<Heights>),
    Land(Box<Ground>),
    Deck(Box<movement::Heights>),
    Island(Box<movement::Heights>),
}

impl Terrain for Floor {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            // The sea is at 0 m off the blocks as under them: its rim walls bodies in, but a drop or a shot over the
            // sea meets the water, not a wall's height.
            Floor::Flat | Floor::Sea(_) => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
            Floor::Deck(heights) | Floor::Island(heights) => heights.height_at(x, y),
        }
    }

    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        matches!(self, Floor::Sea(rim) if rim.walled(from, to))
    }
}

/// A body standing at (x, y) on the floor and the blocks: its feet on the ground there, or on a block's top within
/// a step of it.
#[must_use]
pub fn standing_on(floor: &Floor, blocks: &[Block], x: f64, y: f64) -> Body {
    Body { z: ground_at(blocks, floor, x, y, floor.height_at(x, y)), ..standing(x, y) }
}
