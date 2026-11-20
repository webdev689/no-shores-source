//! The ground a room's fighters stand on.

use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Terrain, standing};

/// The ground a room's fighters stand on: open ground at 0 m, a node's window of the land, a ship's deck in her own
/// frame (its grid of heights over her waterline, a wall off her planks), or a sea island's fine ground in its own.
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Land(Box<Ground>),
    Deck(Box<movement::Heights>),
    Island(Box<movement::Heights>),
}

impl Terrain for Floor {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
            Floor::Deck(heights) | Floor::Island(heights) => heights.height_at(x, y),
        }
    }
}

/// A body standing at (x, y) on the floor and the blocks: its feet on the ground there, or on a block's top within
/// a step of it.
#[must_use]
pub fn standing_on(floor: &Floor, blocks: &[Block], x: f64, y: f64) -> Body {
    Body { z: ground_at(blocks, floor, x, y, floor.height_at(x, y)), ..standing(x, y) }
}
