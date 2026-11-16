//! The blocks a body stands on and runs into: what is underfoot, what is in the way, and sliding along a side.

use crate::body::{Body, TUNING};

/// A block standing on the ground: its footprint (x east, y south, metres) and its top.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Block {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
    pub top: f64,
}

impl Block {
    fn holds(&self, x: f64, y: f64, margin: f64) -> bool {
        x > self.min_x - margin && x < self.max_x + margin && y > self.min_y - margin && y < self.max_y + margin
    }
}

/// The ground under a point: the highest block top at or below `z` plus a step, or the open ground at 0.
#[must_use]
pub fn ground_at(blocks: &[Block], x: f64, y: f64, z: f64) -> f64 {
    blocks
        .iter()
        .filter(|block| block.holds(x, y, 0.0) && block.top <= z + TUNING.step)
        .fold(0.0, |ground, block| if block.top > ground { block.top } else { ground })
}

/// The first block standing in the way at a point: one whose top is above a step over `z`.
fn blocking_at(blocks: &[Block], x: f64, y: f64, z: f64) -> Option<&Block> {
    blocks.iter().find(|block| block.holds(x, y, TUNING.radius) && block.top > z + TUNING.step)
}

/// A block ahead of a body, and how deep it runs the way the body faces.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WallAhead {
    pub block: Block,
    pub depth: f64,
}

/// The block ahead of the body along a bearing, a short reach past its radius, and how deep it runs that way.
#[must_use]
pub fn wall_ahead(blocks: &[Block], body: &Body, bearing: f64) -> Option<WallAhead> {
    let (dir_x, dir_y) = (libm::sin(bearing), -libm::cos(bearing));
    let probe = TUNING.radius + 0.15;
    let block = *blocking_at(blocks, body.x + dir_x * probe, body.y + dir_y * probe, body.z)?;
    let depth = if dir_x.abs() > dir_y.abs() { block.max_x - block.min_x } else { block.max_y - block.min_y };
    Some(WallAhead { block, depth })
}

/// Moves along the ground by (`move_x`, `move_y`), sliding along a block's side and stepping up onto one no higher
/// than a step. Answers the new (x, y).
#[must_use]
pub fn slide(blocks: &[Block], body: &Body, move_x: f64, move_y: f64) -> (f64, f64) {
    let (mut x, mut y) = (body.x, body.y);
    if blocking_at(blocks, x + move_x, y, body.z).is_none() {
        x += move_x;
    }
    if blocking_at(blocks, x, y + move_y, body.z).is_none() {
        y += move_y;
    }
    (x, y)
}
